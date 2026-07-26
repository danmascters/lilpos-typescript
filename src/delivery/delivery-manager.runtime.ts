/// <reference path="./delivery-manager.types.ts" />

(function(global: any) {
  'use strict';

  function createController(options: any) {
    const data = options.dataService;
    const onChange = typeof options.onChange === 'function' ? options.onChange : function() {};
    const afterMutation = typeof options.afterMutation === 'function' ? options.afterMutation : async function() {};
    const state: DeliveryManagerState = global.LilposDeliveryManagerState.create();

    async function load(message = '') {
      state.loading = true; state.error = ''; state.message = message; onChange();
      try {
        const [settings, drivers, shifts, orders, settlements] = await Promise.all([
          data.getDeliverySettings(), data.listDeliveryDrivers(), data.listDriverShifts(),
          data.listDeliveryOrders(), data.listDriverSettlements()
        ]);
        state.settings = global.LilposDeliveryManagerSettings.normalize(settings);
        state.drivers = drivers || []; state.shifts = shifts || []; state.orders = orders || []; state.settlements = settlements || [];
        state.settlementPreviewByDriverId = {};
        const currentBusinessDate = String(data.getBusinessDate());
        state.drivers.forEach((driver) => {
          const shift = state.shifts.find((entry) => entry.driverId === driver.driverId && entry.status === 'OPEN') || null;
          const settlementBusinessDate = String(shift?.businessDate || currentBusinessDate);
          const settledOrderIds = new Set(state.settlements.filter((entry) => entry.status === 'APPROVED').flatMap((entry) => entry.orderIds || []));
          const eligible = state.orders.filter((order) => order.assignedDriverId === driver.driverId
            && String(order.businessDate || '') === settlementBusinessDate
            && !settledOrderIds.has(String(order.id || order.orderId)));
          state.settlementPreviewByDriverId[driver.driverId] = global.LilposDeliveryCalculations.calculate({ orders: eligible, shift });
        });
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to load Delivery Manager.');
      } finally { state.loading = false; onChange(); }
    }

    async function run(action: () => Promise<any>, message: string) {
      state.loading = true; state.error = ''; onChange();
      try { await action(); await afterMutation(); await load(message); }
      catch (err) { state.loading = false; state.error = err instanceof Error ? err.message : String(err); onChange(); }
    }

    function bind(root: ParentNode = document) {
      ['inHouseDeliveryEnabled', 'driverBanksEnabled'].forEach((name) => {
        const toggle = root.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        const dependent = root.querySelector(`[data-delivery-dependent="${name}"]`) as HTMLFieldSetElement | null;
        toggle?.addEventListener('change', () => {
          if (dependent) dependent.disabled = !toggle.checked;
        });
      });
      root.querySelectorAll('[data-delivery-tab]').forEach((element) => element.addEventListener('click', () => {
        state.activeTab = (element as HTMLElement).dataset.deliveryTab as any; onChange();
      }));
      root.querySelector('#deliverySaveSettings')?.addEventListener('click', () => {
        const checked = (name: string) => !!(root.querySelector(`[name="${name}"]`) as HTMLInputElement)?.checked;
        const value = (name: string) => String((root.querySelector(`[name="${name}"]:checked`) as HTMLInputElement)?.value || '');
        const settingsInput = {
          ...state.settings,
          inHouseDeliveryEnabled: checked('inHouseDeliveryEnabled'),
          deliveryQueueMode: value('deliveryQueueMode'),
          driverBanksEnabled: checked('driverBanksEnabled'),
          driverBankReconciliationMode: value('driverBankReconciliationMode')
        };
        void run(() => data.saveDeliverySettings(settingsInput), 'Delivery settings saved.');
      });
      root.querySelector('#deliverySaveDriver')?.addEventListener('click', () => {
        const displayName = String((root.querySelector('#deliveryDriverName') as HTMLInputElement)?.value || '').trim();
        const phone = String((root.querySelector('#deliveryDriverPhone') as HTMLInputElement)?.value || '').trim();
        const editingDriverId = state.editingDriverId;
        void run(async () => {
          if (!displayName) throw new Error('Driver name is required.');
          if (editingDriverId) await data.updateDeliveryDriver(editingDriverId, { displayName, phone });
          else await data.createDeliveryDriver({ displayName, phone });
          state.editingDriverId = null;
        }, editingDriverId ? 'Driver updated.' : 'Driver added.');
      });
      root.querySelector('#deliveryCancelDriverEdit')?.addEventListener('click', () => { state.editingDriverId = null; onChange(); });
      root.querySelectorAll('[data-delivery-edit-driver]').forEach((element) => element.addEventListener('click', () => {
        state.editingDriverId = (element as HTMLElement).dataset.deliveryEditDriver || null; onChange();
      }));
      root.querySelectorAll('[data-delivery-toggle-driver]').forEach((element) => element.addEventListener('click', () => {
        const id = (element as HTMLElement).dataset.deliveryToggleDriver || '';
        const driver = state.drivers.find((entry) => entry.driverId === id);
        if (driver) void run(() => data.setDeliveryDriverActive(id, !driver.active), driver.active ? 'Driver deactivated.' : 'Driver activated.');
      }));
      root.querySelectorAll('[data-delivery-open-shift]').forEach((element) => element.addEventListener('click', () => {
        const driverId = (element as HTMLElement).dataset.deliveryOpenShift || '';
        const bank = Number((root.querySelector(`[data-delivery-bank="${driverId}"]`) as HTMLInputElement)?.value || 0);
        void run(() => data.openDriverShift(driverId, Math.max(0, Math.round(bank * 100)), ''), 'Driver shift opened.');
      }));
      root.querySelectorAll('[data-delivery-close-shift]').forEach((element) => element.addEventListener('click', () => {
        void run(() => data.closeDriverShift((element as HTMLElement).dataset.deliveryCloseShift || ''), 'Driver shift closed.');
      }));
      root.querySelectorAll('[data-delivery-assign]').forEach((element) => element.addEventListener('click', () => {
        const orderId = (element as HTMLElement).dataset.deliveryAssign || '';
        const driverId = String((root.querySelector(`[data-delivery-driver-select="${orderId}"]`) as HTMLSelectElement)?.value || '');
        if (driverId) void run(() => data.assignDeliveryOrder(orderId, driverId), 'Delivery assigned.');
      }));
      root.querySelectorAll('[data-delivery-status]').forEach((element) => element.addEventListener('click', () => {
        const [orderId, status] = String((element as HTMLElement).dataset.deliveryStatus || '').split('|');
        void run(() => data.updateDeliveryOrderStatus(orderId, status), 'Delivery status updated.');
      }));
      root.querySelectorAll('[data-delivery-draft-settlement]').forEach((element) => element.addEventListener('click', () => {
        const driverId = (element as HTMLElement).dataset.deliveryDraftSettlement || '';
        const preview = state.settlementPreviewByDriverId[driverId];
        void run(() => data.createDriverSettlementDraft(driverId, preview), 'Settlement draft created.');
      }));
      root.querySelectorAll('[data-delivery-order-settlement]').forEach((element) => element.addEventListener('click', () => {
        const orderId = (element as HTMLElement).dataset.deliveryOrderSettlement || '';
        const order = state.orders.find((entry) => String(entry.id || entry.orderId) === orderId);
        if (!order?.assignedDriverId) return;
        const shift = state.shifts.find((entry) => entry.driverId === order.assignedDriverId && entry.status === 'OPEN') || null;
        const preview = global.LilposDeliveryCalculations.calculate({ orders: [order], shift: { ...(shift || {}), startingBankAmountCents: 0 } });
        void run(() => data.createDriverSettlementDraft(order.assignedDriverId, preview), 'Per-order settlement draft created.');
      }));
      root.querySelectorAll('[data-delivery-approve-settlement]').forEach((element) => element.addEventListener('click', () => {
        void run(() => data.approveDriverSettlement((element as HTMLElement).dataset.deliveryApproveSettlement || '', 'manager'), 'Settlement approved. No cash drawer transaction was created.');
      }));
    }

    return { state, load, bind };
  }

  global.LilposDeliveryManagerRuntime = { createController };
})(window);
