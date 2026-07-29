import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';

const TEST_DB_NAME_PREFIX = 'LilposWorkstationPrinterAssignmentDb';
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
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

async function seedVersion6PrinterSettingsDb(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open(name, 6);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('printer_settings')) {
        const printerSettings = db.createObjectStore('printer_settings', { keyPath: 'id' });
        printerSettings.createIndex('by_merchantId', 'merchantId', { unique: false });
        printerSettings.createIndex('by_locationId', 'locationId', { unique: false });
        printerSettings.createIndex('by_stationId', 'stationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('pos_printer_configs')) {
        const printers = db.createObjectStore('pos_printer_configs', { keyPath: 'id' });
        printers.createIndex('by_merchantId', 'merchantId', { unique: false });
        printers.createIndex('by_locationId', 'locationId', { unique: false });
      }
      if (!db.objectStoreNames.contains('runtime_meta')) {
        db.createObjectStore('runtime_meta', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['printer_settings', 'pos_printer_configs'], 'readwrite');
      tx.objectStore('pos_printer_configs').put({
        id: 'legacy_receipt',
        merchantId: 'merchant_test',
        locationId: 'location_test',
        name: 'Legacy Receipt',
        enabled: true,
        primaryRole: 'receipt',
        ip: '192.168.1.30',
        port: 9100,
        createdAt: '2026-07-28T15:00:00.000Z',
        updatedAt: '2026-07-28T15:00:00.000Z'
      });
      tx.objectStore('printer_settings').put({
        id: 'printer_settings_v1:merchant_test:location_test:1',
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        defaultReceiptPrinterId: 'legacy_receipt',
        receiptPrinterId: 'legacy_receipt',
        createdAt: '2026-07-28T15:00:00.000Z',
        updatedAt: '2026-07-28T15:00:00.000Z'
      });
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

function createService(input: { stationId?: number; dbVersion?: number } = {}) {
  const createLilposDataService = (window as any).LilposRuntime.createLilposDataService;
  return createLilposDataService({
    dbName: activeTestDbName,
    dbVersion: Number(input.dbVersion || 7),
    nowIso: () => '2026-07-28T15:00:00.000Z',
    getStationNumber: () => Number(input.stationId || 1),
    getMerchantId: () => 'merchant_test',
    getLocationId: () => 'location_test',
    getPlanPersistenceMode: () => 'persistent',
    legacyOrdersKey: 'lilpos_persisted_orders_test'
  });
}

describe('workstation printer assignments', () => {
  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'lilpos-runtime-data.js'));
  });

  beforeEach(async () => {
    activeTestCounter += 1;
    activeTestDbName = `${TEST_DB_NAME_PREFIX}_${activeTestCounter}`;
    await deleteDb(activeTestDbName);
  });

  it('assigns station and cash drawer printers for one station', async () => {
    const service = createService({ stationId: 1, dbVersion: 7 });
    await service.ensureHistoryPersistenceReady();

    await service.upsertPosPrinterConfig({
      id: 'front_counter_1',
      merchantId: 'merchant_test',
      locationId: 'location_test',
      name: 'Front Counter 1',
      enabled: true,
      primaryRole: 'receipt',
      ip: '192.168.1.25',
      port: 9100
    });

    await service.setStationPrinter({ stationId: '1', printerId: 'front_counter_1' });
    await service.setCashDrawerPrinter({ stationId: '1', printerId: 'front_counter_1' });
    await service.updateStationPrinterSlipOptions({ stationId: '1', printVoidSlips: false, printEdits: true, printResends: true });

    const assignment = await service.getWorkstationPrinterAssignment({ stationId: '1' });
    expect(assignment).not.toBeNull();
    expect(assignment.stationPrinterId).toBe('front_counter_1');
    expect(assignment.cashDrawerPrinterId).toBe('front_counter_1');
    expect(assignment.printVoidSlips).toBe(false);
    expect(assignment.printEdits).toBe(true);
    expect(assignment.printResends).toBe(true);

    const resolvedStationPrinter = await service.resolveStationPrinter({ stationId: '1' });
    const resolvedDrawerPrinter = await service.resolveCashDrawerPrinter({ stationId: '1' });
    expect(resolvedStationPrinter?.id).toBe('front_counter_1');
    expect(resolvedDrawerPrinter?.id).toBe('front_counter_1');
  });

  it('keeps assignments isolated by station id', async () => {
    const station1Service = createService({ stationId: 1, dbVersion: 7 });
    await station1Service.ensureHistoryPersistenceReady();

    await station1Service.upsertPosPrinterConfig({
      id: 'front_counter_1',
      merchantId: 'merchant_test',
      locationId: 'location_test',
      name: 'Front Counter 1',
      enabled: true,
      primaryRole: 'receipt',
      ip: '192.168.1.25',
      port: 9100
    });

    await station1Service.setStationPrinter({ stationId: '1', printerId: 'front_counter_1' });

    const station2Service = createService({ stationId: 2, dbVersion: 7 });
    await station2Service.ensureHistoryPersistenceReady();
    const station2Assignment = await station2Service.getWorkstationPrinterAssignment({ stationId: '2' });

    expect(station2Assignment).toBeNull();

    const station1Assignment = await station1Service.getWorkstationPrinterAssignment({ stationId: '1' });
    expect(station1Assignment?.stationPrinterId).toBe('front_counter_1');
  });

  it('rejects assigning disabled printers', async () => {
    const service = createService({ stationId: 1, dbVersion: 7 });
    await service.ensureHistoryPersistenceReady();

    await service.upsertPosPrinterConfig({
      id: 'disabled_receipt',
      merchantId: 'merchant_test',
      locationId: 'location_test',
      name: 'Disabled Receipt',
      enabled: false,
      primaryRole: 'receipt',
      ip: '192.168.1.26',
      port: 9100
    });

    await expect(service.setStationPrinter({ stationId: '1', printerId: 'disabled_receipt' })).rejects.toThrow(
      'Disabled printers cannot be assigned.'
    );
  });

  it('migrates legacy receipt printer settings into workstation assignment on v7 upgrade', async () => {
    await seedVersion6PrinterSettingsDb(activeTestDbName);

    const v7Service = createService({ stationId: 1, dbVersion: 7 });
    await v7Service.ensureHistoryPersistenceReady();

    const assignment = await v7Service.getWorkstationPrinterAssignment({ stationId: '1' });
    expect(assignment).not.toBeNull();
    expect(assignment.stationPrinterId).toBe('legacy_receipt');
    expect(assignment.printVoidSlips).toBe(true);
    expect(assignment.printEdits).toBe(true);
    expect(assignment.printResends).toBe(true);
  });

  it('normalizes legacy profile IDs for existing printers', async () => {
    const service = createService({ stationId: 1, dbVersion: 7 });
    await service.ensureHistoryPersistenceReady();

    await service.upsertPosPrinterConfig({
      id: 'legacy_generic',
      merchantId: 'merchant_test',
      locationId: 'location_test',
      name: 'Legacy Generic',
      enabled: true,
      primaryRole: 'receipt',
      ip: '192.168.1.80',
      port: 9100,
      profile: 'epson_thermal'
    });

    await service.upsertPosPrinterConfig({
      id: 'legacy_u220',
      merchantId: 'merchant_test',
      locationId: 'location_test',
      name: 'Legacy U220',
      enabled: true,
      primaryRole: 'kitchen',
      ip: '192.168.1.81',
      port: 9100,
      profile: 'u220'
    });

    const generic = await service.getPosPrinterConfigById('legacy_generic');
    const u220 = await service.getPosPrinterConfigById('legacy_u220');

    expect(generic?.profile).toBe('generic_escpos_thermal');
    expect(u220?.profile).toBe('epson_tm_u220');
  });
});
