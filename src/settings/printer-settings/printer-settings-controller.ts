/// <reference path="../../printing/printer-types.ts" />
/// <reference path="../../printing/printer-settings-service.ts" />
/// <reference path="../../printing/lilprint-discovery.ts" />
/// <reference path="../../printing/lilprint-client.ts" />
/// <reference path="../../printing/print-job-service.ts" />
/// <reference path="../../printing/receipt-renderer.ts" />
/// <reference path="../../printing/printer-profile-registry.ts" />

(function(global: any) {
  'use strict';

  type PrinterSettingsTopTab = 'printers' | 'activity' | 'advanced';
  type PrinterEditorTab = 'setup' | 'behavior' | 'content' | 'layout' | 'triggers' | 'preview';

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

  function selected(value: any, expected: any): string {
    return String(value || '') === String(expected || '') ? 'selected' : '';
  }

  function clamp(value: any, min: number, max: number, fallback: number): number {
    var n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function splitCsv(value: any): string[] {
    var text = String(value || '').trim();
    if (!text) return [];
    return text.split(',').map(function(token) { return String(token || '').trim(); }).filter(Boolean);
  }

  function splitCsvLower(value: any): string[] {
    return splitCsv(value).map(function(token) { return token.toLowerCase(); });
  }

  function roleLabel(primaryRole: string, customRoleName: string): string {
    var role = String(primaryRole || 'receipt');
    var map: any = {
      receipt: 'Receipt',
      kitchen: 'Kitchen',
      pizza: 'Pizza',
      expo: 'Expo',
      bar: 'Bar',
      delivery: 'Delivery',
      label: 'Label',
      cash_drawer: 'Cash Drawer',
      custom: customRoleName || 'Custom'
    };
    return map[role] || 'Other';
  }

  function normalizeConnectionType(value: any): PrinterConnectionTypeId {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeConnectionTypeId) {
      return global.LilposPrinterProfiles.normalizeConnectionTypeId(value);
    }
    return 'network_printer';
  }

  function normalizePrintMode(value: any, connectionType: any): PrinterPrintModeId {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizePrintModeId) {
      return global.LilposPrinterProfiles.normalizePrintModeId(value, connectionType);
    }
    return 'raw_escpos';
  }

  function normalizeProfileId(value: any): string {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeProfileId) {
      return global.LilposPrinterProfiles.normalizeProfileId(value);
    }
    return String(value || 'generic_escpos_thermal');
  }

  function resolveProfile(profileId: any): PrinterProfileCapabilities {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.resolveProfileCapabilities) {
      return global.LilposPrinterProfiles.resolveProfileCapabilities(profileId);
    }
    return {
      id: 'generic_escpos_thermal',
      label: 'Generic ESC/POS Thermal',
      description: 'General thermal profile.',
      technology: 'thermal',
      supportsFontA: true,
      supportsFontB: true,
      supportsDoubleWidth: true,
      supportsDoubleHeight: true,
      supportsBold: true,
      supportsUnderline: true,
      supportsReverse: true,
      supportsCut: true,
      supportsDrawerPulse: true,
      supportsRasterLogo: true,
      defaultPaperWidth: '80mm',
      defaultCharactersPerLine: 48
    };
  }

  function parseOverride(value: any): boolean | null {
    if (value === true || String(value).toLowerCase() === 'yes') return true;
    if (value === false || String(value).toLowerCase() === 'no') return false;
    return null;
  }

  function formatOverride(value: any): string {
    var normalized = parseOverride(value);
    if (normalized === true) return 'yes';
    if (normalized === false) return 'no';
    return 'auto';
  }

  function effectiveProfileCapabilities(printerDraft: any): PrinterProfileCapabilities {
    var base = resolveProfile(printerDraft && printerDraft.profile);
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.applyCapabilityOverrides) {
      return global.LilposPrinterProfiles.applyCapabilityOverrides(base, {
        cutterInstalled: printerDraft && printerDraft.cutterInstalledOverride,
        cashDrawerConnected: printerDraft && printerDraft.cashDrawerConnectedOverride,
        rasterImageSupport: printerDraft && printerDraft.rasterImageSupportOverride
      });
    }
    return base;
  }

  function profileLabel(profile: string): string {
    var resolved = resolveProfile(profile);
    return String(resolved.label || profile || 'Thermal Printer');
  }

  function connectionModeLabel(connectionTypeId: string): string {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.connectionTypeById) {
      var connectionType = global.LilposPrinterProfiles.connectionTypeById(connectionTypeId);
      return String(connectionType && connectionType.label || 'Network Printer');
    }
    return 'Network Printer';
  }

  function printModeLabel(modeId: string, connectionTypeId: string): string {
    if (global.LilposPrinterProfiles && global.LilposPrinterProfiles.resolvePrintMode) {
      var mode = global.LilposPrinterProfiles.resolvePrintMode(modeId, connectionTypeId);
      return String(mode && mode.label || 'Raw ESC/POS');
    }
    return 'Raw ESC/POS';
  }

  function ticketTypeLabel(ticketType: string): string {
    var map: any = {
      customer_receipt: 'Customer Receipt',
      kitchen_ticket: 'Kitchen Ticket',
      pizza_ticket: 'Pizza Ticket',
      expo_ticket: 'Expo Ticket',
      bar_ticket: 'Bar Ticket',
      delivery_ticket: 'Delivery Ticket',
      label: 'Label',
      custom: 'Custom Ticket'
    };
    return map[String(ticketType || '').toLowerCase()] || 'Custom Ticket';
  }

  function triggerLabel(trigger: string): string {
    var map: any = {
      order_sent: 'When order is sent',
      sale_completed: 'When sale is completed',
      manual_print: 'Manual print',
      order_accepted: 'When order is accepted',
      order_working: 'When order is working',
      status_changed: 'When status changes'
    };
    return map[String(trigger || '').toLowerCase()] || 'Manual print';
  }

  function itemMatchModeLabel(mode: string): string {
    var map: any = {
      all: 'All Items',
      printer_routes: 'Items Assigned to a Printer Route',
      categories: 'Selected Categories',
      items: 'Selected Items',
      unmatched: 'Items Not Matched by Another Production Printer'
    };
    return map[String(mode || '').toLowerCase()] || 'All Items';
  }

  function ticketContentModeLabel(mode: string): string {
    var map: any = {
      full: 'Full Order',
      filtered: 'Matching Items Only',
      filtered_plus_shared: 'Matching Items Plus Other Items',
      unmatched_only: 'Unmatched Items',
      summary: 'Summary Only'
    };
    return map[String(mode || '').toLowerCase()] || 'Full Order';
  }

  function normalizePrinterDraft(input: any): any {
    var source = input || {};
    var connectionType = normalizeConnectionType(source.connectionType || source.transport);
    var printMode = normalizePrintMode(source.printMode, connectionType);
    var profile = normalizeProfileId(source.profile || 'generic_escpos_thermal');
    var profileCaps = resolveProfile(profile);
    var paperWidth = String(source.paperWidth || profileCaps.defaultPaperWidth || '80mm');
    var normalizedPaperWidth = paperWidth === '58mm' ? '58mm' : paperWidth === '76mm' ? '76mm' : '80mm';
    return {
      id: String(source.id || ''),
      name: String(source.name || ''),
      description: String(source.description || ''),
      enabled: source.enabled !== false,
      purpose: String(source.primaryRole || 'receipt'),
      customPurpose: String(source.customRoleName || ''),
      profile: profile,
      ip: String(source.ip || ''),
      port: clamp(source.port, 1, 65535, 9100),
      connectionType: connectionType,
      printMode: printMode,
      transport: global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
        ? global.LilposPrinterProfiles.effectiveTransport(connectionType, printMode)
        : 'tcp_9100',
      paperWidth: normalizedPaperWidth,
      charactersPerLine: clamp(source.charactersPerLine, 20, 64, Number(profileCaps.defaultCharactersPerLine || (normalizedPaperWidth === '58mm' ? 32 : normalizedPaperWidth === '76mm' ? 40 : 48))),
      copies: clamp(source.defaultCopies, 1, 20, 1),
      retryEnabled: source.retryEnabled !== false,
      maxAttempts: clamp(source.maxAttempts, 1, 20, 5),
      priority: String(source.priority || 'normal'),
      routeLabelsText: Array.isArray(source.routeLabels) ? source.routeLabels.join(', ') : String(source.routeLabels || ''),
      cutterInstalledOverride: parseOverride(source.cutterInstalledOverride),
      cashDrawerConnectedOverride: parseOverride(source.cashDrawerConnectedOverride),
      rasterImageSupportOverride: parseOverride(source.rasterImageSupportOverride),
      isStationPrinter: false,
      isCashDrawerPrinter: false,
      printVoidSlips: true,
      printEdits: true,
      printResends: true
    };
  }

  function normalizeRuleDraft(input: any): any {
    var source = input || {};
    var trigger = String(source.trigger || 'manual_print').toLowerCase();
    if (trigger !== 'order_sent' && trigger !== 'sale_completed' && trigger !== 'manual_print' && trigger !== 'order_accepted' && trigger !== 'order_working' && trigger !== 'status_changed') {
      trigger = 'manual_print';
    }

    return {
      id: String(source.id || ''),
      name: String(source.name || ''),
      enabled: source.enabled !== false,
      ticketType: String(source.ticketType || 'customer_receipt').toLowerCase(),
      trigger: trigger,
      itemMatchMode: String(source.itemMatchMode || 'all').toLowerCase(),
      ticketContentMode: String(source.ticketContentMode || 'full').toLowerCase(),
      copies: clamp(source.copies, 1, 20, 1),
      priority: String(source.priority || 'normal'),
      isFallbackRule: source.isFallbackRule === true,
      retryEnabled: source.retryEnabled !== false,
      maxAttempts: clamp(source.maxAttempts, 1, 20, 5),
      printerRouteIdsText: Array.isArray(source.printerRouteIds) ? source.printerRouteIds.join(', ') : '',
      categoryIdsText: Array.isArray(source.categoryIds) ? source.categoryIds.join(', ') : '',
      itemIdsText: Array.isArray(source.itemIds) ? source.itemIds.join(', ') : '',
      excludedCategoryIdsText: Array.isArray(source.excludedCategoryIds) ? source.excludedCategoryIds.join(', ') : '',
      excludedItemIdsText: Array.isArray(source.excludedItemIds) ? source.excludedItemIds.join(', ') : '',
      orderTypesText: Array.isArray(source.orderTypes) ? source.orderTypes.join(', ') : 'all',
      orderSourcesText: Array.isArray(source.orderSources) ? source.orderSources.join(', ') : 'all',
      includeCustomerName: source.includeCustomerName !== false,
      includeCustomerPhone: source.includeCustomerPhone === true,
      includeDeliveryAddress: source.includeDeliveryAddress === true,
      includeCustomerNotes: source.includeCustomerNotes === true,
      saveRule: true
    };
  }

  function createController(input?: any) {
    var deps = input || {};
    var dataService = deps.dataService;
    var onChange = typeof deps.onChange === 'function' ? deps.onChange : function() {};
    var requestedBy = typeof deps.requestedBy === 'function'
      ? deps.requestedBy
      : function() {
          return {
            appId: 'lilpos',
            userId: 'manager',
            userName: 'Manager'
          };
        };
    var hasCapability = typeof deps.hasCapability === 'function' ? deps.hasCapability : function() { return true; };

    var printJobService = global.LilposPrintJobService.createPrintJobService({ dataService: dataService });

    var state: any = {
      loading: true,
      loaded: false,
      error: '',
      actionMessage: '',
      currentTab: 'printers' as PrinterSettingsTopTab,
      editorTab: 'setup' as PrinterEditorTab,
      editorOpen: false,
      scanModalOpen: false,
      scanInvoked: false,
      editorMode: 'create' as 'create' | 'edit',
      editorPrinterId: '',
      editorDiscoveredId: '',
      settings: null as PrinterSettingsRecord | null,
      localPrinters: [] as PosPrinterConfig[],
      localRules: [] as PrinterRoutingRule[],
      workstationAssignment: null as WorkstationPrinterAssignment | null,
      stationName: '',
      scannedPrinters: [] as any[],
      scanMessage: '',
      testStatusByPrinterId: {} as any,
      moreMenuPrinterId: '',
      activityRows: [] as any[],
      activityFilter: 'all',
      advancedPrinterId: '',
      agentStatus: {
        connectionState: 'disconnected' as LilPrintConnectionState,
        message: 'Not checked yet.',
        checkedAt: '',
        baseUrl: '',
        payload: null
      },
      editorPrinterDraft: normalizePrinterDraft({}),
      editorRuleDraft: normalizeRuleDraft({}),
      editorLayoutDraft: {
        textWidth: 'normal',
        textHeight: 'normal',
        headerStyle: 'bold',
        ticketTitle: '',
        matchingSectionTitle: 'Matching Items',
        otherItemsSectionTitle: 'Other Items',
        groupBy: 'none',
        separatorStyle: 'line',
        blankLinesBeforeCut: 4,
        cutAfterPrint: true
      },
      editorContentDraft: {
        merchantName: true,
        merchantAddress: true,
        merchantPhone: true,
        orderNumber: true,
        orderType: true,
        dateTime: true,
        employeeName: true,
        stationName: true,
        customerName: true,
        customerPhone: false,
        deliveryAddress: false,
        itemDescriptions: true,
        modifiers: true,
        modifierPrices: false,
        itemNotes: true,
        orderNotes: true,
        subtotal: true,
        discounts: true,
        tax: true,
        tip: true,
        payments: true,
        changeDue: true,
        duplicateLabel: true,
        footerMessage: ''
      }
    };

    function stationScope() {
      return {
        merchantId: String(dataService && dataService.getMerchantId ? dataService.getMerchantId() : 'local-merchant'),
        locationId: String(dataService && dataService.getLocationId ? dataService.getLocationId() : 'local-location'),
        stationId: String(dataService && dataService.getStationNumber ? dataService.getStationNumber() : 1)
      };
    }

    function stationLabel(): string {
      return 'Front Counter ' + stationScope().stationId;
    }

    function getPrinterById(printerId: string): any {
      var id = String(printerId || '');
      return state.localPrinters.find(function(printer: any) { return String(printer.id || '') === id; }) || null;
    }

    function localPrinterNameById(printerId: string): string {
      var printer = getPrinterById(printerId);
      return printer ? String(printer.name || printer.id || '') : 'Not Assigned';
    }

    function rulesForPrinter(printerId: string): any[] {
      return state.localRules
        .filter(function(rule: any) { return String(rule.destinationPrinterId || '') === String(printerId || ''); })
        .sort(function(a: any, b: any) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });
    }

    function basePrinterSummary(printer: any): string {
      var profile = String(printer.profile || 'generic_escpos_thermal');
      var endpoint = String(printer.ip || '') + ':' + Number(printer.port || 9100);
      var paper = String(printer.paperWidth || '80mm');
      var printMode = printModeLabel(String(printer.printMode || 'raw_escpos'), String(printer.connectionType || 'network_printer'));
      return [profileLabel(profile), printMode, endpoint, paper].filter(Boolean).join(' · ');
    }

    function localStatusLabel(printer: any): string {
      if (!printer) return 'Unknown';
      if (printer.enabled === false) return 'Disabled';
      var agentMatch = state.scannedPrinters.find(function(row: any) {
        return String(row.id || '') === String(printer.id || '')
          || (String(row.ip || '') === String(printer.ip || '') && Number(row.port || 0) === Number(printer.port || 0));
      });
      var status = String(agentMatch && agentMatch.status || '').toLowerCase();
      if (status === 'available') return 'Available';
      if (status === 'unreachable') return 'Unreachable';
      if (agentMatch && agentMatch.paused) return 'Paused';
      return state.agentStatus.connectionState === 'connected' ? 'Configured' : 'Agent unavailable';
    }

    function stateBadge(stateValue: LilPrintConnectionState): string {
      if (stateValue === 'connected') return '<span class="ps-state-pill ok">Connected</span>';
      if (stateValue === 'degraded') return '<span class="ps-state-pill warn">Degraded</span>';
      return '<span class="ps-state-pill bad">Disconnected</span>';
    }

    function normalizeSettings(inputSettings: any): PrinterSettingsRecord {
      return global.LilposPrinterSettingsService.normalize(inputSettings || {});
    }

    function naturalRuleSummary(printer: any, rule: any): string {
      if (!rule) {
        return 'No routing rules configured yet. Add one to decide what this printer receives.';
      }
      var ticket = ticketTypeLabel(rule.ticketType);
      var trigger = triggerLabel(rule.trigger);
      var selection = itemMatchModeLabel(rule.itemMatchMode);
      var printerName = String(printer && printer.name || 'this printer');
      if (rule.itemMatchMode === 'all') return 'When ' + trigger.toLowerCase().replace('when ', '') + ', print the full ' + ticket.toLowerCase() + ' to ' + printerName + '.';
      if (rule.itemMatchMode === 'unmatched') return 'Print unmatched production items to ' + printerName + ' as fallback.';
      return trigger + ', print ' + selection.toLowerCase() + ' as ' + ticket.toLowerCase() + ' to ' + printerName + '.';
    }

    function ensureEditorStateForPrinter(printer: any, options?: any) {
      var assignment = state.workstationAssignment || {
        stationPrinterId: '',
        cashDrawerPrinterId: '',
        printVoidSlips: true,
        printEdits: true,
        printResends: true
      };
      state.editorPrinterDraft = normalizePrinterDraft(printer || {});
      state.editorPrinterDraft.isStationPrinter = String(assignment.stationPrinterId || '') === String(state.editorPrinterDraft.id || '');
      state.editorPrinterDraft.isCashDrawerPrinter = String(assignment.cashDrawerPrinterId || '') === String(state.editorPrinterDraft.id || '');
      state.editorPrinterDraft.printVoidSlips = assignment.printVoidSlips !== false;
      state.editorPrinterDraft.printEdits = assignment.printEdits !== false;
      state.editorPrinterDraft.printResends = assignment.printResends !== false;

      if (options && options.prefillDiscovered) {
        var discovered = options.prefillDiscovered;
        state.editorPrinterDraft.id = String(discovered.id || state.editorPrinterDraft.id || '');
        state.editorPrinterDraft.name = String(discovered.name || state.editorPrinterDraft.name || '');
        state.editorPrinterDraft.ip = String(discovered.ip || state.editorPrinterDraft.ip || '');
        state.editorPrinterDraft.port = clamp(discovered.port, 1, 65535, state.editorPrinterDraft.port || 9100);
        state.editorPrinterDraft.profile = normalizeProfileId(discovered.profile || state.editorPrinterDraft.profile || 'generic_escpos_thermal');
        state.editorPrinterDraft.connectionType = normalizeConnectionType(discovered.connectionType || discovered.transport || state.editorPrinterDraft.connectionType);
        state.editorPrinterDraft.printMode = normalizePrintMode(discovered.printMode || state.editorPrinterDraft.printMode, state.editorPrinterDraft.connectionType);
        state.editorPrinterDraft.transport = global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
          ? global.LilposPrinterProfiles.effectiveTransport(state.editorPrinterDraft.connectionType, state.editorPrinterDraft.printMode)
          : 'tcp_9100';
      }

      var existingRules = rulesForPrinter(String(state.editorPrinterDraft.id || ''));
      var primaryRule = existingRules[0] || {
        name: state.editorPrinterDraft.name ? state.editorPrinterDraft.name + ' Rule' : 'Printer Rule',
        ticketType: state.editorPrinterDraft.purpose === 'receipt' ? 'customer_receipt' : 'kitchen_ticket',
        trigger: state.editorPrinterDraft.purpose === 'receipt' ? 'sale_completed' : 'order_sent',
        itemMatchMode: state.editorPrinterDraft.purpose === 'receipt' ? 'all' : 'printer_routes',
        ticketContentMode: state.editorPrinterDraft.purpose === 'receipt' ? 'full' : 'filtered',
        copies: Number(state.editorPrinterDraft.copies || 1),
        priority: 'normal',
        includeCustomerName: true,
        includeCustomerPhone: false,
        includeDeliveryAddress: false,
        includeCustomerNotes: false,
        orderTypes: ['all'],
        orderSources: ['all']
      };
      state.editorRuleDraft = normalizeRuleDraft(primaryRule);

      var settings = state.settings || normalizeSettings({});
      state.editorContentDraft = {
        merchantName: settings.printMerchantName !== false,
        merchantAddress: settings.printMerchantAddress !== false,
        merchantPhone: settings.printMerchantPhone !== false,
        orderNumber: settings.printOrderNumber !== false,
        orderType: settings.printOrderType !== false,
        dateTime: settings.printDateTime !== false,
        employeeName: settings.printEmployeeName !== false,
        stationName: settings.printStationName !== false,
        customerName: settings.printCustomerName !== false,
        customerPhone: settings.printCustomerPhone === true,
        deliveryAddress: settings.printCustomerAddressForDelivery === true,
        itemDescriptions: settings.printItemDescriptions !== false,
        modifiers: settings.printModifiers !== false,
        modifierPrices: settings.printModifierPrices === true,
        itemNotes: settings.printItemNotes !== false,
        orderNotes: settings.printOrderNotes !== false,
        subtotal: settings.printSubtotal !== false,
        discounts: settings.printDiscounts !== false,
        tax: settings.printTax !== false,
        tip: settings.printTips !== false,
        payments: settings.printPayments !== false,
        changeDue: settings.printChangeDue !== false,
        duplicateLabel: settings.printDuplicateLabelOnReprint !== false,
        footerMessage: String(settings.footerMessage || '')
      };

      state.editorLayoutDraft = {
        textWidth: settings.defaultTextScale || 'normal',
        textHeight: settings.defaultTextScale || 'normal',
        headerStyle: settings.headerTextScale || 'double_size',
        ticketTitle: state.editorRuleDraft.ticketType === 'customer_receipt' ? 'Customer Receipt' : ticketTypeLabel(state.editorRuleDraft.ticketType),
        matchingSectionTitle: 'Matching Items',
        otherItemsSectionTitle: 'Other Items',
        groupBy: 'none',
        separatorStyle: 'line',
        blankLinesBeforeCut: clamp(settings.feedLinesBeforeCut, 0, 10, 4),
        cutAfterPrint: settings.cutPaperAfterReceipt !== false
      };

      var caps = effectiveProfileCapabilities(state.editorPrinterDraft);
      if (!caps.supportsCut) {
        state.editorLayoutDraft.cutAfterPrint = false;
      }
    }

    async function refreshAgentStatus() {
      var settings = state.settings || normalizeSettings({});
      var result = await global.LilposLilPrintDiscovery.discoverLilPrintAgent({
        httpsUrl: settings.agentHttpsUrl,
        httpUrl: settings.agentHttpUrl,
        preferHttps: settings.preferHttps,
        timeoutMs: 3000
      });
      state.agentStatus = {
        connectionState: result.connectionState || 'disconnected',
        message: result.message || '',
        checkedAt: result.checkedAt || '',
        baseUrl: result.baseUrl || '',
        payload: result.payload || null
      };
    }

    async function refreshScannedPrinters() {
      if (!state.agentStatus.baseUrl) {
        state.scannedPrinters = [];
        state.scanMessage = 'LilPrint Agent is not available.';
        return;
      }

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var response = await client.getPrinters();
      if (!response.ok) {
        state.scannedPrinters = [];
        state.scanMessage = response.errorMessage || 'Unable to load printers from LilPrint Agent.';
        return;
      }

      var rows = Array.isArray(response.data) ? response.data : Array.isArray(response.data && response.data.printers) ? response.data.printers : [];
      state.scannedPrinters = rows.map(function(row: any) {
        return {
          id: String(row.id || row.printerId || ''),
          name: String(row.name || row.displayName || 'Printer'),
          ip: String(row.ip || row.host || ''),
          port: clamp(row.port, 1, 65535, 9100),
          profile: normalizeProfileId(row.profile || 'generic_escpos_thermal'),
          connectionType: normalizeConnectionType(row.connectionType || row.transport),
          printMode: normalizePrintMode(row.printMode, normalizeConnectionType(row.connectionType || row.transport)),
          transport: String(row.transport || 'tcp_9100'),
          status: String(row.status || 'unknown'),
          paused: row.paused === true,
          queuedJobs: clamp(row.queuedJobs || row.queueCount || 0, 0, 100000, 0),
          retryWaitJobs: clamp(row.retryWaitJobs || row.retryWaitCount || 0, 0, 100000, 0),
          failedJobs: clamp(row.failedJobs || row.failedCount || 0, 0, 100000, 0),
          lastSuccessfulConnectionAt: String(row.lastSuccessfulConnectionAt || row.lastConnectedAt || ''),
          lastTransmittedAt: String(row.lastTransmittedAt || '')
        };
      });
    }

    function endpointKey(ip: string, port: number): string {
      return String(ip || '').trim().toLowerCase() + ':' + Number(port || 0);
    }

    function unconfiguredScannedPrinters(): any[] {
      var configuredById: any = {};
      var configuredByEndpoint: any = {};
      state.localPrinters.forEach(function(printer: any) {
        configuredById[String(printer.id || '')] = true;
        configuredByEndpoint[endpointKey(printer.ip, printer.port)] = true;
      });

      return state.scannedPrinters.filter(function(printer: any) {
        var id = String(printer.id || '');
        var endpoint = endpointKey(printer.ip, printer.port);
        return !configuredById[id] && !configuredByEndpoint[endpoint];
      });
    }

    async function loadWorkstationAssignment() {
      state.stationName = stationLabel();
      if (!dataService || typeof dataService.getWorkstationPrinterAssignment !== 'function') {
        state.workstationAssignment = {
          id: '',
          merchantId: stationScope().merchantId,
          locationId: stationScope().locationId,
          stationId: stationScope().stationId,
          stationPrinterId: '',
          cashDrawerPrinterId: '',
          printVoidSlips: true,
          printEdits: true,
          printResends: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          syncStatus: 'local-only'
        };
        return;
      }
      var row = await dataService.getWorkstationPrinterAssignment(stationScope());
      state.workstationAssignment = row || {
        id: '',
        merchantId: stationScope().merchantId,
        locationId: stationScope().locationId,
        stationId: stationScope().stationId,
        stationPrinterId: '',
        cashDrawerPrinterId: '',
        printVoidSlips: true,
        printEdits: true,
        printResends: true,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        syncStatus: 'local-only'
      };
    }

    async function loadLocalLists() {
      if (dataService && typeof dataService.listPosPrinterConfigs === 'function') {
        state.localPrinters = await dataService.listPosPrinterConfigs({ includeDisabled: true });
      } else {
        state.localPrinters = [];
      }
      if (dataService && typeof dataService.listPrinterRoutingRules === 'function') {
        state.localRules = await dataService.listPrinterRoutingRules({ includeDisabled: true });
      } else {
        state.localRules = [];
      }
      if (!state.advancedPrinterId && state.localPrinters[0]) {
        state.advancedPrinterId = String(state.localPrinters[0].id || '');
      }
    }

    async function loadActivity() {
      if (!dataService || typeof dataService.listLocalPrintJobReferences !== 'function') {
        state.activityRows = [];
        return;
      }
      state.activityRows = await dataService.listLocalPrintJobReferences();
    }

    async function load() {
      state.loading = true;
      state.error = '';
      state.actionMessage = '';
      onChange();

      try {
        state.settings = dataService && dataService.loadPrinterSettings
          ? await dataService.loadPrinterSettings(stationScope())
          : global.LilposPrinterSettingsService.defaults(stationScope());
        state.settings = normalizeSettings(state.settings || {});

        await loadLocalLists();
        await loadWorkstationAssignment();
        await refreshAgentStatus();
        await refreshScannedPrinters();
        await loadActivity();

        state.scanMessage = 'Shows printers already known to the LilPrint Agent.';
        state.currentTab = 'printers';
        state.loaded = true;
        state.loading = false;
      } catch (err) {
        state.loading = false;
        state.error = err instanceof Error ? err.message : String(err || 'Unable to load printer settings.');
      }

      onChange();
    }

    function openPrinterEditor(mode: 'create' | 'edit', printerId?: string, discovered?: any) {
      state.editorOpen = true;
      state.editorMode = mode;
      state.editorTab = 'setup';
      state.editorPrinterId = mode === 'edit' ? String(printerId || '') : '';
      state.editorDiscoveredId = discovered ? String(discovered.id || '') : '';

      var printer = mode === 'edit'
        ? getPrinterById(String(printerId || ''))
        : null;
      ensureEditorStateForPrinter(printer, discovered ? { prefillDiscovered: discovered } : null);
      onChange();
    }

    function closePrinterEditor() {
      state.editorOpen = false;
      state.editorMode = 'create';
      state.editorPrinterId = '';
      state.editorDiscoveredId = '';
      state.editorRuleDraft = normalizeRuleDraft({});
      state.editorPrinterDraft = normalizePrinterDraft({});
      onChange();
    }

    function connectionTypeOptions(selectedConnectionType: string): string {
      var rows = global.LilposPrinterProfiles && Array.isArray(global.LilposPrinterProfiles.connectionTypes)
        ? global.LilposPrinterProfiles.connectionTypes
        : [{ id: 'network_printer', label: 'Network Printer', implemented: true }];
      return rows.map(function(row: any) {
        var implemented = row.implemented === true;
        return '<option value="' + esc(row.id) + '" ' + selected(selectedConnectionType, row.id) + (implemented ? '' : ' disabled') + '>'
          + esc(row.label)
          + (implemented ? '' : ' (coming soon)')
          + '</option>';
      }).join('');
    }

    function printModeOptions(connectionType: string, selectedMode: string): string {
      var rows = global.LilposPrinterProfiles && global.LilposPrinterProfiles.printModesForConnection
        ? global.LilposPrinterProfiles.printModesForConnection(connectionType)
        : [{ id: 'raw_escpos', label: 'Raw ESC/POS', implemented: true }];
      return rows.map(function(row: any) {
        var implemented = row.implemented === true;
        return '<option value="' + esc(row.id) + '" ' + selected(selectedMode, row.id) + (implemented ? '' : ' disabled') + '>'
          + esc(row.label)
          + (implemented ? '' : ' (coming soon)')
          + '</option>';
      }).join('');
    }

    function profileOptions(selectedProfileId: string): string {
      var rows = global.LilposPrinterProfiles && Array.isArray(global.LilposPrinterProfiles.profileCapabilities)
        ? global.LilposPrinterProfiles.profileCapabilities
        : [{ id: 'generic_escpos_thermal', label: 'Generic ESC/POS Thermal' }];
      return rows.map(function(row: any) {
        return '<option value="' + esc(row.id) + '" ' + selected(selectedProfileId, row.id) + '>' + esc(row.label) + '</option>';
      }).join('');
    }

    function applyProfileSelection(nextProfileId: string): void {
      var previousProfile = resolveProfile(state.editorPrinterDraft.profile);
      var nextProfile = resolveProfile(nextProfileId);
      var currentPaper = String(state.editorPrinterDraft.paperWidth || previousProfile.defaultPaperWidth || '80mm');
      var currentCpl = clamp(state.editorPrinterDraft.charactersPerLine, 20, 64, Number(previousProfile.defaultCharactersPerLine || 48));
      var previousDefaultPaper = String(previousProfile.defaultPaperWidth || '80mm');
      var previousDefaultCpl = clamp(previousProfile.defaultCharactersPerLine, 20, 64, 48);
      var hasCustomSizing = currentPaper !== previousDefaultPaper || currentCpl !== previousDefaultCpl;

      state.editorPrinterDraft.profile = normalizeProfileId(nextProfileId);

      var shouldApplyDefaults = !hasCustomSizing;
      if (hasCustomSizing) {
        shouldApplyDefaults = global.confirm(
          'Apply recommended defaults for ' + nextProfile.label + '?\n\n'
          + 'Paper Width: ' + nextProfile.defaultPaperWidth + '\n'
          + 'Characters Per Line: ' + nextProfile.defaultCharactersPerLine
        );
      }

      if (shouldApplyDefaults) {
        state.editorPrinterDraft.paperWidth = nextProfile.defaultPaperWidth;
        state.editorPrinterDraft.charactersPerLine = clamp(nextProfile.defaultCharactersPerLine, 20, 64, 48);
      }

      var effective = effectiveProfileCapabilities(state.editorPrinterDraft);
      if (!effective.supportsCut && state.editorLayoutDraft.cutAfterPrint !== false) {
        state.editorLayoutDraft.cutAfterPrint = false;
        state.actionMessage = 'Cut After Print was disabled because this profile does not include cutter support by default.';
      }
    }

    function validateActiveSupport(inputDraft: any): string[] {
      var draft = inputDraft || {};
      var errors: string[] = [];
      if (draft.enabled === false) return errors;

      var connectionType = normalizeConnectionType(draft.connectionType);
      var mode = normalizePrintMode(draft.printMode, connectionType);
      var connectionTypeSupported = global.LilposPrinterProfiles && global.LilposPrinterProfiles.supportsConnectionType
        ? global.LilposPrinterProfiles.supportsConnectionType(connectionType)
        : connectionType === 'network_printer';
      var modeSupported = global.LilposPrinterProfiles && global.LilposPrinterProfiles.supportsPrintMode
        ? global.LilposPrinterProfiles.supportsPrintMode(mode, connectionType)
        : mode === 'raw_escpos';

      if (!connectionTypeSupported) {
        errors.push('Only implemented connection types can be enabled.');
      }
      if (!modeSupported) {
        errors.push('Only implemented print modes can be enabled.');
      }
      return errors;
    }

    function validateEditorDocument(doc: Document): string[] {
      var errors: string[] = [];
      var name = String((doc.querySelector('#psEditorPrinterName') as HTMLInputElement | null)?.value || '').trim();
      var ip = String((doc.querySelector('#psEditorIp') as HTMLInputElement | null)?.value || '').trim();
      var port = Number((doc.querySelector('#psEditorPort') as HTMLInputElement | null)?.value || 0);
      var purpose = String((doc.querySelector('#psEditorPurpose') as HTMLSelectElement | null)?.value || '').trim();
      var connectionType = String((doc.querySelector('#psEditorConnectionType') as HTMLSelectElement | null)?.value || '').trim();
      var printMode = String((doc.querySelector('#psEditorPrintMode') as HTMLSelectElement | null)?.value || '').trim();
      var profile = String((doc.querySelector('#psEditorProfile') as HTMLSelectElement | null)?.value || '').trim();

      if (!name) errors.push('Printer Name is required.');
      if (!purpose) errors.push('Printer Purpose is required.');
      if (!connectionType) errors.push('Connection Type is required.');
      if (!printMode) errors.push('Print Mode is required.');
      if (!profile) errors.push('Printer Type / Profile is required.');
      if (!ip) errors.push('IP Address / Hostname is required.');
      if (!(port > 0 && port <= 65535)) errors.push('Port must be between 1 and 65535.');

      var activeSupportErrors = validateActiveSupport({
        enabled: !!((doc.querySelector('#psEditorEnabled') as HTMLInputElement | null)?.checked),
        connectionType: connectionType,
        printMode: printMode
      });
      if (activeSupportErrors.length) errors = errors.concat(activeSupportErrors);

      return errors;
    }

    function endpointConflict(printerId: string, ip: string, port: number): any {
      var key = endpointKey(ip, port);
      return state.localPrinters.find(function(row: any) {
        return String(row.id || '') !== String(printerId || '')
          && endpointKey(row.ip, row.port) === key;
      }) || null;
    }

    function readEditorDraftFromDocument(doc: Document): any {
      var connectionType = normalizeConnectionType((doc.querySelector('#psEditorConnectionType') as HTMLSelectElement | null)?.value || state.editorPrinterDraft.connectionType);
      var printMode = normalizePrintMode((doc.querySelector('#psEditorPrintMode') as HTMLSelectElement | null)?.value || state.editorPrinterDraft.printMode, connectionType);
      var profileId = normalizeProfileId((doc.querySelector('#psEditorProfile') as HTMLSelectElement | null)?.value || state.editorPrinterDraft.profile || 'generic_escpos_thermal');
      var baseProfile = resolveProfile(profileId);
      var cutterInstalledOverride = parseOverride((doc.querySelector('#psEditorCutterInstalled') as HTMLSelectElement | null)?.value);
      var cashDrawerConnectedOverride = parseOverride((doc.querySelector('#psEditorCashDrawerOverride') as HTMLSelectElement | null)?.value);
      var rasterImageSupportOverride = parseOverride((doc.querySelector('#psEditorRasterLogoOverride') as HTMLSelectElement | null)?.value);
      var effectiveCaps = global.LilposPrinterProfiles && global.LilposPrinterProfiles.applyCapabilityOverrides
        ? global.LilposPrinterProfiles.applyCapabilityOverrides(baseProfile, {
            cutterInstalled: cutterInstalledOverride,
            cashDrawerConnected: cashDrawerConnectedOverride,
            rasterImageSupport: rasterImageSupportOverride
          })
        : baseProfile;
      var cutAfterNode = doc.querySelector('#psEditorCutAfterPrint') as HTMLInputElement | null;
      var cutAfterValue = cutAfterNode
        ? (!!cutAfterNode.checked && effectiveCaps.supportsCut)
        : state.editorLayoutDraft.cutAfterPrint !== false;
      var setup = {
        id: String((doc.querySelector('#psEditorStableId') as HTMLInputElement | null)?.value || '').trim(),
        name: String((doc.querySelector('#psEditorPrinterName') as HTMLInputElement | null)?.value || '').trim(),
        description: String((doc.querySelector('#psEditorDescription') as HTMLInputElement | null)?.value || '').trim(),
        enabled: !!((doc.querySelector('#psEditorEnabled') as HTMLInputElement | null)?.checked),
        primaryRole: String((doc.querySelector('#psEditorPurpose') as HTMLSelectElement | null)?.value || 'receipt').trim(),
        customRoleName: String((doc.querySelector('#psEditorCustomPurpose') as HTMLInputElement | null)?.value || '').trim(),
        profile: profileId,
        ip: String((doc.querySelector('#psEditorIp') as HTMLInputElement | null)?.value || '').trim(),
        port: clamp((doc.querySelector('#psEditorPort') as HTMLInputElement | null)?.value, 1, 65535, 9100),
        connectionType: connectionType,
        printMode: printMode,
        paperWidth: String((doc.querySelector('#psEditorPaper') as HTMLSelectElement | null)?.value || baseProfile.defaultPaperWidth || '80mm').trim(),
        charactersPerLine: clamp((doc.querySelector('#psEditorCpl') as HTMLInputElement | null)?.value, 20, 64, clamp(baseProfile.defaultCharactersPerLine, 20, 64, 48)),
        defaultCopies: clamp((doc.querySelector('#psEditorCopies') as HTMLInputElement | null)?.value, 1, 20, 1),
        routeLabels: splitCsv((doc.querySelector('#psEditorRouteLabels') as HTMLInputElement | null)?.value || ''),
        retryEnabled: !!((doc.querySelector('#psEditorRetry') as HTMLInputElement | null)?.checked),
        maxAttempts: clamp((doc.querySelector('#psEditorMaxAttempts') as HTMLInputElement | null)?.value, 1, 20, 5),
        transport: global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
          ? global.LilposPrinterProfiles.effectiveTransport(connectionType, printMode)
          : 'tcp_9100',
        cutPaper: cutAfterValue,
        cutterInstalledOverride: cutterInstalledOverride,
        cashDrawerConnectedOverride: cashDrawerConnectedOverride,
        rasterImageSupportOverride: rasterImageSupportOverride,
        cashDrawerConnected: !!((doc.querySelector('#psEditorDrawerPrinter') as HTMLInputElement | null)?.checked)
      } as any;

      return setup;
    }

    function readRuleDraftFromDocument(doc: Document): any {
      return normalizeRuleDraft({
        id: String((doc.querySelector('#psRuleId') as HTMLInputElement | null)?.value || '').trim(),
        name: String((doc.querySelector('#psRuleName') as HTMLInputElement | null)?.value || '').trim(),
        enabled: !!((doc.querySelector('#psRuleEnabled') as HTMLInputElement | null)?.checked),
        ticketType: String((doc.querySelector('#psRuleTicketType') as HTMLSelectElement | null)?.value || 'customer_receipt').trim(),
        trigger: String((doc.querySelector('#psRuleTrigger') as HTMLSelectElement | null)?.value || 'manual_print').trim(),
        itemMatchMode: String((doc.querySelector('#psRuleItemMatchMode') as HTMLSelectElement | null)?.value || 'all').trim(),
        ticketContentMode: String((doc.querySelector('#psRuleContentMode') as HTMLSelectElement | null)?.value || 'full').trim(),
        copies: clamp((doc.querySelector('#psRuleCopies') as HTMLInputElement | null)?.value, 1, 20, 1),
        priority: String((doc.querySelector('#psRulePriority') as HTMLSelectElement | null)?.value || 'normal').trim(),
        isFallbackRule: !!((doc.querySelector('#psRuleFallback') as HTMLInputElement | null)?.checked),
        retryEnabled: !!((doc.querySelector('#psRuleRetryEnabled') as HTMLInputElement | null)?.checked),
        maxAttempts: clamp((doc.querySelector('#psRuleMaxAttempts') as HTMLInputElement | null)?.value, 1, 20, 5),
        printerRouteIds: splitCsvLower((doc.querySelector('#psRulePrinterRoutes') as HTMLInputElement | null)?.value || ''),
        categoryIds: splitCsv((doc.querySelector('#psRuleCategories') as HTMLInputElement | null)?.value || ''),
        itemIds: splitCsv((doc.querySelector('#psRuleItems') as HTMLInputElement | null)?.value || ''),
        excludedCategoryIds: splitCsv((doc.querySelector('#psRuleExcludedCategories') as HTMLInputElement | null)?.value || ''),
        excludedItemIds: splitCsv((doc.querySelector('#psRuleExcludedItems') as HTMLInputElement | null)?.value || ''),
        orderTypes: splitCsvLower((doc.querySelector('#psRuleOrderTypes') as HTMLInputElement | null)?.value || 'all'),
        orderSources: splitCsvLower((doc.querySelector('#psRuleOrderSources') as HTMLInputElement | null)?.value || 'all'),
        includeCustomerName: !!((doc.querySelector('#psRuleIncludeCustomerName') as HTMLInputElement | null)?.checked),
        includeCustomerPhone: !!((doc.querySelector('#psRuleIncludeCustomerPhone') as HTMLInputElement | null)?.checked),
        includeDeliveryAddress: !!((doc.querySelector('#psRuleIncludeDeliveryAddress') as HTMLInputElement | null)?.checked),
        includeCustomerNotes: !!((doc.querySelector('#psRuleIncludeCustomerNotes') as HTMLInputElement | null)?.checked),
        saveRule: !!((doc.querySelector('#psRuleSaveEnabled') as HTMLInputElement | null)?.checked)
      });
    }

    async function saveAdvancedSettings(doc: Document) {
      if (!dataService || typeof dataService.savePrinterSettings !== 'function') return;
      var current = state.settings || normalizeSettings({});
      var next = normalizeSettings(Object.assign({}, current, {
        preferHttps: !!((doc.querySelector('#psAdvancedPreferHttps') as HTMLInputElement | null)?.checked),
        agentHttpsUrl: String((doc.querySelector('#psAdvancedHttpsUrl') as HTMLInputElement | null)?.value || '').trim(),
        agentHttpUrl: String((doc.querySelector('#psAdvancedHttpUrl') as HTMLInputElement | null)?.value || '').trim()
      }));

      state.settings = await dataService.savePrinterSettings(next);
      state.settings = normalizeSettings(state.settings || next);
      state.actionMessage = 'Advanced settings saved.';
      await refreshAgentStatus();
      await refreshScannedPrinters();
      onChange();
    }

    async function saveEditor(doc: Document) {
      if (!dataService || typeof dataService.upsertPosPrinterConfig !== 'function') {
        state.error = 'Printer configuration APIs are unavailable.';
        onChange();
        return;
      }
      var issues = validateEditorDocument(doc);
      if (issues.length) {
        state.error = issues.join(' ');
        onChange();
        return;
      }

      var printerDraft = readEditorDraftFromDocument(doc);
      var existing = state.editorMode === 'edit' ? getPrinterById(state.editorPrinterId) : null;
      if (existing && existing.id) printerDraft.id = String(existing.id);

      var conflicting = endpointConflict(printerDraft.id, printerDraft.ip, printerDraft.port);
      if (conflicting && !global.confirm('Another configured printer already uses this endpoint: ' + conflicting.name + '. Continue?')) {
        return;
      }

      var saved = await dataService.upsertPosPrinterConfig(Object.assign({}, existing || {}, printerDraft));

      var stationScopeValue = stationScope();
      var stationChecked = !!((doc.querySelector('#psEditorStationPrinter') as HTMLInputElement | null)?.checked);
      var drawerChecked = !!((doc.querySelector('#psEditorDrawerPrinter') as HTMLInputElement | null)?.checked);
      if (hasCapability('printer.station.assign') && dataService.setStationPrinter && dataService.clearStationPrinter) {
        if (stationChecked) {
          if (state.workstationAssignment && String(state.workstationAssignment.stationPrinterId || '') !== String(saved.id || '')) {
            // Single station-printer assignment per workstation.
          }
          await dataService.setStationPrinter(Object.assign({}, stationScopeValue, { printerId: saved.id }));
        } else if (state.workstationAssignment && String(state.workstationAssignment.stationPrinterId || '') === String(saved.id || '')) {
          await dataService.clearStationPrinter(stationScopeValue);
        }
      }

      if (hasCapability('printer.cashdrawer.assign') && dataService.setCashDrawerPrinter && dataService.clearCashDrawerPrinter) {
        if (drawerChecked) {
          await dataService.setCashDrawerPrinter(Object.assign({}, stationScopeValue, { printerId: saved.id }));
        } else if (state.workstationAssignment && String(state.workstationAssignment.cashDrawerPrinterId || '') === String(saved.id || '')) {
          await dataService.clearCashDrawerPrinter(stationScopeValue);
        }
      }

      if (dataService.updateStationPrinterSlipOptions) {
        await dataService.updateStationPrinterSlipOptions(Object.assign({}, stationScopeValue, {
          printVoidSlips: !!((doc.querySelector('#psEditorPrintVoid') as HTMLInputElement | null)?.checked),
          printEdits: !!((doc.querySelector('#psEditorPrintEdits') as HTMLInputElement | null)?.checked),
          printResends: !!((doc.querySelector('#psEditorPrintResends') as HTMLInputElement | null)?.checked)
        }));
      }

      var ruleDraft = readRuleDraftFromDocument(doc);
      if (ruleDraft.saveRule && dataService.savePrinterRoutingRule) {
        var existingRule = ruleDraft.id
          ? state.localRules.find(function(row: any) { return String(row.id || '') === String(ruleDraft.id || ''); })
          : rulesForPrinter(String(saved.id || ''))[0] || null;

        var mergedRule = Object.assign({}, existingRule || {}, ruleDraft, {
          destinationPrinterId: String(saved.id || ''),
          merchantId: String(saved.merchantId || stationScopeValue.merchantId),
          locationId: String(saved.locationId || stationScopeValue.locationId)
        });

        await dataService.savePrinterRoutingRule(mergedRule);
      }

      if (dataService.savePrinterSettings && state.settings) {
        var currentSettings = normalizeSettings(state.settings || {});
        var cutAfterNode = doc.querySelector('#psEditorCutAfterPrint') as HTMLInputElement | null;
        var cutAfterValue = cutAfterNode
          ? !!cutAfterNode.checked
          : (state.editorLayoutDraft.cutAfterPrint !== false);
        var blankLinesNode = doc.querySelector('#psEditorBlankLines') as HTMLInputElement | null;
        var blankLinesFallback = clamp(state.editorLayoutDraft.blankLinesBeforeCut, 0, 10, clamp(currentSettings.feedLinesBeforeCut, 0, 10, 4));
        var blankLinesValue = blankLinesNode
          ? clamp(blankLinesNode.value, 0, 10, blankLinesFallback)
          : blankLinesFallback;
        var nextSettings = normalizeSettings(Object.assign({}, currentSettings, {
          cutPaperAfterReceipt: cutAfterValue,
          feedLinesBeforeCut: blankLinesValue,
          defaultTextScale: String((doc.querySelector('#psLayoutTextWidth') as HTMLSelectElement | null)?.value || currentSettings.defaultTextScale || 'normal'),
          headerTextScale: String((doc.querySelector('#psLayoutHeaderStyle') as HTMLSelectElement | null)?.value || currentSettings.headerTextScale || 'double_size'),
          footerMessage: String((doc.querySelector('#psContentFooterMessage') as HTMLInputElement | null)?.value || currentSettings.footerMessage || ''),
          printDuplicateLabelOnReprint: !!((doc.querySelector('#psContentDuplicateLabel') as HTMLInputElement | null)?.checked),
          printCustomerName: !!((doc.querySelector('#psContentCustomerName') as HTMLInputElement | null)?.checked),
          printCustomerPhone: !!((doc.querySelector('#psContentCustomerPhone') as HTMLInputElement | null)?.checked),
          printCustomerAddressForDelivery: !!((doc.querySelector('#psContentDeliveryAddress') as HTMLInputElement | null)?.checked),
          printOrderNotes: !!((doc.querySelector('#psContentOrderNotes') as HTMLInputElement | null)?.checked),
          printItemNotes: !!((doc.querySelector('#psContentItemNotes') as HTMLInputElement | null)?.checked),
          printDiscounts: !!((doc.querySelector('#psContentDiscounts') as HTMLInputElement | null)?.checked),
          printTips: !!((doc.querySelector('#psContentTip') as HTMLInputElement | null)?.checked),
          printPayments: !!((doc.querySelector('#psContentPayments') as HTMLInputElement | null)?.checked),
          printChangeDue: !!((doc.querySelector('#psContentChangeDue') as HTMLInputElement | null)?.checked)
        }));
        state.settings = await dataService.savePrinterSettings(nextSettings);
        state.settings = normalizeSettings(state.settings || nextSettings);
      }

      await loadLocalLists();
      await loadWorkstationAssignment();
      await loadActivity();
      closePrinterEditor();

      state.error = '';
      state.actionMessage = 'Printer saved.';
      onChange();
    }

    async function deactivatePrinter(printerId: string) {
      if (!dataService || typeof dataService.deactivatePosPrinterConfig !== 'function') return;
      var row = getPrinterById(printerId);
      if (!row) return;
      if (!global.confirm('Deactivate printer "' + row.name + '"?')) return;
      await dataService.deactivatePosPrinterConfig(printerId);
      await loadLocalLists();
      await loadWorkstationAssignment();
      state.actionMessage = 'Printer deactivated.';
      onChange();
    }

    async function duplicatePrinter(printerId: string) {
      if (!dataService || typeof dataService.upsertPosPrinterConfig !== 'function') return;
      var row = getPrinterById(printerId);
      if (!row) return;
      var nextName = String(row.name || 'Printer') + ' Copy';
      var duplicate = Object.assign({}, row, {
        id: '',
        name: nextName,
        enabled: true,
        routeLabels: Array.isArray(row.routeLabels) ? row.routeLabels.slice() : []
      });
      await dataService.upsertPosPrinterConfig(duplicate);
      await loadLocalLists();
      state.actionMessage = 'Configuration duplicated as "' + nextName + '".';
      onChange();
    }

    async function refreshScan() {
      state.scanMessage = 'Scanning printers...';
      state.scanInvoked = true;
      onChange();
      await refreshAgentStatus();
      await refreshScannedPrinters();
      var available = unconfiguredScannedPrinters();
      if (!available.length) {
        state.scanMessage = 'No new printers were found by LilPrint. Shows printers already known to the LilPrint Agent.';
      } else {
        state.scanMessage = 'Shows printers already known to the LilPrint Agent.';
      }
      onChange();
    }

    function queueStatus(printer: any): { label: string; tone: string } {
      if (!printer || printer.enabled === false) return { label: 'Disabled', tone: 'warn' };
      var agentMatch = state.scannedPrinters.find(function(row: any) {
        return String(row.id || '') === String(printer.id || '')
          || (String(row.ip || '') === String(printer.ip || '') && Number(row.port || 0) === Number(printer.port || 0));
      });
      if (!agentMatch) {
        return state.agentStatus.connectionState === 'connected'
          ? { label: 'Ready', tone: 'ok' }
          : { label: 'Unavailable', tone: 'warn' };
      }
      if (agentMatch.paused) return { label: 'Paused', tone: 'warn' };
      if (String(agentMatch.status || '').toLowerCase() === 'unreachable') return { label: 'Unavailable', tone: 'warn' };
      if (Number(agentMatch.retryWaitJobs || 0) > 0) return { label: 'Retrying', tone: 'warn' };
      if (Number(agentMatch.queuedJobs || 0) > 0) return { label: String(agentMatch.queuedJobs) + ' queued', tone: 'muted' };
      return { label: 'Ready', tone: 'ok' };
    }

    function rulesSummaryTags(printer: any): string[] {
      var list = rulesForPrinter(String(printer.id || ''));
      if (!list.length) return ['No Rules'];
      var first = list[0];
      var tags: string[] = [];
      if (first.isFallbackRule) tags.push('Default / Fallback');
      tags.push(triggerLabel(first.trigger));
      if (String(first.itemMatchMode || '') === 'printer_routes') tags.push('Items assigned to route');
      if (Array.isArray(first.orderTypes) && first.orderTypes.length && !first.orderTypes.includes('all')) {
        tags.push(first.orderTypes.map(function(value: string) { return String(value || '').replace(/^./, function(ch) { return ch.toUpperCase(); }); }).join(' + '));
      }
      return tags.slice(0, 3);
    }

    async function submitDirectDiscoveredTestPrint(printer: any): Promise<any> {
      var settings = state.settings || normalizeSettings({});
      if (!state.agentStatus.baseUrl) {
        return { ok: false, message: 'LilPrint Agent is not available.' };
      }

      var merchantId = String((dataService && dataService.getMerchantId && dataService.getMerchantId()) || settings.merchantId || 'local-merchant');
      var locationId = String((dataService && dataService.getLocationId && dataService.getLocationId()) || settings.locationId || 'local-location');
      var stationId = String((dataService && dataService.getStationNumber && dataService.getStationNumber()) || settings.stationId || '1');
      var businessDayId = String((dataService && dataService.getBusinessDate && dataService.getBusinessDate()) || nowIso().slice(0, 10));
      var testId = String(Date.now());
      var printerId = String(printer.id || '').trim() || ('discovered_' + testId);
      var idempotencyKey = ['lilpos', merchantId, locationId, 'printer_test_discovered', printerId, testId].join(':');
      var jobId = 'lilpos_job_' + Math.abs(Number(testId)).toString(16);

      var requestPrinter = {
        id: printerId,
        name: String(printer.name || 'Discovered Printer'),
        ip: String(printer.ip || ''),
        port: clamp(printer.port, 1, 65535, 9100),
        profile: normalizeProfileId(printer.profile || 'generic_escpos_thermal'),
        connectionType: normalizeConnectionType(printer.connectionType || printer.transport),
        printMode: normalizePrintMode(printer.printMode, normalizeConnectionType(printer.connectionType || printer.transport)),
        transport: global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
          ? global.LilposPrinterProfiles.effectiveTransport(
              normalizeConnectionType(printer.connectionType || printer.transport),
              normalizePrintMode(printer.printMode, normalizeConnectionType(printer.connectionType || printer.transport))
            )
          : 'tcp_9100'
      };

      var rendered = global.LilposReceiptRenderer.renderPrinterTestEscposBase64({
        settings: settings,
        printer: requestPrinter
      });

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var response = await client.submitPrintJob({
        appId: 'lilpos',
        merchantId: merchantId,
        locationId: locationId,
        jobId: jobId,
        idempotencyKey: idempotencyKey,
        printer: requestPrinter,
        payload: { type: 'escpos_raw_base64', data: rendered.base64 },
        metadata: {
          orderId: 'printer_test',
          batchId: '',
          stationId: stationId,
          businessDayId: businessDayId,
          jobType: 'printer_test',
          printerRole: 'receipt',
          source: 'lilpos',
          requestedFrom: 'printer_settings_discovery',
          isReprint: false
        },
        options: {
          copies: 1,
          priority: 'normal',
          retryEnabled: true,
          maxAttempts: 3
        }
      });

      if (!response.ok) {
        return { ok: false, message: response.errorMessage || 'Unable to submit test print.' };
      }

      if (dataService && typeof dataService.saveLocalPrintJobReference === 'function') {
        await dataService.saveLocalPrintJobReference({
          orderId: 'printer_test',
          printJobId: jobId,
          idempotencyKey: idempotencyKey,
          jobType: 'printer_test',
          printerRole: 'receipt',
          printerId: printerId,
          requestedAt: nowIso(),
          lastKnownStatus: 'QUEUED',
          lastStatusAt: nowIso(),
          isReprint: false
        });
      }

      return { ok: true, printJobId: jobId };
    }

    async function testConfiguredPrinter(printerId: string) {
      if (!hasCapability('printer.test')) {
        state.error = 'You do not have permission to run printer tests.';
        onChange();
        return;
      }
      state.testStatusByPrinterId[printerId] = 'Sending test...';
      onChange();

      var result = await printJobService.submitTestReceipt({ printerId: printerId, settingsScope: state.settings || {} });
      state.testStatusByPrinterId[printerId] = result.ok
        ? (result.status === 'TRANSMITTED' ? 'Sent to printer' : 'Test job queued')
        : (result.message || 'Test failed');
      await loadActivity();
      onChange();
    }

    async function testDiscoveredPrinter(discoveredId: string) {
      var row = state.scannedPrinters.find(function(printer: any) { return String(printer.id || '') === String(discoveredId || ''); });
      if (!row) return;

      state.testStatusByPrinterId[row.id] = 'Sending test...';
      onChange();
      var result = await submitDirectDiscoveredTestPrint(row);
      state.testStatusByPrinterId[row.id] = result.ok ? 'Test job queued' : (result.message || 'Test failed');
      await loadActivity();
      onChange();
    }

    function normalizeJobStatus(value: any): LilPrintJobStatus {
      var raw = String(value || '').toUpperCase();
      if (raw === 'SENDING') return 'SENDING';
      if (raw === 'TRANSMITTED') return 'TRANSMITTED';
      if (raw === 'RETRY_WAIT') return 'RETRY_WAIT';
      if (raw === 'FAILED_FINAL') return 'FAILED_FINAL';
      if (raw === 'CANCELED') return 'CANCELED';
      if (raw === 'MANUALLY_RESOLVED') return 'MANUALLY_RESOLVED';
      return 'QUEUED';
    }

    function canRetryJobStatus(status: LilPrintJobStatus): boolean {
      return status === 'FAILED_FINAL' || status === 'RETRY_WAIT';
    }

    function canCancelJobStatus(status: LilPrintJobStatus): boolean {
      return status === 'QUEUED' || status === 'RETRY_WAIT';
    }

    function canResolveJobStatus(status: LilPrintJobStatus): boolean {
      return status === 'FAILED_FINAL';
    }

    function canReprintJobStatus(status: LilPrintJobStatus): boolean {
      return status === 'TRANSMITTED' || status === 'FAILED_FINAL' || status === 'CANCELED' || status === 'MANUALLY_RESOLVED';
    }

    function actionButtonsForRow(row: any): string {
      var status = normalizeJobStatus(row && row.lastKnownStatus);
      var id = esc(String(row && row.id || ''));
      var buttons: string[] = [];

      if (canRetryJobStatus(status)) {
        buttons.push('<button class="btn-secondary" data-ps-retry-job="' + id + '">Retry</button>');
      }
      if (canCancelJobStatus(status)) {
        buttons.push('<button class="btn-secondary" data-ps-cancel-job="' + id + '">Cancel</button>');
      }
      if (canResolveJobStatus(status)) {
        buttons.push('<button class="btn-secondary" data-ps-resolve-job="' + id + '">Resolve</button>');
      }
      if (canReprintJobStatus(status)) {
        buttons.push('<button class="btn-secondary" data-ps-reprint-job="' + id + '">Reprint</button>');
      }

      return buttons.length ? buttons.join('') : '<span class="ps-empty">No actions available</span>';
    }

    function remoteStatusOr(localStatus: LilPrintJobStatus, apiResult: any): LilPrintJobStatus {
      var payload = apiResult && apiResult.data && typeof apiResult.data === 'object' ? apiResult.data : null;
      return normalizeJobStatus(payload && payload.status ? payload.status : localStatus);
    }

    function reprintPayload(row: any): any {
      var stamp = String(Date.now());
      return {
        reason: 'Manual reprint from Printer Settings',
        requestedBy: requestedBy(),
        newJobId: String(row && row.printJobId || 'job') + '_reprint_' + stamp,
        newIdempotencyKey: String(row && row.idempotencyKey || 'lilpos:reprint') + ':' + stamp
      };
    }

    async function retryPrintJob(localRefId: string) {
      var row = state.activityRows.find(function(entry: any) { return String(entry.id || '') === String(localRefId || ''); });
      if (!row || !row.printJobId || !state.agentStatus.baseUrl) return;
      var currentStatus = normalizeJobStatus(row.lastKnownStatus);
      if (!canRetryJobStatus(currentStatus)) {
        state.error = 'Only FAILED_FINAL or RETRY_WAIT jobs can be retried.';
        onChange();
        return;
      }
      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var result = await client.retryJob(row.printJobId, {
        reason: 'Manual retry from Printer Settings',
        requestedBy: requestedBy()
      });

      if (result.ok) {
        state.actionMessage = 'Retry requested.';
        if (dataService && dataService.updateLocalPrintJobReference) {
          await dataService.updateLocalPrintJobReference(row.id, {
            lastKnownStatus: remoteStatusOr('QUEUED', result),
            lastStatusAt: nowIso(),
            lastErrorCode: '',
            lastErrorMessage: ''
          });
        }
      } else {
        state.error = result.errorMessage || ('Retry request failed.' + (result.requestId ? ' Request ID: ' + result.requestId : ''));
      }

      await loadActivity();
      onChange();
    }

    async function cancelPrintJob(localRefId: string) {
      var row = state.activityRows.find(function(entry: any) { return String(entry.id || '') === String(localRefId || ''); });
      if (!row || !row.printJobId || !state.agentStatus.baseUrl) return;
      var currentStatus = normalizeJobStatus(row.lastKnownStatus);
      if (!canCancelJobStatus(currentStatus)) {
        state.error = 'Only QUEUED or RETRY_WAIT jobs can be canceled.';
        onChange();
        return;
      }

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var result = await client.cancelJob(row.printJobId, {
        reason: 'Canceled from Printer Settings',
        requestedBy: requestedBy()
      });

      if (result.ok) {
        state.actionMessage = 'Job canceled.';
        if (dataService && dataService.updateLocalPrintJobReference) {
          await dataService.updateLocalPrintJobReference(row.id, {
            lastKnownStatus: remoteStatusOr('CANCELED', result),
            lastStatusAt: nowIso(),
            lastErrorCode: '',
            lastErrorMessage: ''
          });
        }
      } else {
        state.error = result.errorMessage || ('Cancel request failed.' + (result.requestId ? ' Request ID: ' + result.requestId : ''));
      }

      await loadActivity();
      onChange();
    }

    async function reprintPrintJob(localRefId: string) {
      var row = state.activityRows.find(function(entry: any) { return String(entry.id || '') === String(localRefId || ''); });
      if (!row || !row.printJobId || !state.agentStatus.baseUrl) return;
      var currentStatus = normalizeJobStatus(row.lastKnownStatus);
      if (!canReprintJobStatus(currentStatus)) {
        state.error = 'Reprint is available for completed or finalized jobs.';
        onChange();
        return;
      }

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var result = await client.reprintJob(row.printJobId, reprintPayload(row));

      if (result.ok) {
        state.actionMessage = 'Reprint requested.';
      } else {
        state.error = result.errorMessage || ('Reprint request failed.' + (result.requestId ? ' Request ID: ' + result.requestId : ''));
      }

      await loadActivity();
      onChange();
    }

    async function resolvePrintJob(localRefId: string) {
      var row = state.activityRows.find(function(entry: any) { return String(entry.id || '') === String(localRefId || ''); });
      if (!row || !row.printJobId || !state.agentStatus.baseUrl) return;
      var currentStatus = normalizeJobStatus(row.lastKnownStatus);
      if (!canResolveJobStatus(currentStatus)) {
        state.error = 'Only FAILED_FINAL jobs can be resolved.';
        onChange();
        return;
      }

      var resolution = global.prompt('Describe how this print issue was resolved:') || '';
      var resolutionText = String(resolution || '').trim();
      if (!resolutionText) return;

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var result = await client.resolveJob(row.printJobId, {
        resolution: resolutionText,
        requestedBy: requestedBy()
      });

      if (!result.ok) {
        state.error = result.errorMessage || ('Resolve request failed.' + (result.requestId ? ' Request ID: ' + result.requestId : ''));
        onChange();
        return;
      }

      if (dataService && dataService.updateLocalPrintJobReference) {
        await dataService.updateLocalPrintJobReference(localRefId, {
          lastKnownStatus: remoteStatusOr('MANUALLY_RESOLVED', result),
          lastStatusAt: nowIso(),
          lastErrorCode: '',
          lastErrorMessage: ''
        });
      }

      await loadActivity();
      state.actionMessage = 'Job marked as resolved.';
      onChange();
    }

    async function callQueueControl(kind: 'pause' | 'resume' | 'clear') {
      if (!state.advancedPrinterId || !state.agentStatus.baseUrl) {
        state.error = 'Select a configured printer first.';
        onChange();
        return;
      }
      if (!hasCapability('printer.queue.manage')) {
        state.error = 'You do not have permission to manage printer queues.';
        onChange();
        return;
      }

      var reason = global.prompt('Enter reason for this action:') || '';
      if (!reason.trim()) return;

      var client = global.LilposLilPrintClient.createLilPrintClient({ baseUrl: state.agentStatus.baseUrl });
      var result = kind === 'pause'
        ? await client.pausePrinter(state.advancedPrinterId, reason, requestedBy())
        : kind === 'resume'
        ? await client.resumePrinter(state.advancedPrinterId, reason, requestedBy())
        : await client.clearPrinterQueue(state.advancedPrinterId, reason, requestedBy(), ['QUEUED', 'RETRY_WAIT']);

      if (!result.ok) {
        state.error = result.errorMessage || 'Queue action failed.';
      } else {
        state.actionMessage = kind === 'pause'
          ? 'Printer paused.'
          : kind === 'resume'
          ? 'Printer resumed.'
          : 'Pending queue cleared.';
      }

      await refreshScannedPrinters();
      onChange();
    }

    function renderTopTabs(): string {
      var tabs: Array<{ id: PrinterSettingsTopTab; label: string }> = [
        { id: 'printers', label: 'Printers' },
        { id: 'activity', label: 'Print Activity' },
        { id: 'advanced', label: 'Advanced' }
      ];
      return '<div class="ps-tab-nav ps-top-nav">' + tabs.map(function(tab) {
        return '<button class="ps-tab-btn' + (state.currentTab === tab.id ? ' active' : '') + '" data-ps-top-tab="' + esc(tab.id) + '">' + esc(tab.label) + '</button>';
      }).join('') + '</div>';
    }

    function renderHeaderStatusBar(): string {
      var assignment = state.workstationAssignment || {};
      var stationPrinterName = assignment.stationPrinterId ? localPrinterNameById(String(assignment.stationPrinterId || '')) : 'Not Assigned';
      var cashDrawerName = assignment.cashDrawerPrinterId ? localPrinterNameById(String(assignment.cashDrawerPrinterId || '')) : 'Not Assigned';

      return ''
        + '<section class="ps-panel ps-status-strip">'
        + '  <div class="ps-status-grid">'
        + '    <div><b>LilPrint Agent:</b> ' + stateBadge(state.agentStatus.connectionState) + '</div>'
        + '    <div><b>Station:</b> ' + esc(state.stationName || stationLabel()) + '</div>'
        + '    <div><b>Station Printer:</b> ' + esc(stationPrinterName) + '</div>'
        + '    <div><b>Cash Drawer:</b> ' + esc(cashDrawerName) + '</div>'
        + '  </div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-secondary" id="psScanPrinters">Scan for Printers</button>'
        + '    <button class="btn-secondary" id="psAddPrinter">Add Printer</button>'
        + '    <button class="btn-secondary" id="psRefreshStatus">Refresh Status</button>'
        + '  </div>'
        + '</section>';
    }

    function renderPrinterTable(): string {
      if (!state.localPrinters.length) {
        return '<p class="ps-empty">No configured printers yet.</p>';
      }
      return ''
        + '<div class="ps-table-wrap">'
        + '<table class="ps-printer-table ps-printer-table-main">'
        + '<thead><tr>'
        + '<th>Name</th>'
        + '<th>Enabled</th>'
        + '<th>Purpose</th>'
        + '<th>Connection</th>'
        + '<th>Printer / Paper</th>'
        + '<th>Queue Status</th>'
        + '<th>Ticket Behavior</th>'
        + '<th>Rules</th>'
        + '<th>Station Printer</th>'
        + '<th>Cash Drawer</th>'
        + '<th>Actions</th>'
        + '</tr></thead><tbody>'
        + state.localPrinters.map(function(printer: any) {
            var printerId = String(printer.id || '');
            var stationAssigned = state.workstationAssignment && String(state.workstationAssignment.stationPrinterId || '') === printerId;
            var drawerAssigned = state.workstationAssignment && String(state.workstationAssignment.cashDrawerPrinterId || '') === printerId;
            var role = roleLabel(String(printer.primaryRole || 'receipt'), String(printer.customRoleName || ''));
            var queue = queueStatus(printer);
            var firstRule = rulesForPrinter(printerId)[0] || null;
            var testStatus = String(state.testStatusByPrinterId[printerId] || '');
            var tags = rulesSummaryTags(printer);
            var dependencyLabel = firstRule ? ticketContentModeLabel(firstRule.ticketContentMode) : 'No rule configured';
            return ''
              + '<tr class="ps-row-open" tabindex="0" role="button" aria-label="Open printer ' + esc(printer.name || printerId) + '" data-ps-open-printer-row="' + esc(printerId) + '">'
              + '<td><b>' + esc(printer.name || printerId) + '</b>' + (testStatus ? '<small class="ps-test-status">' + esc(testStatus) + '</small>' : '') + '</td>'
              + '<td><label class="ps-table-toggle"><input type="checkbox" data-ps-toggle-enabled="' + esc(printerId) + '" ' + checked(printer.enabled !== false) + ' /><span class="ps-tag ' + (printer.enabled !== false ? 'ok' : 'warn') + '">' + (printer.enabled !== false ? 'Enabled' : 'Disabled') + '</span></label></td>'
              + '<td>' + esc(role) + '</td>'
              + '<td><div>' + esc(connectionModeLabel(printer.connectionType || 'network_printer')) + '</div><small>' + esc(printModeLabel(String(printer.printMode || 'raw_escpos'), String(printer.connectionType || 'network_printer'))) + ' · ' + esc(String(printer.ip || '') + ':' + Number(printer.port || 9100)) + '</small></td>'
              + '<td><div>' + esc(profileLabel(printer.profile || 'generic_escpos_thermal')) + '</div><small>' + esc(String(printer.paperWidth || '80mm')) + '</small></td>'
              + '<td><span class="ps-tag ' + esc(queue.tone) + '">' + esc(queue.label) + '</span></td>'
              + '<td>' + esc(dependencyLabel) + '</td>'
              + '<td>' + tags.map(function(tag: string) { return '<span class="ps-tag muted">' + esc(tag) + '</span>'; }).join(' ') + '</td>'
              + '<td><label class="ps-table-toggle"><input type="checkbox" data-ps-set-station="' + esc(printerId) + '" ' + checked(stationAssigned) + ' />' + (stationAssigned ? '<span class="ps-tag ok">Station Printer</span>' : '<span class="ps-tag muted">No</span>') + '</label></td>'
              + '<td><label class="ps-table-toggle"><input type="checkbox" data-ps-set-drawer="' + esc(printerId) + '" ' + checked(drawerAssigned) + ' />' + (drawerAssigned ? '<span class="ps-tag ok">Assigned</span>' : '<span class="ps-tag muted">No</span>') + '</label></td>'
              + '<td class="ps-row-actions">'
              + '<button class="btn-secondary" data-ps-test-printer="' + esc(printerId) + '">Test</button>'
              + '<button class="btn-secondary" data-ps-edit-printer="' + esc(printerId) + '">Edit</button>'
              + '<button class="ps-icon-danger-btn" data-ps-delete-printer="' + esc(printerId) + '" aria-label="Delete Printer" title="Delete Printer"><svg class="ps-icon-trash" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M7 7l1 12h8l1-12"></path><path d="M10 11v5"></path><path d="M14 11v5"></path></svg></button>'
              + '</td>'
              + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    function renderScanModal(): string {
      if (!state.scanModalOpen) return '';
      var rows = state.scanInvoked ? unconfiguredScannedPrinters() : [];
      return ''
        + '<div class="ps-modal-backdrop" id="psScanModalBackdrop">'
        + '<section class="ps-modal" aria-label="Discovered Printers">'
        + '<header><h4>Discovered Printers</h4><button class="btn-secondary" id="psCloseScanModal">Close</button></header>'
        + '<p class="muted">' + esc(state.scanMessage || 'Shows printers already known to the LilPrint Agent.') + '</p>'
        + (rows.length
          ? '<div class="ps-table-wrap"><table class="ps-printer-table"><thead><tr><th>Name</th><th>IP / Port</th><th>Profile</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
            + rows.map(function(row: any) {
                var testStatus = String(state.testStatusByPrinterId[String(row.id || '')] || '');
                return '<tr>'
                  + '<td><b>' + esc(row.name) + '</b>' + (testStatus ? '<small class="ps-test-status">' + esc(testStatus) + '</small>' : '') + '</td>'
                  + '<td>' + esc(String(row.ip || '') + ':' + Number(row.port || 9100)) + '</td>'
                  + '<td>' + esc(profileLabel(row.profile || 'generic_escpos_thermal')) + '</td>'
                  + '<td><span class="ps-tag ' + (String(row.status || '').toLowerCase() === 'available' ? 'ok' : 'warn') + '">' + esc(String(row.status || 'unknown')) + '</span></td>'
                  + '<td class="ps-row-actions"><button class="btn-secondary" data-ps-test-discovered="' + esc(row.id) + '">Test</button><button class="btn-secondary" data-ps-import-discovered="' + esc(row.id) + '">Add Printer</button></td>'
                  + '</tr>';
              }).join('')
            + '</tbody></table></div>'
          : '<p class="ps-empty">No new printers were found.</p>')
        + '</section></div>';
    }

    function renderPrintersTab(): string {
      return ''
        + renderHeaderStatusBar()
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head">'
        + '    <h4>Configured Printers</h4>'
        + '    <small>' + esc(state.localPrinters.length) + ' configured</small>'
        + '  </div>'
        + renderPrinterTable()
        + '</section>'
        + renderPrinterEditor()
        + renderScanModal();
    }

    function statusTone(status: string): string {
      var upper = String(status || '').toUpperCase();
      if (upper === 'TRANSMITTED') return 'ok';
      if (upper === 'FAILED_FINAL' || upper === 'CANCELED') return 'bad';
      if (upper === 'RETRY_WAIT') return 'warn';
      return 'muted';
    }

    function renderActivityTab(): string {
      var rows = state.activityRows || [];
      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head">'
        + '    <h4>Print Activity</h4>'
        + '    <div class="ps-actions"><button class="btn-secondary" id="psRefreshActivity">Refresh</button></div>'
        + '  </div>'
        + (rows.length
          ? '<div class="ps-activity-list">' + rows.slice(0, 120).map(function(row: any) {
              var printerName = localPrinterNameById(String(row.printerId || ''));
              return ''
                + '<article class="ps-activity-card">'
                + '  <div class="ps-activity-head">'
                + '    <b>' + esc(row.jobType || 'print_job') + '</b>'
                + '    <span class="ps-tag ' + statusTone(row.lastKnownStatus) + '">' + esc(row.lastKnownStatus || 'QUEUED') + '</span>'
                + '  </div>'
                + '  <small>' + esc(printerName) + ' · ' + esc(String(row.requestedAt || '')) + '</small>'
                + (row.lastErrorMessage ? '<small class="ps-error-inline">' + esc(row.lastErrorMessage) + '</small>' : '')
                + '  <div class="ps-actions">'
                +      actionButtonsForRow(row)
                + '  </div>'
                + '</article>';
            }).join('') + '</div>'
          : '<p class="ps-empty">No print activity yet.</p>')
        + '</section>';
    }

    function renderAdvancedDiscoveredDiagnostics(): string {
      if (!state.scannedPrinters.length) {
        return '<p class="ps-empty">No discovered printer diagnostics available.</p>';
      }
      return '<div class="ps-table-wrap"><table class="ps-printer-table"><thead><tr><th>Name</th><th>ID</th><th>Endpoint</th><th>Status</th><th>Queue</th></tr></thead><tbody>'
        + state.scannedPrinters.map(function(row: any) {
            return '<tr>'
              + '<td>' + esc(row.name) + '</td>'
              + '<td>' + esc(row.id) + '</td>'
              + '<td>' + esc(String(row.ip || '') + ':' + Number(row.port || 9100)) + '</td>'
              + '<td>' + esc(String(row.status || 'unknown')) + '</td>'
              + '<td>' + esc(row.queuedJobs || 0) + ' / ' + esc(row.retryWaitJobs || 0) + ' / ' + esc(row.failedJobs || 0) + '</td>'
              + '</tr>';
          }).join('')
        + '</tbody></table></div>';
    }

    function renderAdvancedTab(): string {
      var settings = state.settings || normalizeSettings({});
      var capabilities = state.agentStatus.payload && state.agentStatus.payload.capabilities
        ? JSON.stringify(state.agentStatus.payload.capabilities, null, 2)
        : '';

      return ''
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Agent Settings</h4></div>'
        + '  <div class="ps-grid-3">'
        + '    <label class="ps-toggle"><input id="psAdvancedPreferHttps" type="checkbox" ' + checked(settings.preferHttps) + ' /> Prefer HTTPS</label>'
        + '    <label><span>HTTPS URL</span><input id="psAdvancedHttpsUrl" value="' + esc(settings.agentHttpsUrl || '') + '" /></label>'
        + '    <label><span>HTTP URL</span><input id="psAdvancedHttpUrl" value="' + esc(settings.agentHttpUrl || '') + '" /></label>'
        + '  </div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-secondary" id="psAdvancedSave">Save Advanced</button>'
        + '    <button class="btn-secondary" id="psRefreshStatusAdvanced">Refresh Status</button>'
        + '  </div>'
        + '  <div class="ps-agent-meta"><b>Status:</b> ' + esc(state.agentStatus.message || 'Unknown') + '<br/><b>Working URL:</b> ' + esc(state.agentStatus.baseUrl || 'n/a') + '</div>'
        + '</section>'
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Queue Management</h4></div>'
        + '  <div class="ps-grid-2">'
        + '    <label><span>Target Printer</span><select id="psAdvancedPrinterSelect">'
        + state.localPrinters.map(function(printer: any) {
            return '<option value="' + esc(printer.id) + '" ' + selected(state.advancedPrinterId, printer.id) + '>' + esc(printer.name) + '</option>';
          }).join('')
        + '    </select></label>'
        + '  </div>'
        + '  <div class="ps-actions">'
        + '    <button class="btn-secondary" id="psPauseQueue">Pause</button>'
        + '    <button class="btn-secondary" id="psResumeQueue">Resume</button>'
        + '    <button class="btn-danger" id="psClearQueue">Clear Pending Queue</button>'
        + '  </div>'
        + '</section>'
        + '<section class="ps-panel">'
        + '  <div class="ps-panel-head"><h4>Discovered Printer Diagnostics</h4></div>'
        + renderAdvancedDiscoveredDiagnostics()
        + '</section>'
        + (capabilities
          ? '<section class="ps-panel"><div class="ps-panel-head"><h4>Agent Capabilities</h4></div><pre class="ps-preview">' + esc(capabilities) + '</pre></section>'
          : '');
    }

    function renderEditorTabs(): string {
      var tabs: Array<{ id: PrinterEditorTab; label: string }> = [
        { id: 'setup', label: 'Setup' },
        { id: 'behavior', label: 'Behavior' },
        { id: 'content', label: 'Content' },
        { id: 'layout', label: 'Layout' },
        { id: 'triggers', label: 'Triggers' },
        { id: 'preview', label: 'Preview' }
      ];
      return '<div class="ps-tab-nav ps-editor-nav">' + tabs.map(function(tab) {
        return '<button class="ps-tab-btn' + (state.editorTab === tab.id ? ' active' : '') + '" data-ps-editor-tab="' + esc(tab.id) + '">' + esc(tab.label) + '</button>';
      }).join('') + '</div>';
    }

    function purposeOptions(selectedPurpose: string): string {
      var options = [
        ['receipt', 'Receipt'],
        ['kitchen', 'Kitchen'],
        ['pizza', 'Pizza'],
        ['expo', 'Expo'],
        ['bar', 'Bar'],
        ['delivery', 'Delivery'],
        ['label', 'Label'],
        ['custom', 'Other']
      ];
      return options.map(function(row: any) {
        return '<option value="' + esc(row[0]) + '" ' + selected(selectedPurpose, row[0]) + '>' + esc(row[1]) + '</option>';
      }).join('');
    }

    function renderSetupTab(): string {
      var d = state.editorPrinterDraft || normalizePrinterDraft({});
      var layout = state.editorLayoutDraft || {};
      var profile = resolveProfile(d.profile);
      var effective = effectiveProfileCapabilities(d);
      var modeHelp = printModeLabel(String(d.printMode || 'raw_escpos'), String(d.connectionType || 'network_printer'));
      return ''
        + '<div class="ps-grid-3">'
        + '  <label><span>Printer Name</span><input id="psEditorPrinterName" value="' + esc(d.name) + '" /></label>'
        + '  <label><span>Description</span><input id="psEditorDescription" value="' + esc(d.description) + '" /></label>'
        + '  <label class="ps-toggle"><input id="psEditorEnabled" type="checkbox" ' + checked(d.enabled !== false) + ' /> Enabled</label>'
        + '  <label><span>Printer Purpose</span><select id="psEditorPurpose">' + purposeOptions(d.purpose) + '</select></label>'
        + '  <label><span>Custom Purpose Label</span><input id="psEditorCustomPurpose" value="' + esc(d.customPurpose || '') + '" /></label>'
        + '  <label><span>Connection Type</span><select id="psEditorConnectionType">' + connectionTypeOptions(d.connectionType || 'network_printer') + '</select></label>'
        + '  <label><span>Print Mode</span><select id="psEditorPrintMode">' + printModeOptions(d.connectionType || 'network_printer', d.printMode || 'raw_escpos') + '</select><small>' + esc(modeHelp) + '</small></label>'
        + '  <label><span>Printer Type / Profile</span><select id="psEditorProfile">' + profileOptions(d.profile || 'generic_escpos_thermal') + '</select></label>'
        + '  <p class="ps-profile-help"><b>' + esc(profile.label) + '</b><br/>' + esc(profile.description || '') + '</p>'
        + '  <label><span>IP Address / Hostname</span><input id="psEditorIp" value="' + esc(d.ip || '') + '" /></label>'
        + '  <label><span>Port</span><input id="psEditorPort" type="number" min="1" max="65535" value="' + esc(d.port || 9100) + '" /></label>'
        + '  <label><span>Paper Width</span><select id="psEditorPaper"><option value="80mm" ' + selected(d.paperWidth, '80mm') + '>80mm</option><option value="76mm" ' + selected(d.paperWidth, '76mm') + '>76mm</option><option value="58mm" ' + selected(d.paperWidth, '58mm') + '>58mm</option></select></label>'
        + '  <label><span>Characters Per Line</span><input id="psEditorCpl" type="number" min="20" max="64" value="' + esc(d.charactersPerLine || 48) + '" /></label>'
        + '  <label><span>Copies</span><input id="psEditorCopies" type="number" min="1" max="20" value="' + esc(d.copies || 1) + '" /></label>'
        + '  <label><span>Route Labels</span><input id="psEditorRouteLabels" value="' + esc(d.routeLabelsText || '') + '" /></label>'
        + '  <label><span>Stable Printer ID</span><input id="psEditorStableId" value="' + esc(d.id || '') + '" placeholder="Auto-generated if blank" /></label>'
        + '  <label class="ps-toggle"><input id="psEditorRetry" type="checkbox" ' + checked(d.retryEnabled !== false) + ' /> Retry failed jobs</label>'
        + '  <label><span>Maximum Attempts</span><input id="psEditorMaxAttempts" type="number" min="1" max="20" value="' + esc(d.maxAttempts || 5) + '" /></label>'
        + '  <label><span>Blank Lines Before Cut</span><input id="psEditorBlankLines" type="number" min="0" max="10" value="' + esc(layout.blankLinesBeforeCut || 0) + '" /></label>'
        + '  <label class="ps-toggle"><input id="psEditorCutAfterPrint" type="checkbox" ' + checked(layout.cutAfterPrint !== false) + (effective.supportsCut ? '' : ' disabled') + ' /> Cut After Print' + (effective.supportsCut ? '' : ' (not available for this profile)') + '</label>'
        + '  <small>Logo/Image support: ' + (effective.supportsRasterLogo ? 'Available' : 'Unavailable for this profile') + '</small>'
        + '</div>'
        + '<details class="ps-advanced-details"><summary>Advanced Printer Options</summary>'
        + '  <div class="ps-grid-3">'
        + '    <label><span>Cutter installed</span><select id="psEditorCutterInstalled"><option value="auto" ' + selected(formatOverride(d.cutterInstalledOverride), 'auto') + '>Use profile default</option><option value="yes" ' + selected(formatOverride(d.cutterInstalledOverride), 'yes') + '>Yes</option><option value="no" ' + selected(formatOverride(d.cutterInstalledOverride), 'no') + '>No</option></select></label>'
        + '    <label><span>Cash drawer connected</span><select id="psEditorCashDrawerOverride"><option value="auto" ' + selected(formatOverride(d.cashDrawerConnectedOverride), 'auto') + '>Use profile default</option><option value="yes" ' + selected(formatOverride(d.cashDrawerConnectedOverride), 'yes') + '>Yes</option><option value="no" ' + selected(formatOverride(d.cashDrawerConnectedOverride), 'no') + '>No</option></select></label>'
        + '    <label><span>Raster image support</span><select id="psEditorRasterLogoOverride"><option value="auto" ' + selected(formatOverride(d.rasterImageSupportOverride), 'auto') + '>Use profile default</option><option value="yes" ' + selected(formatOverride(d.rasterImageSupportOverride), 'yes') + '>Yes</option><option value="no" ' + selected(formatOverride(d.rasterImageSupportOverride), 'no') + '>No</option></select></label>'
        + '  </div>'
        + '</details>'
        + '<div class="ps-editor-assignment">'
        + '  <label class="ps-toggle"><input id="psEditorStationPrinter" type="checkbox" ' + checked(d.isStationPrinter === true) + ' /> Station Printer for this workstation</label>'
        + (d.isStationPrinter
          ? '<div class="ps-station-suboptions">'
            + '<label><input id="psEditorPrintVoid" type="checkbox" ' + checked(d.printVoidSlips !== false) + ' /> Print Void Slips</label>'
            + '<label><input id="psEditorPrintEdits" type="checkbox" ' + checked(d.printEdits !== false) + ' /> Print Edits</label>'
            + '<label><input id="psEditorPrintResends" type="checkbox" ' + checked(d.printResends !== false) + ' /> Print Resends</label>'
            + '</div>'
          : '')
        + '  <label class="ps-toggle"><input id="psEditorDrawerPrinter" type="checkbox" ' + checked(d.isCashDrawerPrinter === true) + ' /> Cash Drawer is connected through this printer</label>'
        + '</div>';
    }

    function renderBehaviorTab(): string {
      var r = state.editorRuleDraft || normalizeRuleDraft({});
      var ruleSummary = naturalRuleSummary(state.editorPrinterDraft || {}, r);
      return ''
        + '<div class="ps-grid-3">'
        + '  <label><span>Rule Name</span><input id="psRuleName" value="' + esc(r.name || '') + '" placeholder="Main receipt rule" /></label>'
        + '  <label><span>Ticket Type</span><select id="psRuleTicketType">'
        + '    <option value="customer_receipt" ' + selected(r.ticketType, 'customer_receipt') + '>Customer Receipt</option>'
        + '    <option value="kitchen_ticket" ' + selected(r.ticketType, 'kitchen_ticket') + '>Kitchen Ticket</option>'
        + '    <option value="pizza_ticket" ' + selected(r.ticketType, 'pizza_ticket') + '>Pizza Ticket</option>'
        + '    <option value="expo_ticket" ' + selected(r.ticketType, 'expo_ticket') + '>Expo Ticket</option>'
        + '    <option value="bar_ticket" ' + selected(r.ticketType, 'bar_ticket') + '>Bar Ticket</option>'
        + '    <option value="delivery_ticket" ' + selected(r.ticketType, 'delivery_ticket') + '>Delivery Ticket</option>'
        + '    <option value="label" ' + selected(r.ticketType, 'label') + '>Label</option>'
        + '    <option value="custom" ' + selected(r.ticketType, 'custom') + '>Custom Ticket</option>'
        + '  </select></label>'
        + '  <label><span>Ticket Behavior</span><select id="psRuleContentMode">'
        + '    <option value="full" ' + selected(r.ticketContentMode, 'full') + '>Full Order</option>'
        + '    <option value="filtered" ' + selected(r.ticketContentMode, 'filtered') + '>Matching Items Only</option>'
        + '    <option value="filtered_plus_shared" ' + selected(r.ticketContentMode, 'filtered_plus_shared') + '>Matching Items Plus Other Items</option>'
        + '    <option value="unmatched_only" ' + selected(r.ticketContentMode, 'unmatched_only') + '>Unmatched Items</option>'
        + '    <option value="summary" ' + selected(r.ticketContentMode, 'summary') + '>Summary Only</option>'
        + '  </select></label>'
        + '  <label><span>Item Selection</span><select id="psRuleItemMatchMode">'
        + '    <option value="all" ' + selected(r.itemMatchMode, 'all') + '>All Items</option>'
        + '    <option value="printer_routes" ' + selected(r.itemMatchMode, 'printer_routes') + '>Items Assigned to a Printer Route</option>'
        + '    <option value="categories" ' + selected(r.itemMatchMode, 'categories') + '>Selected Categories</option>'
        + '    <option value="items" ' + selected(r.itemMatchMode, 'items') + '>Selected Items</option>'
        + '    <option value="unmatched" ' + selected(r.itemMatchMode, 'unmatched') + '>Items Not Matched by Another Production Printer</option>'
        + '  </select></label>'
        + '  <label><span>Copies</span><input id="psRuleCopies" type="number" min="1" max="20" value="' + esc(r.copies || 1) + '" /></label>'
        + '  <label><span>Priority</span><select id="psRulePriority"><option value="low" ' + selected(r.priority, 'low') + '>Low</option><option value="normal" ' + selected(r.priority, 'normal') + '>Normal</option><option value="high" ' + selected(r.priority, 'high') + '>High</option></select></label>'
        + '  <label class="ps-toggle"><input id="psRuleFallback" type="checkbox" ' + checked(r.isFallbackRule === true) + ' /> Use as fallback for unmatched production items</label>'
        + '  <label class="ps-toggle"><input id="psRuleEnabled" type="checkbox" ' + checked(r.enabled !== false) + ' /> Rule enabled</label>'
        + '  <label class="ps-toggle"><input id="psRuleSaveEnabled" type="checkbox" ' + checked(r.saveRule !== false) + ' /> Save this rule with printer</label>'
        + '</div>'
        + '<details class="ps-advanced-details"><summary>What should print here?</summary>'
        + '  <div class="ps-grid-2">'
        + '    <label><span>Printer Routes (comma-separated)</span><input id="psRulePrinterRoutes" value="' + esc(r.printerRouteIdsText || '') + '" placeholder="pizza, kitchen" /></label>'
        + '    <label><span>Categories (comma-separated IDs)</span><input id="psRuleCategories" value="' + esc(r.categoryIdsText || '') + '" placeholder="cat_pizza, cat_salads" /></label>'
        + '    <label><span>Items (comma-separated IDs)</span><input id="psRuleItems" value="' + esc(r.itemIdsText || '') + '" placeholder="item_1001, item_1020" /></label>'
        + '    <label><span>Exclude Categories</span><input id="psRuleExcludedCategories" value="' + esc(r.excludedCategoryIdsText || '') + '" /></label>'
        + '    <label><span>Exclude Items</span><input id="psRuleExcludedItems" value="' + esc(r.excludedItemIdsText || '') + '" /></label>'
        + '  </div>'
        + '</details>'
        + '<details class="ps-advanced-details"><summary>Advanced Delivery Options</summary>'
        + '  <div class="ps-grid-3">'
        + '    <label class="ps-toggle"><input id="psRuleRetryEnabled" type="checkbox" ' + checked(r.retryEnabled !== false) + ' /> Retry failed jobs</label>'
        + '    <label><span>Maximum attempts</span><input id="psRuleMaxAttempts" type="number" min="1" max="20" value="' + esc(r.maxAttempts || 5) + '" /></label>'
        + '    <label><span>Rule ID</span><input id="psRuleId" value="' + esc(r.id || '') + '" placeholder="Auto-assigned" /></label>'
        + '  </div>'
        + '</details>'
        + '<p class="ps-rule-summary"><b>Summary:</b> ' + esc(ruleSummary) + '</p>';
    }

    function renderContentTab(): string {
      var c = state.editorContentDraft || {};
      var receiptMode = String(state.editorRuleDraft.ticketType || '') === 'customer_receipt';
      return ''
        + '<div class="ps-content-grid">'
        + '  <label><input id="psContentMerchantName" type="checkbox" ' + checked(c.merchantName !== false) + ' /> Merchant Name</label>'
        + '  <label><input id="psContentMerchantAddress" type="checkbox" ' + checked(c.merchantAddress !== false) + ' /> Merchant Address</label>'
        + '  <label><input id="psContentMerchantPhone" type="checkbox" ' + checked(c.merchantPhone !== false) + ' /> Merchant Phone</label>'
        + '  <label><input id="psContentOrderNumber" type="checkbox" ' + checked(c.orderNumber !== false) + ' /> Order Number</label>'
        + '  <label><input id="psContentOrderType" type="checkbox" ' + checked(c.orderType !== false) + ' /> Order Type</label>'
        + '  <label><input id="psContentDateTime" type="checkbox" ' + checked(c.dateTime !== false) + ' /> Date and Time</label>'
        + '  <label><input id="psContentEmployeeName" type="checkbox" ' + checked(c.employeeName !== false) + ' /> Employee Name</label>'
        + '  <label><input id="psContentStationName" type="checkbox" ' + checked(c.stationName !== false) + ' /> Station Name</label>'
        + '  <label><input id="psContentCustomerName" type="checkbox" ' + checked(c.customerName !== false) + ' /> Customer Name</label>'
        + '  <label><input id="psContentCustomerPhone" type="checkbox" ' + checked(c.customerPhone === true) + ' /> Customer Phone</label>'
        + '  <label><input id="psContentDeliveryAddress" type="checkbox" ' + checked(c.deliveryAddress === true) + ' /> Delivery Address</label>'
        + '  <label><input id="psContentItemDescriptions" type="checkbox" ' + checked(c.itemDescriptions !== false) + ' /> Item Descriptions</label>'
        + '  <label><input id="psContentModifiers" type="checkbox" ' + checked(c.modifiers !== false) + ' /> Modifiers</label>'
        + '  <label><input id="psContentModifierPrices" type="checkbox" ' + checked(c.modifierPrices === true) + ' /> Modifier Prices</label>'
        + '  <label><input id="psContentItemNotes" type="checkbox" ' + checked(c.itemNotes !== false) + ' /> Item Notes</label>'
        + '  <label><input id="psContentOrderNotes" type="checkbox" ' + checked(c.orderNotes !== false) + ' /> Order Notes</label>'
        + (receiptMode
          ? '  <label><input id="psContentSubtotal" type="checkbox" ' + checked(c.subtotal !== false) + ' /> Subtotal</label>'
            + '  <label><input id="psContentDiscounts" type="checkbox" ' + checked(c.discounts !== false) + ' /> Discounts</label>'
            + '  <label><input id="psContentTax" type="checkbox" ' + checked(c.tax !== false) + ' /> Tax</label>'
            + '  <label><input id="psContentTip" type="checkbox" ' + checked(c.tip !== false) + ' /> Tip</label>'
            + '  <label><input id="psContentPayments" type="checkbox" ' + checked(c.payments !== false) + ' /> Payments</label>'
            + '  <label><input id="psContentChangeDue" type="checkbox" ' + checked(c.changeDue !== false) + ' /> Change Due</label>'
          : '')
        + '  <label><input id="psContentDuplicateLabel" type="checkbox" ' + checked(c.duplicateLabel !== false) + ' /> Duplicate / Reprint Label</label>'
        + '</div>'
        + '<label class="ps-wide"><span>Footer Message</span><input id="psContentFooterMessage" value="' + esc(c.footerMessage || '') + '" /></label>';
    }

    function renderLayoutTab(): string {
      var l = state.editorLayoutDraft || {};
      var caps = effectiveProfileCapabilities(state.editorPrinterDraft || {});
      return ''
        + '<div class="ps-grid-3">'
        + '  <label><span>Paper Width</span><select id="psLayoutPaper"><option value="80mm" ' + selected(state.editorPrinterDraft.paperWidth, '80mm') + '>80mm</option><option value="76mm" ' + selected(state.editorPrinterDraft.paperWidth, '76mm') + '>76mm</option><option value="58mm" ' + selected(state.editorPrinterDraft.paperWidth, '58mm') + '>58mm</option></select></label>'
        + '  <label><span>Characters Per Line</span><input id="psLayoutCpl" type="number" min="20" max="64" value="' + esc(state.editorPrinterDraft.charactersPerLine || 48) + '" /></label>'
        + '  <label><span>Header Style</span><select id="psLayoutHeaderStyle"><option value="normal" ' + selected(l.headerStyle, 'normal') + '>Normal</option><option value="double_height" ' + selected(l.headerStyle, 'double_height') + (caps.supportsDoubleHeight ? '' : ' disabled') + '>Double Height</option><option value="double_width" ' + selected(l.headerStyle, 'double_width') + (caps.supportsDoubleWidth ? '' : ' disabled') + '>Double Width</option><option value="double_size" ' + selected(l.headerStyle, 'double_size') + (caps.supportsDoubleWidth && caps.supportsDoubleHeight ? '' : ' disabled') + '>Double Size</option></select></label>'
        + '  <label><span>Text Width</span><select id="psLayoutTextWidth"><option value="normal" ' + selected(l.textWidth, 'normal') + '>Normal</option><option value="double_width" ' + selected(l.textWidth, 'double_width') + (caps.supportsDoubleWidth ? '' : ' disabled') + '>Double Width</option></select></label>'
        + '  <label><span>Ticket Title</span><input id="psLayoutTicketTitle" value="' + esc(l.ticketTitle || '') + '" /></label>'
        + '  <label><span>Matching Section Title</span><input id="psLayoutMatchingTitle" value="' + esc(l.matchingSectionTitle || '') + '" /></label>'
        + '  <label><span>Other Items Section Title</span><input id="psLayoutOtherTitle" value="' + esc(l.otherItemsSectionTitle || '') + '" /></label>'
        + '</div>';
    }

    function renderTriggersTab(): string {
      var r = state.editorRuleDraft || normalizeRuleDraft({});
      return ''
        + '<div class="ps-grid-3">'
        + '  <label><span>Primary Trigger</span><select id="psRuleTrigger">'
        + '    <option value="order_sent" ' + selected(r.trigger, 'order_sent') + '>When Order Is Sent</option>'
        + '    <option value="sale_completed" ' + selected(r.trigger, 'sale_completed') + '>When Sale Is Completed</option>'
        + '    <option value="manual_print" ' + selected(r.trigger, 'manual_print') + '>Manual Print</option>'
        + '    <option value="order_accepted" ' + selected(r.trigger, 'order_accepted') + '>When Order Is Accepted</option>'
        + '    <option value="order_working" ' + selected(r.trigger, 'order_working') + '>When Order Is Working</option>'
        + '    <option value="status_changed" ' + selected(r.trigger, 'status_changed') + '>When Status Changes</option>'
        + '  </select></label>'
        + '  <label><span>Order Types Filter (comma-separated)</span><input id="psRuleOrderTypes" value="' + esc(r.orderTypesText || 'all') + '" placeholder="pickup, delivery" /></label>'
        + '  <label><span>Source Filter (comma-separated)</span><input id="psRuleOrderSources" value="' + esc(r.orderSourcesText || 'all') + '" placeholder="lilpos, doordash" /></label>'
        + '  <label class="ps-toggle"><input id="psRuleIncludeCustomerName" type="checkbox" ' + checked(r.includeCustomerName !== false) + ' /> Include Customer Name</label>'
        + '  <label class="ps-toggle"><input id="psRuleIncludeCustomerPhone" type="checkbox" ' + checked(r.includeCustomerPhone === true) + ' /> Include Customer Phone</label>'
        + '  <label class="ps-toggle"><input id="psRuleIncludeDeliveryAddress" type="checkbox" ' + checked(r.includeDeliveryAddress === true) + ' /> Include Delivery Address</label>'
        + '  <label class="ps-toggle"><input id="psRuleIncludeCustomerNotes" type="checkbox" ' + checked(r.includeCustomerNotes === true) + ' /> Include Customer Notes</label>'
        + '</div>'
        + '<details class="ps-advanced-details"><summary>Limit Which Orders Print</summary>'
        + '  <p class="muted">Use order type and source filters when your order data includes those values. Unsupported sources should be omitted.</p>'
        + '</details>';
    }

    function renderPreviewTab(): string {
      var settings = normalizeSettings(state.settings || {});
      var draftPrinter = state.editorPrinterDraft || {};
      var preview = global.LilposReceiptRenderer.renderPrinterTestEscposBase64({
        settings: Object.assign({}, settings, {
          paperWidth: draftPrinter.paperWidth || settings.paperWidth,
          charactersPerLine: draftPrinter.charactersPerLine || settings.charactersPerLine
        }),
        printerConfig: draftPrinter,
        printer: {
          id: String(draftPrinter.id || 'preview_printer'),
          name: String(draftPrinter.name || 'Preview Printer'),
          ip: String(draftPrinter.ip || '0.0.0.0'),
          port: Number(draftPrinter.port || 9100),
          profile: String(draftPrinter.profile || 'generic_escpos_thermal'),
          connectionType: normalizeConnectionType(draftPrinter.connectionType),
          printMode: normalizePrintMode(draftPrinter.printMode, draftPrinter.connectionType),
          transport: global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
            ? global.LilposPrinterProfiles.effectiveTransport(draftPrinter.connectionType, draftPrinter.printMode)
            : 'tcp_9100'
        }
      });

      var summary = [
        'TEST PRINT',
        'Printer: ' + String(draftPrinter.name || 'Unnamed Printer'),
        'Ticket Type: ' + ticketTypeLabel(String(state.editorRuleDraft.ticketType || 'customer_receipt')),
        'Date/Time: ' + new Date().toLocaleString()
      ].join('\n');

      return ''
        + '<div class="ps-panel">'
        + '  <pre class="ps-preview">' + esc(summary) + '\n\n' + esc((preview && preview.previewText) || 'Preview data unavailable.') + '</pre>'
        + '  <div class="ps-actions">'
        + '    <button id="psPreviewTestPrint" class="btn-secondary">Print Test</button>'
        + '  </div>'
        + '</div>';
    }

    function renderEditorBody(): string {
      if (state.editorTab === 'setup') return renderSetupTab();
      if (state.editorTab === 'behavior') return renderBehaviorTab();
      if (state.editorTab === 'content') return renderContentTab();
      if (state.editorTab === 'layout') return renderLayoutTab();
      if (state.editorTab === 'triggers') return renderTriggersTab();
      return renderPreviewTab();
    }

    function renderPrinterEditor(): string {
      if (!state.editorOpen) return '';

      return ''
        + '<div class="ps-modal-backdrop" id="psEditorBackdrop">'
        + '<section class="ps-modal ps-editor-modal" aria-label="Printer Editor">'
        + '  <header>'
        + '    <h4>' + esc(state.editorMode === 'create' ? 'Add Printer' : 'Edit Printer') + '</h4>'
        + '    <button id="psEditorCancelTop" class="btn-secondary">Close</button>'
        + '  </header>'
        + renderEditorTabs()
        + '<div class="ps-editor-panel">'
        + renderEditorBody()
        + '</div>'
        + '<div class="ps-actions">'
        + '  <button id="psEditorCancel" class="btn-secondary">Cancel</button>'
        + '  <button id="psEditorSave" class="btn-success">Save Printer</button>'
        + '</div>'
        + '</section></div>';
    }

    function renderActiveTopTab(): string {
      if (state.currentTab === 'printers') return renderPrintersTab();
      if (state.currentTab === 'activity') return renderActivityTab();
      return renderAdvancedTab();
    }

    function render(): string {
      if (!state.loaded || state.loading) {
        return '<div class="mgr-section-content"><h3>Printer Settings</h3><p class="muted">Loading printer settings...</p></div>';
      }

      return ''
        + '<div class="mgr-section-content printer-settings-view">'
        + '  <div class="ps-page-head">'
        + '    <h3>Printer Settings</h3>'
        + '    <p class="muted">Configure each printer in one place: setup, behavior, content, layout, triggers, preview, and test.</p>'
        + '  </div>'
        + (state.error ? '<p class="sdm-error">' + esc(state.error) + '</p>' : '')
        + (state.actionMessage ? '<p class="sdm-action-message">' + esc(state.actionMessage) + '</p>' : '')
        + renderTopTabs()
        + '<div class="ps-tab-panel">' + renderActiveTopTab() + '</div>'
        + '</div>';
    }

    function bind(document: Document) {
      if (!state.loaded) return;

      document.querySelectorAll('[data-ps-top-tab]').forEach(function(node) {
        node.addEventListener('click', function() {
          state.currentTab = String((node as HTMLElement).getAttribute('data-ps-top-tab') || 'printers') as PrinterSettingsTopTab;
          onChange();
        });
      });

      document.querySelectorAll('[data-ps-editor-tab]').forEach(function(node) {
        node.addEventListener('click', function() {
          state.editorTab = String((node as HTMLElement).getAttribute('data-ps-editor-tab') || 'setup') as PrinterEditorTab;
          onChange();
        });
      });

      document.querySelector('#psAddPrinter')?.addEventListener('click', function() {
        if (!hasCapability('printer.configure')) return;
        openPrinterEditor('create');
      });

      document.querySelector('#psScanPrinters')?.addEventListener('click', function() {
        void (async function() {
          state.scanModalOpen = true;
          await refreshScan();
          onChange();
        })();
      });

      document.querySelector('#psCloseScanModal')?.addEventListener('click', function() {
        state.scanModalOpen = false;
        onChange();
      });

      document.querySelector('#psScanModalBackdrop')?.addEventListener('click', function(event) {
        if (event.target !== event.currentTarget) return;
        state.scanModalOpen = false;
        onChange();
      });

      document.querySelector('#psRefreshStatus')?.addEventListener('click', function() {
        void (async function() {
          await refreshAgentStatus();
          await refreshScannedPrinters();
          onChange();
        })();
      });
      document.querySelector('#psRefreshStatusAdvanced')?.addEventListener('click', function() {
        void (async function() {
          await refreshAgentStatus();
          await refreshScannedPrinters();
          onChange();
        })();
      });

      document.querySelectorAll('[data-ps-edit-printer]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          event.stopPropagation();
          if (!hasCapability('printer.configure')) return;
          openPrinterEditor('edit', String((node as HTMLElement).getAttribute('data-ps-edit-printer') || ''));
        });
      });

      document.querySelectorAll('[data-ps-toggle-enabled]').forEach(function(node) {
        node.addEventListener('change', function(event) {
          event.stopPropagation();
          var printerId = String((node as HTMLElement).getAttribute('data-ps-toggle-enabled') || '');
          var row = getPrinterById(printerId);
          if (!row || !dataService || !dataService.upsertPosPrinterConfig) return;
          var nextEnabled = !!((node as HTMLInputElement).checked);
          void (async function() {
            await dataService.upsertPosPrinterConfig(Object.assign({}, row, {
              enabled: nextEnabled,
              disabledAt: nextEnabled ? '' : nowIso()
            }));
            await loadLocalLists();
            state.actionMessage = nextEnabled ? 'Printer enabled.' : 'Printer disabled.';
            onChange();
          })();
        });
      });

      document.querySelectorAll('[data-ps-delete-printer]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          event.stopPropagation();
          var printerId = String((node as HTMLElement).getAttribute('data-ps-delete-printer') || '');
          var printer = getPrinterById(printerId);
          if (!printer) return;
          var dependencies: string[] = [];
          var assignment = state.workstationAssignment || {};
          if (String(assignment.stationPrinterId || '') === printerId) {
            dependencies.push('Station Printer for ' + stationLabel());
          }
          if (String(assignment.cashDrawerPrinterId || '') === printerId) {
            dependencies.push('Cash Drawer for ' + stationLabel());
          }
          var ruleCount = rulesForPrinter(printerId).length;
          if (ruleCount > 0) dependencies.push('Used by ' + ruleCount + ' print rule' + (ruleCount === 1 ? '' : 's'));
          var message = 'Delete "' + String(printer.name || printerId) + '"?\n\nThis printer will be removed from LilPOS configuration.';
          if (dependencies.length) {
            message += '\n\nDependencies:\n- ' + dependencies.join('\n- ');
            message += '\n\nConfirm to continue and resolve affected dependencies.';
          }
          if (!global.confirm(message)) return;
          void deactivatePrinter(printerId);
        });
      });

      document.querySelectorAll('[data-ps-test-printer]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          event.stopPropagation();
          var printerId = String((node as HTMLElement).getAttribute('data-ps-test-printer') || '');
          void testConfiguredPrinter(printerId);
        });
      });

      document.querySelectorAll('[data-ps-test-discovered]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          event.stopPropagation();
          var printerId = String((node as HTMLElement).getAttribute('data-ps-test-discovered') || '');
          void testDiscoveredPrinter(printerId);
        });
      });

      document.querySelectorAll('[data-ps-import-discovered]').forEach(function(node) {
        node.addEventListener('click', function(event) {
          event.stopPropagation();
          if (!hasCapability('printer.configure')) return;
          var discoveredId = String((node as HTMLElement).getAttribute('data-ps-import-discovered') || '');
          var row = state.scannedPrinters.find(function(printer: any) { return String(printer.id || '') === discoveredId; });
          if (!row) return;
          state.scanModalOpen = false;
          openPrinterEditor('create', '', row);
        });
      });

      document.querySelectorAll('[data-ps-set-station]').forEach(function(node) {
        node.addEventListener('click', function(event) { event.stopPropagation(); });
        node.addEventListener('change', function(event) {
          event.stopPropagation();
          if (!dataService) return;
          var printerId = String((node as HTMLElement).getAttribute('data-ps-set-station') || '');
          var checkedState = !!((node as HTMLInputElement).checked);
          void (async function() {
            if (checkedState && dataService.setStationPrinter) {
              await dataService.setStationPrinter(Object.assign({}, stationScope(), { printerId: printerId }));
            } else if (!checkedState && dataService.clearStationPrinter) {
              await dataService.clearStationPrinter(stationScope());
            }
            await loadWorkstationAssignment();
            state.actionMessage = checkedState ? 'Station printer updated.' : 'Station printer cleared.';
            onChange();
          })();
        });
      });

      document.querySelectorAll('[data-ps-set-drawer]').forEach(function(node) {
        node.addEventListener('click', function(event) { event.stopPropagation(); });
        node.addEventListener('change', function(event) {
          event.stopPropagation();
          if (!dataService) return;
          var printerId = String((node as HTMLElement).getAttribute('data-ps-set-drawer') || '');
          var checkedState = !!((node as HTMLInputElement).checked);
          void (async function() {
            if (checkedState && dataService.setCashDrawerPrinter) {
              await dataService.setCashDrawerPrinter(Object.assign({}, stationScope(), { printerId: printerId }));
            } else if (!checkedState && dataService.clearCashDrawerPrinter) {
              await dataService.clearCashDrawerPrinter(stationScope());
            }
            await loadWorkstationAssignment();
            state.actionMessage = checkedState ? 'Cash drawer printer updated.' : 'Cash drawer printer cleared.';
            onChange();
          })();
        });
      });

      document.querySelectorAll('[data-ps-open-printer-row]').forEach(function(node) {
        node.addEventListener('click', function(event: any) {
          var target = event.target as HTMLElement | null;
          if (target && target.closest('button, input, label, a, [data-ps-test-printer], [data-ps-edit-printer], [data-ps-delete-printer], [data-ps-set-station], [data-ps-set-drawer], [data-ps-toggle-enabled]')) {
            return;
          }
          if (!hasCapability('printer.configure')) return;
          var printerId = String((node as HTMLElement).getAttribute('data-ps-open-printer-row') || '');
          if (!printerId) return;
          openPrinterEditor('edit', printerId);
        });
        node.addEventListener('keydown', function(event: any) {
          var code = String(event.key || '');
          if (code !== 'Enter' && code !== ' ') return;
          event.preventDefault();
          if (!hasCapability('printer.configure')) return;
          var printerId = String((node as HTMLElement).getAttribute('data-ps-open-printer-row') || '');
          if (!printerId) return;
          openPrinterEditor('edit', printerId);
        });
      });

      document.querySelector('#psEditorCancel')?.addEventListener('click', function() {
        closePrinterEditor();
      });
      document.querySelector('#psEditorCancelTop')?.addEventListener('click', function() {
        closePrinterEditor();
      });
      document.querySelector('#psEditorBackdrop')?.addEventListener('click', function(event) {
        if (event.target !== event.currentTarget) return;
        closePrinterEditor();
      });

      document.querySelector('#psEditorSave')?.addEventListener('click', function() {
        if (!hasCapability('printer.configure')) return;
        void saveEditor(document);
      });

      document.querySelector('#psPreviewTestPrint')?.addEventListener('click', function() {
        var editorId = String((document.querySelector('#psEditorStableId') as HTMLInputElement | null)?.value || '').trim()
          || String(state.editorPrinterDraft.id || '');
        if (editorId) {
          void testConfiguredPrinter(editorId);
          return;
        }
        var draftPrinter = readEditorDraftFromDocument(document);
        void (async function() {
          var result = await submitDirectDiscoveredTestPrint({
            id: draftPrinter.id || ('preview_' + Date.now()),
            name: draftPrinter.name,
            ip: draftPrinter.ip,
            port: draftPrinter.port,
            profile: draftPrinter.profile
          });
          state.actionMessage = result.ok ? 'Test job queued.' : (result.message || 'Test failed.');
          await loadActivity();
          onChange();
        })();
      });

      document.querySelector('#psRefreshActivity')?.addEventListener('click', function() {
        void (async function() {
          await loadActivity();
          onChange();
        })();
      });

      document.querySelectorAll('[data-ps-retry-job]').forEach(function(node) {
        node.addEventListener('click', function() {
          void retryPrintJob(String((node as HTMLElement).getAttribute('data-ps-retry-job') || ''));
        });
      });
      document.querySelectorAll('[data-ps-reprint-job]').forEach(function(node) {
        node.addEventListener('click', function() {
          void reprintPrintJob(String((node as HTMLElement).getAttribute('data-ps-reprint-job') || ''));
        });
      });
      document.querySelectorAll('[data-ps-cancel-job]').forEach(function(node) {
        node.addEventListener('click', function() {
          void cancelPrintJob(String((node as HTMLElement).getAttribute('data-ps-cancel-job') || ''));
        });
      });
      document.querySelectorAll('[data-ps-resolve-job]').forEach(function(node) {
        node.addEventListener('click', function() {
          void resolvePrintJob(String((node as HTMLElement).getAttribute('data-ps-resolve-job') || ''));
        });
      });

      document.querySelector('#psAdvancedSave')?.addEventListener('click', function() {
        void saveAdvancedSettings(document);
      });

      document.querySelector('#psAdvancedPrinterSelect')?.addEventListener('change', function(event) {
        state.advancedPrinterId = String((event.target as HTMLSelectElement).value || '');
      });

      document.querySelector('#psPauseQueue')?.addEventListener('click', function() {
        void callQueueControl('pause');
      });
      document.querySelector('#psResumeQueue')?.addEventListener('click', function() {
        void callQueueControl('resume');
      });
      document.querySelector('#psClearQueue')?.addEventListener('click', function() {
        void callQueueControl('clear');
      });

      document.querySelector('#psEditorStationPrinter')?.addEventListener('change', function() {
        state.editorPrinterDraft.isStationPrinter = !!((document.querySelector('#psEditorStationPrinter') as HTMLInputElement | null)?.checked);
        onChange();
      });

      document.querySelector('#psEditorConnectionType')?.addEventListener('change', function() {
        var connectionType = normalizeConnectionType((document.querySelector('#psEditorConnectionType') as HTMLSelectElement | null)?.value || 'network_printer');
        state.editorPrinterDraft.connectionType = connectionType;
        state.editorPrinterDraft.printMode = normalizePrintMode(state.editorPrinterDraft.printMode, connectionType);
        state.editorPrinterDraft.transport = global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
          ? global.LilposPrinterProfiles.effectiveTransport(state.editorPrinterDraft.connectionType, state.editorPrinterDraft.printMode)
          : 'tcp_9100';
        onChange();
      });

      document.querySelector('#psEditorPrintMode')?.addEventListener('change', function() {
        state.editorPrinterDraft.printMode = normalizePrintMode(
          (document.querySelector('#psEditorPrintMode') as HTMLSelectElement | null)?.value,
          state.editorPrinterDraft.connectionType
        );
        state.editorPrinterDraft.transport = global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
          ? global.LilposPrinterProfiles.effectiveTransport(state.editorPrinterDraft.connectionType, state.editorPrinterDraft.printMode)
          : 'tcp_9100';
        onChange();
      });

      document.querySelector('#psEditorProfile')?.addEventListener('change', function() {
        applyProfileSelection(String((document.querySelector('#psEditorProfile') as HTMLSelectElement | null)?.value || 'generic_escpos_thermal'));
        onChange();
      });

      document.querySelector('#psEditorCutAfterPrint')?.addEventListener('change', function() {
        state.editorLayoutDraft.cutAfterPrint = !!((document.querySelector('#psEditorCutAfterPrint') as HTMLInputElement | null)?.checked);
      });

      document.querySelector('#psEditorBlankLines')?.addEventListener('change', function() {
        state.editorLayoutDraft.blankLinesBeforeCut = clamp(
          (document.querySelector('#psEditorBlankLines') as HTMLInputElement | null)?.value,
          0,
          10,
          clamp(state.editorLayoutDraft.blankLinesBeforeCut, 0, 10, 4)
        );
      });
    }

    return {
      state: state,
      load: load,
      render: render,
      bind: bind,
      refreshAgentStatus: refreshAgentStatus,
      refreshPrinters: refreshScannedPrinters,
      getDraft: function() { return state.settings ? normalizeSettings(state.settings) : null; }
    };
  }

  global.LilposPrinterSettings = {
    createController: createController
  };
})(window);
