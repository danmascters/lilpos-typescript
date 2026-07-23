import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';

type BootedApp = {
  dom: JSDOM;
  window: Window & typeof globalThis;
  document: Document;
};

function runScriptInContext(filePath: string, context: vm.Context) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInContext(code, context, { filename: filePath });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForSelector(document: Document, selector: string, timeoutMs = 3000): Promise<Element> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = document.querySelector(selector);
    if (found) return found;
    await wait(20);
  }
  throw new Error(`Timed out waiting for selector: ${selector}`);
}

function click(document: Document, selector: string) {
  const target = document.querySelector(selector) as HTMLElement | null;
  expect(target, `Expected click target: ${selector}`).not.toBeNull();
  target?.dispatchEvent(new document.defaultView!.MouseEvent('click', { bubbles: true }));
}

function inputValue(document: Document, selector: string, value: string) {
  const field = document.querySelector(selector) as HTMLInputElement | null;
  expect(field, `Expected input field: ${selector}`).not.toBeNull();
  if (!field) return;
  field.value = value;
  field.dispatchEvent(new document.defaultView!.Event('input', { bubbles: true }));
}

async function bootApp(indexedDbFactory = new FDBFactory()): Promise<BootedApp> {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost',
    runScripts: 'outside-only'
  });
  const context = dom.getInternalVMContext();
  const win = dom.window as unknown as Window & typeof globalThis;

  (win as any).alert = () => {};
  (win as any).indexedDB = indexedDbFactory;
  (win as any).IDBKeyRange = FDBKeyRange;
  (win as any).matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  });

  (context as any).indexedDB = indexedDbFactory;
  (context as any).IDBKeyRange = FDBKeyRange;
  (context as any).alert = () => {};

  const repoRoot = path.resolve(__dirname, '..');
  runScriptInContext(path.join(repoRoot, 'dist', 'lilpos-runtime-data.js'), context);
  runScriptInContext(path.join(repoRoot, 'dist', 'app', 'orders-management-view.js'), context);
  runScriptInContext(path.join(repoRoot, 'dist', 'app.js'), context);

  await waitForSelector(win.document, '#ordersViewBtn');
  return { dom, window: win, document: win.document };
}

function loadOrdersHelper() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'outside-only'
  });
  const context = dom.getInternalVMContext();
  const repoRoot = path.resolve(__dirname, '..');
  runScriptInContext(path.join(repoRoot, 'dist', 'app', 'orders-management-view.js'), context);
  return {
    dom,
    api: (dom.window as any).LilposOrdersManagement
  };
}

