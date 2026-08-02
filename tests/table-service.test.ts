import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

function runScript(filePath: string, context: vm.Context) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
}

async function bootTableService() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', runScripts: 'outside-only' });
  const context = dom.getInternalVMContext();
  const factory = new FDBFactory();
  (dom.window as any).indexedDB = factory;
  (dom.window as any).IDBKeyRange = FDBKeyRange;
  (context as any).indexedDB = factory;
  (context as any).IDBKeyRange = FDBKeyRange;
  const repoRoot = path.resolve(__dirname, '..');
  [
    'dist/lilpos-runtime-data.js',
    'dist/features/table-service/table-service.types.js',
    'dist/features/table-service/default-table-layout.js',
    'dist/features/table-service/table-service-store.js',
    'dist/features/table-service/table-service-utils.js',
    'dist/features/table-service/table-node.js',
    'dist/features/table-service/table-status-legend.js',
    'dist/features/table-service/table-service-header.js',
    'dist/features/table-service/table-inspector.js',
    'dist/features/table-service/table-layout-toolbar.js',
    'dist/features/table-service/table-service-zoom-controls.js',
    'dist/features/table-service/table-service-floor.js',
    'dist/features/table-service/table-service-screen.js',
    'dist/features/table-service/table-service-runtime.js'
  ].forEach((relPath) => runScript(path.join(repoRoot, relPath), context));
  const runtime = (dom.window as any).LilposTableServiceRuntime.createController({
    dataService: (dom.window as any).LilposRuntime.createLilposDataService({ dbName: 'table_service_test', dbVersion: 8, getPlanPersistenceMode: () => 'persistent' })
  });
  await runtime.load();
  return { dom, runtime };
}

describe('table service module', () => {
  it('seeds a main room and renders summary data', async () => {
    const { dom, runtime } = await bootTableService();
    try {
      const html = runtime.render();
      expect(html).toContain('Main Dining Room');
      expect(html).toContain('Open Tables');
      expect(html).toContain('Table T4');
      expect(html).toContain('Maria');
      expect(html).toContain('$54.25');
      expect(html).toContain('Needs Cleaning');
    } finally {
      dom.window.close();
    }
  });

  it('computes summary metrics from floor data', async () => {
    const { dom, runtime: _runtime } = await bootTableService();
    try {
      const tables = [
        { id: 'a', roomId: 'r', displayName: 'A', shape: 'round', xPercent: 0, yPercent: 0, seatCapacity: 4, occupiedSeats: 4, status: 'SEATED', isVisible: true },
        { id: 'b', roomId: 'r', displayName: 'B', shape: 'square', xPercent: 0, yPercent: 0, seatCapacity: 2, occupiedSeats: 0, status: 'AVAILABLE', isVisible: true },
        { id: 'c', roomId: 'r', displayName: 'C', shape: 'square', xPercent: 0, yPercent: 0, seatCapacity: 4, occupiedSeats: 1, status: 'NEEDS_CLEANING', isVisible: true }
      ] as any;
      const summary = (dom.window as any).LilposTableServiceUtils.computeSummary(tables);
      expect(summary).toEqual({ openTables: 2, availableTables: 1, guestsSeated: 5, seatsAvailable: 5, needsAttention: 1 });
    } finally {
      dom.window.close();
    }
  });
});
