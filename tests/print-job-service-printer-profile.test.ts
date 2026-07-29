import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

describe('Print Job Service profile propagation', () => {
  const submitPrintJob = vi.fn(async () => ({ ok: true, status: 200, requestId: 'r1', data: { status: 'QUEUED' } }));
  const renderCustomer = vi.fn(() => ({ base64: 'dGVzdA==', bytes: [] }));
  const renderTest = vi.fn(() => ({ base64: 'dGVzdA==', bytes: [] }));

  beforeAll(() => {
    const repoRoot = path.resolve(__dirname, '..');
    runScript(path.join(repoRoot, 'dist', 'printing', 'printer-profile-registry.js'));
    runScript(path.join(repoRoot, 'dist', 'printing', 'print-job-service.js'));
  });

  beforeEach(() => {
    vi.clearAllMocks();

    (window as any).LilposPrinterSettingsService = {
      defaults: (input: any) => ({
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        receiptPrintingEnabled: true,
        preferHttps: true,
        agentHttpsUrl: 'https://localhost:3031',
        agentHttpUrl: 'http://localhost:3030',
        feedLinesBeforeCut: 2,
        cutPaperAfterReceipt: true,
        copies: 1,
        priority: 'normal',
        maxAttempts: 5,
        ...input
      }),
      normalize: (input: any) => ({
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        receiptPrintingEnabled: true,
        preferHttps: true,
        agentHttpsUrl: 'https://localhost:3031',
        agentHttpUrl: 'http://localhost:3030',
        feedLinesBeforeCut: 2,
        cutPaperAfterReceipt: true,
        copies: 1,
        priority: 'normal',
        maxAttempts: 5,
        ...input
      })
    };

    (window as any).LilposLilPrintDiscovery = {
      discoverLilPrintAgent: vi.fn(async () => ({ ok: true, baseUrl: 'http://localhost:3030', connectionState: 'connected', message: 'ok' }))
    };

    (window as any).LilposLilPrintClient = {
      createLilPrintClient: () => ({
        submitPrintJob
      })
    };

    (window as any).LilposPrinterRoutingEngine = {
      evaluatePrintRoutes: vi.fn(() => ([
        {
          ruleId: 'rule1',
          printerId: 'kitchen_1',
          ticketType: 'kitchen_ticket',
          matchedLineIds: [],
          ticketContentMode: 'full',
          copies: 1,
          priority: 'normal',
          required: true
        }
      ]))
    };

    (window as any).LilposReceiptRenderer = {
      renderCustomerReceiptEscposBase64: renderCustomer,
      renderPrinterTestEscposBase64: renderTest
    };
  });

  function makeDataService() {
    return {
      getMerchantId: () => 'merchant_test',
      getLocationId: () => 'location_test',
      getStationNumber: () => 1,
      getBusinessDate: () => '2026-07-29',
      loadPrinterSettings: vi.fn(async () => ({
        merchantId: 'merchant_test',
        locationId: 'location_test',
        stationId: '1',
        receiptPrintingEnabled: true,
        defaultReceiptPrinterId: 'kitchen_1'
      })),
      listPosPrinterConfigs: vi.fn(async () => ([
        {
          id: 'kitchen_1',
          merchantId: 'merchant_test',
          locationId: 'location_test',
          enabled: true,
          name: 'Kitchen Impact',
          ip: '192.168.1.44',
          port: 9100,
          connectionType: 'network_printer',
          printMode: 'raw_escpos',
          transport: 'tcp_9100',
          profile: 'epson_tm_u220',
          paperWidth: '76mm',
          charactersPerLine: 40,
          retryEnabled: true,
          maxAttempts: 5,
          primaryRole: 'kitchen',
          defaultCopies: 1
        }
      ])),
      listPrinterRoutingRules: vi.fn(async () => []),
      saveLocalPrintJobReference: vi.fn(async (input: any) => ({ id: 'ref1', ...input })),
      updateLocalPrintJobReference: vi.fn(async () => null),
      saveLocalPrintBatch: vi.fn(async (input: any) => ({ id: 'batch1', ...input })),
      updateLocalPrintBatch: vi.fn(async () => null)
    };
  }

  it('passes chosen profile to renderer for production tickets', async () => {
    const service = (window as any).LilposPrintJobService.createPrintJobService({ dataService: makeDataService() });

    await service.submitCustomerReceipt({
      order: {
        id: 'order1',
        orderId: 'order1',
        total: 20,
        subtotal: 18,
        tax: 2,
        lines: [{ qty: 1, name: 'Pizza', price: 20, mods: [] }]
      }
    });

    expect(renderCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        printer: expect.objectContaining({ profile: 'epson_tm_u220' })
      })
    );
    expect(submitPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        printer: expect.objectContaining({ profile: 'epson_tm_u220', printMode: 'raw_escpos' })
      })
    );
  });

  it('uses chosen profile for test print rendering', async () => {
    const dataService = makeDataService();
    const service = (window as any).LilposPrintJobService.createPrintJobService({ dataService });

    await service.submitTestReceipt({ printerId: 'kitchen_1' });

    expect(renderTest).toHaveBeenCalledWith(
      expect.objectContaining({
        printer: expect.objectContaining({ profile: 'epson_tm_u220' }),
        printerConfig: expect.objectContaining({ profile: 'epson_tm_u220' })
      })
    );

    expect(submitPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          requestedFrom: 'printer_settings',
          jobType: 'printer_test'
        })
      })
    );

    expect(dataService.saveLocalPrintJobReference).toHaveBeenCalledWith(
      expect.objectContaining({
        jobType: 'printer_test',
        printerId: 'kitchen_1'
      })
    );

    expect(dataService.updateLocalPrintJobReference).toHaveBeenCalledWith(
      'ref1',
      expect.objectContaining({
        lastKnownStatus: 'QUEUED'
      })
    );
  });
});
