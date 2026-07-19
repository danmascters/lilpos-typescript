import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DB_NAME_PREFIX = 'LilposRuntimeMigrationTestDb';
let activeTestDbName = `${TEST_DB_NAME_PREFIX}_0`;
let activeTestCounter = 0;

if (!(globalThis as any).indexedDB) {
  (globalThis as any).indexedDB = new FDBFactory();
}
if (!(globalThis as any).IDBKeyRange) {
  (globalThis as any).IDBKeyRange = FDBKeyRange;
}

const localStorageBacking = new Map<string, string>();
const localStorageShim = {
  getItem(key: string) {
    return localStorageBacking.has(key) ? localStorageBacking.get(key)! : null;
  },
  setItem(key: string, value: any) {
    localStorageBacking.set(String(key), String(value));
  },
  removeItem(key: string) {
    localStorageBacking.delete(String(key));
  },
  clear() {
    localStorageBacking.clear();
  }
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageShim,
  configurable: true,
  writable: true
});
if ((globalThis as any).window) {
  Object.defineProperty((globalThis as any).window, 'localStorage', {
    value: localStorageShim,
    configurable: true,
    writable: true
  });
}

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

async function deleteDb(name: string): Promise<void> {
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    const fallback = setTimeout(() => resolve(), 50);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
    req.onsuccess = () => {
      clearTimeout(fallback);
      resolve();
    };
    req.onerror = () => {
      clearTimeout(fallback);
      resolve();
    };
    req.onblocked = () => {
      clearTimeout(fallback);
      resolve();
    };
  });
}

async function seedV1KvDatabase(name: string, key: string, value: any): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
    req.onerror = () => reject(req.error);
  });
}

function createService() {
  const createLilposDataService = (window as any).LilposRuntime.createLilposDataService;
  return createLilposDataService({
    dbName: activeTestDbName,
    dbVersion: 2,
    nowIso: () => '2026-07-19T16:00:00.000Z',
    getStationNumber: () => 1,
    getMerchantId: () => 'merchant_test',
    getPlanPersistenceMode: () => 'persistent',
    legacyOrdersKey: 'lilpos_persisted_orders_test'
  });
}

function clearLegacyStorageKey(key: string) {
  const storage: any = localStorage as any;
  if (!storage) return;
  if (typeof storage.removeItem === 'function') {
    storage.removeItem(key);
    return;
  }
  if (typeof storage.clear === 'function') {
    storage.clear();
    return;
  }
  if (typeof storage.setItem === 'function') {
    storage.setItem(key, '');
    return;
  }
  try {
    delete storage[key];
  } catch (_err) {
    // No-op fallback for non-standard storage shims.
  }
}

