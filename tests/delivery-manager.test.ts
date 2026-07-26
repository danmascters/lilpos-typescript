import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

let counter = 0;
let dbName = '';

function runScript(filePath: string) {
  vm.runInThisContext(fs.readFileSync(filePath, 'utf8'), { filename: filePath });
}

function service() {
  return (window as any).LilposRuntime.createLilposDataService({
    dbName,
    dbVersion: 4,
    nowIso: () => '2026-07-25T16:00:00.000Z',
    getStationNumber: () => 1,
    getMerchantId: () => 'merchant_delivery_test',
    getPlanPersistenceMode: () => 'persistent',
    legacyOrdersKey: `delivery_legacy_${counter}`
  });
}

describe('Delivery Manager v1', () => {
  beforeAll(() => {
    const root = path.resolve(__dirname, '..');
    runScript(path.join(root, 'dist', 'delivery', 'delivery-manager.settings.js'));
    runScript(path.join(root, 'dist', 'delivery', 'delivery-manager.calculations.js'));
    runScript(path.join(root, 'dist', 'delivery', 'delivery-manager.state.js'));
    runScript(path.join(root, 'dist', 'delivery', 'delivery-manager.view.js'));
    runScript(path.join(root, 'dist', 'delivery', 'delivery-manager.runtime.js'));
    runScript(path.join(root, 'dist', 'lilpos-runtime-data.js'));
  });

  beforeEach(() => {
    counter += 1;
    dbName = `LilposDeliveryManagerTest_${counter}`;
    const factory = new FDBFactory();
    Object.defineProperty(globalThis, 'indexedDB', { value: factory, configurable: true });
    Object.defineProperty(window, 'indexedDB', { value: factory, configurable: true });
    Object.defineProperty(globalThis, 'IDBKeyRange', { value: FDBKeyRange, configurable: true });
    Object.defineProperty(window, 'IDBKeyRange', { value: FDBKeyRange, configurable: true });
  });

  it('uses money-safe settlement math for both net directions', () => {
    const calculate = (window as any).LilposDeliveryCalculations.calculate;
    const paidCash = { id: 'cash', deliveryStatus: 'DELIVERED', paymentStatus: 'paid', paymentLines: [{ paymentType: 'Cash', baseAmountCents: 10000 }] };
    const paidCard = { id: 'card', deliveryStatus: 'DELIVERED', paymentStatus: 'paid', paymentLines: [{ paymentType: 'Card', baseAmountCents: 4000, tipAmountCents: 2500 }] };
    const withBank = calculate({ orders: [paidCash, paidCard], shift: { bankEnabledAtShiftStart: true, startingBankAmountCents: 2000 } });
    expect(withBank).toMatchObject({ cashOrderTotalCents: 10000, startingBankAmountCents: 2000, creditCardTipsOwedCents: 2500, netAmountCents: 9500, netDirection: 'DRIVER_OWES_STORE' });

    const storeOwes = calculate({ orders: [{ ...paidCash, paymentLines: [{ paymentType: 'Cash', baseAmountCents: 2000 }] }, { ...paidCard, paymentLines: [{ paymentType: 'Card', tipAmountCents: 4500 }] }], shift: null });
    expect(storeOwes).toMatchObject({ netAmountCents: 2500, netDirection: 'STORE_OWES_DRIVER' });
  });

  it('migrates to v4 stores and persists settings, drivers, and shifts', async () => {
    const data = service();
    await data.ensureHistoryPersistenceReady();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(dbName, 4);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    ['delivery_settings', 'delivery_drivers', 'driver_shifts', 'driver_settlements', 'delivery_events'].forEach((name) => expect(db.objectStoreNames.contains(name)).toBe(true));
    const historyIndexes = db.transaction('order_history', 'readonly').objectStore('order_history').indexNames;
    expect(historyIndexes.contains('by_deliveryStatus')).toBe(true);
    expect(historyIndexes.contains('by_assignedDriverId')).toBe(true);
    db.close();

    await data.saveDeliverySettings({ inHouseDeliveryEnabled: true, deliveryQueueMode: 'dedicated_delivery_queue', driverBanksEnabled: true, driverBankReconciliationMode: 'end_of_shift' });
    const driver = await data.createDeliveryDriver({ displayName: 'Alex Driver', phone: '555-0100' });
    const shift = await data.openDriverShift(driver.driverId, 2000, 'Opening bank');
    expect(shift).toMatchObject({ startingBankAmountCents: 2000, status: 'OPEN', businessDate: '2026-07-25' });
    expect((await service().getDeliverySettings()).deliveryQueueMode).toBe('dedicated_delivery_queue');
    expect((await service().listDeliveryDrivers())[0].displayName).toBe('Alex Driver');
  });

  it('assigns and advances delivery orders with durable events', async () => {
    const data = service();
    await data.saveDeliverySettings({ inHouseDeliveryEnabled: true, driverBanksEnabled: true });
    const driver = await data.createDeliveryDriver({ displayName: 'Sam' });
    await data.saveOrderHistorySnapshot({ orderId: 'delivery-1', orderNumber: '1-1', orderType: 'delivery', deliveryStatus: 'PENDING_DELIVERY', paymentStatus: 'paid', totalCents: 10000, businessDate: '2026-07-25' });
    await data.assignDeliveryOrder('delivery-1', driver.driverId);
    await data.updateDeliveryOrderStatus('delivery-1', 'OUT_FOR_DELIVERY');
    await data.updateDeliveryOrderStatus('delivery-1', 'DELIVERED');

    const order = (await data.listDeliveryOrders(driver.driverId))[0];
    expect(order.deliveryStatus).toBe('DELIVERED');
    expect(order.deliveredAt).toBe('2026-07-25T16:00:00.000Z');
    await expect(data.updateDeliveryOrderStatus('delivery-1', 'ASSIGNED')).rejects.toThrow(/not allowed/i);
    const events = await data.listDeliveryEvents();
    expect(events.map((event: any) => event.eventType)).toEqual(expect.arrayContaining(['DELIVERY_ASSIGNED', 'DELIVERY_STATUS_CHANGED']));
  });

  it('calculates, drafts, and approves an auditable settlement without a drawer payout', async () => {
    const data = service();
    await data.saveDeliverySettings({ inHouseDeliveryEnabled: true, driverBanksEnabled: true, driverBankReconciliationMode: 'end_of_shift' });
    const driver = await data.createDeliveryDriver({ displayName: 'Jordan' });
    const shift = await data.openDriverShift(driver.driverId, 2000);
    await data.saveOrderHistorySnapshot({ orderId: 'cash-order', orderNumber: '1-2', orderType: 'delivery', deliveryStatus: 'DELIVERED', assignedDriverId: driver.driverId, paymentStatus: 'paid', totalCents: 10000, businessDate: shift.businessDate });
    await data.savePaymentHistory({ orderId: 'cash-order', paymentId: 'cash-pay', paymentType: 'Cash', baseAmountCents: 10000, amountCents: 10000 });
    await data.saveOrderHistorySnapshot({ orderId: 'card-order', orderNumber: '1-3', orderType: 'delivery', deliveryStatus: 'DELIVERED', assignedDriverId: driver.driverId, paymentStatus: 'paid', totalCents: 6500, businessDate: shift.businessDate });
    await data.savePaymentHistory({ orderId: 'card-order', paymentId: 'card-pay', paymentType: 'Card', baseAmountCents: 4000, tipAmountCents: 2500, amountCents: 6500 });

    const calculation = await data.calculateDriverSettlement(driver.driverId);
    expect(calculation).toMatchObject({ netAmountCents: 9500, netDirection: 'DRIVER_OWES_STORE', warnings: [] });
    const draft = await data.createDriverSettlementDraft(driver.driverId, calculation);
    const approved = await data.approveDriverSettlement(draft.settlementId, 'manager-1');
    expect(approved).toMatchObject({ status: 'APPROVED', approvedByEmployeeId: 'manager-1', netAmountCents: 9500 });
    expect((await data.listDriverSettlements(driver.driverId))[0].status).toBe('APPROVED');
    expect((await data.listDeliveryEvents()).some((event: any) => event.eventType === 'SETTLEMENT_APPROVED')).toBe(true);
  });

  it('renders all four manager tabs and the configured driver metrics', () => {
    const state = (window as any).LilposDeliveryManagerState.create();
    state.activeTab = 'settlements';
    state.drivers = [{ driverId: 'd1', displayName: 'Taylor', active: true }];
    state.orders = [{ assignedDriverId: 'd1', deliveryStatus: 'OUT_FOR_DELIVERY' }];
    const html = (window as any).LilposDeliveryManagerView.render(state);
    expect(html).toContain('Driver Banks / Settlement');
    expect(html).toContain('Out <b>1</b>');
    expect(html).toContain('Cash drawer payouts are not created.');
  });

  it('makes dependent settings selectable immediately when their feature is enabled', () => {
    const state = (window as any).LilposDeliveryManagerState.create();
    const root = document.createElement('div');
    root.innerHTML = (window as any).LilposDeliveryManagerView.render(state);
    const controller = (window as any).LilposDeliveryManagerRuntime.createController({ dataService: {} });
    controller.bind(root);

    const deliveryToggle = root.querySelector('[name="inHouseDeliveryEnabled"]') as HTMLInputElement;
    const queueOptions = root.querySelector('[data-delivery-dependent="inHouseDeliveryEnabled"]') as HTMLFieldSetElement;
    const bankToggle = root.querySelector('[name="driverBanksEnabled"]') as HTMLInputElement;
    const reconciliationOptions = root.querySelector('[data-delivery-dependent="driverBanksEnabled"]') as HTMLFieldSetElement;
    expect(queueOptions.disabled).toBe(true);
    expect(reconciliationOptions.disabled).toBe(true);

    deliveryToggle.checked = true;
    deliveryToggle.dispatchEvent(new Event('change'));
    bankToggle.checked = true;
    bankToggle.dispatchEvent(new Event('change'));
    expect(queueOptions.disabled).toBe(false);
    expect(reconciliationOptions.disabled).toBe(false);
    expect((root.querySelector('[value="dedicated_delivery_queue"]') as HTMLInputElement).disabled).toBe(false);
    expect((root.querySelector('[value="per_order"]') as HTMLInputElement).disabled).toBe(false);
  });

  it('captures enabled settings before the loading render replaces the form', async () => {
    const root = document.createElement('div');
    const initialState = (window as any).LilposDeliveryManagerState.create();
    root.innerHTML = (window as any).LilposDeliveryManagerView.render(initialState);
    let saved: any = null;
    const data = {
      saveDeliverySettings: async (input: any) => { saved = input; },
      getDeliverySettings: async () => saved,
      listDeliveryDrivers: async () => [],
      listDriverShifts: async () => [],
      listDeliveryOrders: async () => [],
      listDriverSettlements: async () => [],
      getBusinessDate: () => '2026-07-25'
    };
    let controller: any;
    controller = (window as any).LilposDeliveryManagerRuntime.createController({
      dataService: data,
      onChange: () => { if (controller?.state.loading) root.replaceChildren(); }
    });
    controller.bind(root);
    const enableDelivery = root.querySelector('[name="inHouseDeliveryEnabled"]') as HTMLInputElement;
    const dedicatedQueue = root.querySelector('[value="dedicated_delivery_queue"]') as HTMLInputElement;
    const enableBanks = root.querySelector('[name="driverBanksEnabled"]') as HTMLInputElement;
    const perOrder = root.querySelector('[value="per_order"]') as HTMLInputElement;
    enableDelivery.checked = true;
    enableDelivery.dispatchEvent(new Event('change'));
    dedicatedQueue.checked = true;
    enableBanks.checked = true;
    enableBanks.dispatchEvent(new Event('change'));
    perOrder.checked = true;
    (root.querySelector('#deliverySaveSettings') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(saved).toMatchObject({
      inHouseDeliveryEnabled: true,
      deliveryQueueMode: 'dedicated_delivery_queue',
      driverBanksEnabled: true,
      driverBankReconciliationMode: 'per_order'
    });
  });
});
