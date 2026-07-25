import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

function runScriptInContext(filePath: string, context: vm.Context) {
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
}

async function waitForSelector(document: Document, selector: string, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const match = document.querySelector(selector);
    if (match) return match;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${selector}`);
}

async function bootApp() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost',
    runScripts: 'outside-only'
  });
  const context = dom.getInternalVMContext();
  const win = dom.window as any;
  win.alert = () => {};
  win.indexedDB = indexedDB;
  win.IDBKeyRange = IDBKeyRange;
  win.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {}
  });
  (context as any).indexedDB = indexedDB;
  (context as any).IDBKeyRange = IDBKeyRange;
  (context as any).alert = () => {};

  const root = path.resolve(__dirname, '..');
  runScriptInContext(path.join(root, 'dist/lilpos-runtime-data.js'), context);
  runScriptInContext(path.join(root, 'dist/app.js'), context);
  await waitForSelector(win.document, '#calendarClassifier');
  return { dom, document: win.document as Document };
}

function click(document: Document, selector: string) {
  const element = document.querySelector(selector) as HTMLElement | null;
  expect(element, `Expected ${selector}`).not.toBeNull();
  element?.click();
}

function setNativeValue(document: Document, selector: string, value: string) {
  const input = document.querySelector(selector) as HTMLInputElement | null;
  expect(input, `Expected ${selector}`).not.toBeNull();
  if (!input) return;
  input.value = value;
  input.dispatchEvent(new document.defaultView!.Event('input', { bubbles: true }));
  input.dispatchEvent(new document.defaultView!.Event('change', { bubbles: true }));
}

describe('future order date and time joggers', () => {
  it('renders weekday-date format and adjusts date and time components', async () => {
    const app = await bootApp();
    try {
      click(app.document, '#calendarClassifier');
      await waitForSelector(app.document, '#scheduleDate');

      setNativeValue(app.document, '#scheduleDate', '2026-07-11');
      expect(app.document.querySelector('.schedule-field-group .schedule-picker-value')?.textContent).toBe('SAT-07/11/26');

      click(app.document, '[data-schedule-date-part="day"][data-schedule-delta="1"]');
      expect((app.document.querySelector('#scheduleDate') as HTMLInputElement).value).toBe('2026-07-12');
      expect(app.document.querySelector('.schedule-field-group .schedule-picker-value')?.textContent).toBe('SUN-07/12/26');

      setNativeValue(app.document, '#scheduleTime', '03:30');
      const timeValueSelector = '.schedule-field-group:nth-child(2) .schedule-picker-value';
      expect(app.document.querySelector(timeValueSelector)?.textContent).toBe('03:30 AM');

      click(app.document, '[data-schedule-time-part="period"][data-schedule-delta="1"]');
      expect((app.document.querySelector('#scheduleTime') as HTMLInputElement).value).toBe('15:30');
      expect(app.document.querySelector(timeValueSelector)?.textContent).toBe('03:30 PM');

      expect(app.document.querySelectorAll('[data-schedule-date-part]')).toHaveLength(6);
      expect(app.document.querySelectorAll('[data-schedule-time-part]')).toHaveLength(6);
    } finally {
      app.dom.window.close();
    }
  });
});
