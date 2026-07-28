/// <reference path="../../printing/printer-types.ts" />
/// <reference path="../../printing/printer-settings-service.ts" />
/// <reference path="../../printing/lilprint-discovery.ts" />
/// <reference path="../../printing/lilprint-client.ts" />
/// <reference path="../../printing/print-job-service.ts" />

(function(global: any) {
  'use strict';

  type PrinterSettingsTab = 'overview' | 'printers' | 'rules' | 'receipt' | 'kitchen' | 'agent';

  function esc(value: any): string {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function checked(value: boolean): string {
    return value ? 'checked' : '';
  }

  function option(selected: any, value: any, label: string): string {
    return '<option value="' + esc(value) + '" ' + (String(selected) === String(value) ? 'selected' : '') + '>' + esc(label) + '</option>';
  }

  function clamp(value: any, min: number, max: number, fallback: number): number {
    var n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function splitCsvLower(value: any, fallback: string[]): string[] {
    var raw = String(value || '').trim();
    if (!raw) return fallback.slice();
    return raw.split(',').map(function(token) { return String(token || '').trim().toLowerCase(); }).filter(Boolean);
  }

  function splitCsv(value: any): string[] {
    var raw = String(value || '').trim();
    if (!raw) return [];
    return raw.split(',').map(function(token) { return String(token || '').trim(); }).filter(Boolean);
  }

  function joinCsv(values: any): string {
    return Array.isArray(values) ? values.join(', ') : '';
  }

  function stateBadge(state: LilPrintConnectionState): string {
    if (state === 'connected') return '<span class="ps-state-pill ok">Connected</span>';
    if (state === 'degraded') return '<span class="ps-state-pill warn">Degraded</span>';
    return '<span class="ps-state-pill bad">Disconnected</span>';
  }

  function printerStatusLabel(printer: any): string {
    if (!printer) return 'Unknown';
    if (printer.paperOut === true) return 'Paper Out';
    if (printer.coverOpen === true) return 'Cover Open';
    if (printer.cutterError === true) return 'Cutter Error';
    if (printer.paused === true) return 'Paused';
    if (String(printer.status || '').toLowerCase() === 'unreachable') return 'Unreachable';
    if (String(printer.status || '').toLowerCase() === 'available') return 'Available';
    return 'Unknown';
  }

  function buildPreview(settings: PrinterSettingsRecord): string {
    var width = Math.max(20, Number(settings.charactersPerLine || 32));
    var hr = Array(width).fill('-').join('');
    var merchant = settings.printMerchantName ? 'MERCHANT NAME' : '';
    var order = settings.printOrderNumber ? 'Order 1-42' : '';
    var type = settings.printOrderType ? 'Pickup' : '';
    var footer = settings.footerMessage ? settings.footerMessage : '';
    return [
      merchant,
      settings.printMerchantAddress ? '123 Main St' : '',
      settings.printMerchantPhone ? '(555) 555-1212' : '',
      '',
      (order + (order && type ? '  ' : '') + type).trim(),
      settings.printDateTime ? '07/27/2026 9:15 PM' : '',
      hr,
      settings.printItemDescriptions ? '1  Large Pizza                $18.00' : '',
      settings.printModifiers ? '   + Pepperoni                $2.00' : '',
      hr,
      settings.printSubtotal ? 'Subtotal                     $20.00' : '',
      settings.printTax ? 'Tax                           $1.20' : '',
      settings.printTips ? 'Tip                           $3.00' : '',
      settings.printTotal !== false ? 'TOTAL                        $24.20' : '',
      '',
      footer
    ].filter(Boolean).map(function(line) { return esc(line); }).join('\n');
  }

  function createController(input?: any) {
    var deps = input || {};
    var dataService = deps.dataService;
    var onChange = typeof deps.onChange === 'function' ? deps.onChange : function() {};
    var requestedBy = typeof deps.requestedBy === 'function' ? deps.requestedBy : function() { return 'manager'; };

    var printJobService = global.LilposPrintJobService.createPrintJobService({ dataService: dataService });

    var state = {
      loading: true,
      loaded: false,
      saving: false,
      error: '',
      actionMessage: '',
      currentTab: 'overview' as PrinterSettingsTab,
      settings: null as PrinterSettingsRecord | null,
      draft: null as PrinterSettingsRecord | null,
      draftErrors: [] as string[],
      unsaved: false,
      localPrinters: [] as PosPrinterConfig[],
      localRules: [] as PrinterRoutingRule[],
      discoveredPrinters: [] as LilPrintPrinter[],
      printerLoadMessage: '',
      testPrintStatus: '',
      printerEditorOpen: false,
      printerEditorMode: 'create' as 'create' | 'edit',
      printerEditorId: '',
      ruleEditorOpen: false,
      ruleEditorMode: 'create' as 'create' | 'edit',
      ruleEditorId: '',
      agentStatus: {
        connectionState: 'disconnected' as LilPrintConnectionState,
        message: 'Not checked yet.',
        checkedAt: '',
        baseUrl: '',
        payload: null
      }
    };

    function normalizeSettings(inputSettings: any): PrinterSettingsRecord {
      var normalized = global.LilposPrinterSettingsService.normalize(inputSettings || {});
      if (!normalized.defaultReceiptPrinterId && normalized.receiptPrinterId) {
        normalized.defaultReceiptPrinterId = normalized.receiptPrinterId;
      }
      if (!normalized.receiptPrinterId && normalized.defaultReceiptPrinterId) {
        normalized.receiptPrinterId = normalized.defaultReceiptPrinterId;
      }
      return normalized;
    }

    function localPrinterNameById(printerId: string): string {
      var found = state.localPrinters.find(function(printer) { return String(printer.id) === String(printerId); });
      return found ? found.name : String(printerId || '');
    }

    function markChanged() {
      state.unsaved = JSON.stringify(state.settings || {}) !== JSON.stringify(state.draft || {});
    }

    async function loadLocalLists() {
      if (!dataService) {
        state.localPrinters = [];
        state.localRules = [];
        return;
      }
      if (typeof dataService.listPosPrinterConfigs === 'function') {
        state.localPrinters = await dataService.listPosPrinterConfigs({ includeDisabled: true });
      } else {
        state.localPrinters = [];
      }
      if (typeof dataService.listPrinterRoutingRules === 'function') {
        state.localRules = await dataService.listPrinterRoutingRules({ includeDisabled: true });
      } else {
        state.localRules = [];
      }
    }

    async function load() {
      state.loading = true;
      state.error = '';
      state.actionMessage = '';
      onChange();
      try {
        var loaded = dataService && dataService.loadPrinterSettings
          ? await dataService.loadPrinterSettings({ stationId: String(dataService.getStationNumber ? dataService.getStationNumber() : 1) })
          : global.LilposPrinterSettingsService.defaults({});
        state.settings = normalizeSettings(loaded || {});
        state.draft = normalizeSettings(loaded || {});
        await loadLocalLists();
        await refreshAgentStatus();
        await refreshDiscoveredPrinters();
        state.loaded = true;
        state.loading = false;
        markChanged();
        onChange();
      } catch (err) {
        state.loading = false;
        state.error = err instanceof Error ? err.message : String(err || 'Unable to load printer settings.');
        onChange();
      }
    }

    function parseDraftFromDocument(doc: Document) {
      if (!state.draft) return;
      var qInput = function(sel: string) { return doc.querySelector(sel) as HTMLInputElement | null; };
      var qSelect = function(sel: string) { return doc.querySelector(sel) as HTMLSelectElement | null; };
      var checkedValue = function(sel: string, fallback: boolean) {
        var node = qInput(sel);
        return node ? !!node.checked : fallback;
      };
      var inputValue = function(sel: string, fallback: string) {
        var node = qInput(sel);
        return node ? String(node.value || '') : fallback;
      };
      var numberValue = function(sel: string, fallback: number) {
        var node = qInput(sel);
        return node ? Number(node.value || fallback) : fallback;
      };
      var selectValue = function(sel: string, fallback: string) {
        var node = qSelect(sel);
        return node ? String(node.value || '') : fallback;
      };

      var defaultReceiptPrinterId = selectValue('#psDefaultReceiptPrinter', String(state.draft.defaultReceiptPrinterId || state.draft.receiptPrinterId || ''));

      var next = Object.assign({}, state.draft, {
        preferHttps: checkedValue('#psPreferHttps', state.draft.preferHttps),
        agentHttpsUrl: inputValue('#psAgentHttpsUrl', state.draft.agentHttpsUrl),
        agentHttpUrl: inputValue('#psAgentHttpUrl', state.draft.agentHttpUrl),
        receiptPrintingEnabled: checkedValue('#psReceiptPrintingEnabled', state.draft.receiptPrintingEnabled),
        promptForReceiptAfterSale: checkedValue('#psPromptAfterSale', state.draft.promptForReceiptAfterSale),
        autoPrintReceiptAfterSale: checkedValue('#psAutoPrintAfterSale', state.draft.autoPrintReceiptAfterSale),
        defaultReceiptPrinterId: defaultReceiptPrinterId,
        receiptPrinterId: defaultReceiptPrinterId,
        defaultKitchenPrinterId: selectValue('#psDefaultKitchenPrinter', String(state.draft.defaultKitchenPrinterId || '')),
        paperWidth: selectValue('#psPaperWidth', state.draft.paperWidth) as LilPosPaperWidth,
        charactersPerLine: numberValue('#psCharactersPerLine', state.draft.charactersPerLine),
        leftMarginChars: numberValue('#psLeftMargin', Number(state.draft.leftMarginChars || 0)),
        rightMarginChars: numberValue('#psRightMargin', Number(state.draft.rightMarginChars || 0)),
        fontFamilyMode: selectValue('#psFontFamily', state.draft.fontFamilyMode) as LilPosFontFamilyMode,
        defaultTextScale: selectValue('#psDefaultScale', state.draft.defaultTextScale) as LilPosTextScale,
        headerTextScale: selectValue('#psHeaderScale', state.draft.headerTextScale) as LilPosTextScale,
        kitchenPaperWidth: selectValue('#psKitchenPaperWidth', String(state.draft.kitchenPaperWidth || state.draft.paperWidth || '80mm')),
        kitchenCharactersPerLine: numberValue('#psKitchenCharactersPerLine', Number(state.draft.kitchenCharactersPerLine || state.draft.charactersPerLine || 48)),
        kitchenOrderNumberScale: selectValue('#psKitchenOrderScale', String(state.draft.kitchenOrderNumberScale || 'double_size')),
        kitchenItemTextScale: selectValue('#psKitchenItemScale', String(state.draft.kitchenItemTextScale || 'normal')),
        kitchenModifierTextScale: selectValue('#psKitchenModifierScale', String(state.draft.kitchenModifierTextScale || 'normal')),
        kitchenShowPromisedTime: checkedValue('#psKitchenShowPromised', state.draft.kitchenShowPromisedTime !== false),
        kitchenShowEmployeeName: checkedValue('#psKitchenShowEmployee', state.draft.kitchenShowEmployeeName !== false),
        kitchenShowStationName: checkedValue('#psKitchenShowStation', state.draft.kitchenShowStationName !== false),
        kitchenShowOrderNotes: checkedValue('#psKitchenShowOrderNotes', state.draft.kitchenShowOrderNotes !== false),
        kitchenShowItemNotes: checkedValue('#psKitchenShowItemNotes', state.draft.kitchenShowItemNotes !== false),
        feedLinesBeforeCut: numberValue('#psFeedLines', state.draft.feedLinesBeforeCut),
        cutPaperAfterReceipt: checkedValue('#psCutPaper', state.draft.cutPaperAfterReceipt),
        printLogo: checkedValue('#psPrintLogo', state.draft.printLogo),
        printMerchantName: checkedValue('#psPrintMerchantName', state.draft.printMerchantName),
        printMerchantAddress: checkedValue('#psPrintMerchantAddress', state.draft.printMerchantAddress),
        printMerchantPhone: checkedValue('#psPrintMerchantPhone', state.draft.printMerchantPhone),
        printOrderNumber: checkedValue('#psPrintOrderNumber', state.draft.printOrderNumber),
        printOrderType: checkedValue('#psPrintOrderType', state.draft.printOrderType),
        printDateTime: checkedValue('#psPrintDateTime', state.draft.printDateTime),
        printEmployeeName: checkedValue('#psPrintEmployee', state.draft.printEmployeeName),
        printStationName: checkedValue('#psPrintStation', state.draft.printStationName),
        printCustomerName: checkedValue('#psPrintCustomerName', state.draft.printCustomerName),
        printCustomerPhone: checkedValue('#psPrintCustomerPhone', state.draft.printCustomerPhone),
        printCustomerAddressForDelivery: checkedValue('#psPrintDeliveryAddress', state.draft.printCustomerAddressForDelivery),
        printItemDescriptions: checkedValue('#psPrintItemDescriptions', state.draft.printItemDescriptions),
        printModifiers: checkedValue('#psPrintModifiers', state.draft.printModifiers),
        printItemNotes: checkedValue('#psPrintItemNotes', state.draft.printItemNotes),
        printOrderNotes: checkedValue('#psPrintOrderNotes', state.draft.printOrderNotes),
        printSubtotal: checkedValue('#psPrintSubtotal', state.draft.printSubtotal),
        printDiscounts: checkedValue('#psPrintDiscounts', state.draft.printDiscounts),
        printTax: checkedValue('#psPrintTax', state.draft.printTax),
        printTips: checkedValue('#psPrintTips', state.draft.printTips),
        printPayments: checkedValue('#psPrintPayments', state.draft.printPayments),
        printChangeDue: checkedValue('#psPrintChangeDue', state.draft.printChangeDue),
        footerMessage: inputValue('#psFooterMessage', state.draft.footerMessage || ''),
        printDuplicateLabelOnReprint: checkedValue('#psPrintDuplicateLabel', state.draft.printDuplicateLabelOnReprint),
        copies: numberValue('#psCopies', state.draft.copies),
        priority: selectValue('#psPriority', state.draft.priority) as LilPrintPriority,
        retryEnabled: checkedValue('#psRetryEnabled', state.draft.retryEnabled),
        maxAttempts: numberValue('#psMaxAttempts', state.draft.maxAttempts),
        openCashDrawerWithCashSale: checkedValue('#psOpenDrawer', state.draft.openCashDrawerWithCashSale)
      });

      next.charactersPerLine = clamp(next.charactersPerLine, 20, 64, 48);
      next.kitchenCharactersPerLine = clamp(next.kitchenCharactersPerLine, 20, 64, 48);
      state.draft = normalizeSettings(next);
      state.draftErrors = global.LilposPrinterSettingsService.validate(state.draft);
      markChanged();
      onChange();
    }

    async function saveSettings() {
      if (!state.draft) return;
      state.draftErrors = global.LilposPrinterSettingsService.validate(state.draft);
      if (state.draftErrors.length) {
        onChange();
        return;
      }
      state.saving = true;
      state.error = '';
      state.actionMessage = '';
      onChange();
      try {
        var saved = dataService && dataService.savePrinterSettings
          ? await dataService.savePrinterSettings(state.draft)
          : normalizeSettings(state.draft);
        state.settings = normalizeSettings(saved || state.draft);
        state.draft = normalizeSettings(saved || state.draft);
        state.saving = false;
        state.actionMessage = 'Printer settings saved.';
        markChanged();
        onChange();
      } catch (err) {
        state.saving = false;
        state.error = err instanceof Error ? err.message : String(err || 'Unable to save printer settings.');
        onChange();
      }
    }

    async function refreshAgentStatus() {
      if (!state.draft) return;
      var result = await global.LilposLilPrintDiscovery.discoverLilPrintAgent({
        httpsUrl: state.draft.agentHttpsUrl,
        httpUrl: state.draft.agentHttpUrl,
        preferHttps: state.draft.preferHttps,
        timeoutMs: 3000
      });
      state.agentStatus = {
        connectionState: result.connectionState || 'disconnected',
        message: result.message || '',
        checkedAt: result.checkedAt || '',
        baseUrl: result.baseUrl || '',
        payload: result.payload || null
      };
      onChange();
    }

    async function refreshDiscoveredPrinters() {
      state.printerLoadMessage = '';
      if (!state.agentStatus.baseUrl) {
        state.discoveredPrinters = [];
        state.printerLoadMessage = 'LilPrint Agent is not available.';
        onChange();
        return;
      }
      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var response = await client.getPrinters();
      if (!response.ok) {
        state.discoveredPrinters = [];
        state.printerLoadMessage = response.errorMessage || 'Unable to load printers.';
        onChange();
        return;
      }
      var rows = Array.isArray(response.data) ? response.data : Array.isArray(response.data && response.data.printers) ? response.data.printers : [];
      state.discoveredPrinters = rows.map(function(row: any) {
        return {
          id: String(row.id || row.printerId || ''),
          name: String(row.name || row.displayName || 'Printer'),
          ip: String(row.ip || row.host || ''),
          port: Number(row.port || 9100),
          profile: String(row.profile || 'generic_escpos'),
          transport: String(row.transport || 'tcp_9100'),
          status: String(row.status || 'unknown'),
          paused: row.paused === true,
          queuedJobs: Number(row.queuedJobs || row.queueCount || 0),
          retryWaitJobs: Number(row.retryWaitJobs || row.retryWaitCount || 0),
          failedJobs: Number(row.failedJobs || row.failedCount || 0),
          lastSuccessfulConnectionAt: String(row.lastSuccessfulConnectionAt || row.lastConnectedAt || ''),
          lastTransmittedAt: String(row.lastTransmittedAt || '')
        } as LilPrintPrinter;
      });
      if (!state.discoveredPrinters.length) state.printerLoadMessage = 'No printers were returned by LilPrint.';
      onChange();
    }

    function openPrinterEditor(mode: 'create' | 'edit', printerId?: string) {
      state.printerEditorOpen = true;
      state.printerEditorMode = mode;
      state.printerEditorId = mode === 'edit' ? String(printerId || '') : '';
      onChange();
    }

    function closePrinterEditor() {
      state.printerEditorOpen = false;
      state.printerEditorMode = 'create';
      state.printerEditorId = '';
      onChange();
    }

    function editRule(ruleId: string) {
      state.ruleEditorOpen = true;
      state.ruleEditorMode = 'edit';
      state.ruleEditorId = String(ruleId || '');
      onChange();
    }

    function openNewRule() {
      state.ruleEditorOpen = true;
      state.ruleEditorMode = 'create';
      state.ruleEditorId = '';
      onChange();
    }

    function closeRuleEditor() {
      state.ruleEditorOpen = false;
      state.ruleEditorMode = 'create';
      state.ruleEditorId = '';
      onChange();
    }

    async function savePrinterFromEditor(doc: Document) {
      if (!dataService || typeof dataService.upsertPosPrinterConfig !== 'function') {
        state.error = 'Printer store APIs are unavailable.';
        onChange();
        return;
      }

      var existing = state.printerEditorMode === 'edit'
        ? state.localPrinters.find(function(printer) { return String(printer.id) === String(state.printerEditorId); })
        : null;

      var name = String((doc.querySelector('#psPrinterName') as HTMLInputElement | null)?.value || '').trim();
      var ip = String((doc.querySelector('#psPrinterIp') as HTMLInputElement | null)?.value || '').trim();
      var port = Number((doc.querySelector('#psPrinterPort') as HTMLInputElement | null)?.value || 9100);
      var profile = String((doc.querySelector('#psPrinterProfile') as HTMLInputElement | null)?.value || 'generic_escpos').trim();
      var primaryRole = String((doc.querySelector('#psPrinterPrimaryRole') as HTMLSelectElement | null)?.value || 'receipt').trim();
      var paperWidth = String((doc.querySelector('#psPrinterPaperWidth') as HTMLSelectElement | null)?.value || '80mm').trim();
      var charactersPerLine = Number((doc.querySelector('#psPrinterCpl') as HTMLInputElement | null)?.value || (paperWidth === '58mm' ? 32 : 48));
      var defaultCopies = Number((doc.querySelector('#psPrinterCopies') as HTMLInputElement | null)?.value || 1);
      var retryEnabled = !!((doc.querySelector('#psPrinterRetryEnabled') as HTMLInputElement | null)?.checked);
      var maxAttempts = Number((doc.querySelector('#psPrinterMaxAttempts') as HTMLInputElement | null)?.value || 5);
      var enabled = !!((doc.querySelector('#psPrinterEnabled') as HTMLInputElement | null)?.checked);
      var routeLabels = splitCsv((doc.querySelector('#psPrinterRouteLabels') as HTMLInputElement | null)?.value || '');

      if (!name) {
        state.error = 'Printer name is required.';
        onChange();
        return;
      }

      var payload = {
        id: existing && existing.id ? existing.id : '',
        merchantId: state.draft ? state.draft.merchantId : '',
        locationId: state.draft ? state.draft.locationId : '',
        name: name,
        ip: ip,
        port: clamp(port, 1, 65535, 9100),
        profile: profile || 'generic_escpos',
        primaryRole: primaryRole,
        paperWidth: paperWidth === '58mm' ? '58mm' : '80mm',
        charactersPerLine: clamp(charactersPerLine, 20, 64, paperWidth === '58mm' ? 32 : 48),
        defaultCopies: clamp(defaultCopies, 1, 20, 1),
        retryEnabled: retryEnabled,
        maxAttempts: clamp(maxAttempts, 1, 20, 5),
        enabled: enabled,
        routeLabels: routeLabels,
        transport: 'tcp_9100',
        cutPaper: true,
        cashDrawerConnected: false,
        description: ''
      };

      try {
        await dataService.upsertPosPrinterConfig(payload);
        await loadLocalLists();
        state.error = '';
        state.actionMessage = state.printerEditorMode === 'create' ? 'Printer created.' : 'Printer updated.';
        closePrinterEditor();
        if (state.draft && !state.draft.defaultReceiptPrinterId && state.localPrinters.length === 1) {
          state.draft.defaultReceiptPrinterId = state.localPrinters[0].id;
          state.draft.receiptPrinterId = state.localPrinters[0].id;
          state.unsaved = true;
        }
        onChange();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to save printer.');
        onChange();
      }
    }

    async function deactivatePrinter(printerId: string) {
      if (!dataService || typeof dataService.deactivatePosPrinterConfig !== 'function') return;
      try {
        await dataService.deactivatePosPrinterConfig(printerId);
        await loadLocalLists();
        state.actionMessage = 'Printer deactivated.';
        onChange();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to deactivate printer.');
        onChange();
      }
    }

    function buildNewRuleDraft(): any {
      return {
        id: '',
        name: '',
        enabled: true,
        destinationPrinterId: state.localPrinters[0] ? state.localPrinters[0].id : '',
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
        copies: 1,
        priority: 'normal',
        isFallbackRule: false,
        stopAfterMatch: false,
        includeCustomerName: true,
        includeCustomerPhone: false,
        includeDeliveryAddress: false,
        includeCustomerNotes: false
      };
    }

    function selectedRuleDraft(): any {
      if (state.ruleEditorMode !== 'edit') {
        return buildNewRuleDraft();
      }
      return state.localRules.find(function(rule) { return String(rule.id) === String(state.ruleEditorId); }) || buildNewRuleDraft();
    }

    async function saveRuleFromEditor(doc: Document) {
      if (!dataService || typeof dataService.savePrinterRoutingRule !== 'function') {
        state.error = 'Routing rule APIs are unavailable.';
        onChange();
        return;
      }

      var existing = state.ruleEditorMode === 'edit'
        ? state.localRules.find(function(rule) { return String(rule.id) === String(state.ruleEditorId); })
        : null;

      var name = String((doc.querySelector('#psRuleName') as HTMLInputElement | null)?.value || '').trim();
      var destinationPrinterId = String((doc.querySelector('#psRulePrinter') as HTMLSelectElement | null)?.value || '').trim();
      var ticketType = String((doc.querySelector('#psRuleTicketType') as HTMLSelectElement | null)?.value || 'customer_receipt').trim();
      var trigger = String((doc.querySelector('#psRuleTrigger') as HTMLSelectElement | null)?.value || 'sale_completed').trim();
      var itemMatchMode = String((doc.querySelector('#psRuleItemMatch') as HTMLSelectElement | null)?.value || 'all').trim();
      var ticketContentMode = String((doc.querySelector('#psRuleContentMode') as HTMLSelectElement | null)?.value || 'full').trim();
      var priority = String((doc.querySelector('#psRulePriority') as HTMLSelectElement | null)?.value || 'normal').trim();
      var copies = Number((doc.querySelector('#psRuleCopies') as HTMLInputElement | null)?.value || 1);
      var enabled = !!((doc.querySelector('#psRuleEnabled') as HTMLInputElement | null)?.checked);
      var isFallbackRule = !!((doc.querySelector('#psRuleFallback') as HTMLInputElement | null)?.checked);
      var stopAfterMatch = !!((doc.querySelector('#psRuleStopAfterMatch') as HTMLInputElement | null)?.checked);
      var includeCustomerName = !!((doc.querySelector('#psRuleCustomerName') as HTMLInputElement | null)?.checked);
      var includeCustomerPhone = !!((doc.querySelector('#psRuleCustomerPhone') as HTMLInputElement | null)?.checked);
      var includeDeliveryAddress = !!((doc.querySelector('#psRuleDeliveryAddress') as HTMLInputElement | null)?.checked);
      var includeCustomerNotes = !!((doc.querySelector('#psRuleCustomerNotes') as HTMLInputElement | null)?.checked);

      if (!name) {
        state.error = 'Routing rule name is required.';
        onChange();
        return;
      }
      if (!destinationPrinterId) {
        state.error = 'Select a destination printer for the rule.';
        onChange();
        return;
      }

      var payload = {
        id: existing && existing.id ? existing.id : '',
        merchantId: state.draft ? state.draft.merchantId : '',
        locationId: state.draft ? state.draft.locationId : '',
        name: name,
        enabled: enabled,
        destinationPrinterId: destinationPrinterId,
        ticketType: ticketType,
        trigger: trigger,
        orderTypes: splitCsvLower((doc.querySelector('#psRuleOrderTypes') as HTMLInputElement | null)?.value || '', ['all']),
        orderSources: splitCsvLower((doc.querySelector('#psRuleOrderSources') as HTMLInputElement | null)?.value || '', ['all']),
        itemMatchMode: itemMatchMode,
        printerRouteIds: splitCsvLower((doc.querySelector('#psRulePrinterRouteIds') as HTMLInputElement | null)?.value || '', []),
        categoryIds: splitCsv((doc.querySelector('#psRuleCategoryIds') as HTMLInputElement | null)?.value || ''),
        itemIds: splitCsv((doc.querySelector('#psRuleItemIds') as HTMLInputElement | null)?.value || ''),
        excludedCategoryIds: splitCsv((doc.querySelector('#psRuleExcludedCategoryIds') as HTMLInputElement | null)?.value || ''),
        excludedItemIds: splitCsv((doc.querySelector('#psRuleExcludedItemIds') as HTMLInputElement | null)?.value || ''),
        ticketContentMode: ticketContentMode,
        includeCustomerName: includeCustomerName,
        includeCustomerPhone: includeCustomerPhone,
        includeDeliveryAddress: includeDeliveryAddress,
        includeCustomerNotes: includeCustomerNotes,
        copies: clamp(copies, 1, 20, 1),
        priority: (priority === 'low' || priority === 'high') ? priority : 'normal',
        isFallbackRule: isFallbackRule,
        stopAfterMatch: stopAfterMatch,
        sortOrder: existing && existing.sortOrder ? existing.sortOrder : 0
      };

      try {
        await dataService.savePrinterRoutingRule(payload);
        await loadLocalLists();
        closeRuleEditor();
        state.error = '';
        state.actionMessage = state.ruleEditorMode === 'create' ? 'Routing rule created.' : 'Routing rule updated.';
        onChange();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to save routing rule.');
        onChange();
      }
    }

    async function deleteRule(ruleId: string) {
      if (!dataService || typeof dataService.deletePrinterRoutingRule !== 'function') return;
      if (!global.confirm('Delete this routing rule?')) return;
      try {
        await dataService.deletePrinterRoutingRule(ruleId);
        await loadLocalLists();
        state.actionMessage = 'Routing rule deleted.';
        onChange();
      } catch (err) {
        state.error = err instanceof Error ? err.message : String(err || 'Unable to delete routing rule.');
        onChange();
      }
    }

    async function submitTestReceipt() {
      if (!state.draft) return;
      state.testPrintStatus = 'Submitting test receipt...';
      onChange();
      var result = await printJobService.submitTestReceipt({ settingsScope: state.draft });
      state.testPrintStatus = result.ok ? ('Queued (' + esc(result.printJobId || '') + ')') : (result.message || 'Unable to submit test receipt.');
      onChange();
    }

    async function callPrinterControl(kind: 'pause' | 'resume' | 'clear') {
      if (!state.draft || !state.draft.defaultReceiptPrinterId || !state.agentStatus.baseUrl) {
        state.actionMessage = 'Select a default receipt printer first.';
        onChange();
        return;
      }
      var reason = global.prompt('Enter audit reason for this action:') || '';
      if (!reason.trim()) {
        state.actionMessage = 'Action canceled. Reason is required.';
        onChange();
        return;
      }

      var who = requestedBy();
      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var response = kind === 'pause'
        ? await client.pausePrinter(state.draft.defaultReceiptPrinterId, reason, who)
        : kind === 'resume'
        ? await client.resumePrinter(state.draft.defaultReceiptPrinterId, reason, who)
        : await client.clearPrinterQueue(state.draft.defaultReceiptPrinterId, reason, who);

      state.actionMessage = response.ok
        ? (kind === 'pause' ? 'Printer paused.' : kind === 'resume' ? 'Printer resumed.' : 'Queue clear requested.')
        : (response.errorMessage || 'Printer control request failed.');
      await refreshDiscoveredPrinters();
      onChange();
    }

    function renderTabNav(): string {
      var tabs: Array<{ id: PrinterSettingsTab; title: string }> = [
        { id: 'overview', title: 'Overview' },
        { id: 'printers', title: 'Printers' },
        { id: 'rules', title: 'Routing Rules' },
        { id: 'receipt', title: 'Receipt Format' },
        { id: 'kitchen', title: 'Kitchen Format' },
        { id: 'agent', title: 'Agent & Status' }
      ];
      return '<div class="ps-tab-nav">' + tabs.map(function(tab) {
        var active = state.currentTab === tab.id;
        return '<button class="ps-tab-btn' + (active ? ' active' : '') + '" data-ps-tab="' + esc(tab.id) + '">' + esc(tab.title) + '</button>';
      }).join('') + '</div>';
    }

    function renderOverview(): string {
      var d = state.draft as PrinterSettingsRecord;
      var defaultReceipt = d.defaultReceiptPrinterId ? localPrinterNameById(d.defaultReceiptPrinterId) : 'Not set';
      var defaultKitchen = d.defaultKitchenPrinterId ? localPrinterNameById(d.defaultKitchenPrinterId) : 'Not set';
      var enabledRules = state.localRules.filter(function(rule) { return rule.enabled !== false; }).length;
      return ''
        + '<div class="ps-card-grid">'
        + '  <article class="ps-stat-card"><h4>Configured Printers</h4><p>' + esc(state.localPrinters.length) + '</p><small>local mapped printer profiles</small></article>'
        + '  <article class="ps-stat-card"><h4>Routing Rules</h4><p>' + esc(state.localRules.length) + '</p><small>' + esc(enabledRules) + ' enabled</small></article>'
        + '  <article class="ps-stat-card"><h4>Default Receipt</h4><p>' + esc(defaultReceipt) + '</p><small>applies to post-sale receipts</small></article>'
        + '  <article class="ps-stat-card"><h4>Default Kitchen</h4><p>' + esc(defaultKitchen) + '</p><small>preparation fallback destination</small></article>'
        + '</div>'
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Quick Actions</h4></div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-secondary" data-ps-open-printer="create">Add Printer</button>'
        + '    <button class="btn-secondary" data-ps-open-rule="create">Add Routing Rule</button>'
        + '    <button class="btn-secondary" id="psTestReceipt">Run Test Receipt</button>'
        + '  </div>'
        + '  <p class="muted">Use this page to manage multi-printer routing and format behavior without leaving manager settings.</p>'
        + '</section>';
    }

    function renderLocalPrinterRows(): string {
      if (!state.localPrinters.length) {
        return '<tr><td colspan="11" class="ps-empty">No local printers configured yet.</td></tr>';
      }
      return state.localPrinters.map(function(printer) {
        var active = printer.enabled !== false;
        return '<tr>'
          + '<td>' + esc(printer.name) + '</td>'
          + '<td>' + esc(printer.id) + '</td>'
          + '<td>' + esc(printer.primaryRole || 'receipt') + '</td>'
          + '<td>' + esc((printer.ip || '') + ':' + Number(printer.port || 9100)) + '</td>'
          + '<td>' + esc(printer.profile || 'generic_escpos') + '</td>'
          + '<td>' + esc(printer.paperWidth || '80mm') + '</td>'
          + '<td>' + esc(printer.charactersPerLine || 48) + '</td>'
          + '<td>' + esc(printer.defaultCopies || 1) + '</td>'
          + '<td><span class="ps-tag ' + (active ? 'ok' : 'warn') + '">' + (active ? 'Enabled' : 'Disabled') + '</span></td>'
          + '<td>' + esc(joinCsv(printer.routeLabels || [])) + '</td>'
          + '<td class="ps-row-actions">'
          + '  <button class="btn-secondary" data-ps-edit-printer="' + esc(printer.id) + '">Edit</button>'
          + (active ? '<button class="btn-danger" data-ps-deactivate-printer="' + esc(printer.id) + '">Deactivate</button>' : '')
          + '</td>'
          + '</tr>';
      }).join('');
    }

    function renderPrinterEditor(): string {
      if (!state.printerEditorOpen) return '';
      var existing = state.printerEditorMode === 'edit'
        ? state.localPrinters.find(function(printer) { return String(printer.id) === String(state.printerEditorId); })
        : null;
      var model = existing || {
        name: '', ip: '', port: 9100, profile: 'generic_escpos', primaryRole: 'receipt',
        paperWidth: '80mm', charactersPerLine: 48, defaultCopies: 1, retryEnabled: true, maxAttempts: 5, enabled: true, routeLabels: []
      } as any;

      return ''
        + '<section class="ps-panel ps-editor">'
        + '  <div class="ps-panel-head"><h4>' + (state.printerEditorMode === 'create' ? 'Add Printer' : 'Edit Printer') + '</h4></div>'
        + '  <div class="ps-grid-4">'
        + '    <label><span>Name</span><input id="psPrinterName" value="' + esc(model.name || '') + '" /></label>'
        + '    <label><span>IP</span><input id="psPrinterIp" value="' + esc(model.ip || '') + '" /></label>'
        + '    <label><span>Port</span><input id="psPrinterPort" type="number" min="1" max="65535" value="' + esc(model.port || 9100) + '" /></label>'
        + '    <label><span>Profile</span><input id="psPrinterProfile" value="' + esc(model.profile || 'generic_escpos') + '" /></label>'
        + '    <label><span>Primary role</span><select id="psPrinterPrimaryRole">'
        +      option(model.primaryRole, 'receipt', 'receipt')
        +      + option(model.primaryRole, 'kitchen', 'kitchen')
        +      + option(model.primaryRole, 'pizza', 'pizza')
        +      + option(model.primaryRole, 'expo', 'expo')
        +      + option(model.primaryRole, 'bar', 'bar')
        +      + option(model.primaryRole, 'delivery', 'delivery')
        +      + option(model.primaryRole, 'label', 'label')
        +      + option(model.primaryRole, 'cash_drawer', 'cash_drawer')
        +      + option(model.primaryRole, 'custom', 'custom')
        +    '</select></label>'
        + '    <label><span>Paper width</span><select id="psPrinterPaperWidth">' + option(model.paperWidth, '58mm', '58mm') + option(model.paperWidth, '80mm', '80mm') + '</select></label>'
        + '    <label><span>Chars/line</span><input id="psPrinterCpl" type="number" min="20" max="64" value="' + esc(model.charactersPerLine || 48) + '" /></label>'
        + '    <label><span>Default copies</span><input id="psPrinterCopies" type="number" min="1" max="20" value="' + esc(model.defaultCopies || 1) + '" /></label>'
        + '    <label><span>Max attempts</span><input id="psPrinterMaxAttempts" type="number" min="1" max="20" value="' + esc(model.maxAttempts || 5) + '" /></label>'
        + '    <label><span>Route labels (CSV)</span><input id="psPrinterRouteLabels" value="' + esc(joinCsv(model.routeLabels || [])) + '" /></label>'
        + '    <label class="ps-toggle"><input id="psPrinterRetryEnabled" type="checkbox" ' + checked(model.retryEnabled !== false) + ' /> Retry enabled</label>'
        + '    <label class="ps-toggle"><input id="psPrinterEnabled" type="checkbox" ' + checked(model.enabled !== false) + ' /> Enabled</label>'
        + '  </div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-success" id="psSavePrinter">Save Printer</button>'
        + '    <button class="btn-secondary" id="psCancelPrinter">Cancel</button>'
        + '  </div>'
        + '</section>';
    }

    function renderPrintersTab(): string {
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head">'
        + '    <h4>Local Printer Registry</h4>'
        + '    <div class="ps-actions"><button class="btn-secondary" data-ps-open-printer="create">Add Printer</button></div>'
        + '  </div>'
        + '  <p class="muted">Create local printer configurations that routing rules can target. This does not replace LilPrint discovery.</p>'
        + '  <div class="ps-table-wrap"><table class="ps-printer-table"><thead><tr><th>Name</th><th>ID</th><th>Role</th><th>Endpoint</th><th>Profile</th><th>Paper</th><th>CPL</th><th>Copies</th><th>Status</th><th>Route Labels</th><th>Actions</th></tr></thead><tbody>' + renderLocalPrinterRows() + '</tbody></table></div>'
        + '</section>'
        + renderPrinterEditor();
    }

    function renderRuleRows(): string {
      if (!state.localRules.length) {
        return '<tr><td colspan="10" class="ps-empty">No routing rules configured yet.</td></tr>';
      }
      return state.localRules.map(function(rule) {
        return '<tr>'
          + '<td>' + esc(rule.name) + '</td>'
          + '<td>' + esc(localPrinterNameById(rule.destinationPrinterId)) + '</td>'
          + '<td>' + esc(rule.ticketType) + '</td>'
          + '<td>' + esc(rule.trigger) + '</td>'
          + '<td>' + esc(rule.itemMatchMode) + '</td>'
          + '<td>' + esc(rule.ticketContentMode) + '</td>'
          + '<td>' + esc(rule.priority) + '</td>'
          + '<td>' + esc(rule.copies || 1) + '</td>'
          + '<td><span class="ps-tag ' + (rule.enabled !== false ? 'ok' : 'warn') + '">' + (rule.enabled !== false ? 'Enabled' : 'Disabled') + '</span></td>'
          + '<td class="ps-row-actions">'
          + '  <button class="btn-secondary" data-ps-edit-rule="' + esc(rule.id) + '">Edit</button>'
          + '  <button class="btn-danger" data-ps-delete-rule="' + esc(rule.id) + '">Delete</button>'
          + '</td>'
          + '</tr>';
      }).join('');
    }

    function renderRuleEditor(): string {
      if (!state.ruleEditorOpen) return '';
      var rule = selectedRuleDraft();
      return ''
        + '<section class="ps-panel ps-editor">'
        + '  <div class="ps-panel-head"><h4>' + (state.ruleEditorMode === 'create' ? 'Add Routing Rule' : 'Edit Routing Rule') + '</h4></div>'
        + '  <div class="ps-grid-4">'
        + '    <label><span>Rule name</span><input id="psRuleName" value="' + esc(rule.name || '') + '" /></label>'
        + '    <label><span>Destination printer</span><select id="psRulePrinter">' + state.localPrinters.map(function(printer) { return option(rule.destinationPrinterId, printer.id, printer.name + ' (' + printer.primaryRole + ')'); }).join('') + '</select></label>'
        + '    <label><span>Ticket type</span><select id="psRuleTicketType">'
        +      option(rule.ticketType, 'customer_receipt', 'customer_receipt')
        +      + option(rule.ticketType, 'kitchen_ticket', 'kitchen_ticket')
        +      + option(rule.ticketType, 'pizza_ticket', 'pizza_ticket')
        +      + option(rule.ticketType, 'expo_ticket', 'expo_ticket')
        +      + option(rule.ticketType, 'bar_ticket', 'bar_ticket')
        +      + option(rule.ticketType, 'delivery_ticket', 'delivery_ticket')
        +      + option(rule.ticketType, 'label', 'label')
        +      + option(rule.ticketType, 'custom', 'custom')
        +    '</select></label>'
        + '    <label><span>Trigger</span><select id="psRuleTrigger">'
        +      option(rule.trigger, 'sale_completed', 'sale_completed')
        +      + option(rule.trigger, 'manual_print', 'manual_print')
        +      + option(rule.trigger, 'order_sent', 'order_sent')
        +      + option(rule.trigger, 'order_accepted', 'order_accepted')
        +      + option(rule.trigger, 'order_working', 'order_working')
        +      + option(rule.trigger, 'status_changed', 'status_changed')
        +    '</select></label>'
        + '    <label><span>Item match mode</span><select id="psRuleItemMatch">'
        +      option(rule.itemMatchMode, 'all', 'all')
        +      + option(rule.itemMatchMode, 'printer_routes', 'printer_routes')
        +      + option(rule.itemMatchMode, 'categories', 'categories')
        +      + option(rule.itemMatchMode, 'items', 'items')
        +      + option(rule.itemMatchMode, 'unmatched', 'unmatched')
        +    '</select></label>'
        + '    <label><span>Ticket content mode</span><select id="psRuleContentMode">'
        +      option(rule.ticketContentMode, 'full', 'full')
        +      + option(rule.ticketContentMode, 'filtered', 'filtered')
        +      + option(rule.ticketContentMode, 'filtered_plus_shared', 'filtered_plus_shared')
        +      + option(rule.ticketContentMode, 'unmatched_only', 'unmatched_only')
        +      + option(rule.ticketContentMode, 'summary', 'summary')
        +    '</select></label>'
        + '    <label><span>Priority</span><select id="psRulePriority">' + option(rule.priority, 'low', 'low') + option(rule.priority, 'normal', 'normal') + option(rule.priority, 'high', 'high') + '</select></label>'
        + '    <label><span>Copies</span><input id="psRuleCopies" type="number" min="1" max="20" value="' + esc(rule.copies || 1) + '" /></label>'
        + '    <label><span>Order types (CSV)</span><input id="psRuleOrderTypes" value="' + esc(joinCsv(rule.orderTypes || ['all'])) + '" /></label>'
        + '    <label><span>Order sources (CSV)</span><input id="psRuleOrderSources" value="' + esc(joinCsv(rule.orderSources || ['all'])) + '" /></label>'
        + '    <label><span>Printer route IDs (CSV)</span><input id="psRulePrinterRouteIds" value="' + esc(joinCsv(rule.printerRouteIds || [])) + '" /></label>'
        + '    <label><span>Category IDs (CSV)</span><input id="psRuleCategoryIds" value="' + esc(joinCsv(rule.categoryIds || [])) + '" /></label>'
        + '    <label><span>Item IDs (CSV)</span><input id="psRuleItemIds" value="' + esc(joinCsv(rule.itemIds || [])) + '" /></label>'
        + '    <label><span>Excluded category IDs (CSV)</span><input id="psRuleExcludedCategoryIds" value="' + esc(joinCsv(rule.excludedCategoryIds || [])) + '" /></label>'
        + '    <label><span>Excluded item IDs (CSV)</span><input id="psRuleExcludedItemIds" value="' + esc(joinCsv(rule.excludedItemIds || [])) + '" /></label>'
        + '    <label class="ps-toggle"><input id="psRuleEnabled" type="checkbox" ' + checked(rule.enabled !== false) + ' /> Rule enabled</label>'
        + '    <label class="ps-toggle"><input id="psRuleFallback" type="checkbox" ' + checked(rule.isFallbackRule === true) + ' /> Fallback rule</label>'
        + '    <label class="ps-toggle"><input id="psRuleStopAfterMatch" type="checkbox" ' + checked(rule.stopAfterMatch === true) + ' /> Stop after match</label>'
        + '    <label class="ps-toggle"><input id="psRuleCustomerName" type="checkbox" ' + checked(rule.includeCustomerName !== false) + ' /> Include customer name</label>'
        + '    <label class="ps-toggle"><input id="psRuleCustomerPhone" type="checkbox" ' + checked(rule.includeCustomerPhone === true) + ' /> Include customer phone</label>'
        + '    <label class="ps-toggle"><input id="psRuleDeliveryAddress" type="checkbox" ' + checked(rule.includeDeliveryAddress === true) + ' /> Include delivery address</label>'
        + '    <label class="ps-toggle"><input id="psRuleCustomerNotes" type="checkbox" ' + checked(rule.includeCustomerNotes === true) + ' /> Include customer notes</label>'
        + '  </div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-success" id="psSaveRule">Save Rule</button>'
        + '    <button class="btn-secondary" id="psCancelRule">Cancel</button>'
        + '  </div>'
        + '</section>';
    }

    function renderRulesTab(): string {
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head">'
        + '    <h4>Routing Rules</h4>'
        + '    <div class="ps-actions"><button class="btn-secondary" data-ps-open-rule="create">Add Rule</button></div>'
        + '  </div>'
        + '  <p class="muted">Rules evaluate order trigger, source, and item match criteria to decide which printer receives each ticket.</p>'
        + '  <div class="ps-table-wrap"><table class="ps-printer-table"><thead><tr><th>Name</th><th>Destination</th><th>Ticket Type</th><th>Trigger</th><th>Match</th><th>Content</th><th>Priority</th><th>Copies</th><th>Status</th><th>Actions</th></tr></thead><tbody>' + renderRuleRows() + '</tbody></table></div>'
        + '</section>'
        + renderRuleEditor();
    }

    function printerOptionRows(includeEmptyLabel?: string): string {
      var rows = includeEmptyLabel ? option('', '', includeEmptyLabel) : '';
      rows += state.localPrinters.filter(function(printer) { return printer.enabled !== false; }).map(function(printer) {
        return option(state.draft && state.draft.defaultReceiptPrinterId, printer.id, printer.name + ' (' + printer.primaryRole + ')');
      }).join('');
      return rows;
    }

    function renderReceiptTab(): string {
      var d = state.draft as PrinterSettingsRecord;
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Receipt Format & Behavior</h4></div>'
        + '  <div class="ps-grid-3">'
        + '    <label><span>Default receipt printer</span><select id="psDefaultReceiptPrinter">' + printerOptionRows('Select printer') + '</select></label>'
        + '    <label><span>Paper width</span><select id="psPaperWidth">' + option(d.paperWidth, '58mm', '58mm') + option(d.paperWidth, '80mm', '80mm') + '</select></label>'
        + '    <label><span>Characters per line</span><input id="psCharactersPerLine" type="number" min="20" max="64" value="' + esc(d.charactersPerLine) + '" /></label>'
        + '    <label><span>Left margin chars</span><input id="psLeftMargin" type="number" min="0" max="8" value="' + esc(d.leftMarginChars || 0) + '" /></label>'
        + '    <label><span>Right margin chars</span><input id="psRightMargin" type="number" min="0" max="8" value="' + esc(d.rightMarginChars || 0) + '" /></label>'
        + '    <label><span>Blank lines before cut</span><input id="psFeedLines" type="number" min="0" max="10" value="' + esc(d.feedLinesBeforeCut) + '" /></label>'
        + '    <label><span>Default font</span><select id="psFontFamily">' + option(d.fontFamilyMode, 'font_a', 'Font A') + option(d.fontFamilyMode, 'font_b', 'Font B') + '</select></label>'
        + '    <label><span>Default text size</span><select id="psDefaultScale">' + option(d.defaultTextScale, 'normal', 'Normal') + option(d.defaultTextScale, 'double_height', 'Double Height') + option(d.defaultTextScale, 'double_width', 'Double Width') + option(d.defaultTextScale, 'double_size', 'Double Size') + '</select></label>'
        + '    <label><span>Header text size</span><select id="psHeaderScale">' + option(d.headerTextScale, 'normal', 'Normal') + option(d.headerTextScale, 'double_height', 'Double Height') + option(d.headerTextScale, 'double_width', 'Double Width') + option(d.headerTextScale, 'double_size', 'Double Size') + '</select></label>'
        + '    <label><span>Copies</span><input id="psCopies" type="number" min="1" max="20" value="' + esc(d.copies) + '" /></label>'
        + '    <label><span>Priority</span><select id="psPriority">' + option(d.priority, 'low', 'Low') + option(d.priority, 'normal', 'Normal') + option(d.priority, 'high', 'High') + '</select></label>'
        + '    <label><span>Max attempts</span><input id="psMaxAttempts" type="number" min="1" max="20" value="' + esc(d.maxAttempts) + '" /></label>'
        + '    <label class="ps-toggle"><input id="psCutPaper" type="checkbox" ' + checked(d.cutPaperAfterReceipt) + ' /> Cut paper</label>'
        + '    <label class="ps-toggle"><input id="psRetryEnabled" type="checkbox" ' + checked(d.retryEnabled) + ' /> Retry failed receipts</label>'
        + '    <label class="ps-toggle"><input id="psOpenDrawer" type="checkbox" ' + checked(d.openCashDrawerWithCashSale) + ' /> Open drawer on cash sale</label>'
        + '    <label class="ps-toggle"><input id="psReceiptPrintingEnabled" type="checkbox" ' + checked(d.receiptPrintingEnabled) + ' /> Enable receipt printing</label>'
        + '    <label class="ps-toggle"><input id="psPromptAfterSale" type="checkbox" ' + checked(d.promptForReceiptAfterSale) + ' /> Prompt after sale</label>'
        + '    <label class="ps-toggle"><input id="psAutoPrintAfterSale" type="checkbox" ' + checked(d.autoPrintReceiptAfterSale) + ' /> Auto-print after sale</label>'
        + '  </div>'
        + '  <div class="ps-toggle-grid">'
        + '    <label><input id="psPrintLogo" type="checkbox" ' + checked(d.printLogo) + ' /> Print logo</label>'
        + '    <label><input id="psPrintMerchantName" type="checkbox" ' + checked(d.printMerchantName) + ' /> Merchant name</label>'
        + '    <label><input id="psPrintMerchantAddress" type="checkbox" ' + checked(d.printMerchantAddress) + ' /> Merchant address</label>'
        + '    <label><input id="psPrintMerchantPhone" type="checkbox" ' + checked(d.printMerchantPhone) + ' /> Merchant phone</label>'
        + '    <label><input id="psPrintOrderNumber" type="checkbox" ' + checked(d.printOrderNumber) + ' /> Order number</label>'
        + '    <label><input id="psPrintOrderType" type="checkbox" ' + checked(d.printOrderType) + ' /> Order type</label>'
        + '    <label><input id="psPrintDateTime" type="checkbox" ' + checked(d.printDateTime) + ' /> Date and time</label>'
        + '    <label><input id="psPrintEmployee" type="checkbox" ' + checked(d.printEmployeeName) + ' /> Employee name</label>'
        + '    <label><input id="psPrintStation" type="checkbox" ' + checked(d.printStationName) + ' /> Station name</label>'
        + '    <label><input id="psPrintCustomerName" type="checkbox" ' + checked(d.printCustomerName) + ' /> Customer name</label>'
        + '    <label><input id="psPrintCustomerPhone" type="checkbox" ' + checked(d.printCustomerPhone) + ' /> Customer phone</label>'
        + '    <label><input id="psPrintDeliveryAddress" type="checkbox" ' + checked(d.printCustomerAddressForDelivery) + ' /> Delivery address</label>'
        + '    <label><input id="psPrintItemDescriptions" type="checkbox" ' + checked(d.printItemDescriptions) + ' /> Item descriptions</label>'
        + '    <label><input id="psPrintModifiers" type="checkbox" ' + checked(d.printModifiers) + ' /> Modifiers</label>'
        + '    <label><input id="psPrintItemNotes" type="checkbox" ' + checked(d.printItemNotes) + ' /> Item notes</label>'
        + '    <label><input id="psPrintOrderNotes" type="checkbox" ' + checked(d.printOrderNotes) + ' /> Order notes</label>'
        + '    <label><input id="psPrintSubtotal" type="checkbox" ' + checked(d.printSubtotal) + ' /> Subtotal</label>'
        + '    <label><input id="psPrintDiscounts" type="checkbox" ' + checked(d.printDiscounts) + ' /> Discounts</label>'
        + '    <label><input id="psPrintTax" type="checkbox" ' + checked(d.printTax) + ' /> Tax</label>'
        + '    <label><input id="psPrintTips" type="checkbox" ' + checked(d.printTips) + ' /> Tips</label>'
        + '    <label><input id="psPrintPayments" type="checkbox" ' + checked(d.printPayments) + ' /> Payments</label>'
        + '    <label><input id="psPrintChangeDue" type="checkbox" ' + checked(d.printChangeDue) + ' /> Change due</label>'
        + '    <label><input id="psPrintDuplicateLabel" type="checkbox" ' + checked(d.printDuplicateLabelOnReprint) + ' /> Duplicate label on reprint</label>'
        + '  </div>'
        + '  <label class="ps-wide"><span>Footer message</span><input id="psFooterMessage" value="' + esc(d.footerMessage || '') + '" /></label>'
        + '</section>'
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Receipt Preview</h4></div>'
        + '  <pre class="ps-preview">' + buildPreview(d) + '</pre>'
        + '</section>';
    }

    function renderKitchenTab(): string {
      var d = state.draft as PrinterSettingsRecord;
      var selectedKitchen = String(d.defaultKitchenPrinterId || '');
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Kitchen Ticket Format</h4></div>'
        + '  <div class="ps-grid-3">'
        + '    <label><span>Default kitchen printer</span><select id="psDefaultKitchenPrinter">'
        +      option(selectedKitchen, '', 'Select printer')
        +      state.localPrinters.filter(function(printer) { return printer.enabled !== false; }).map(function(printer) {
                 return option(selectedKitchen, printer.id, printer.name + ' (' + printer.primaryRole + ')');
               }).join('')
        + '    </select></label>'
        + '    <label><span>Kitchen paper width</span><select id="psKitchenPaperWidth">' + option(String(d.kitchenPaperWidth || '80mm'), '58mm', '58mm') + option(String(d.kitchenPaperWidth || '80mm'), '80mm', '80mm') + '</select></label>'
        + '    <label><span>Kitchen chars/line</span><input id="psKitchenCharactersPerLine" type="number" min="20" max="64" value="' + esc(d.kitchenCharactersPerLine || d.charactersPerLine || 48) + '" /></label>'
        + '    <label><span>Order number scale</span><select id="psKitchenOrderScale">' + option(String(d.kitchenOrderNumberScale || 'double_size'), 'normal', 'normal') + option(String(d.kitchenOrderNumberScale || 'double_size'), 'double_height', 'double_height') + option(String(d.kitchenOrderNumberScale || 'double_size'), 'double_width', 'double_width') + option(String(d.kitchenOrderNumberScale || 'double_size'), 'double_size', 'double_size') + '</select></label>'
        + '    <label><span>Item text scale</span><select id="psKitchenItemScale">' + option(String(d.kitchenItemTextScale || 'normal'), 'normal', 'normal') + option(String(d.kitchenItemTextScale || 'normal'), 'double_height', 'double_height') + option(String(d.kitchenItemTextScale || 'normal'), 'double_width', 'double_width') + option(String(d.kitchenItemTextScale || 'normal'), 'double_size', 'double_size') + '</select></label>'
        + '    <label><span>Modifier text scale</span><select id="psKitchenModifierScale">' + option(String(d.kitchenModifierTextScale || 'normal'), 'normal', 'normal') + option(String(d.kitchenModifierTextScale || 'normal'), 'double_height', 'double_height') + option(String(d.kitchenModifierTextScale || 'normal'), 'double_width', 'double_width') + option(String(d.kitchenModifierTextScale || 'normal'), 'double_size', 'double_size') + '</select></label>'
        + '    <label class="ps-toggle"><input id="psKitchenShowPromised" type="checkbox" ' + checked(d.kitchenShowPromisedTime !== false) + ' /> Show promised time</label>'
        + '    <label class="ps-toggle"><input id="psKitchenShowEmployee" type="checkbox" ' + checked(d.kitchenShowEmployeeName !== false) + ' /> Show employee name</label>'
        + '    <label class="ps-toggle"><input id="psKitchenShowStation" type="checkbox" ' + checked(d.kitchenShowStationName !== false) + ' /> Show station name</label>'
        + '    <label class="ps-toggle"><input id="psKitchenShowOrderNotes" type="checkbox" ' + checked(d.kitchenShowOrderNotes !== false) + ' /> Show order notes</label>'
        + '    <label class="ps-toggle"><input id="psKitchenShowItemNotes" type="checkbox" ' + checked(d.kitchenShowItemNotes !== false) + ' /> Show item notes</label>'
        + '  </div>'
        + '  <p class="muted">Kitchen routing is determined by rules; this section controls default fallback and kitchen-format rendering values.</p>'
        + '</section>';
    }

    function renderDiscoveredRows(): string {
      if (!state.discoveredPrinters.length) {
        return '<tr><td colspan="8" class="ps-empty">' + esc(state.printerLoadMessage || 'No discovered printers.') + '</td></tr>';
      }
      return state.discoveredPrinters.map(function(printer) {
        return '<tr>'
          + '<td>' + esc(printer.name) + '</td>'
          + '<td>' + esc(printer.id) + '</td>'
          + '<td>' + esc((printer.ip || '') + ':' + Number(printer.port || 9100)) + '</td>'
          + '<td>' + esc(printer.profile || '') + '</td>'
          + '<td>' + esc(printer.transport || '') + '</td>'
          + '<td>' + esc(printerStatusLabel(printer)) + '</td>'
          + '<td>' + esc(printer.queuedJobs || 0) + ' / ' + esc(printer.retryWaitJobs || 0) + ' / ' + esc(printer.failedJobs || 0) + '</td>'
          + '<td>' + esc(printer.lastSuccessfulConnectionAt || '') + '</td>'
          + '</tr>';
      }).join('');
    }

    function renderAgentTab(): string {
      var d = state.draft as PrinterSettingsRecord;
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>LilPrint Agent</h4><div>' + stateBadge(state.agentStatus.connectionState) + '</div></div>'
        + '  <div class="ps-grid-3">'
        + '    <label class="ps-toggle"><input id="psPreferHttps" type="checkbox" ' + checked(d.preferHttps) + ' /> Prefer HTTPS</label>'
        + '    <label><span>HTTPS URL</span><input id="psAgentHttpsUrl" value="' + esc(d.agentHttpsUrl) + '" /></label>'
        + '    <label><span>HTTP fallback URL</span><input id="psAgentHttpUrl" value="' + esc(d.agentHttpUrl) + '" /></label>'
        + '  </div>'
        + '  <div class="ps-agent-meta"><b>Status:</b> ' + esc(state.agentStatus.message || 'Not checked yet.') + '<br/><b>Working URL:</b> ' + esc(state.agentStatus.baseUrl || 'n/a') + '<br/><b>Last Check:</b> ' + esc(state.agentStatus.checkedAt || 'n/a') + '</div>'
        + '  <div class="ps-actions">'
        + '    <button id="psTestAgent" class="btn-secondary">Test Agent Connection</button>'
        + '    <button id="psRefreshAgent" class="btn-secondary">Refresh Agent Status</button>'
        + '    <button id="psRefreshPrinters" class="btn-secondary">Refresh Discovered Printers</button>'
        + '    <button id="psPausePrinter" class="btn-secondary">Pause Default Receipt Printer</button>'
        + '    <button id="psResumePrinter" class="btn-secondary">Resume Default Receipt Printer</button>'
        + '    <button id="psClearQueue" class="btn-danger">Clear Pending Queue</button>'
        + '  </div>'
        + '</section>'
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Discovered Printers</h4></div>'
        + '  <div class="ps-table-wrap"><table class="ps-printer-table"><thead><tr><th>Name</th><th>ID</th><th>Endpoint</th><th>Profile</th><th>Transport</th><th>Status</th><th>Q/R/F</th><th>Last Connected</th></tr></thead><tbody>' + renderDiscoveredRows() + '</tbody></table></div>'
        + '</section>';
    }

    function renderActiveTab(): string {
      if (state.currentTab === 'overview') return renderOverview();
      if (state.currentTab === 'printers') return renderPrintersTab();
      if (state.currentTab === 'rules') return renderRulesTab();
      if (state.currentTab === 'receipt') return renderReceiptTab();
      if (state.currentTab === 'kitchen') return renderKitchenTab();
      return renderAgentTab();
    }

    function render(): string {
      if (state.loading || !state.draft) {
        return '<div class="mgr-section-content"><h3>Printer Settings</h3><p class="muted">Loading printer settings...</p></div>';
      }

      return ''
        + '<div class="mgr-section-content printer-settings-view">'
        + '  <div class="ps-page-head">'
        + '    <h3>Printer Settings</h3>'
        + '    <p class="muted">Multi-printer mapping, routing rules, receipt format, and LilPrint agent operations.</p>'
        + '  </div>'
        + (state.error ? '<p class="sdm-error">' + esc(state.error) + '</p>' : '')
        + (state.actionMessage ? '<p class="sdm-action-message">' + esc(state.actionMessage) + '</p>' : '')
        + (state.draftErrors.length ? '<p class="sdm-error">' + esc(state.draftErrors.join(' ')) + '</p>' : '')
        + renderTabNav()
        + '<div class="ps-tab-panel">'
        + renderActiveTab()
        + '</div>'
        + '<div class="ps-actions ps-footer-actions">'
        + '  <button id="psSave" class="btn-success" ' + (state.saving ? 'disabled' : '') + '>' + (state.saving ? 'Saving...' : 'Save All Changes') + '</button>'
        + '  <button id="psCancel" class="btn-secondary" ' + (!state.unsaved ? 'disabled' : '') + '>Cancel Draft Changes</button>'
        + '  <button id="psTestReceiptGlobal" class="btn-secondary">Test Receipt</button>'
        + '  <span class="muted">' + esc(state.testPrintStatus || '') + '</span>'
        + '</div>'
        + '</div>';
    }

    function bind(document: Document) {
      if (!state.loaded) return;

      var liveIds = [
        '#psPreferHttps','#psAgentHttpsUrl','#psAgentHttpUrl','#psReceiptPrintingEnabled','#psPromptAfterSale','#psAutoPrintAfterSale',
        '#psDefaultReceiptPrinter','#psDefaultKitchenPrinter','#psPaperWidth','#psCharactersPerLine','#psLeftMargin','#psRightMargin','#psFontFamily','#psDefaultScale','#psHeaderScale',
        '#psKitchenPaperWidth','#psKitchenCharactersPerLine','#psKitchenOrderScale','#psKitchenItemScale','#psKitchenModifierScale','#psKitchenShowPromised','#psKitchenShowEmployee','#psKitchenShowStation','#psKitchenShowOrderNotes','#psKitchenShowItemNotes',
        '#psFeedLines','#psCutPaper','#psPrintLogo','#psPrintMerchantName','#psPrintMerchantAddress','#psPrintMerchantPhone',
        '#psPrintOrderNumber','#psPrintOrderType','#psPrintDateTime','#psPrintEmployee','#psPrintStation','#psPrintCustomerName','#psPrintCustomerPhone','#psPrintDeliveryAddress',
        '#psPrintItemDescriptions','#psPrintModifiers','#psPrintItemNotes','#psPrintOrderNotes','#psPrintSubtotal','#psPrintDiscounts','#psPrintTax','#psPrintTips','#psPrintPayments','#psPrintChangeDue',
        '#psFooterMessage','#psPrintDuplicateLabel','#psCopies','#psPriority','#psRetryEnabled','#psMaxAttempts','#psOpenDrawer'
      ];

      liveIds.forEach(function(sel) {
        var node = document.querySelector(sel) as HTMLElement | null;
        if (!node) return;
        var eventName = node.tagName === 'INPUT' && (node as HTMLInputElement).type === 'text' ? 'input' : 'change';
        node.addEventListener(eventName, function() {
          parseDraftFromDocument(document);
        });
      });

      document.querySelectorAll('[data-ps-tab]').forEach(function(node) {
        node.addEventListener('click', function() {
          state.currentTab = String((node as HTMLElement).getAttribute('data-ps-tab') || 'overview') as PrinterSettingsTab;
          onChange();
        });
      });

      document.querySelectorAll('[data-ps-open-printer]').forEach(function(node) {
        node.addEventListener('click', function() {
          var mode = String((node as HTMLElement).getAttribute('data-ps-open-printer') || 'create') as 'create' | 'edit';
          openPrinterEditor(mode);
        });
      });

      document.querySelectorAll('[data-ps-edit-printer]').forEach(function(node) {
        node.addEventListener('click', function() {
          openPrinterEditor('edit', String((node as HTMLElement).getAttribute('data-ps-edit-printer') || ''));
        });
      });

      document.querySelectorAll('[data-ps-deactivate-printer]').forEach(function(node) {
        node.addEventListener('click', function() {
          var printerId = String((node as HTMLElement).getAttribute('data-ps-deactivate-printer') || '');
          if (!printerId) return;
          if (!global.confirm('Deactivate this printer?')) return;
          void deactivatePrinter(printerId);
        });
      });

      document.querySelectorAll('[data-ps-open-rule]').forEach(function(node) {
        node.addEventListener('click', function() {
          var mode = String((node as HTMLElement).getAttribute('data-ps-open-rule') || 'create');
          if (mode === 'create') openNewRule();
        });
      });

      document.querySelectorAll('[data-ps-edit-rule]').forEach(function(node) {
        node.addEventListener('click', function() {
          editRule(String((node as HTMLElement).getAttribute('data-ps-edit-rule') || ''));
        });
      });

      document.querySelectorAll('[data-ps-delete-rule]').forEach(function(node) {
        node.addEventListener('click', function() {
          void deleteRule(String((node as HTMLElement).getAttribute('data-ps-delete-rule') || ''));
        });
      });

      document.querySelector('#psSave')?.addEventListener('click', function() { void saveSettings(); });
      document.querySelector('#psCancel')?.addEventListener('click', function() {
        if (!state.settings) return;
        state.draft = normalizeSettings(state.settings);
        state.draftErrors = [];
        markChanged();
        onChange();
      });

      document.querySelector('#psSavePrinter')?.addEventListener('click', function() { void savePrinterFromEditor(document); });
      document.querySelector('#psCancelPrinter')?.addEventListener('click', function() { closePrinterEditor(); });
      document.querySelector('#psSaveRule')?.addEventListener('click', function() { void saveRuleFromEditor(document); });
      document.querySelector('#psCancelRule')?.addEventListener('click', function() { closeRuleEditor(); });

      document.querySelector('#psTestAgent')?.addEventListener('click', function() { void refreshAgentStatus(); });
      document.querySelector('#psRefreshAgent')?.addEventListener('click', function() { void refreshAgentStatus(); });
      document.querySelector('#psRefreshPrinters')?.addEventListener('click', function() { void refreshDiscoveredPrinters(); });
      document.querySelector('#psPausePrinter')?.addEventListener('click', function() { void callPrinterControl('pause'); });
      document.querySelector('#psResumePrinter')?.addEventListener('click', function() { void callPrinterControl('resume'); });
      document.querySelector('#psClearQueue')?.addEventListener('click', function() { void callPrinterControl('clear'); });
      document.querySelector('#psTestReceipt')?.addEventListener('click', function() { void submitTestReceipt(); });
      document.querySelector('#psTestReceiptGlobal')?.addEventListener('click', function() { void submitTestReceipt(); });
    }

    return {
      state: state,
      load: load,
      render: render,
      bind: bind,
      refreshAgentStatus: refreshAgentStatus,
      refreshPrinters: refreshDiscoveredPrinters,
      getDraft: function() { return state.draft ? normalizeSettings(state.draft) : null; }
    };
  }

  global.LilposPrinterSettings = {
    createController: createController,
    printerStatusLabel: printerStatusLabel
  };
})(window);
