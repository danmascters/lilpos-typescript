import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

describe('Printer Settings Controller', () => {
  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'printing', 'printer-profile-registry.js'));
    runScript(path.join(repoRoot, 'dist', 'printing', 'printer-settings-service.js'));
    runScript(path.join(repoRoot, 'dist', 'settings', 'printer-settings', 'printer-settings-controller.js'));
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="root"></div>';
    vi.restoreAllMocks();
  });

  function makeDataService() {
    return {
      getMerchantId: () => 'merchant_test',
      getLocationId: () => 'location_test',
      getStationNumber: () => 1,
      loadPrinterSettings: vi.fn(async () => ({
        id: 'printer_settings_v1:merchant_test:location_test:1',
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        preferHttps: true,
        agentHttpsUrl: 'https://localhost:3031',
        agentHttpUrl: 'http://localhost:3030'
      })),
      listPosPrinterConfigs: vi.fn(async () => ([
        {
          id: 'main_printer',
          merchantId: 'merchant_test',
          locationId: 'location_test',
          name: 'Main',
          enabled: true,
          primaryRole: 'receipt',
          ip: '192.168.1.233',
          port: 9100,
          connectionType: 'network_printer',
          printMode: 'raw_escpos',
          transport: 'tcp_9100',
          profile: 'generic_escpos_thermal',
          paperWidth: '80mm',
          charactersPerLine: 48,
          defaultCopies: 1,
          retryEnabled: true,
          maxAttempts: 5,
          cutPaper: true,
          cashDrawerConnected: false,
          routeLabels: ['pizza'],
          createdAt: '2026-07-28T15:00:00.000Z',
          updatedAt: '2026-07-28T15:00:00.000Z'
        }
      ])),
      listPrinterRoutingRules: vi.fn(async () => ([
        {
          id: 'rule_main_receipt',
          merchantId: 'merchant_test',
          locationId: 'location_test',
          name: 'Main receipt',
          enabled: true,
          sortOrder: 10,
          destinationPrinterId: 'main_printer',
          ticketType: 'customer_receipt',
          trigger: 'sale_completed',
          orderTypes: ['all'],
          orderSources: ['all'],
          itemMatchMode: 'all',
          printerRouteIds: [],
          categoryIds: [],
          itemIds: [],
          excludedCategoryIds: [],
          excludedItemIds: [],
          ticketContentMode: 'full',
          includeCustomerName: true,
          includeCustomerPhone: false,
          includeDeliveryAddress: false,
          includeCustomerNotes: false,
          copies: 1,
          priority: 'normal',
          isFallbackRule: false,
          stopAfterMatch: false,
          createdAt: '2026-07-28T15:00:00.000Z',
          updatedAt: '2026-07-28T15:00:00.000Z'
        }
      ])),
      getWorkstationPrinterAssignment: vi.fn(async () => ({
        id: 'workstation-printers:merchant_test:location_test:1',
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        stationPrinterId: 'main_printer',
        cashDrawerPrinterId: '',
        printVoidSlips: true,
        printEdits: true,
        printResends: true,
        createdAt: '2026-07-28T15:00:00.000Z',
        updatedAt: '2026-07-28T15:00:00.000Z',
        syncStatus: 'local-only'
      })),
      listLocalPrintJobReferences: vi.fn(async () => ([
        {
          id: 'ref_1',
          orderId: 'order_1',
          printJobId: 'job_1',
          idempotencyKey: 'a',
          jobType: 'customer_receipt',
          printerRole: 'receipt',
          printerId: 'main_printer',
          requestedAt: '2026-07-28T15:00:00.000Z',
          lastKnownStatus: 'TRANSMITTED',
          lastStatusAt: '2026-07-28T15:00:01.000Z',
          isReprint: false
        }
      ])),
      savePrinterSettings: vi.fn(async (input: any) => input),
      upsertPosPrinterConfig: vi.fn(async (input: any) => ({ ...input, id: input.id || 'new_printer' })),
      setStationPrinter: vi.fn(async () => null),
      clearStationPrinter: vi.fn(async () => null),
      setCashDrawerPrinter: vi.fn(async () => null),
      clearCashDrawerPrinter: vi.fn(async () => null),
      updateStationPrinterSlipOptions: vi.fn(async () => null),
      savePrinterRoutingRule: vi.fn(async (input: any) => input),
      deactivatePosPrinterConfig: vi.fn(async () => null),
      saveLocalPrintJobReference: vi.fn(async () => null),
      updateLocalPrintJobReference: vi.fn(async () => null)
    };
  }

  function makeHarness() {
    const dataService = makeDataService();
    const submitTestReceipt = vi.fn(async () => ({ ok: true, status: 'QUEUED' }));
    const getPrinters = vi.fn(async () => ({
      ok: true,
      data: [
        {
          id: 'agent_only',
          name: 'Agent Printer',
          ip: '192.168.1.50',
          port: 9100,
          profile: 'generic_escpos',
          status: 'available'
        }
      ]
    }));

    (window as any).LilposLilPrintDiscovery = {
      discoverLilPrintAgent: vi.fn(async () => ({
        ok: true,
        connectionState: 'connected',
        message: 'Connected',
        checkedAt: '2026-07-28T15:00:00.000Z',
        baseUrl: 'http://localhost:3030',
        payload: {}
      }))
    };

    const retryJob = vi.fn(async () => ({ ok: true, data: { status: 'QUEUED' } }));
    const reprintJob = vi.fn(async () => ({ ok: true, data: { status: 'QUEUED' } }));
    const cancelJob = vi.fn(async () => ({ ok: true, data: { status: 'CANCELED' } }));
    const resolveJob = vi.fn(async () => ({ ok: true, data: { status: 'MANUALLY_RESOLVED' } }));
    const pausePrinter = vi.fn(async () => ({ ok: true, data: { status: 'PAUSED' } }));
    const resumePrinter = vi.fn(async () => ({ ok: true, data: { status: 'UNKNOWN' } }));
    const clearPrinterQueue = vi.fn(async () => ({ ok: true, data: { status: 'CLEARED' } }));

    (window as any).LilposLilPrintClient = {
      createLilPrintClient: () => ({
        getPrinters,
        submitPrintJob: vi.fn(async () => ({ ok: true })),
        retryJob,
        reprintJob,
        cancelJob,
        resolveJob,
        pausePrinter,
        resumePrinter,
        clearPrinterQueue
      })
    };

    (window as any).LilposPrintJobService = {
      createPrintJobService: () => ({ submitTestReceipt })
    };

    const root = document.getElementById('root');
    if (!root) throw new Error('Root not found');
    let controller: any = null;
    const mount = () => {
      root.innerHTML = controller.render();
      controller.bind(document);
    };
    controller = (window as any).LilposPrinterSettings.createController({
      dataService,
      onChange: mount,
      requestedBy: () => 'Manager',
      hasCapability: () => true
    });

    return {
      controller,
      dataService,
      submitTestReceipt,
      getPrinters,
      retryJob,
      reprintJob,
      cancelJob,
      resolveJob,
      pausePrinter,
      resumePrinter,
      clearPrinterQueue,
      mount,
      root
    };
  }

  it('renders configured printers as table rows and keeps printers default', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    expect(h.root.textContent).toContain('Printers');
    expect(h.root.textContent).toContain('Print Activity');
    expect(h.root.textContent).toContain('Advanced');
    expect(h.root.querySelectorAll('.ps-printer-table-main tbody tr').length).toBe(1);
    expect(h.root.textContent).toContain('Configured Printers');
    expect(h.root.textContent).toContain('Main');
    expect(h.root.querySelector('.ps-printer-card')).toBeNull();
    expect(h.root.querySelector('#psScanModalBackdrop')).toBeNull();
  });

  it('row click opens editor and supports keyboard activation', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const row = h.root.querySelector('[data-ps-open-printer-row="main_printer"]') as HTMLElement;
    expect(row).toBeTruthy();
    row.click();
    expect(h.root.querySelector('#psEditorBackdrop')).toBeTruthy();

    h.root.querySelector('#psEditorCancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const rowAgain = h.root.querySelector('[data-ps-open-printer-row="main_printer"]') as HTMLElement;
    rowAgain.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(h.root.querySelector('#psEditorBackdrop')).toBeTruthy();
  });

  it('test action targets selected printer and does not open editor', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const testBtn = h.root.querySelector('[data-ps-test-printer="main_printer"]') as HTMLElement;
    testBtn.click();
    await Promise.resolve();

    expect(h.submitTestReceipt).toHaveBeenCalledWith(expect.objectContaining({ printerId: 'main_printer' }));
    expect(h.root.querySelector('#psEditorBackdrop')).toBeNull();
  });

  it('edit action opens same editor and retains stable id', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const editBtn = h.root.querySelector('[data-ps-edit-printer="main_printer"]') as HTMLElement;
    editBtn.click();
    const stableIdInput = h.root.querySelector('#psEditorStableId') as HTMLInputElement;
    expect(stableIdInput).toBeTruthy();
    expect(stableIdInput.value).toBe('main_printer');
  });

  it('delete asks confirmation and does not open editor', async () => {
    const h = makeHarness();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await h.controller.load();
    h.mount();

    const deleteBtn = h.root.querySelector('[data-ps-delete-printer="main_printer"]') as HTMLElement;
    deleteBtn.click();
    expect(confirmSpy).toHaveBeenCalled();
    expect(h.root.querySelector('#psEditorBackdrop')).toBeNull();
    expect(h.dataService.deactivatePosPrinterConfig).not.toHaveBeenCalled();
  });

  it('station and cash drawer checkboxes update assignments without opening editor', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const stationBox = h.root.querySelector('[data-ps-set-station="main_printer"]') as HTMLInputElement;
    stationBox.checked = false;
    stationBox.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(h.dataService.clearStationPrinter).toHaveBeenCalled();
    expect(h.root.querySelector('#psEditorBackdrop')).toBeNull();

    const drawerBox = h.root.querySelector('[data-ps-set-drawer="main_printer"]') as HTMLInputElement;
    drawerBox.checked = true;
    drawerBox.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(h.dataService.setCashDrawerPrinter).toHaveBeenCalledWith(expect.objectContaining({ printerId: 'main_printer' }));
    expect(h.root.querySelector('#psEditorBackdrop')).toBeNull();
  });

  it('add printer opens editor and scan modal appears only after scan', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    expect(h.root.querySelector('#psScanModalBackdrop')).toBeNull();

    const addBtn = h.root.querySelector('#psAddPrinter') as HTMLElement;
    addBtn.click();
    expect(h.root.querySelector('#psEditorBackdrop')).toBeTruthy();

    h.root.querySelector('#psEditorCancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const scanBtn = h.root.querySelector('#psScanPrinters') as HTMLElement;
    scanBtn.click();
    await Promise.resolve();
    expect(h.root.querySelector('#psScanModalBackdrop')).toBeTruthy();
    expect(h.root.textContent).toContain('Discovered Printers');

    h.root.querySelector('#psCloseScanModal')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(h.root.querySelector('#psScanModalBackdrop')).toBeNull();
  });

  it('saves Cut After Print from setup section', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const editBtn = h.root.querySelector('[data-ps-edit-printer="main_printer"]') as HTMLElement;
    editBtn.click();

    const cutAfter = h.root.querySelector('#psEditorCutAfterPrint') as HTMLInputElement;
    expect(cutAfter).toBeTruthy();
    cutAfter.checked = false;

    const saveBtn = h.root.querySelector('#psEditorSave') as HTMLElement;
    saveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.dataService.upsertPosPrinterConfig).toHaveBeenCalledWith(expect.objectContaining({ cutPaper: false }));
  });

  it('saves Blank Lines Before Cut from setup section', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    const editBtn = h.root.querySelector('[data-ps-edit-printer="main_printer"]') as HTMLElement;
    editBtn.click();

    const blankLines = h.root.querySelector('#psEditorBlankLines') as HTMLInputElement;
    expect(blankLines).toBeTruthy();
    blankLines.value = '2';
    blankLines.dispatchEvent(new Event('change', { bubbles: true }));
    expect(h.controller.state.editorLayoutDraft.blankLinesBeforeCut).toBe(2);

    const saveBtn = h.root.querySelector('#psEditorSave') as HTMLElement;
    saveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.dataService.upsertPosPrinterConfig).toHaveBeenCalled();
  });

  it('shows connection type and dependent print mode options', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    h.root.querySelector('[data-ps-edit-printer="main_printer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const connectionType = h.root.querySelector('#psEditorConnectionType') as HTMLSelectElement;
    const printMode = h.root.querySelector('#psEditorPrintMode') as HTMLSelectElement;

    expect(connectionType).toBeTruthy();
    expect(printMode).toBeTruthy();
    expect(connectionType.options.length).toBeGreaterThan(1);
    expect(printMode.options.length).toBeGreaterThan(1);
    expect(printMode.textContent).toContain('Raw ESC/POS');
    expect(printMode.textContent).toContain('Epson ePOS XML');
  });

  it('prevents enabling unsupported connection type as active printer', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    h.root.querySelector('[data-ps-edit-printer="main_printer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const connectionType = h.root.querySelector('#psEditorConnectionType') as HTMLSelectElement;
    connectionType.value = 'usb_serial';
    connectionType.dispatchEvent(new Event('change', { bubbles: true }));

    h.root.querySelector('#psEditorSave')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(h.dataService.upsertPosPrinterConfig).not.toHaveBeenCalled();
    expect(h.root.textContent).toContain('Only implemented connection types can be enabled.');
  });

  it('selecting Epson TM-U220 disables Cut After Print and persists profile id', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    h.root.querySelector('[data-ps-edit-printer="main_printer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const profile = h.root.querySelector('#psEditorProfile') as HTMLSelectElement;
    profile.value = 'epson_tm_u220';
    profile.dispatchEvent(new Event('change', { bubbles: true }));

    const cutToggle = h.root.querySelector('#psEditorCutAfterPrint') as HTMLInputElement;
    expect(cutToggle.disabled).toBe(true);
    expect(cutToggle.checked).toBe(false);

    h.root.querySelector('#psEditorSave')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();

    expect(h.dataService.upsertPosPrinterConfig).toHaveBeenCalledWith(
      expect.objectContaining({ profile: 'epson_tm_u220', cutPaper: false })
    );
  });

  it('thermal profile retains thermal cut capability', async () => {
    const h = makeHarness();
    await h.controller.load();
    h.mount();

    h.root.querySelector('[data-ps-edit-printer="main_printer"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const profile = h.root.querySelector('#psEditorProfile') as HTMLSelectElement;
    profile.value = 'generic_escpos_thermal';
    profile.dispatchEvent(new Event('change', { bubbles: true }));

    const cutToggle = h.root.querySelector('#psEditorCutAfterPrint') as HTMLInputElement;
    expect(cutToggle.disabled).toBe(false);
  });

  it('routes retry action to retry endpoint and updates local state', async () => {
    const h = makeHarness();
    h.dataService.listLocalPrintJobReferences.mockResolvedValueOnce([
      {
        id: 'ref_retry',
        orderId: 'order_2',
        printJobId: 'job_retry',
        idempotencyKey: 'idem_retry',
        jobType: 'customer_receipt',
        printerRole: 'receipt',
        printerId: 'main_printer',
        requestedAt: '2026-07-28T15:00:00.000Z',
        lastKnownStatus: 'FAILED_FINAL',
        lastStatusAt: '2026-07-28T15:00:01.000Z',
        isReprint: false
      }
    ]);

    await h.controller.load();
    h.mount();
    (h.root.querySelector('[data-ps-top-tab="activity"]') as HTMLElement).click();

    (h.root.querySelector('[data-ps-retry-job="ref_retry"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.retryJob).toHaveBeenCalledWith(
      'job_retry',
      expect.objectContaining({ reason: 'Manual retry from Printer Settings' })
    );
    expect(h.dataService.updateLocalPrintJobReference).toHaveBeenCalledWith(
      'ref_retry',
      expect.objectContaining({ lastKnownStatus: 'QUEUED' })
    );
  });

  it('shows cancel only for active states and calls cancel endpoint', async () => {
    const h = makeHarness();
    h.dataService.listLocalPrintJobReferences.mockResolvedValueOnce([
      {
        id: 'ref_cancel',
        orderId: 'order_3',
        printJobId: 'job_cancel',
        idempotencyKey: 'idem_cancel',
        jobType: 'customer_receipt',
        printerRole: 'receipt',
        printerId: 'main_printer',
        requestedAt: '2026-07-28T15:00:00.000Z',
        lastKnownStatus: 'QUEUED',
        lastStatusAt: '2026-07-28T15:00:01.000Z',
        isReprint: false
      },
      {
        id: 'ref_sent',
        orderId: 'order_4',
        printJobId: 'job_sent',
        idempotencyKey: 'idem_sent',
        jobType: 'customer_receipt',
        printerRole: 'receipt',
        printerId: 'main_printer',
        requestedAt: '2026-07-28T15:00:00.000Z',
        lastKnownStatus: 'TRANSMITTED',
        lastStatusAt: '2026-07-28T15:00:01.000Z',
        isReprint: false
      }
    ]);

    await h.controller.load();
    h.mount();
    (h.root.querySelector('[data-ps-top-tab="activity"]') as HTMLElement).click();

    expect(h.root.querySelector('[data-ps-cancel-job="ref_cancel"]')).toBeTruthy();
    expect(h.root.querySelector('[data-ps-cancel-job="ref_sent"]')).toBeNull();

    (h.root.querySelector('[data-ps-cancel-job="ref_cancel"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.cancelJob).toHaveBeenCalledWith(
      'job_cancel',
      expect.objectContaining({ reason: 'Canceled from Printer Settings' })
    );
  });

  it('calls resolve endpoint for FAILED_FINAL jobs', async () => {
    const h = makeHarness();
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Issue handled manually');
    h.dataService.listLocalPrintJobReferences.mockResolvedValueOnce([
      {
        id: 'ref_resolve',
        orderId: 'order_5',
        printJobId: 'job_resolve',
        idempotencyKey: 'idem_resolve',
        jobType: 'customer_receipt',
        printerRole: 'receipt',
        printerId: 'main_printer',
        requestedAt: '2026-07-28T15:00:00.000Z',
        lastKnownStatus: 'FAILED_FINAL',
        lastStatusAt: '2026-07-28T15:00:01.000Z',
        isReprint: false
      }
    ]);

    await h.controller.load();
    h.mount();
    (h.root.querySelector('[data-ps-top-tab="activity"]') as HTMLElement).click();

    (h.root.querySelector('[data-ps-resolve-job="ref_resolve"]') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(promptSpy).toHaveBeenCalled();
    expect(h.resolveJob).toHaveBeenCalledWith(
      'job_resolve',
      expect.objectContaining({ resolution: 'Issue handled manually' })
    );
    expect(h.dataService.updateLocalPrintJobReference).toHaveBeenCalledWith(
      'ref_resolve',
      expect.objectContaining({ lastKnownStatus: 'MANUALLY_RESOLVED' })
    );
  });

  it('queue clear sends default contract status set', async () => {
    const h = makeHarness();
    vi.spyOn(window, 'prompt').mockReturnValue('Shift change');

    await h.controller.load();
    h.mount();
    (h.root.querySelector('[data-ps-top-tab="advanced"]') as HTMLElement).click();

    (h.root.querySelector('#psClearQueue') as HTMLElement).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(h.clearPrinterQueue).toHaveBeenCalledWith(
      'main_printer',
      'Shift change',
      expect.anything(),
      ['QUEUED', 'RETRY_WAIT']
    );
  });
});