describe('Orders Management view mode helper', () => {
  it('defaults every queue to Tiles mode and stores queues independently', () => {
    const { dom, api } = loadOrdersHelper();
    try {
      const defaults = api.normalizePreferences(null);
      expect(defaults).toEqual(expect.objectContaining({
        open: 'STANDARD',
        completed: 'STANDARD',
        onlineOnly: 'STANDARD',
        futureOrders: 'STANDARD'
      }));
      expect(defaults.columnLayouts.open.order).toEqual(api.DEFAULT_COLUMN_ORDER);

      const openRows = api.setViewModeForQueue(defaults, 'open', 'ROWS');
      expect(openRows.open).toBe('ROWS');
      expect(openRows.completed).toBe('STANDARD');
      expect(api.viewModeForQueue(openRows, 'completed')).toBe('STANDARD');
    } finally {
      dom.window.close();
    }
  });

  it('stores column order and sort independently per queue', () => {
    const { dom, api } = loadOrdersHelper();
    try {
      const defaults = api.normalizePreferences(null);
      const openMoved = api.moveColumnForQueue(defaults, 'open', 'phone', 'customer');
      expect(api.columnLayoutForQueue(openMoved, 'open').order.slice(0, 3)).toEqual(['order', 'phone', 'customer']);
      expect(api.columnLayoutForQueue(openMoved, 'completed').order.slice(0, 3)).toEqual(['order', 'customer', 'phone']);

      const sorted = api.setSortForQueue(openMoved, 'open', 'total');
      expect(api.columnLayoutForQueue(sorted, 'open').sort).toEqual({ columnId: 'total', direction: 'asc' });
      const toggled = api.setSortForQueue(sorted, 'open', 'total');
      expect(api.columnLayoutForQueue(toggled, 'open').sort).toEqual({ columnId: 'total', direction: 'desc' });
    } finally {
      dom.window.close();
    }
  });

  it('renders row totals, payment status pills, order status pills, and long customer truncation hooks', () => {
    const { dom, api } = loadOrdersHelper();
    try {
      const html = api.renderOrderRows({
        rows: [{
          id: 'order_1',
          number: '1-00042',
          customerName: 'A Very Long Customer Name That Should Truncate In The Row',
          customerPhone: '(555) 123-4567',
          customerAddress: '88 Long Street, Queens, NY, 11101',
          orderType: 'delivery',
          timeLabel: '11:30 AM',
          receivedTimeLabel: '11:30 AM',
          dueTimeLabel: 'ASAP 12:00 PM',
          source: 'Phone',
          status: 'open',
          total: 123.45,
          paymentStatus: 'unpaid'
        }],
        orderTypes: { delivery: 'Delivery' },
        h: (value: any) => String(value ?? '').replace(/[&<>"]/g, ''),
        money: (value: any) => `$${Number(value).toFixed(2)}`,
        formatOrderNumberForDisplay: (value: any) => String(value).replace('-000', '-'),
        paymentBadgeForOrder: () => ({ paidClass: 'partial', paidText: 'PARTIALLY PAID' })
      });
      const host = dom.window.document.createElement('div');
      host.innerHTML = html;

      expect(host.querySelector('.orders-mgmt-row-head')?.textContent).toContain('Received Time');
      expect(host.querySelector('.orders-mgmt-row-head')?.textContent).toContain('Due Time');
      expect(host.querySelector('[data-orders-sort-column="receivedTime"]')).not.toBeNull();
      expect(host.querySelector('[data-orders-column-id="phone"]')?.getAttribute('draggable')).toBe('true');
      const dataRow = host.querySelector('.orders-mgmt-row[data-open-order]');
      expect(dataRow?.querySelector('.orders-row-number')?.textContent).toBe('#1-42');
      expect(dataRow?.querySelector('.orders-row-customer')?.getAttribute('title')).toContain('Very Long Customer');
      expect(dataRow?.querySelector('.orders-row-customer-meta')?.textContent).toContain('88 Long Street');
      expect(dataRow?.querySelector('.orders-row-phone')?.textContent).toBe('(555) 123-4567');
      expect(dataRow?.querySelector('.orders-row-received-time')?.textContent).toBe('11:30 AM');
      expect(dataRow?.querySelector('.orders-row-due-time')?.textContent).toBe('ASAP 12:00 PM');
      expect(dataRow?.querySelector('.orders-row-payment .order-payment-badge')?.textContent).toBe('PARTIALLY PAID');
      expect(dataRow?.querySelector('.orders-row-status .order-status')?.textContent).toBe('OPEN');
      expect(dataRow?.querySelector('.orders-row-total')?.textContent).toBe('$123.45');
    } finally {
      dom.window.close();
    }
  });

  it('shows phone for any row but keeps address delivery-only', () => {
    const { dom, api } = loadOrdersHelper();
    try {
      const html = api.renderOrderRows({
        rows: [{
          id: 'order_2',
          number: '1-43',
          customerName: 'Pickup Guest',
          customerPhone: '(555) 333-2222',
          customerAddress: '22 Hidden Address',
          orderType: 'pickup',
          timeLabel: '12:00 PM',
          receivedTimeLabel: '12:00 PM',
          dueTimeLabel: 'ASAP',
          source: 'Counter',
          status: 'open',
          total: 20,
          paymentStatus: 'unpaid'
        }],
        orderTypes: { pickup: 'Pickup' },
        h: (value: any) => String(value ?? '').replace(/[&<>"]/g, ''),
        money: (value: any) => `$${Number(value).toFixed(2)}`,
        formatOrderNumberForDisplay: (value: any) => String(value),
        paymentBadgeForOrder: () => ({ paidClass: 'unpaid', paidText: 'NOT PAID' })
      });
      const host = dom.window.document.createElement('div');
      host.innerHTML = html;
      const dataRow = host.querySelector('.orders-mgmt-row[data-open-order]');

      expect(dataRow?.querySelector('.orders-row-phone')?.textContent).toBe('(555) 333-2222');
      expect(dataRow?.querySelector('.orders-row-due-time')?.textContent).toBe('ASAP');
      expect(dataRow?.querySelector('.orders-row-customer-meta')).toBeNull();
    } finally {
      dom.window.close();
    }
  });

  it('renders an empty rows container without dropping the switch markup', () => {
    const { dom, api } = loadOrdersHelper();
    try {
      const switchHtml = api.renderViewModeSwitch({ activeMode: 'ROWS', h: (value: any) => String(value) });
      const rowsHtml = api.renderOrderRows({
        rows: [],
        orderTypes: {},
        h: (value: any) => String(value ?? ''),
        money: (value: any) => String(value),
        formatOrderNumberForDisplay: (value: any) => String(value),
        paymentBadgeForOrder: () => ({ paidClass: 'unpaid', paidText: 'NOT PAID' })
      });
      const host = dom.window.document.createElement('div');
      host.innerHTML = switchHtml + rowsHtml;

      expect(host.querySelector('[data-orders-view-mode="STANDARD"]')?.textContent).toBe('Tiles');
      expect(host.querySelector('[data-orders-view-mode="ROWS"]')?.classList.contains('active')).toBe(true);
      expect(host.querySelector('.orders-mgmt-rows')).not.toBeNull();
      expect(host.querySelectorAll('[data-open-order]').length).toBe(0);
    } finally {
      dom.window.close();
    }
  });
});

describe('Orders Management view mode app behavior', () => {
  it('keeps Tiles as the initial card mode and preserves card markup', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#ordersViewBtn');
      await waitForSelector(app.document, '#ordersQuery');

      expect(app.document.querySelector('[data-orders-view-mode="STANDARD"]')?.classList.contains('active')).toBe(true);
      expect(app.document.querySelector('.order-mgmt-tile')).not.toBeNull();
      expect(app.document.querySelector('.orders-mgmt-rows')).toBeNull();
    } finally {
      app.dom.window.close();
    }
  });

  it('switching Open to Rows does not change Completed and does not clear search', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#ordersViewBtn');
      await waitForSelector(app.document, '#ordersQuery');
      inputValue(app.document, '#ordersQuery', 'Guest');
      click(app.document, '[data-orders-view-mode="ROWS"]');
      await wait(40);

      expect((app.document.querySelector('#ordersQuery') as HTMLInputElement).value).toBe('Guest');
      expect(app.document.querySelector('[data-orders-view-mode="ROWS"]')?.classList.contains('active')).toBe(true);

      click(app.document, '[data-orders-filter="completed"]');
      await wait(40);
      expect(app.document.querySelector('[data-orders-view-mode="STANDARD"]')?.classList.contains('active')).toBe(true);
    } finally {
      app.dom.window.close();
    }
  });

  it('row clicks open the matching order detail workflow', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#ordersViewBtn');
      await waitForSelector(app.document, '#ordersQuery');
      click(app.document, '[data-orders-view-mode="ROWS"]');
      const firstRow = await waitForSelector(app.document, '.orders-mgmt-row[data-open-order]') as HTMLElement;
      const displayNumber = firstRow.querySelector('.orders-row-number')?.textContent?.replace(/^#/, '') || '';
      firstRow.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true }));
      await wait(80);

      expect(app.document.querySelector('.order-detail-pane')?.textContent).toContain(`Order #${displayNumber}`);
    } finally {
      app.dom.window.close();
    }
  });

  it('clicking a row header sorts visible rows by that column', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#ordersViewBtn');
      await waitForSelector(app.document, '#ordersQuery');
      click(app.document, '[data-orders-view-mode="ROWS"]');
      await waitForSelector(app.document, '[data-orders-sort-column="total"]');
      click(app.document, '[data-orders-sort-column="total"]');
      await wait(60);

      const totals = Array.from(app.document.querySelectorAll('.orders-mgmt-row[data-open-order] .orders-row-total'))
        .map((entry) => Number(String(entry.textContent || '').replace(/[^0-9.]/g, '')));
      expect(totals.length).toBeGreaterThan(1);
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
      expect(app.document.querySelector('[data-orders-sort-column="total"] .orders-row-sort-marker')?.textContent).toBe('▲');
    } finally {
      app.dom.window.close();
    }
  });

  it('empty queues show the view switch in both Tiles and Rows modes', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#ordersViewBtn');
      await waitForSelector(app.document, '#ordersQuery');
      inputValue(app.document, '#ordersQuery', 'zzzz-no-matching-orders');

      expect(app.document.querySelector('.orders-view-switch')).not.toBeNull();
      expect(app.document.body.textContent).toContain('No matching orders for this filter.');

      click(app.document, '[data-orders-view-mode="ROWS"]');
      await wait(40);
      expect(app.document.querySelector('.orders-view-switch')).not.toBeNull();
      expect(app.document.querySelector('.orders-mgmt-rows.is-empty')).not.toBeNull();
      expect(app.document.body.textContent).toContain('No matching orders for this filter.');
    } finally {
      app.dom.window.close();
    }
  });
});

