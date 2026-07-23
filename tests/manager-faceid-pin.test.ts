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

  await waitForSelector(win.document, '#managerSettingsBtn');
  return { dom, window: win, document: win.document };
}

async function openManagerPin(document: Document) {
  click(document, '#managerSettingsBtn');
  await waitForSelector(document, '.mgr-pin-card');
}

describe('Manager PIN Face ID placeholder', () => {
  it('renders Face ID icon button with correct accessible label and tooltip', async () => {
    const app = await bootApp();
    try {
      await openManagerPin(app.document);
      const btn = app.document.querySelector('#mgrPinFaceId') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      expect(btn?.getAttribute('aria-label')).toBe('Sign in using Face ID');
      expect(btn?.getAttribute('title')).toBe('Sign in using Face ID');
    } finally {
      app.dom.window.close();
    }
  });

  it('clicking Face ID does not submit PIN and does not authenticate', async () => {
    const app = await bootApp();
    try {
      await openManagerPin(app.document);
      click(app.document, '#mgrPinFaceId');
      await wait(30);

      expect(app.document.querySelector('.mgr-settings-view')).toBeNull();
      expect(app.document.querySelector('.mgr-pin-card')).not.toBeNull();
      expect(app.document.body.textContent || '').toContain('Face ID sign-in is not available yet.');
    } finally {
      app.dom.window.close();
    }
  });

  it('keyboard activation on Face ID button shows placeholder message', async () => {
    const app = await bootApp();
    try {
      await openManagerPin(app.document);
      const btn = app.document.querySelector('#mgrPinFaceId') as HTMLButtonElement | null;
      expect(btn).not.toBeNull();
      btn?.focus();
      btn?.dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await wait(30);
      expect(app.document.body.textContent || '').toContain('Face ID sign-in is not available yet.');
      expect(app.document.querySelector('.mgr-pin-card')).not.toBeNull();
      expect(app.document.querySelector('.mgr-settings-view')).toBeNull();
    } finally {
      app.dom.window.close();
    }
  });

  it('existing PIN login still works after Face ID click', async () => {
    const app = await bootApp();
    try {
      await openManagerPin(app.document);
      click(app.document, '#mgrPinFaceId');
      await wait(20);

      for (const d of ['1', '2', '3', '4']) {
        click(app.document, `[data-pin-digit="${d}"]`);
        await wait(10);
      }
      await wait(40);

      expect(app.document.querySelector('.mgr-settings-view')).not.toBeNull();
      expect(app.document.querySelector('.mgr-pin-card')).toBeNull();
    } finally {
      app.dom.window.close();
    }
  });

  it('placeholder message appears and PIN controls (clear/back/cancel) remain functional', async () => {
    const app = await bootApp();
    try {
      await openManagerPin(app.document);
      click(app.document, '#mgrPinFaceId');
      await wait(20);

      click(app.document, '[data-pin-digit="9"]');
      click(app.document, '[data-pin-back]');
      click(app.document, '[data-pin-digit="8"]');
      click(app.document, '[data-pin-clear]');
      await wait(20);

      const display = app.document.querySelector('.mgr-pin-display');
      expect(display?.textContent || '').toContain('○');

      click(app.document, '#mgrPinCancel');
      await wait(20);
      expect(app.document.querySelector('.mgr-pin-card')).toBeNull();
    } finally {
      app.dom.window.close();
    }
  });
});
