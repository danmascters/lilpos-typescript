import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

function runScriptInContext(filePath: string, context: vm.Context) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
}

async function seedDb(factory: FDBFactory, dbName: string) {
  await new Promise<void>((resolve, reject) => {
    const req = factory.open(dbName, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('order_history')) db.createObjectStore('order_history', { keyPath: 'historyId' });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['kv', 'order_history'], 'readwrite');
      tx.objectStore('kv').put({
        runtimeKind: 'lilpos-runtime-package-v1',
        generatedAt: '2026-07-23T12:00:00.000Z',
        categories: [{ id: 'cat_1', name: 'Pizza' }],
        itemTiles: [{ id: 'item_1', name: 'Cheese Pizza', apiToken: 'secret-value' }],
        modifierFlows: { groups: [], options: [] },
        pricingRules: { sizes: [], taxRules: [] },
        settings: { register: { defaultOrderType: 'Pickup' }, printerSettings: { receipt: 'Front' } },
        customers: [{ id: 'cust_1', name: 'Maria', phone: '5551234567' }]
      }, 'activeMenu');
      tx.objectStore('order_history').put({
        historyId: 'hist_1',
        orderId: 'ord_1',
        orderStatus: 'open',
        paymentStatus: 'unpaid',
        storedDisplayName: 'Maria',
        totalCents: 1200,
        syncStatus: 'pending',
        authToken: 'do-not-export'
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

describe('Station Data Manager', () => {
  it('lists sections, records, health, and redacts secret-like export fields', async () => {
    const factory = new FDBFactory();
    const dbName = 'StationDataManagerTest';
    await seedDb(factory, dbName);

    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost',
      runScripts: 'outside-only'
    });
    const context = dom.getInternalVMContext();
    (dom.window as any).indexedDB = factory;
    (dom.window as any).IDBKeyRange = FDBKeyRange;
    (context as any).indexedDB = factory;
    (context as any).IDBKeyRange = FDBKeyRange;

    const repoRoot = path.resolve(__dirname, '..');
    runScriptInContext(path.join(repoRoot, 'dist', 'lilpos-runtime-data.js'), context);
    runScriptInContext(path.join(repoRoot, 'dist', 'runtime', 'local-data-admin.js'), context);
    runScriptInContext(path.join(repoRoot, 'dist', 'admin', 'station-data-manager.js'), context);
    runScriptInContext(path.join(repoRoot, 'dist', 'admin', 'station-data-manager.view.js'), context);

    try {
      const createService = (dom.window as any).LilposRuntime.createLilposDataService;
      const service = createService({ dbName, dbVersion: 3 });
      const cached = await service.getRuntimeCache('activeMenu');
      service.loadRuntimePackage(cached);
      const admin = (dom.window as any).LilposLocalDataAdmin.createLocalDataAdmin({ dataService: service, dbName, dbVersion: 3 });

      const sections = await admin.listSections();
      expect(sections.some((section: any) => section.id === 'menu.items')).toBe(true);
      expect(sections.some((section: any) => section.id === 'orders.open')).toBe(true);

      const records = await admin.searchRecords('menu.items', 'cheese');
      expect(records.length).toBe(1);
      expect(records[0].value.apiToken).toBe('[REDACTED]');

      const health = await admin.getHealth();
      expect(health.indexedDbAvailable).toBe(true);
      expect(health.storeNames).toContain('order_history');

      const exported = await admin.exportStore('orders.open');
      expect(exported.sections[0].records[0].value.authToken).toBe('[REDACTED]');

      const viewState = (dom.window as any).LilposStationDataManager.defaultState();
      viewState.sections = sections;
      viewState.activeSectionId = 'menu.items';
      viewState.records = records;
      viewState.health = health;
      const html = (dom.window as any).LilposStationDataManagerView.render(viewState);
      expect(html).toContain('Station Data Manager');
      expect(html).toContain('Cheese Pizza');
    } finally {
      dom.window.close();
    }
  });
});
