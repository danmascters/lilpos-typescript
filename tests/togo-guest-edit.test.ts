import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

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

async function bootApp(): Promise<BootedApp> {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost',
    runScripts: 'outside-only'
  });
  const context = dom.getInternalVMContext();
  const win = dom.window as unknown as Window & typeof globalThis;

  (win as any).alert = () => {};
  (win as any).indexedDB = indexedDB;
  (win as any).IDBKeyRange = IDBKeyRange;
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

  (context as any).indexedDB = indexedDB;
  (context as any).IDBKeyRange = IDBKeyRange;
  (context as any).alert = () => {};

  const repoRoot = path.resolve(__dirname, '..');
  runScriptInContext(path.join(repoRoot, 'dist', 'lilpos-runtime-data.js'), context);
  runScriptInContext(path.join(repoRoot, 'dist', 'app.js'), context);

  await waitForSelector(win.document, '[data-order-type="togo"]');
  return { dom, window: win, document: win.document };
}

async function saveTogoGuest(document: Document, name: string, phone: string) {
  click(document, '[data-order-type="togo"]');
  await waitForSelector(document, '#startOrderTypeDraftBtn');
  inputValue(document, '#togoDraftName', name);
  inputValue(document, '#togoDraftPhone', phone);
  click(document, '#startOrderTypeDraftBtn');
  await wait(40);
}

describe('To-Go guest summary edit pencil', () => {
  it('shows edit icon for To-Go name only', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, 'Taylor Guest', '');
      const pencil = app.document.querySelector('#editTogoGuestDetails');
      expect(pencil).not.toBeNull();
      expect(app.document.body.textContent).toContain('Guest Name:');
      expect(app.document.body.textContent).toContain('Taylor Guest');
    } finally {
      app.dom.window.close();
    }
  });

  it('shows edit icon for To-Go phone only', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, '', '5551234567');
      const pencil = app.document.querySelector('#editTogoGuestDetails');
      expect(pencil).not.toBeNull();
      expect(app.document.body.textContent).toContain('Guest Phone:');
    } finally {
      app.dom.window.close();
    }
  });

  it('hides edit icon when To-Go guest name and phone are both blank', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, '', '');
      const pencil = app.document.querySelector('#editTogoGuestDetails');
      expect(pencil).toBeNull();
      expect(app.document.body.textContent).not.toContain('Guest Name:');
      expect(app.document.body.textContent).not.toContain('Guest Phone:');
    } finally {
      app.dom.window.close();
    }
  });

  it('clicking edit pre-fills existing To-Go guest values', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, 'Jamie Test', '5554447777');
      click(app.document, '#editTogoGuestDetails');
      await waitForSelector(app.document, '#togoDraftName');
      const nameField = app.document.querySelector('#togoDraftName') as HTMLInputElement;
      const phoneField = app.document.querySelector('#togoDraftPhone') as HTMLInputElement;
      expect(nameField.value).toBe('Jamie Test');
      expect(phoneField.value).toContain('555');
      expect(phoneField.value).toContain('7777');
    } finally {
      app.dom.window.close();
    }
  });

  it('saving edits updates the current order details in place', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, 'First Name', '');
      click(app.document, '#editTogoGuestDetails');
      await waitForSelector(app.document, '#togoDraftName');
      inputValue(app.document, '#togoDraftName', 'Updated Name');
      click(app.document, '#startOrderTypeDraftBtn');
      await wait(40);
      const summaryText = app.document.body.textContent || '';
      expect(summaryText).toContain('Updated Name');
      expect(summaryText).not.toContain('First Name');
      expect(app.document.querySelector('#editTogoGuestDetails')).not.toBeNull();
    } finally {
      app.dom.window.close();
    }
  });

  it('canceling edit keeps existing To-Go guest values unchanged', async () => {
    const app = await bootApp();
    try {
      await saveTogoGuest(app.document, 'Keep Me', '');
      click(app.document, '#editTogoGuestDetails');
      await waitForSelector(app.document, '#togoDraftName');
      inputValue(app.document, '#togoDraftName', 'Discard Me');
      click(app.document, '#cancelOrderTypeDraftBtn');
      await wait(40);
      const summaryText = app.document.body.textContent || '';
      expect(summaryText).toContain('Keep Me');
      expect(summaryText).not.toContain('Discard Me');
    } finally {
      app.dom.window.close();
    }
  });

  it('editing To-Go guest details keeps active cart and order type unchanged', async () => {
    const app = await bootApp();
    try {
      const lineCountBefore = app.document.querySelectorAll('.line-item').length;

      await saveTogoGuest(app.document, 'Cart Keeper', '5556669999');
      click(app.document, '#editTogoGuestDetails');
      await waitForSelector(app.document, '#togoDraftName');
      inputValue(app.document, '#togoDraftName', 'Cart Keeper Updated');
      click(app.document, '#startOrderTypeDraftBtn');
      await wait(40);

      const lineCountAfter = app.document.querySelectorAll('.line-item').length;
      const activeOrderType = app.document.querySelector('[data-order-type="togo"].active');

      expect(lineCountAfter).toBe(lineCountBefore);
      expect(activeOrderType).not.toBeNull();
    } finally {
      app.dom.window.close();
    }
  });

});