describe('Runtime history migration v1 -> v2', () => {
  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'lilpos-runtime-data.js'));
  });

  beforeEach(async () => {
    activeTestCounter += 1;
    activeTestDbName = `${TEST_DB_NAME_PREFIX}_${activeTestCounter}`;
    clearLegacyStorageKey('lilpos_persisted_orders_test');
    await deleteDb(activeTestDbName);
  });

  it('preserves existing v1 kv data and creates v2 stores', async () => {
    const menuSnapshot = { runtimeKind: 'lilpos-runtime-package-v1', packageVersion: 123 };
    await seedV1KvDatabase(activeTestDbName, 'activeMenu', menuSnapshot);

    const service = createService();
    await service.ensureHistoryPersistenceReady();

    const cachedMenu = await service.getRuntimeCache('activeMenu');
    expect(cachedMenu).toEqual(menuSnapshot);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(activeTestDbName, 2);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    const expectedStores = [
      'kv',
      'runtime_meta',
      'order_history',
      'order_history_items',
      'order_events',
      'payment_history'
    ];
    expectedStores.forEach((store) => {
      expect(db.objectStoreNames.contains(store)).toBe(true);
    });

    const tx = db.transaction('order_events', 'readonly');
    const eventIndexes = tx.objectStore('order_events').indexNames;
    expect(eventIndexes.contains('by_idempotencyKey')).toBe(true);
    db.close();
  });

  it('migrates legacy localStorage OrderPersistence rows into typed stores', async () => {
    localStorage.setItem('lilpos_persisted_orders_test', JSON.stringify([
      {
        id: 'order_100',
        orderNumber: '1-00042',
        stationNumber: 1,
        businessDate: '2026-07-19',
        createdTimestamp: '2026-07-19T15:00:00.000Z',
        updatedTimestamp: '2026-07-19T15:05:00.000Z',
        orderType: 'pickup',
        status: 'completed',
        paymentStatus: 'paid',
        paid: true,
        customerSnapshot: { name: 'Walk-in Caller', phone: '5551234567', address1: '123 Main' },
        lines: [{ lineId: 'l1', name: 'Cheese Pizza', qty: 2, price: 10 }],
        subtotal: 20,
        tax: 1.5,
        total: 21.5,
        paymentMethodSummary: 'Cash',
        paymentLines: [{ paymentType: 'Cash', amount: 21.5 }],
        auditEvents: [
          { event: 'Entered', timestamp: '2026-07-19T15:00:00.000Z', employeeShortName: 'ADM' },
          { event: 'Paid', timestamp: '2026-07-19T15:05:00.000Z', employeeShortName: 'ADM' }
        ]
      }
    ]));

    const service = createService();
    await service.ensureHistoryPersistenceReady();

    const history = await service.listOrderHistory();
    expect(history.length).toBe(1);
    expect(history[0].displayOrderNumber).toBe('1-42');

    const events = await service.listOrderEvents('order_100');
    expect(events.length).toBe(2);
    expect(events[0].employeeShortName).toBe('ADM');

    const payments = await service.listPaymentHistory('order_100');
    expect(payments.length).toBe(1);
    expect(payments[0].paymentType).toBe('Cash');
    expect(payments[0].cardLastFour).toBe('');

    // Legacy source remains intact
    const legacyRaw = localStorage.getItem('lilpos_persisted_orders_test');
    expect(legacyRaw).not.toBeNull();
    expect(JSON.parse(legacyRaw || '[]').length).toBe(1);
  });

  it('legacy import is idempotent and repeat-safe', async () => {
    localStorage.setItem('lilpos_persisted_orders_test', JSON.stringify([
      {
        id: 'order_repeat',
        orderNumber: '1-00007',
        createdTimestamp: '2026-07-19T10:00:00.000Z',
        updatedTimestamp: '2026-07-19T10:05:00.000Z',
        orderType: 'pickup',
        status: 'completed',
        paymentStatus: 'paid',
        paid: true,
        customerSnapshot: { name: 'Guest' },
        lines: [{ lineId: 'a', name: 'Slice', qty: 1, price: 3 }],
        total: 3,
        paymentLines: [{ paymentType: 'Cash', amount: 3 }],
        auditEvents: [{ event: 'Entered', timestamp: '2026-07-19T10:00:00.000Z', employeeShortName: 'JS' }]
      }
    ]));

    const service = createService();
    await service.ensureHistoryPersistenceReady();
    await service.__debugReimportLegacy();

    const history = await service.listOrderHistory();
    const events = await service.listOrderEvents('order_repeat');
    const payments = await service.listPaymentHistory('order_repeat');

    expect(history.length).toBe(1);
    expect(events.length).toBe(1);
    expect(payments.length).toBe(1);
  });

  it('malformed legacy records do not erase legacy data and partial retry is safe', async () => {
    localStorage.setItem('lilpos_persisted_orders_test', JSON.stringify([
      {
        id: 'order_good',
        orderNumber: '1-00008',
        createdTimestamp: '2026-07-19T12:00:00.000Z',
        updatedTimestamp: '2026-07-19T12:01:00.000Z',
        orderType: 'pickup',
        status: 'open',
        paymentStatus: 'unpaid',
        paid: false,
        total: 8,
        lines: []
      },
      {
        // malformed: missing id and orderNumber
        total: 5
      }
    ]));

    const service = createService();
    const result = await service.ensureHistoryPersistenceReady(true);

    expect(result.totalLegacyOrders).toBe(2);
    expect(result.failedOrders.length).toBe(1);

    const history = await service.listOrderHistory();
    expect(history.length).toBe(1);

    // Legacy source still untouched
    const legacyRaw = localStorage.getItem('lilpos_persisted_orders_test');
    expect(JSON.parse(legacyRaw || '[]').length).toBe(2);

    // Retry should not duplicate the successful migrated order
    await service.__debugReimportLegacy();
    const historyAfterRetry = await service.listOrderHistory();
    expect(historyAfterRetry.length).toBe(1);
  });

  it('new writes after migration go to indexeddb path only and preserve associations', async () => {
    const service = createService();
    await service.ensureHistoryPersistenceReady();

    await service.saveOrderHistorySnapshot({
      historyId: 'hist_new_1',
      orderId: 'order_new_1',
      displayOrderNumber: '1-00021',
      orderType: 'delivery',
      orderStatus: 'completed',
      paymentStatus: 'paid',
      storedDisplayName: 'Counter Customer',
      subtotalCents: 1000,
      taxCents: 66,
      totalCents: 1066,
      amountPaidCents: 1066,
      remainingBalanceCents: 0,
      createdAt: '2026-07-19T16:00:00.000Z',
      updatedAt: '2026-07-19T16:00:00.000Z'
    });

    await service.saveOrderHistoryItems('hist_new_1', 'order_new_1', [
      {
        historyItemId: 'itm_new_1',
        itemName: 'Pepperoni Pizza',
        quantity: 1,
        unitPriceCents: 1066,
        lineTotalCents: 1066,
        sortOrder: 0
      }
    ]);

    await service.appendOrderEvent({
      eventId: 'evt_new_1',
      orderId: 'order_new_1',
      historyId: 'hist_new_1',
      eventType: 'ORDER_SENT',
      eventTimestamp: '2026-07-19T16:01:00.000Z',
      employeeShortName: 'ADM',
      idempotencyKey: 'idemp_evt_new_1'
    });

    await service.savePaymentHistory({
      paymentHistoryId: 'pay_new_1',
      orderId: 'order_new_1',
      historyId: 'hist_new_1',
      paymentId: 'payment_new_1',
      paymentType: 'Credit Card',
      amountCents: 1066,
      cardBrand: 'visa',
      cardLastFour: '4242',
      idempotencyKey: 'idemp_pay_new_1'
    });

    // No dual-write back into legacy localStorage key
    const legacyRaw = localStorage.getItem('lilpos_persisted_orders_test');
    expect(legacyRaw == null || !legacyRaw.includes('order_new_1')).toBe(true);

    const history = await service.getOrderHistoryByOrderId('order_new_1');
    const events = await service.listOrderEvents('order_new_1');
    const payments = await service.listPaymentHistory('order_new_1');
    const compat = await service.getHistoricalOrderByIdCompat('order_new_1');

    expect(history).not.toBeNull();
    expect(history.displayOrderNumber).toBe('1-21');
    expect(events.length).toBe(1);
    expect(events[0].historyId).toBe('hist_new_1');
    expect(payments.length).toBe(1);
    expect(payments[0].historyId).toBe('hist_new_1');
    expect(payments[0].cardLastFour).toBe('4242');
    expect(compat.orderId || compat.id).toBe('order_new_1');
    expect(compat.lines.length).toBe(1);
  });
});