describe('Orders Management view mode runtime persistence', () => {
  it('persists queue preferences across service reinitialization', async () => {
    const factory = new FDBFactory();
    const dbName = 'OrdersViewModePrefsTest';
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

    try {
      const createService = (dom.window as any).LilposRuntime.createLilposDataService;
      const serviceA = createService({ dbName, dbVersion: 3 });
      const defaults = await serviceA.loadOrdersManagementViewPreferences();
      expect(defaults.open).toBe('STANDARD');
      expect(defaults.completed).toBe('STANDARD');
      expect(defaults.columnLayouts.open.order.slice(0, 3)).toEqual(['order', 'customer', 'phone']);

      await serviceA.saveOrdersManagementViewPreferences({
        ...defaults,
        open: 'ROWS',
        onlineOnly: 'ROWS',
        columnLayouts: {
          ...defaults.columnLayouts,
          open: {
            order: ['phone', 'order', 'customer', 'type', 'receivedTime', 'dueTime', 'source', 'payment', 'status', 'total'],
            sort: { columnId: 'total', direction: 'desc' }
          }
        }
      });

      const serviceB = createService({ dbName, dbVersion: 3 });
      const restored = await serviceB.loadOrdersManagementViewPreferences();
      expect(restored.open).toBe('ROWS');
      expect(restored.completed).toBe('STANDARD');
      expect(restored.onlineOnly).toBe('ROWS');
      expect(restored.futureOrders).toBe('STANDARD');
      expect(restored.columnLayouts.open.order.slice(0, 3)).toEqual(['phone', 'order', 'customer']);
      expect(restored.columnLayouts.open.sort).toEqual({ columnId: 'total', direction: 'desc' });
      expect(restored.columnLayouts.completed.order.slice(0, 3)).toEqual(['order', 'customer', 'phone']);
    } finally {
      dom.window.close();
    }
  });

  it('uses the existing kv migration path without losing existing v1 data', async () => {
    const factory = new FDBFactory();
    const dbName = 'OrdersViewModeMigrationTest';
    const seededValue = { runtimeKind: 'lilpos-runtime-package-v1', packageVersion: 42 };

    await new Promise<void>((resolve, reject) => {
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(seededValue, 'activeMenu');
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

    try {
      const createService = (dom.window as any).LilposRuntime.createLilposDataService;
      const service = createService({ dbName, dbVersion: 3 });
      await service.saveOrdersManagementViewPreferences({ open: 'ROWS' });

      expect(await service.getRuntimeCache('activeMenu')).toEqual(seededValue);
      expect((await service.loadOrdersManagementViewPreferences()).open).toBe('ROWS');
    } finally {
      dom.window.close();
    }
  });
});
