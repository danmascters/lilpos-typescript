(function(global: any) {
  'use strict';

  function buildLilposRuntimePackageFromLegacy(legacy: any, seed?: any, deps?: any): any {
    const safeSeed = seed || {};
    const safeDeps = deps || {};
    const nowIso = safeDeps.nowIso || (function() { return new Date().toISOString(); });
    const lineCount = typeof safeDeps.getLineCount === 'function' ? safeDeps.getLineCount() : 6;

    if (!legacy) return null;
    if (legacy.runtimeKind === 'lilpos-runtime-package-v1') return legacy;

    const favoriteItemIds = Array.isArray(safeSeed.favoriteItemIds)
      ? safeSeed.favoriteItemIds
      : Array.isArray(legacy && legacy.uiState && legacy.uiState.favoriteItemIds)
      ? legacy.uiState.favoriteItemIds
      : [];

    const favoriteCategoryIds = Array.isArray(safeSeed.favoriteCategoryIds)
      ? safeSeed.favoriteCategoryIds
      : Array.isArray(legacy && legacy.uiState && legacy.uiState.favoriteCategoryIds)
      ? legacy.uiState.favoriteCategoryIds
      : [];

    return {
      runtimeKind: 'lilpos-runtime-package-v1',
      packageVersion: legacy.registerPackageVersion || Date.now(),
      generatedAt: legacy.generatedAt || nowIso(),
      scale: legacy.scale || 'large',
      counts: {
        categories: legacy.categories ? legacy.categories.length : 0,
        items: legacy.items ? legacy.items.length : 0,
        modifierGroups: legacy.modifierGroups ? legacy.modifierGroups.length : 0,
        modifierOptions: legacy.modifierOptions ? legacy.modifierOptions.length : 0,
        itemModifierGroups: legacy.itemModifierGroups ? legacy.itemModifierGroups.length : 0
      },
      categories: (legacy.categories || []).map(function(c) {
        return Object.assign({}, c, { hidden: !!c.hidden });
      }),
      itemTiles: (legacy.items || []).map(function(i) {
        return Object.assign({}, i);
      }),
      modifierFlows: {
        groups: legacy.modifierGroups || [],
        options: legacy.modifierOptions || [],
        itemGroups: legacy.itemModifierGroups || []
      },
      pricingRules: {
        taxRules: legacy.taxRules || [],
        sizes: legacy.sizes || []
      },
      printerRoutes: legacy.printerRoutes || [],
      favorites: {
        itemIds: Array.from(new Set(favoriteItemIds)),
        categoryIds: Array.from(new Set(favoriteCategoryIds))
      },
      customers: Array.isArray(safeSeed.customers) ? safeSeed.customers : [],
      settings: {
        register: legacy.registerSettings || {
          mode: 'PRINT_ONLY',
          keepReprintMinutes: 60,
          currency: 'USD',
          orderTypes: ['Pickup', 'Delivery', 'Dine In'],
          defaultOrderType: 'Pickup'
        },
        printerSettings: {
          kitchen: 'Kitchen Printer',
          receipt: 'Front Receipt'
        },
        callerId: {
          enabled: true,
          lines: lineCount
        }
      },
      retentionPolicy: {
        durable: ['menu runtime package', 'customers', 'customer addresses', 'customer notes', 'settings', 'printer settings', 'caller id settings', 'favorites'],
        sameDay: ['current tickets', 'same-day activity', 'print/reprint buffer', 'caller events', 'incoming orders', 'driver activity', 'reports']
      }
    };
  }

  function createLilposDataService(deps?: any): any {
    var safeDeps = deps || {};
    var normalizePhone = safeDeps.normalizePhone || function(v) { return String(v || '').replace(/\D/g, ''); };
    var isItemOutOfStock = safeDeps.isItemOutOfStock || function() { return false; };
    var getFallbackCustomers = safeDeps.getFallbackCustomers || function() { return []; };
    var nowIso = safeDeps.nowIso || function() { return new Date().toISOString(); };
    var dbName = safeDeps.dbName || 'BringdatSmartRegisterMockNoNpm';
    var dbVersion = Number.isFinite(Number(safeDeps.dbVersion)) ? Number(safeDeps.dbVersion) : 7;
    var legacyOrdersKey = safeDeps.legacyOrdersKey || 'lilpos_persisted_orders';
    var getStationNumber = safeDeps.getStationNumber || function() { return 1; };
    var getMerchantId = safeDeps.getMerchantId || function() { return 'local-merchant'; };
    var getLocationId = safeDeps.getLocationId || function() { return 'local-location'; };
    var getPlanPersistenceMode = safeDeps.getPlanPersistenceMode || function() { return 'same-day'; };

    var STORE_KV = 'kv';
    var STORE_META = 'runtime_meta';
    var STORE_ORDER_HISTORY = 'order_history';
    var STORE_ORDER_HISTORY_ITEMS = 'order_history_items';
    var STORE_ORDER_EVENTS = 'order_events';
    var STORE_PAYMENT_HISTORY = 'payment_history';
    var STORE_SPLIT_PAYMENT_PLAN = 'split_payment_plan';
    var STORE_SPLIT_PAYMENT_PORTION = 'split_payment_portion';
    var STORE_DELIVERY_SETTINGS = 'delivery_settings';
    var STORE_DELIVERY_DRIVERS = 'delivery_drivers';
    var STORE_DRIVER_SHIFTS = 'driver_shifts';
    var STORE_DRIVER_SETTLEMENTS = 'driver_settlements';
    var STORE_DELIVERY_EVENTS = 'delivery_events';
    var STORE_PRINTER_SETTINGS = 'printer_settings';
    var STORE_PRINT_JOB_REFS = 'print_job_refs';
    var STORE_POS_PRINTER_CONFIGS = 'pos_printer_configs';
    var STORE_PRINTER_ROUTING_RULES = 'printer_routing_rules';
    var STORE_LOCAL_PRINT_BATCHES = 'local_print_batches';
    var STORE_WORKSTATION_PRINTER_ASSIGNMENTS = 'workstation_printer_assignments';

    var LEGACY_IMPORT_META_KEY = 'legacy_order_import_v1';
    var ORDERS_MANAGEMENT_VIEW_PREFS_KEY = 'orders_management_view_preferences_v1';
    var PRINTER_SETTINGS_KEY = 'printer_settings_v1';
    var PRINTER_MIGRATION_META_KEY = 'printer_settings_migration_v2';
    var WORKSTATION_PRINTER_ASSIGNMENT_KEY = 'workstation-printers';

    var historyBootPromise: Promise<any> | null = null;

    function toIntCents(value: any): number {
      return Math.round(Number(value || 0) * 100);
    }

    function fromIntCents(value: any): number {
      return Number.isFinite(Number(value)) ? Number(value) / 100 : 0;
    }

    function normalizeOrderStatus(order: any) {
      var rawStatus = String(order && order.status || '').trim().toLowerCase();
      if (rawStatus === 'completed' || rawStatus === 'open' || rawStatus === 'canceled' || rawStatus === 'closed') {
        return rawStatus;
      }
      var paid = !!(order && order.paid) || String(order && order.paymentStatus || '').toLowerCase() === 'paid';
      return paid ? 'completed' : 'open';
    }

    function padOrderSequence(sequence: number): string {
      return String(Math.max(0, Number(sequence || 0))).padStart(5, '0');
    }

    function businessDateNow(): string {
      return String(nowIso()).split('T')[0];
    }

    function normalizeDisplayOrderNumber(orderNumber: any): string {
      var raw = String(orderNumber || '').trim();
      if (!raw) return '';
      if (/^\d+$/.test(raw)) return String(Number(raw));
      var stationPattern = raw.match(/^(\d+)-0*(\d+)$/);
      if (stationPattern) return stationPattern[1] + '-' + String(Number(stationPattern[2]));
      return raw;
    }

    function normalizeOrdersQueueViewMode(value: any): string {
      return String(value || '').toUpperCase() === 'ROWS' ? 'ROWS' : 'STANDARD';
    }

    var ORDERS_QUEUE_PREF_KEYS = ['open', 'completed', 'onlineOnly', 'futureOrders'];
    var ORDERS_ROW_COLUMN_IDS = ['order', 'customer', 'phone', 'type', 'receivedTime', 'dueTime', 'source', 'payment', 'status', 'total'];

    function normalizeOrdersRowColumnOrder(input: any): string[] {
      var seen: any = {};
      var order = Array.isArray(input)
        ? input.filter(function(columnId) {
            var id = String(columnId || '');
            if (ORDERS_ROW_COLUMN_IDS.indexOf(id) < 0 || seen[id]) return false;
            seen[id] = true;
            return true;
          }).map(function(columnId) { return String(columnId); })
        : [];
      ORDERS_ROW_COLUMN_IDS.forEach(function(columnId) {
        if (!seen[columnId]) order.push(columnId);
      });
      return order;
    }

    function normalizeOrdersRowColumnSort(input: any): any {
      var columnId = String(input && input.columnId || '');
      if (ORDERS_ROW_COLUMN_IDS.indexOf(columnId) < 0) return null;
      return {
        columnId: columnId,
        direction: String(input && input.direction || '').toLowerCase() === 'desc' ? 'desc' : 'asc'
      };
    }

    function normalizeOrdersQueueColumnLayout(input: any): any {
      return {
        order: normalizeOrdersRowColumnOrder(input && input.order),
        sort: normalizeOrdersRowColumnSort(input && input.sort)
      };
    }

    function normalizeOrdersQueueColumnLayouts(input: any): any {
      var source = input || {};
      return ORDERS_QUEUE_PREF_KEYS.reduce(function(acc: any, key: string) {
        acc[key] = normalizeOrdersQueueColumnLayout(source[key]);
        return acc;
      }, {});
    }

    function normalizeOrdersManagementViewPreferences(input: any): any {
      var source = input || {};
      return {
        open: normalizeOrdersQueueViewMode(source.open),
        completed: normalizeOrdersQueueViewMode(source.completed),
        onlineOnly: normalizeOrdersQueueViewMode(source.onlineOnly),
        futureOrders: normalizeOrdersQueueViewMode(source.futureOrders),
        columnLayouts: normalizeOrdersQueueColumnLayouts(source.columnLayouts)
      };
    }

    function clampNumber(value: any, min: number, max: number, fallback: number): number {
      var n = Number(value);
      if (!Number.isFinite(n)) n = fallback;
      return Math.max(min, Math.min(max, Math.round(n)));
    }

    function normalizePrinterConnectionType(value: any): string {
      var raw = String(value || '').trim().toLowerCase();
      if (raw === 'android_quickprinter' || raw === 'android') return 'android_quickprinter';
      if (raw === 'bluetooth_escpos' || raw === 'bluetooth') return 'bluetooth_escpos';
      if (raw === 'windows_printer' || raw === 'windows') return 'windows_printer';
      if (raw === 'usb_serial' || raw === 'usb') return 'usb_serial';
      return 'network_printer';
    }

    function normalizePrinterProfileId(value: any): string {
      var raw = String(value || '').trim().toLowerCase();
      if (!raw) return 'generic_escpos_thermal';
      if (raw === 'generic_escpos' || raw === 'epson_escpos' || raw === 'epson_thermal') return 'generic_escpos_thermal';
      if (raw === 'tm_u220' || raw === 'u220' || raw === 'epson_u220') return 'epson_tm_u220';
      if (raw === 'star_tsp100') return 'star_escpos';
      if (raw === 'bixolon') return 'bixolon_escpos';
      return raw;
    }

    function normalizePrinterPrintMode(mode: any, connectionType: any): string {
      var rawMode = String(mode || '').trim().toLowerCase();
      var normalizedConnectionType = normalizePrinterConnectionType(connectionType);
      if (normalizedConnectionType === 'network_printer') {
        return rawMode === 'epson_epos_xml' ? 'epson_epos_xml' : 'raw_escpos';
      }
      if (normalizedConnectionType === 'android_quickprinter') {
        return 'android_quickprinter_intent';
      }
      return 'raw_escpos';
    }

    function normalizePrinterTransport(connectionType: any, printMode: any): LilPrintTransport {
      var normalizedConnectionType = normalizePrinterConnectionType(connectionType);
      var normalizedMode = normalizePrinterPrintMode(printMode, normalizedConnectionType);
      if (normalizedConnectionType === 'network_printer' && normalizedMode === 'epson_epos_xml') return 'tcp_9100';
      return 'tcp_9100';
    }

    function normalizeCapabilityOverride(value: any): boolean | null {
      if (value === true) return true;
      if (value === false) return false;
      if (String(value || '').toLowerCase() === 'yes') return true;
      if (String(value || '').toLowerCase() === 'no') return false;
      return null;
    }

    function normalizePrinterSettingsRecord(input: any): any {
      var source = input || {};
      var rawPaperWidth = String(source.paperWidth || '80mm');
      var paperWidth = rawPaperWidth === '58mm' ? '58mm' : rawPaperWidth === '76mm' ? '76mm' : '80mm';
      var defaultCpl = paperWidth === '58mm' ? 32 : paperWidth === '76mm' ? 40 : 48;
      var merchantId = String(source.merchantId || getMerchantId() || 'local-merchant');
      var locationId = String(source.locationId || getLocationId() || 'local-location');
      var stationId = source.stationId == null ? String(getStationNumber() || 1) : String(source.stationId || '');
      var id = String(source.id || (PRINTER_SETTINGS_KEY + ':' + merchantId + ':' + locationId + ':' + stationId));
      var stamp = String(source.updatedAt || nowIso());
      var created = String(source.createdAt || stamp);
      var charsPerLine = clampNumber(source.charactersPerLine, 20, 64, defaultCpl);
      var printerPort = clampNumber(source.receiptPrinterPort, 1, 65535, 9100);

      return {
        id: id,
        merchantId: merchantId,
        locationId: locationId,
        stationId: stationId,
        agentHttpsUrl: String(source.agentHttpsUrl || 'https://localhost:3031'),
        agentHttpUrl: String(source.agentHttpUrl || 'http://localhost:3030'),
        preferHttps: source.preferHttps !== false,
        receiptPrintingEnabled: source.receiptPrintingEnabled !== false,
        promptForReceiptAfterSale: source.promptForReceiptAfterSale !== false,
        autoPrintReceiptAfterSale: source.autoPrintReceiptAfterSale === true,
        defaultReceiptPrinterId: source.defaultReceiptPrinterId ? String(source.defaultReceiptPrinterId) : '',
        defaultKitchenPrinterId: source.defaultKitchenPrinterId ? String(source.defaultKitchenPrinterId) : '',
        cashDrawerPrinterId: source.cashDrawerPrinterId ? String(source.cashDrawerPrinterId) : '',
        receiptPrinterId: source.receiptPrinterId ? String(source.receiptPrinterId) : '',
        receiptPrinterName: source.receiptPrinterName ? String(source.receiptPrinterName) : '',
        receiptPrinterIp: source.receiptPrinterIp ? String(source.receiptPrinterIp) : '',
        receiptPrinterPort: printerPort,
        receiptPrinterProfile: source.receiptPrinterProfile ? normalizePrinterProfileId(source.receiptPrinterProfile) : '',
        receiptPrinterTransport: 'tcp_9100',
        paperWidth: paperWidth,
        charactersPerLine: charsPerLine,
        leftMarginChars: clampNumber(source.leftMarginChars, 0, 8, 0),
        rightMarginChars: clampNumber(source.rightMarginChars, 0, 8, 0),
        fontFamilyMode: String(source.fontFamilyMode || 'font_a') === 'font_b' ? 'font_b' : 'font_a',
        defaultTextScale: String(source.defaultTextScale || 'normal'),
        headerTextScale: String(source.headerTextScale || 'double_width'),
        emphasizeTotals: source.emphasizeTotals !== false,
        emphasizeOrderNumber: source.emphasizeOrderNumber !== false,
        condenseItemDescriptions: source.condenseItemDescriptions === true,
        printLogo: source.printLogo === true,
        printMerchantName: source.printMerchantName !== false,
        printMerchantAddress: source.printMerchantAddress !== false,
        printMerchantPhone: source.printMerchantPhone !== false,
        printOrderNumber: source.printOrderNumber !== false,
        printOrderType: source.printOrderType !== false,
        printCustomerName: source.printCustomerName !== false,
        printCustomerPhone: source.printCustomerPhone !== false,
        printCustomerAddressForDelivery: source.printCustomerAddressForDelivery !== false,
        printItemDescriptions: source.printItemDescriptions !== false,
        printItemQuantities: source.printItemQuantities !== false,
        printItemPrices: source.printItemPrices !== false,
        printModifiers: source.printModifiers !== false,
        printModifierPrices: source.printModifierPrices !== false,
        printItemNotes: source.printItemNotes !== false,
        printOrderNotes: source.printOrderNotes !== false,
        printSubtotal: source.printSubtotal !== false,
        printTax: source.printTax !== false,
        printDiscounts: source.printDiscounts !== false,
        printTips: source.printTips !== false,
        printTotal: source.printTotal !== false,
        printPayments: source.printPayments !== false,
        printAmountTendered: source.printAmountTendered !== false,
        printChangeDue: source.printChangeDue !== false,
        printEmployeeName: source.printEmployeeName !== false,
        printStationName: source.printStationName !== false,
        printDateTime: source.printDateTime !== false,
        footerMessage: String(source.footerMessage || 'Thank you!'),
        printDuplicateLabelOnReprint: source.printDuplicateLabelOnReprint !== false,
        feedLinesBeforeCut: clampNumber(source.feedLinesBeforeCut, 0, 10, 4),
        cutPaperAfterReceipt: source.cutPaperAfterReceipt !== false,
        openCashDrawerWithCashSale: source.openCashDrawerWithCashSale === true,
        kitchenPaperWidth: String(source.kitchenPaperWidth || source.paperWidth || '80mm') === '58mm'
          ? '58mm'
          : String(source.kitchenPaperWidth || source.paperWidth || '80mm') === '76mm'
          ? '76mm'
          : '80mm',
        kitchenCharactersPerLine: clampNumber(source.kitchenCharactersPerLine, 20, 64, defaultCpl),
        kitchenOrderNumberScale: String(source.kitchenOrderNumberScale || 'double_size'),
        kitchenItemTextScale: String(source.kitchenItemTextScale || 'normal'),
        kitchenModifierTextScale: String(source.kitchenModifierTextScale || 'normal'),
        kitchenShowPromisedTime: source.kitchenShowPromisedTime !== false,
        kitchenShowEmployeeName: source.kitchenShowEmployeeName !== false,
        kitchenShowStationName: source.kitchenShowStationName !== false,
        kitchenShowOrderNotes: source.kitchenShowOrderNotes !== false,
        kitchenShowItemNotes: source.kitchenShowItemNotes !== false,
        copies: clampNumber(source.copies, 1, 20, 1),
        priority: ['low', 'normal', 'high'].indexOf(String(source.priority || 'normal')) >= 0 ? String(source.priority || 'normal') : 'normal',
        retryEnabled: source.retryEnabled !== false,
        maxAttempts: clampNumber(source.maxAttempts, 1, 20, 5),
        migratedToMultiPrinterV2At: source.migratedToMultiPrinterV2At ? String(source.migratedToMultiPrinterV2At) : '',
        createdAt: created,
        updatedAt: stamp,
        syncStatus: source.syncStatus ? String(source.syncStatus) : (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')
      };
    }

    function workstationPrinterAssignmentId(input: any): string {
      var source = input || {};
      var merchantId = String(source.merchantId || getMerchantId() || 'local-merchant');
      var locationId = String(source.locationId || getLocationId() || 'local-location');
      var stationId = String(source.stationId == null ? (getStationNumber() || 1) : source.stationId || '');
      return [WORKSTATION_PRINTER_ASSIGNMENT_KEY, merchantId, locationId, stationId].join(':');
    }

    function normalizeWorkstationPrinterAssignmentRecord(input: any): any {
      var source = input || {};
      var merchantId = String(source.merchantId || getMerchantId() || 'local-merchant');
      var locationId = String(source.locationId || getLocationId() || 'local-location');
      var stationId = String(source.stationId == null ? (getStationNumber() || 1) : source.stationId || '');
      var stamp = String(source.updatedAt || nowIso());
      var created = String(source.createdAt || stamp);

      return {
        id: String(source.id || workstationPrinterAssignmentId({
          merchantId: merchantId,
          locationId: locationId,
          stationId: stationId
        })),
        merchantId: merchantId,
        locationId: locationId,
        stationId: stationId,
        stationPrinterId: source.stationPrinterId ? String(source.stationPrinterId) : '',
        cashDrawerPrinterId: source.cashDrawerPrinterId ? String(source.cashDrawerPrinterId) : '',
        printVoidSlips: source.printVoidSlips !== false,
        printEdits: source.printEdits !== false,
        printResends: source.printResends !== false,
        createdAt: created,
        updatedAt: stamp,
        syncStatus: source.syncStatus ? String(source.syncStatus) : (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')
      };
    }

    function slugToken(value: any): string {
      return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 28);
    }

    function randomToken(length?: number): string {
      var target = Math.max(4, Math.min(12, Number(length || 6)));
      var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var out = '';
      for (var i = 0; i < target; i += 1) {
        out += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      return out;
    }

    function normalizeStablePrinterId(value: any, nameFallback?: any): string {
      var raw = String(value || '').trim();
      if (/^[A-Za-z0-9_-]+$/.test(raw)) return raw;
      var fromName = slugToken(nameFallback || 'printer');
      return 'printer_' + (fromName || 'device') + '_' + randomToken(4);
    }

    function normalizePosPrinterConfigRecord(input: any): any {
      var source = input || {};
      var stamp = String(source.updatedAt || nowIso());
      var created = String(source.createdAt || stamp);
      var id = normalizeStablePrinterId(source.id, source.name || source.description || source.primaryRole || 'printer');
      var connectionType = normalizePrinterConnectionType(source.connectionType || source.transport);
      var printMode = normalizePrinterPrintMode(source.printMode, connectionType);
      var normalizedPaperWidth = String(source.paperWidth || '80mm') === '58mm'
        ? '58mm'
        : String(source.paperWidth || '80mm') === '76mm'
        ? '76mm'
        : '80mm';
      var defaultCpl = normalizedPaperWidth === '58mm' ? 32 : normalizedPaperWidth === '76mm' ? 40 : 48;
      var primaryRole = String(source.primaryRole || 'receipt').toLowerCase();
      var allowedRoles = ['receipt', 'kitchen', 'pizza', 'expo', 'bar', 'delivery', 'label', 'cash_drawer', 'custom'];
      if (allowedRoles.indexOf(primaryRole) < 0) primaryRole = 'custom';

      return {
        id: id,
        merchantId: String(source.merchantId || getMerchantId() || 'local-merchant'),
        locationId: String(source.locationId || getLocationId() || 'local-location'),
        name: String(source.name || 'Printer').trim() || 'Printer',
        description: String(source.description || ''),
        enabled: source.enabled !== false,
        primaryRole: primaryRole,
        customRoleName: String(source.customRoleName || ''),
        secondaryRoles: Array.isArray(source.secondaryRoles)
          ? source.secondaryRoles.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        ip: String(source.ip || source.receiptPrinterIp || '').trim(),
        port: clampNumber(source.port != null ? source.port : source.receiptPrinterPort, 1, 65535, 9100),
        connectionType: connectionType,
        printMode: printMode,
        transport: normalizePrinterTransport(connectionType, printMode),
        profile: normalizePrinterProfileId(source.profile || source.receiptPrinterProfile || 'generic_escpos_thermal'),
        paperWidth: normalizedPaperWidth,
        charactersPerLine: clampNumber(source.charactersPerLine, 20, 64, defaultCpl),
        defaultCopies: clampNumber(source.defaultCopies != null ? source.defaultCopies : source.copies, 1, 20, 1),
        retryEnabled: source.retryEnabled !== false,
        maxAttempts: clampNumber(source.maxAttempts, 1, 20, 5),
        cutPaper: source.cutPaper !== false,
        cashDrawerConnected: source.cashDrawerConnected === true,
        cutterInstalledOverride: normalizeCapabilityOverride(source.cutterInstalledOverride),
        cashDrawerConnectedOverride: normalizeCapabilityOverride(source.cashDrawerConnectedOverride),
        rasterImageSupportOverride: normalizeCapabilityOverride(source.rasterImageSupportOverride),
        routeLabels: Array.isArray(source.routeLabels)
          ? source.routeLabels.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        disabledAt: source.enabled === false
          ? String(source.disabledAt || stamp)
          : '',
        createdAt: created,
        updatedAt: stamp,
        syncStatus: source.syncStatus ? String(source.syncStatus) : (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')
      };
    }

    function normalizePrinterRoutingRuleRecord(input: any): any {
      var source = input || {};
      var stamp = String(source.updatedAt || nowIso());
      var created = String(source.createdAt || stamp);
      var ticketType = String(source.ticketType || 'customer_receipt').toLowerCase();
      var trigger = String(source.trigger || 'manual_print').toLowerCase();
      var itemMatchMode = String(source.itemMatchMode || 'all').toLowerCase();
      var ticketContentMode = String(source.ticketContentMode || 'full').toLowerCase();
      return {
        id: String(source.id || ('rule_' + randomToken(8))),
        merchantId: String(source.merchantId || getMerchantId() || 'local-merchant'),
        locationId: String(source.locationId || getLocationId() || 'local-location'),
        name: String(source.name || 'Routing Rule').trim() || 'Routing Rule',
        enabled: source.enabled !== false,
        sortOrder: Math.max(0, Number(source.sortOrder || 0)),
        destinationPrinterId: String(source.destinationPrinterId || ''),
        ticketType: ticketType,
        trigger: trigger,
        orderTypes: Array.isArray(source.orderTypes)
          ? source.orderTypes.map(function(value: any) { return String(value || '').trim().toLowerCase(); }).filter(Boolean)
          : ['all'],
        orderSources: Array.isArray(source.orderSources)
          ? source.orderSources.map(function(value: any) { return String(value || '').trim().toLowerCase(); }).filter(Boolean)
          : ['all'],
        itemMatchMode: itemMatchMode,
        printerRouteIds: Array.isArray(source.printerRouteIds)
          ? source.printerRouteIds.map(function(value: any) { return String(value || '').trim().toLowerCase(); }).filter(Boolean)
          : [],
        categoryIds: Array.isArray(source.categoryIds)
          ? source.categoryIds.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        itemIds: Array.isArray(source.itemIds)
          ? source.itemIds.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        excludedCategoryIds: Array.isArray(source.excludedCategoryIds)
          ? source.excludedCategoryIds.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        excludedItemIds: Array.isArray(source.excludedItemIds)
          ? source.excludedItemIds.map(function(value: any) { return String(value || '').trim(); }).filter(Boolean)
          : [],
        ticketContentMode: ticketContentMode,
        includeCustomerName: source.includeCustomerName !== false,
        includeCustomerPhone: source.includeCustomerPhone === true,
        includeDeliveryAddress: source.includeDeliveryAddress === true,
        includeCustomerNotes: source.includeCustomerNotes === true,
        copies: clampNumber(source.copies, 1, 20, 1),
        priority: ['low', 'normal', 'high'].indexOf(String(source.priority || 'normal')) >= 0 ? String(source.priority || 'normal') : 'normal',
        isFallbackRule: source.isFallbackRule === true,
        stopAfterMatch: source.stopAfterMatch === true,
        formattingOverrideId: String(source.formattingOverrideId || ''),
        createdAt: created,
        updatedAt: stamp,
        syncStatus: source.syncStatus ? String(source.syncStatus) : (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')
      };
    }

    function normalizeLocalPrintBatchRecord(input: any): any {
      var source = input || {};
      var stamp = String(source.updatedAt || nowIso());
      return {
        id: String(source.id || ('batch_' + Date.now() + '_' + randomToken(6))),
        orderId: String(source.orderId || ''),
        trigger: String(source.trigger || 'manual_print'),
        requestedAt: String(source.requestedAt || stamp),
        requiredJobCount: Math.max(0, Number(source.requiredJobCount || 0)),
        optionalJobCount: Math.max(0, Number(source.optionalJobCount || 0)),
        overallStatus: String(source.overallStatus || 'BUILDING'),
        createdAt: String(source.createdAt || stamp),
        updatedAt: stamp,
        syncStatus: source.syncStatus ? String(source.syncStatus) : (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')
      };
    }

    function safeParseLegacyOrders(): any[] {
      try {
        var raw = global.localStorage && global.localStorage.getItem(legacyOrdersKey);
        if (!raw) return [];
        var parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error('Failed to parse legacy persisted orders for migration:', err);
        return [];
      }
    }

    function parseDailySequence(orderNumber: any, stationNumber: any): number | null {
      var expectedPrefix = String(stationNumber) + '-';
      var raw = String(orderNumber || '');
      if (!raw.startsWith(expectedPrefix)) return null;
      var suffix = raw.slice(expectedPrefix.length);
      var parsed = Number(suffix);
      return Number.isFinite(parsed) ? parsed : null;
    }

    function deterministicKey(parts: any[]): string {
      return parts.map(function(part) { return String(part == null ? '' : part); }).join('|').toLowerCase();
    }

    function ensureSplitPaymentStores(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_SPLIT_PAYMENT_PLAN)) {
        var planStore = db.createObjectStore(STORE_SPLIT_PAYMENT_PLAN, { keyPath: 'id' });
        planStore.createIndex('by_orderId', 'orderId', { unique: false });
        planStore.createIndex('by_status', 'status', { unique: false });
        planStore.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
      }

      if (!db.objectStoreNames.contains(STORE_SPLIT_PAYMENT_PORTION)) {
        var portionStore = db.createObjectStore(STORE_SPLIT_PAYMENT_PORTION, { keyPath: 'id' });
        portionStore.createIndex('by_planId', 'planId', { unique: false });
        portionStore.createIndex('by_orderId', 'orderId', { unique: false });
        portionStore.createIndex('by_status', 'status', { unique: false });
        portionStore.createIndex('by_paymentId', 'paymentId', { unique: false });
        portionStore.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
      }
    }

    function ensureDeliveryStores(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_DELIVERY_SETTINGS)) db.createObjectStore(STORE_DELIVERY_SETTINGS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_DELIVERY_DRIVERS)) {
        var drivers = db.createObjectStore(STORE_DELIVERY_DRIVERS, { keyPath: 'driverId' });
        drivers.createIndex('by_active', 'active', { unique: false }); drivers.createIndex('by_updatedAt', 'updatedAt', { unique: false }); drivers.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DRIVER_SHIFTS)) {
        var shifts = db.createObjectStore(STORE_DRIVER_SHIFTS, { keyPath: 'driverShiftId' });
        shifts.createIndex('by_driverId', 'driverId', { unique: false }); shifts.createIndex('by_status', 'status', { unique: false }); shifts.createIndex('by_businessDate', 'businessDate', { unique: false }); shifts.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DRIVER_SETTLEMENTS)) {
        var settlements = db.createObjectStore(STORE_DRIVER_SETTLEMENTS, { keyPath: 'settlementId' });
        settlements.createIndex('by_driverId', 'driverId', { unique: false }); settlements.createIndex('by_driverShiftId', 'driverShiftId', { unique: false }); settlements.createIndex('by_businessDate', 'businessDate', { unique: false }); settlements.createIndex('by_status', 'status', { unique: false }); settlements.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_DELIVERY_EVENTS)) {
        var events = db.createObjectStore(STORE_DELIVERY_EVENTS, { keyPath: 'deliveryEventId' });
        events.createIndex('by_orderId', 'orderId', { unique: false }); events.createIndex('by_driverId', 'driverId', { unique: false }); events.createIndex('by_eventType', 'eventType', { unique: false }); events.createIndex('by_createdAt', 'createdAt', { unique: false }); events.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
    }

    function ensurePrinterStores(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_PRINTER_SETTINGS)) {
        var printerSettings = db.createObjectStore(STORE_PRINTER_SETTINGS, { keyPath: 'id' });
        printerSettings.createIndex('by_merchantId', 'merchantId', { unique: false });
        printerSettings.createIndex('by_locationId', 'locationId', { unique: false });
        printerSettings.createIndex('by_stationId', 'stationId', { unique: false });
        printerSettings.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        printerSettings.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PRINT_JOB_REFS)) {
        var printJobs = db.createObjectStore(STORE_PRINT_JOB_REFS, { keyPath: 'id' });
        printJobs.createIndex('by_orderId', 'orderId', { unique: false });
        printJobs.createIndex('by_printJobId', 'printJobId', { unique: false });
        printJobs.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
        printJobs.createIndex('by_lastKnownStatus', 'lastKnownStatus', { unique: false });
        printJobs.createIndex('by_requestedAt', 'requestedAt', { unique: false });
        printJobs.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
    }

    function ensureMultiPrinterStores(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_POS_PRINTER_CONFIGS)) {
        var printers = db.createObjectStore(STORE_POS_PRINTER_CONFIGS, { keyPath: 'id' });
        printers.createIndex('by_merchantId', 'merchantId', { unique: false });
        printers.createIndex('by_locationId', 'locationId', { unique: false });
        printers.createIndex('by_enabled', 'enabled', { unique: false });
        printers.createIndex('by_primaryRole', 'primaryRole', { unique: false });
        printers.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        printers.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PRINTER_ROUTING_RULES)) {
        var rules = db.createObjectStore(STORE_PRINTER_ROUTING_RULES, { keyPath: 'id' });
        rules.createIndex('by_merchantId', 'merchantId', { unique: false });
        rules.createIndex('by_locationId', 'locationId', { unique: false });
        rules.createIndex('by_enabled', 'enabled', { unique: false });
        rules.createIndex('by_sortOrder', 'sortOrder', { unique: false });
        rules.createIndex('by_ticketType', 'ticketType', { unique: false });
        rules.createIndex('by_trigger', 'trigger', { unique: false });
        rules.createIndex('by_destinationPrinterId', 'destinationPrinterId', { unique: false });
        rules.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LOCAL_PRINT_BATCHES)) {
        var batches = db.createObjectStore(STORE_LOCAL_PRINT_BATCHES, { keyPath: 'id' });
        batches.createIndex('by_orderId', 'orderId', { unique: false });
        batches.createIndex('by_trigger', 'trigger', { unique: false });
        batches.createIndex('by_requestedAt', 'requestedAt', { unique: false });
        batches.createIndex('by_overallStatus', 'overallStatus', { unique: false });
        batches.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
    }

    function ensureWorkstationPrinterAssignmentStore(db: IDBDatabase) {
      if (!db.objectStoreNames.contains(STORE_WORKSTATION_PRINTER_ASSIGNMENTS)) {
        var assignments = db.createObjectStore(STORE_WORKSTATION_PRINTER_ASSIGNMENTS, { keyPath: 'id' });
        assignments.createIndex('by_merchantId', 'merchantId', { unique: false });
        assignments.createIndex('by_locationId', 'locationId', { unique: false });
        assignments.createIndex('by_stationId', 'stationId', { unique: false });
        assignments.createIndex('by_stationPrinterId', 'stationPrinterId', { unique: false });
        assignments.createIndex('by_cashDrawerPrinterId', 'cashDrawerPrinterId', { unique: false });
        assignments.createIndex('by_updatedAt', 'updatedAt', { unique: false });
        assignments.createIndex('by_syncStatus', 'syncStatus', { unique: false });
      }
    }

    function seedMultiPrinterFromLegacySettings(tx: IDBTransaction) {
      if (!tx) return;
      try {
        var settingsStore = tx.objectStore(STORE_PRINTER_SETTINGS);
        var printerStore = tx.objectStore(STORE_POS_PRINTER_CONFIGS);
        var rulesStore = tx.objectStore(STORE_PRINTER_ROUTING_RULES);

        settingsStore.getAll().onsuccess = function(event: any) {
          var settingsRows = Array.isArray(event && event.target && event.target.result) ? event.target.result : [];
          settingsRows.forEach(function(settings: any) {
            if (!settings || !settings.receiptPrinterId) return;
            var printer = normalizePosPrinterConfigRecord({
              id: settings.receiptPrinterId,
              merchantId: settings.merchantId,
              locationId: settings.locationId,
              name: settings.receiptPrinterName || 'Front Receipt Printer',
              description: 'Migrated from single receipt printer settings',
              enabled: true,
              primaryRole: 'receipt',
              secondaryRoles: settings.openCashDrawerWithCashSale ? ['cash_drawer'] : [],
              ip: settings.receiptPrinterIp,
              port: settings.receiptPrinterPort,
              profile: settings.receiptPrinterProfile || 'generic_escpos_thermal',
              paperWidth: settings.paperWidth,
              charactersPerLine: settings.charactersPerLine,
              defaultCopies: settings.copies,
              retryEnabled: settings.retryEnabled,
              maxAttempts: settings.maxAttempts,
              cutPaper: settings.cutPaperAfterReceipt,
              cashDrawerConnected: settings.openCashDrawerWithCashSale,
              createdAt: settings.createdAt,
              updatedAt: settings.updatedAt,
              syncStatus: settings.syncStatus
            });
            printerStore.put(printer);

            var routingRule = normalizePrinterRoutingRuleRecord({
              id: 'rule_receipt_default_' + slugToken(printer.id || 'front'),
              merchantId: settings.merchantId,
              locationId: settings.locationId,
              name: 'Customer Receipt',
              enabled: true,
              sortOrder: 10,
              destinationPrinterId: printer.id,
              ticketType: 'customer_receipt',
              trigger: 'sale_completed',
              orderTypes: ['all'],
              orderSources: ['all'],
              itemMatchMode: 'all',
              ticketContentMode: 'full',
              includeCustomerName: true,
              includeCustomerPhone: false,
              includeDeliveryAddress: false,
              includeCustomerNotes: false,
              copies: settings.copies || 1,
              priority: settings.priority || 'normal',
              isFallbackRule: false,
              stopAfterMatch: false,
              createdAt: settings.createdAt,
              updatedAt: settings.updatedAt,
              syncStatus: settings.syncStatus
            });
            rulesStore.put(routingRule);

            var next = normalizePrinterSettingsRecord(settings || {});
            if (!next.defaultReceiptPrinterId && next.receiptPrinterId) next.defaultReceiptPrinterId = next.receiptPrinterId;
            next.migratedToMultiPrinterV2At = next.migratedToMultiPrinterV2At || nowIso();
            settingsStore.put(next);
          });
        };
      } catch (_err) {
        // Keep migration non-destructive.
      }
    }

    function migrateWorkstationPrinterAssignmentsFromSettings(tx: IDBTransaction) {
      if (!tx) return;
      try {
        var settingsStore = tx.objectStore(STORE_PRINTER_SETTINGS);
        var assignmentStore = tx.objectStore(STORE_WORKSTATION_PRINTER_ASSIGNMENTS);
        var printerStore = tx.objectStore(STORE_POS_PRINTER_CONFIGS);

        settingsStore.getAll().onsuccess = function(event: any) {
          var settingsRows = Array.isArray(event && event.target && event.target.result) ? event.target.result : [];
          settingsRows.forEach(function(settings: any) {
            var normalizedSettings = normalizePrinterSettingsRecord(settings || {});
            var assignmentId = workstationPrinterAssignmentId(normalizedSettings);

            assignmentStore.get(assignmentId).onsuccess = function(existingEvent: any) {
              var existing = existingEvent && existingEvent.target ? existingEvent.target.result : null;
              if (existing && existing.updatedAt && new Date(existing.updatedAt).getTime() >= new Date(normalizedSettings.updatedAt || 0).getTime()) {
                return;
              }

              var candidateStationPrinterId = String(
                normalizedSettings.defaultReceiptPrinterId
                || normalizedSettings.receiptPrinterId
                || ''
              ).trim();

              var candidateCashDrawerPrinterId = String(normalizedSettings.cashDrawerPrinterId || '').trim();
              if (!candidateCashDrawerPrinterId && normalizedSettings.openCashDrawerWithCashSale && candidateStationPrinterId) {
                candidateCashDrawerPrinterId = candidateStationPrinterId;
              }

              if (!candidateStationPrinterId && !candidateCashDrawerPrinterId) return;

              var next = normalizeWorkstationPrinterAssignmentRecord(Object.assign({}, existing || {}, {
                id: assignmentId,
                merchantId: normalizedSettings.merchantId,
                locationId: normalizedSettings.locationId,
                stationId: normalizedSettings.stationId,
                stationPrinterId: candidateStationPrinterId,
                cashDrawerPrinterId: candidateCashDrawerPrinterId,
                printVoidSlips: existing && existing.printVoidSlips !== undefined ? existing.printVoidSlips : true,
                printEdits: existing && existing.printEdits !== undefined ? existing.printEdits : true,
                printResends: existing && existing.printResends !== undefined ? existing.printResends : true,
                createdAt: existing && existing.createdAt ? existing.createdAt : (normalizedSettings.createdAt || nowIso()),
                updatedAt: nowIso(),
                syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
              }));

              var pushNext = function() {
                assignmentStore.put(next);
              };

              if (!next.stationPrinterId) {
                pushNext();
                return;
              }

              printerStore.get(next.stationPrinterId).onsuccess = function(printerEvent: any) {
                var printerRow = printerEvent && printerEvent.target ? printerEvent.target.result : null;
                if (!printerRow || printerRow.enabled !== false) {
                  pushNext();
                  return;
                }
                next.stationPrinterId = '';
                pushNext();
              };
            };
          });
        };
      } catch (_err) {
        // Keep migration non-destructive.
      }
    }

    function openRuntimeDb(): Promise<IDBDatabase> {
      return new Promise(function(resolve, reject) {
        var req = indexedDB.open(dbName, dbVersion);
        req.onupgradeneeded = function(event: any) {
          var db = req.result;
          var tx = req.transaction;
          var oldVersion = Number(event && event.oldVersion || 0);

          if (!db.objectStoreNames.contains(STORE_KV)) {
            db.createObjectStore(STORE_KV);
          }

          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'id' });
          }

          if (oldVersion < 2) {
            if (!db.objectStoreNames.contains(STORE_ORDER_HISTORY)) {
              var orderHistory = db.createObjectStore(STORE_ORDER_HISTORY, { keyPath: 'historyId' });
              orderHistory.createIndex('by_orderId', 'orderId', { unique: false });
              orderHistory.createIndex('by_businessDate', 'businessDate', { unique: false });
              orderHistory.createIndex('by_stationId', 'stationId', { unique: false });
              orderHistory.createIndex('by_orderStatus', 'orderStatus', { unique: false });
              orderHistory.createIndex('by_paymentStatus', 'paymentStatus', { unique: false });
              orderHistory.createIndex('by_completedAt', 'completedAt', { unique: false });
              orderHistory.createIndex('by_syncStatus', 'syncStatus', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_ORDER_HISTORY_ITEMS)) {
              var orderHistoryItems = db.createObjectStore(STORE_ORDER_HISTORY_ITEMS, { keyPath: 'historyItemId' });
              orderHistoryItems.createIndex('by_historyId', 'historyId', { unique: false });
              orderHistoryItems.createIndex('by_orderId', 'orderId', { unique: false });
              orderHistoryItems.createIndex('by_sortOrder', 'sortOrder', { unique: false });
            }

            if (!db.objectStoreNames.contains(STORE_ORDER_EVENTS)) {
              var orderEvents = db.createObjectStore(STORE_ORDER_EVENTS, { keyPath: 'eventId' });
              orderEvents.createIndex('by_orderId', 'orderId', { unique: false });
              orderEvents.createIndex('by_historyId', 'historyId', { unique: false });
              orderEvents.createIndex('by_eventTimestamp', 'eventTimestamp', { unique: false });
              orderEvents.createIndex('by_eventType', 'eventType', { unique: false });
              orderEvents.createIndex('by_employeeId', 'employeeId', { unique: false });
              orderEvents.createIndex('by_businessDate', 'businessDate', { unique: false });
              orderEvents.createIndex('by_syncStatus', 'syncStatus', { unique: false });
              orderEvents.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
            }

            if (!db.objectStoreNames.contains(STORE_PAYMENT_HISTORY)) {
              var paymentHistory = db.createObjectStore(STORE_PAYMENT_HISTORY, { keyPath: 'paymentHistoryId' });
              paymentHistory.createIndex('by_orderId', 'orderId', { unique: false });
              paymentHistory.createIndex('by_historyId', 'historyId', { unique: false });
              paymentHistory.createIndex('by_paymentType', 'paymentType', { unique: false });
              paymentHistory.createIndex('by_paidAt', 'paidAt', { unique: false });
              paymentHistory.createIndex('by_syncStatus', 'syncStatus', { unique: false });
              paymentHistory.createIndex('by_idempotencyKey', 'idempotencyKey', { unique: true });
            }

            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try {
                tx.objectStore(STORE_META).put({
                  id: 'schema_version',
                  value: 2,
                  migratedAt: nowIso()
                });
              } catch (_err) {
                // Keep migration non-destructive even if metadata write fails.
              }
            }
          }

          if (oldVersion < 3) {
            ensureSplitPaymentStores(db);
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try {
                tx.objectStore(STORE_META).put({
                  id: 'schema_version',
                  value: 3,
                  migratedAt: nowIso()
                });
              } catch (_err) {
                // Non-destructive migration metadata update
              }
            }
          }

          if (oldVersion < 4) {
            ensureDeliveryStores(db);
            if (tx && db.objectStoreNames.contains(STORE_ORDER_HISTORY)) {
              var deliveryOrderHistory = tx.objectStore(STORE_ORDER_HISTORY);
              if (!deliveryOrderHistory.indexNames.contains('by_deliveryStatus')) deliveryOrderHistory.createIndex('by_deliveryStatus', 'deliveryStatus', { unique: false });
              if (!deliveryOrderHistory.indexNames.contains('by_assignedDriverId')) deliveryOrderHistory.createIndex('by_assignedDriverId', 'assignedDriverId', { unique: false });
            }
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try { tx.objectStore(STORE_META).put({ id: 'schema_version', value: 4, migratedAt: nowIso() }); } catch (_err) {}
            }
          }

          if (oldVersion < 5) {
            ensurePrinterStores(db);
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try { tx.objectStore(STORE_META).put({ id: 'schema_version', value: 5, migratedAt: nowIso() }); } catch (_err) {}
            }
          }

          if (oldVersion < 6) {
            ensurePrinterStores(db);
            ensureMultiPrinterStores(db);
            seedMultiPrinterFromLegacySettings(tx);
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try { tx.objectStore(STORE_META).put({ id: 'schema_version', value: 6, migratedAt: nowIso() }); } catch (_err) {}
              try { tx.objectStore(STORE_META).put({ id: PRINTER_MIGRATION_META_KEY, migratedAt: nowIso(), status: 'done' }); } catch (_err2) {}
            }
          }

          if (oldVersion < 7) {
            ensurePrinterStores(db);
            ensureMultiPrinterStores(db);
            ensureWorkstationPrinterAssignmentStore(db);
            migrateWorkstationPrinterAssignmentsFromSettings(tx);
            if (tx && tx.objectStore && db.objectStoreNames.contains(STORE_META)) {
              try { tx.objectStore(STORE_META).put({ id: 'schema_version', value: 7, migratedAt: nowIso() }); } catch (_err) {}
              try { tx.objectStore(STORE_META).put({ id: WORKSTATION_PRINTER_ASSIGNMENT_KEY + '_migration_v1', migratedAt: nowIso(), status: 'done' }); } catch (_err2) {}
            }
          }
        };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    }

    function txDone(tx: IDBTransaction): Promise<void> {
      return new Promise(function(resolve, reject) {
        tx.oncomplete = function() { resolve(); };
        tx.onerror = function() { reject(tx.error); };
        tx.onabort = function() { reject(tx.error || new Error('IndexedDB transaction aborted')); };
      });
    }

    function requestResult(req: IDBRequest): Promise<any> {
      return new Promise(function(resolve, reject) {
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    }

    async function kvPut(key: string, value: any): Promise<boolean> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).put(value, key);
      await txDone(tx);
      return true;
    }

    async function kvGet(key: string): Promise<any> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readonly');
      var value = await requestResult(tx.objectStore(STORE_KV).get(key));
      await txDone(tx);
      return value;
    }

    async function kvClear(): Promise<boolean> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_KV, 'readwrite');
      tx.objectStore(STORE_KV).clear();
      await txDone(tx);
      return true;
    }

    async function metaGet(id: string): Promise<any> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_META, 'readonly');
      var value = await requestResult(tx.objectStore(STORE_META).get(id));
      await txDone(tx);
      return value || null;
    }

    async function metaPut(record: any): Promise<void> {
      var db = await openRuntimeDb();
      var tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put(record);
      await txDone(tx);
    }

    function sanitizeLegacyOrder(order: any): any {
      var safeOrder = order || {};
      var orderId = String(safeOrder.id || safeOrder.orderId || safeOrder.orderNumber || '').trim();
      if (!orderId) {
        throw new Error('Legacy order missing stable id/orderNumber');
      }
      var historyId = 'hist_legacy_' + orderId;
      var customer = safeOrder.customerSnapshot || safeOrder.customerInfo || safeOrder.customer || {};
      var displayName = String(
        customer && customer.name
        || safeOrder.customerName
        || safeOrder.customerLabel
        || safeOrder.orderLabel
        || safeOrder.orderIdentity
        || safeOrder.displayName
        || 'Guest'
      ).trim() || 'Guest';

      var paidAmountCents = Array.isArray(safeOrder.paymentLines)
        ? safeOrder.paymentLines.reduce(function(sum: number, line: any) {
            return sum + toIntCents((line && line.amount) || 0);
          }, 0)
        : (safeOrder.paid ? toIntCents(safeOrder.total || 0) : 0);

      var legacyTipCents = toIntCents(safeOrder.tipTotal || safeOrder.tip || 0);
      if (!legacyTipCents && Array.isArray(safeOrder.paymentLines)) {
        legacyTipCents = safeOrder.paymentLines.reduce(function(sum: number, line: any) {
          return sum + toIntCents((line && line.tipAmount) || 0);
        }, 0);
      }

      var totalCents = toIntCents(safeOrder.total || 0);
      var remainingBalanceCents = Math.max(0, totalCents - paidAmountCents);

      return {
        historyId: historyId,
        orderId: orderId,
        merchantId: String(safeOrder.merchantId || getMerchantId() || 'local-merchant'),
        stationId: String(safeOrder.stationNumber || getStationNumber() || 1),
        businessDate: String(safeOrder.businessDate || businessDateNow()),
        displayOrderNumber: normalizeDisplayOrderNumber(safeOrder.orderNumber || safeOrder.number || orderId),
        internalOrderSequence: parseDailySequence(safeOrder.orderNumber || safeOrder.number, safeOrder.stationNumber || getStationNumber()) || 0,
        orderType: String(safeOrder.orderType || 'pickup'),
        orderStatus: normalizeOrderStatus(safeOrder),
        paymentStatus: String(safeOrder.paymentStatus || (safeOrder.paid ? 'paid' : 'unpaid')),
        storedDisplayName: displayName,
        storedPhone: normalizePhone(customer && customer.phone),
        storedAddressSummary: String(customer && customer.address1 || ''),
        subtotalCents: toIntCents(safeOrder.subtotal || 0),
        taxCents: toIntCents(safeOrder.tax || 0),
        discountCents: toIntCents(safeOrder.discount || 0),
        feeCents: toIntCents(safeOrder.fee || 0),
        tipCents: legacyTipCents,
        totalCents: totalCents,
        amountPaidCents: paidAmountCents,
        remainingBalanceCents: remainingBalanceCents,
        openedAt: safeOrder.createdTimestamp || null,
        sentAt: safeOrder.sentAt || safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null,
        completedAt: safeOrder.paid ? (safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null) : null,
        closedAt: (normalizeOrderStatus(safeOrder) === 'completed' || normalizeOrderStatus(safeOrder) === 'closed') ? (safeOrder.updatedTimestamp || safeOrder.createdTimestamp || null) : null,
        createdAt: safeOrder.createdTimestamp || nowIso(),
        updatedAt: safeOrder.updatedTimestamp || nowIso(),
        version: Number(safeOrder.version || 1),
        syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
        syncAttempts: Number(safeOrder.syncAttempts || 0),
        lastSyncError: safeOrder.lastSyncError || null,
        lastSyncedAt: safeOrder.lastSyncedAt || null,
        sourceSnapshot: {
          orderSpecialInstructions: safeOrder.orderSpecialInstructions || '',
          timingType: safeOrder.timingType || 'asap',
          asapTime: safeOrder.asapTime || null,
          futureDateTime: safeOrder.futureDateTime || null,
          orderSource: safeOrder.orderSource || '',
          customer: customer,
          paymentMethodSummary: safeOrder.paymentMethodSummary || ''
        },
        migration: {
          source: 'legacy_localstorage_orderpersistence',
          migrationKey: 'legacy:' + orderId,
          migratedAt: nowIso()
        }
      };
    }

    function legacyOrderItems(historyId: string, order: any): any[] {
      var lines = Array.isArray(order && order.lines) ? order.lines : [];
      return lines.map(function(line: any, idx: number) {
        var qty = Number(line && line.qty || 1);
        var unitPrice = Number(line && line.price || 0);
        var lineSubtotal = unitPrice * qty;
        var modifierSummary = Array.isArray(line && line.mods)
          ? line.mods.map(function(mod: any) {
              return String(mod && (mod.optionName || mod.name || mod.optionId || mod.id || '')); 
            }).filter(Boolean).join(', ')
          : '';
        return {
          historyItemId: 'hist_item_legacy_' + String(order && order.id || order && order.orderNumber || 'unknown') + '_' + String(idx),
          historyId: historyId,
          orderId: String(order && order.id || order && order.orderNumber || ''),
          sourceItemId: String(line && line.itemId || line && line.lineId || ''),
          itemName: String(line && (line.name || line.itemName || line.title) || 'Item'),
          categoryName: String(line && line.categoryName || ''),
          sizeName: String(line && line.size || ''),
          quantity: qty,
          unitPriceCents: toIntCents(unitPrice),
          lineSubtotalCents: toIntCents(lineSubtotal),
          lineTotalCents: toIntCents(lineSubtotal),
          instructions: String(line && line.specialInstruction || ''),
          modifierSummary: modifierSummary,
          sortOrder: idx,
          createdAt: String(order && order.createdTimestamp || nowIso())
        };
      });
    }

    function legacyOrderEvents(historyId: string, order: any): any[] {
      var orderId = String(order && order.id || order && order.orderNumber || '');
      var sourceEvents = Array.isArray(order && order.auditEvents) ? order.auditEvents : [];
      var normalized = sourceEvents.map(function(event: any, idx: number) {
        var label = String(event && (event.event || event.type || event.label || event.status || 'ORDER_UPDATED')).trim();
        var upper = label.toUpperCase();
        var eventType = upper.startsWith('ORDER_') || upper.startsWith('PAYMENT_') ? upper : 'ORDER_' + upper.replace(/\s+/g, '_');
        var timestamp = String(event && (event.timestamp || event.at || event.createdAt) || order && order.updatedTimestamp || order && order.createdTimestamp || nowIso());
        var employeeShortName = String(event && (event.employeeShortName || event.employeeInitials || event.by || event.employeeId) || 'System');
        var idempotencyKey = deterministicKey(['legacy', orderId, eventType, timestamp, idx]);
        return {
          eventId: 'evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
          orderId: orderId,
          historyId: historyId,
          merchantId: String(order && order.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(order && order.stationNumber || getStationNumber() || 1),
          businessDate: String(order && order.businessDate || businessDateNow()),
          eventType: eventType,
          eventTimestamp: timestamp,
          employeeId: String(event && event.employeeId || ''),
          employeeShortName: employeeShortName || 'System',
          actorType: String(event && event.actorType || 'employee'),
          idempotencyKey: idempotencyKey,
          metadata: event && event.metadata || null,
          createdAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
          syncAttempts: 0,
          lastSyncError: null,
          lastSyncedAt: null,
          migration: {
            source: 'legacy_localstorage_orderpersistence',
            migrationKey: 'legacy:' + orderId + ':event:' + idx
          }
        };
      });

      if (normalized.length) return normalized;

      var fallbackTimestamp = String(order && order.createdTimestamp || nowIso());
      var idempotencyKey = deterministicKey(['legacy', orderId, 'ORDER_ENTERED', fallbackTimestamp, 0]);
      return [{
        eventId: 'evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
        orderId: orderId,
        historyId: historyId,
        merchantId: String(order && order.merchantId || getMerchantId() || 'local-merchant'),
        stationId: String(order && order.stationNumber || getStationNumber() || 1),
        businessDate: String(order && order.businessDate || businessDateNow()),
        eventType: 'ORDER_ENTERED',
        eventTimestamp: fallbackTimestamp,
        employeeId: '',
        employeeShortName: 'System',
        actorType: 'system',
        idempotencyKey: idempotencyKey,
        metadata: { importedWithoutLedger: true },
        createdAt: nowIso(),
        syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
        syncAttempts: 0,
        lastSyncError: null,
        lastSyncedAt: null,
        migration: {
          source: 'legacy_localstorage_orderpersistence',
          migrationKey: 'legacy:' + orderId + ':event:fallback'
        }
      }];
    }

    function legacyPayments(historyId: string, order: any): any[] {
      var orderId = String(order && order.id || order && order.orderNumber || '');
      var paymentLines = Array.isArray(order && order.paymentLines) ? order.paymentLines : [];
      if (!paymentLines.length) return [];

      return paymentLines.map(function(line: any, idx: number) {
        var paymentType = String(line && line.paymentType || line && line.type || 'Other');
        var baseAmountCents = toIntCents(line && line.amount || 0);
        var tipAmountCents = toIntCents(line && line.tipAmount || 0);
        var amountCents = baseAmountCents + tipAmountCents;
        var cardBrand = String(line && (line.cardBrand || line.brand || line.cardType) || '').trim();
        var lastFour = String(line && (line.lastFour || line.last4 || line.cardLastFour) || '').replace(/\D/g, '').slice(-4);
        var paymentId = String(line && line.paymentId || 'legacy_' + orderId + '_' + idx);
        var idempotencyKey = deterministicKey(['legacy', orderId, 'payment', paymentId, amountCents]);
        return {
          paymentHistoryId: 'pay_' + idempotencyKey.replace(/[^a-z0-9_\-]/g, '_'),
          orderId: orderId,
          historyId: historyId,
          paymentId: paymentId,
          paymentType: paymentType,
          tenderLabel: String(line && line.tenderLabel || paymentType),
          amountCents: amountCents,
          baseAmountCents: baseAmountCents,
          tipAmountCents: tipAmountCents,
          cardBrand: cardBrand,
          cardLastFour: lastFour,
          processorReferenceId: String(line && line.processorReferenceId || line && line.processorRef || ''),
          status: String(line && line.status || 'approved'),
          employeeId: String(line && line.employeeId || ''),
          employeeShortName: String(line && line.employeeShortName || line && line.employeeInitials || 'System'),
          paidAt: String(line && line.paidAt || order && order.updatedTimestamp || order && order.createdTimestamp || nowIso()),
          createdAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only',
          syncAttempts: 0,
          lastSyncError: null,
          lastSyncedAt: null,
          idempotencyKey: idempotencyKey,
          migration: {
            source: 'legacy_localstorage_orderpersistence',
            migrationKey: 'legacy:' + orderId + ':payment:' + idx
          }
        };
      });
    }

    async function importLegacyOrdersIntoHistory(): Promise<any> {
      var legacyOrders = safeParseLegacyOrders();
      var result = {
        totalLegacyOrders: legacyOrders.length,
        importedOrders: 0,
        importedItems: 0,
        importedEvents: 0,
        importedPayments: 0,
        failedOrders: [] as any[]
      };

      if (!legacyOrders.length) {
        await metaPut({ id: LEGACY_IMPORT_META_KEY, migratedAt: nowIso(), status: 'done', result: result });
        return result;
      }

      var db = await openRuntimeDb();
      var tx = db.transaction([STORE_ORDER_HISTORY, STORE_ORDER_HISTORY_ITEMS, STORE_ORDER_EVENTS, STORE_PAYMENT_HISTORY, STORE_META], 'readwrite');
      var historyStore = tx.objectStore(STORE_ORDER_HISTORY);
      var itemsStore = tx.objectStore(STORE_ORDER_HISTORY_ITEMS);
      var eventsStore = tx.objectStore(STORE_ORDER_EVENTS);
      var paymentsStore = tx.objectStore(STORE_PAYMENT_HISTORY);
      var metaStore = tx.objectStore(STORE_META);

      for (var i = 0; i < legacyOrders.length; i += 1) {
        var legacyOrder = legacyOrders[i];
        try {
          var snapshot = sanitizeLegacyOrder(legacyOrder);
          historyStore.put(snapshot);
          result.importedOrders += 1;

          var items = legacyOrderItems(snapshot.historyId, legacyOrder);
          for (var itemIdx = 0; itemIdx < items.length; itemIdx += 1) {
            itemsStore.put(items[itemIdx]);
            result.importedItems += 1;
          }

          var events = legacyOrderEvents(snapshot.historyId, legacyOrder);
          for (var eventIdx = 0; eventIdx < events.length; eventIdx += 1) {
            eventsStore.put(events[eventIdx]);
            result.importedEvents += 1;
          }

          var payments = legacyPayments(snapshot.historyId, legacyOrder);
          for (var paymentIdx = 0; paymentIdx < payments.length; paymentIdx += 1) {
            paymentsStore.put(payments[paymentIdx]);
            result.importedPayments += 1;
          }
        } catch (err: any) {
          result.failedOrders.push({
            index: i,
            orderId: String(legacyOrder && (legacyOrder.id || legacyOrder.orderNumber) || ''),
            message: err && err.message || String(err)
          });
          console.error('Legacy order migration skipped malformed record', legacyOrder, err);
        }
      }

      metaStore.put({
        id: LEGACY_IMPORT_META_KEY,
        migratedAt: nowIso(),
        status: result.failedOrders.length ? 'partial' : 'done',
        result: result
      });

      await txDone(tx);
      return result;
    }

    async function ensureHistoryPersistenceReady(forceLegacyImport?: boolean): Promise<any> {
      if (!historyBootPromise || forceLegacyImport) {
        historyBootPromise = (async function() {
          await openRuntimeDb();
          var marker = await metaGet(LEGACY_IMPORT_META_KEY);
          if (!marker || forceLegacyImport) {
            return importLegacyOrdersIntoHistory();
          }
          return marker.result || marker;
        })();
      }
      return historyBootPromise;
    }

    async function listStoreAll(storeName: string, indexName?: string, query?: any): Promise<any[]> {
      await ensureHistoryPersistenceReady();
      var db = await openRuntimeDb();
      var tx = db.transaction(storeName, 'readonly');
      var store = tx.objectStore(storeName);
      var req = indexName
        ? store.index(indexName).getAll(query)
        : store.getAll();
      var rows = await requestResult(req);
      await txDone(tx);
      return Array.isArray(rows) ? rows : [];
    }

    function eventLabelToType(label: any): string {
      var raw = String(label || '').trim();
      if (!raw) return 'ORDER_UPDATED';
      var upper = raw.toUpperCase().replace(/\s+/g, '_');
      if (upper.startsWith('ORDER_') || upper.startsWith('PAYMENT_') || upper === 'HISTORY_IMPORTED') return upper;
      if (upper === 'PAID') return 'ORDER_PAID';
      if (upper === 'PARTIALLY_PAID') return 'ORDER_PARTIALLY_PAID';
      return 'ORDER_' + upper;
    }

    function toReadableEventLabel(eventType: any): string {
      var t = String(eventType || '').toUpperCase();
      var map: any = {
        ORDER_ENTERED: 'Entered',
        ORDER_UPDATED: 'Updated',
        ORDER_SENT: 'Sent',
        PAYMENT_APPLIED: 'Payment Applied',
        ORDER_PARTIALLY_PAID: 'Partially Paid',
        ORDER_PAID: 'Paid',
        ORDER_COMPLETED: 'Completed',
        ORDER_CLOSED: 'Closed',
        ORDER_REOPENED: 'Reopened',
        ORDER_CANCELED: 'Canceled',
        ORDER_VOIDED: 'Voided',
        ORDER_REFUNDED: 'Refunded',
        ORDER_REPRINTED: 'Reprinted',
        HISTORY_IMPORTED: 'History Imported'
      };
      return map[t] || t.replace(/^ORDER_/, '').replace(/^PAYMENT_/, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
    }

    return {
      runtimePackage: null,
      indexes: {
        itemsById: new Map(),
        categoriesById: new Map(),
        itemsByCategoryId: new Map(),
        visibleCategoryIds: [],
        favoriteTiles: { categories: [], items: [], mixed: [] },
        searchIndex: [],
        outOfStockByItemId: new Set(),
        priceOverrideByItemId: new Map(),
        itemMods: new Map(),
        groupsById: {},
        optsByGroup: new Map(),
        indexMs: 0
      },

      defaultOrdersManagementViewPreferences: function() {
        return normalizeOrdersManagementViewPreferences(null);
      },

      loadOrdersManagementViewPreferences: async function() {
        var stored = await kvGet(ORDERS_MANAGEMENT_VIEW_PREFS_KEY);
        return normalizeOrdersManagementViewPreferences(stored);
      },

      saveOrdersManagementViewPreferences: async function(preferences: any) {
        var normalized = normalizeOrdersManagementViewPreferences(preferences);
        await kvPut(ORDERS_MANAGEMENT_VIEW_PREFS_KEY, normalized);
        return normalized;
      },

      defaultPrinterSettings: function(input?: any) {
        return normalizePrinterSettingsRecord(input || {});
      },

      loadPrinterSettings: async function(input?: any) {
        await ensureHistoryPersistenceReady();
        var defaults = normalizePrinterSettingsRecord(input || {});
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINTER_SETTINGS, 'readonly');
        var store = tx.objectStore(STORE_PRINTER_SETTINGS);
        var row = await requestResult(store.get(defaults.id));
        await txDone(tx);
        return normalizePrinterSettingsRecord(Object.assign({}, defaults, row || {}));
      },

      savePrinterSettings: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var current = await this.loadPrinterSettings(input || {});
        var merged = Object.assign({}, current, input || {}, {
          id: current.id,
          merchantId: current.merchantId,
          locationId: current.locationId,
          stationId: current.stationId,
          createdAt: current.createdAt || nowIso(),
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
        });
        var normalized = normalizePrinterSettingsRecord(merged);
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINTER_SETTINGS, 'readwrite');
        tx.objectStore(STORE_PRINTER_SETTINGS).put(normalized);
        await txDone(tx);
        return normalized;
      },

      getWorkstationPrinterAssignment: async function(input?: any) {
        await ensureHistoryPersistenceReady();
        var source = (typeof input === 'object' && input) ? input : { stationId: input };
        var normalized = normalizeWorkstationPrinterAssignmentRecord(source || {});
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_WORKSTATION_PRINTER_ASSIGNMENTS, 'readonly');
        var store = tx.objectStore(STORE_WORKSTATION_PRINTER_ASSIGNMENTS);
        var row = await requestResult(store.get(normalized.id));
        await txDone(tx);
        if (!row) return null;
        return normalizeWorkstationPrinterAssignmentRecord(row);
      },

      saveWorkstationPrinterAssignment: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var source = input || {};
        var current = await this.getWorkstationPrinterAssignment(source) || normalizeWorkstationPrinterAssignmentRecord(source || {});
        var merged = Object.assign({}, current, source || {}, {
          id: current.id,
          merchantId: current.merchantId,
          locationId: current.locationId,
          stationId: current.stationId,
          createdAt: current.createdAt || nowIso(),
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
        });
        var normalized = normalizeWorkstationPrinterAssignmentRecord(merged);
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_WORKSTATION_PRINTER_ASSIGNMENTS, 'readwrite');
        tx.objectStore(STORE_WORKSTATION_PRINTER_ASSIGNMENTS).put(normalized);
        await txDone(tx);
        return normalized;
      },

      validateAssignablePrinter: async function(input: any): Promise<any> {
        var source = input || {};
        var printerId = String(source.printerId || '').trim();
        if (!printerId) throw new Error('Printer id is required.');
        var printer = await this.getPosPrinterConfigById(printerId);
        if (!printer) throw new Error('Printer is unavailable or no longer configured.');
        if (printer.enabled === false) throw new Error('Disabled printers cannot be assigned.');
        if (!String(printer.ip || '').trim() || !(Number(printer.port || 0) > 0)) {
          throw new Error('Printer must have a valid connection configuration before assignment.');
        }
        var merchantId = String(source.merchantId || getMerchantId() || '');
        var locationId = String(source.locationId || getLocationId() || '');
        if (merchantId && String(printer.merchantId || '') !== merchantId) {
          throw new Error('Printer belongs to a different merchant scope.');
        }
        if (locationId && String(printer.locationId || '') !== locationId) {
          throw new Error('Printer belongs to a different location scope.');
        }
        return printer;
      },

      setStationPrinter: async function(stationOrInput: any, printerId?: string) {
        var source = (typeof stationOrInput === 'object' && stationOrInput)
          ? Object.assign({}, stationOrInput)
          : { stationId: stationOrInput, printerId: printerId };
        var scope = normalizeWorkstationPrinterAssignmentRecord(source || {});
        var targetPrinterId = String(source.printerId || '').trim();
        await this.validateAssignablePrinter({
          printerId: targetPrinterId,
          merchantId: scope.merchantId,
          locationId: scope.locationId
        });
        return this.saveWorkstationPrinterAssignment({
          merchantId: scope.merchantId,
          locationId: scope.locationId,
          stationId: scope.stationId,
          stationPrinterId: targetPrinterId
        });
      },

      clearStationPrinter: async function(stationOrInput: any) {
        var source = (typeof stationOrInput === 'object' && stationOrInput) ? stationOrInput : { stationId: stationOrInput };
        var scope = normalizeWorkstationPrinterAssignmentRecord(source || {});
        return this.saveWorkstationPrinterAssignment({
          merchantId: scope.merchantId,
          locationId: scope.locationId,
          stationId: scope.stationId,
          stationPrinterId: ''
        });
      },

      setCashDrawerPrinter: async function(stationOrInput: any, printerId?: string) {
        var source = (typeof stationOrInput === 'object' && stationOrInput)
          ? Object.assign({}, stationOrInput)
          : { stationId: stationOrInput, printerId: printerId };
        var scope = normalizeWorkstationPrinterAssignmentRecord(source || {});
        var targetPrinterId = String(source.printerId || '').trim();
        await this.validateAssignablePrinter({
          printerId: targetPrinterId,
          merchantId: scope.merchantId,
          locationId: scope.locationId
        });
        return this.saveWorkstationPrinterAssignment({
          merchantId: scope.merchantId,
          locationId: scope.locationId,
          stationId: scope.stationId,
          cashDrawerPrinterId: targetPrinterId
        });
      },

      clearCashDrawerPrinter: async function(stationOrInput: any) {
        var source = (typeof stationOrInput === 'object' && stationOrInput) ? stationOrInput : { stationId: stationOrInput };
        var scope = normalizeWorkstationPrinterAssignmentRecord(source || {});
        return this.saveWorkstationPrinterAssignment({
          merchantId: scope.merchantId,
          locationId: scope.locationId,
          stationId: scope.stationId,
          cashDrawerPrinterId: ''
        });
      },

      updateStationPrinterSlipOptions: async function(stationOrInput: any, options?: any) {
        var source = (typeof stationOrInput === 'object' && stationOrInput && !options)
          ? stationOrInput
          : Object.assign({ stationId: stationOrInput }, options || {});
        var scope = normalizeWorkstationPrinterAssignmentRecord(source || {});
        var patch = {
          merchantId: scope.merchantId,
          locationId: scope.locationId,
          stationId: scope.stationId
        } as any;
        if (source.printVoidSlips != null) patch.printVoidSlips = source.printVoidSlips !== false;
        if (source.printEdits != null) patch.printEdits = source.printEdits !== false;
        if (source.printResends != null) patch.printResends = source.printResends !== false;
        return this.saveWorkstationPrinterAssignment(patch);
      },

      resolveStationPrinter: async function(input?: any) {
        var assignment = await this.getWorkstationPrinterAssignment(input || {});
        var printerId = String(assignment && assignment.stationPrinterId || '').trim();
        if (!printerId) return null;
        var printer = await this.getPosPrinterConfigById(printerId);
        if (!printer || printer.enabled === false) return null;
        if (!String(printer.ip || '').trim() || !(Number(printer.port || 0) > 0)) return null;
        return printer;
      },

      resolveCashDrawerPrinter: async function(input?: any) {
        var assignment = await this.getWorkstationPrinterAssignment(input || {});
        var printerId = String(assignment && assignment.cashDrawerPrinterId || '').trim();
        if (!printerId) return null;
        var printer = await this.getPosPrinterConfigById(printerId);
        if (!printer || printer.enabled === false) return null;
        if (!String(printer.ip || '').trim() || !(Number(printer.port || 0) > 0)) return null;
        return printer;
      },

      shouldPrintStationSlip: function(assignment: any, slipType: any) {
        if (!assignment) return false;
        if (slipType === 'void_slip') return assignment.printVoidSlips !== false;
        if (slipType === 'edit_slip') return assignment.printEdits !== false;
        if (slipType === 'resend_slip') return assignment.printResends !== false;
        return false;
      },

      listPosPrinterConfigs: async function(options?: any) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_POS_PRINTER_CONFIGS);
        var merchantId = String(options && options.merchantId || getMerchantId() || '');
        var locationId = String(options && options.locationId || getLocationId() || '');
        rows = rows.filter(function(row: any) {
          if (merchantId && String(row.merchantId || '') !== merchantId) return false;
          if (locationId && String(row.locationId || '') !== locationId) return false;
          if (options && options.includeDisabled !== true && row.enabled === false) return false;
          return true;
        });
        rows.sort(function(a: any, b: any) {
          return String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });
        });
        return rows.map(function(row: any) { return normalizePosPrinterConfigRecord(row); });
      },

      getPosPrinterConfigById: async function(printerId: string) {
        await ensureHistoryPersistenceReady();
        var id = String(printerId || '').trim();
        if (!id) return null;
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_POS_PRINTER_CONFIGS, 'readonly');
        var row = await requestResult(tx.objectStore(STORE_POS_PRINTER_CONFIGS).get(id));
        await txDone(tx);
        return row ? normalizePosPrinterConfigRecord(row) : null;
      },

      upsertPosPrinterConfig: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var normalized = normalizePosPrinterConfigRecord(input || {});
        if (normalized.enabled !== false) {
          if (String(normalized.connectionType || '') !== 'network_printer') {
            throw new Error('Only Network Printer connection type is currently supported for active printers.');
          }
          if (String(normalized.printMode || '') !== 'raw_escpos') {
            throw new Error('Only Raw ESC/POS mode is currently supported for active printers.');
          }
        }
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_POS_PRINTER_CONFIGS, 'readwrite');
        var store = tx.objectStore(STORE_POS_PRINTER_CONFIGS);
        var current = await requestResult(store.get(normalized.id));
        var next = normalizePosPrinterConfigRecord(Object.assign({}, current || {}, normalized, {
          id: current && current.id ? current.id : normalized.id,
          createdAt: current && current.createdAt ? current.createdAt : normalized.createdAt,
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
        }));
        store.put(next);
        await txDone(tx);
        return next;
      },

      deactivatePosPrinterConfig: async function(printerId: string) {
        await ensureHistoryPersistenceReady();
        var id = String(printerId || '').trim();
        if (!id) throw new Error('Printer id is required.');
        var current = await this.getPosPrinterConfigById(id);
        if (!current) throw new Error('Printer not found.');
        return this.upsertPosPrinterConfig(Object.assign({}, current, {
          enabled: false,
          disabledAt: nowIso()
        }));
      },

      listPrinterRoutingRules: async function(options?: any) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_PRINTER_ROUTING_RULES);
        var merchantId = String(options && options.merchantId || getMerchantId() || '');
        var locationId = String(options && options.locationId || getLocationId() || '');
        rows = rows.filter(function(row: any) {
          if (merchantId && String(row.merchantId || '') !== merchantId) return false;
          if (locationId && String(row.locationId || '') !== locationId) return false;
          if (options && options.includeDisabled !== true && row.enabled === false) return false;
          return true;
        });
        rows.sort(function(a: any, b: any) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });
        return rows.map(function(row: any) { return normalizePrinterRoutingRuleRecord(row); });
      },

      savePrinterRoutingRule: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var normalized = normalizePrinterRoutingRuleRecord(input || {});
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINTER_ROUTING_RULES, 'readwrite');
        var store = tx.objectStore(STORE_PRINTER_ROUTING_RULES);
        var current = await requestResult(store.get(normalized.id));

        var sortOrder = Number(normalized.sortOrder || 0);
        if (!(sortOrder > 0)) {
          var allRows = await requestResult(store.getAll());
          var maxSort = Array.isArray(allRows)
            ? allRows.reduce(function(best: number, row: any) { return Math.max(best, Number(row && row.sortOrder || 0)); }, 0)
            : 0;
          sortOrder = maxSort + 10;
        }

        var next = normalizePrinterRoutingRuleRecord(Object.assign({}, current || {}, normalized, {
          id: current && current.id ? current.id : normalized.id,
          createdAt: current && current.createdAt ? current.createdAt : normalized.createdAt,
          updatedAt: nowIso(),
          sortOrder: sortOrder,
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
        }));
        store.put(next);
        await txDone(tx);
        return next;
      },

      deletePrinterRoutingRule: async function(ruleId: string) {
        await ensureHistoryPersistenceReady();
        var id = String(ruleId || '').trim();
        if (!id) return false;
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINTER_ROUTING_RULES, 'readwrite');
        tx.objectStore(STORE_PRINTER_ROUTING_RULES).delete(id);
        await txDone(tx);
        return true;
      },

      saveLocalPrintBatch: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var normalized = normalizeLocalPrintBatchRecord(input || {});
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_LOCAL_PRINT_BATCHES, 'readwrite');
        var store = tx.objectStore(STORE_LOCAL_PRINT_BATCHES);
        var current = await requestResult(store.get(normalized.id));
        var next = normalizeLocalPrintBatchRecord(Object.assign({}, current || {}, normalized, {
          id: current && current.id ? current.id : normalized.id,
          createdAt: current && current.createdAt ? current.createdAt : normalized.createdAt,
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'
        }));
        store.put(next);
        await txDone(tx);
        return next;
      },

      updateLocalPrintBatch: async function(batchId: string, patch: any) {
        await ensureHistoryPersistenceReady();
        var id = String(batchId || '').trim();
        if (!id) return null;
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_LOCAL_PRINT_BATCHES, 'readwrite');
        var store = tx.objectStore(STORE_LOCAL_PRINT_BATCHES);
        var current = await requestResult(store.get(id));
        if (!current) {
          await txDone(tx);
          return null;
        }
        var next = normalizeLocalPrintBatchRecord(Object.assign({}, current, patch || {}, {
          id: current.id,
          createdAt: current.createdAt,
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : current.syncStatus || 'local-only'
        }));
        store.put(next);
        await txDone(tx);
        return next;
      },

      listLocalPrintBatches: async function(options?: any) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_LOCAL_PRINT_BATCHES);
        if (options && options.orderId) {
          rows = rows.filter(function(row: any) { return String(row.orderId || '') === String(options.orderId); });
        }
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.requestedAt || 0).getTime() - new Date(a && a.requestedAt || 0).getTime();
        });
        return rows.map(function(row: any) { return normalizeLocalPrintBatchRecord(row); });
      },

      saveLocalPrintJobReference: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var stamp = nowIso();
        var id = String(input && input.id || ('print_ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)));
        var idempotencyKey = String(input && input.idempotencyKey || '').trim();
        if (!idempotencyKey) throw new Error('saveLocalPrintJobReference requires idempotencyKey');
        var row = {
          id: id,
          orderId: String(input && input.orderId || ''),
          batchId: String(input && input.batchId || ''),
          printJobId: String(input && input.printJobId || ''),
          idempotencyKey: idempotencyKey,
          jobType: String(input && input.jobType || 'customer_receipt'),
          printerRole: String(input && input.printerRole || 'receipt'),
          printerId: String(input && input.printerId || ''),
          requestedAt: String(input && input.requestedAt || stamp),
          lastKnownStatus: String(input && input.lastKnownStatus || 'QUEUED'),
          lastStatusAt: String(input && input.lastStatusAt || stamp),
          lastErrorCode: String(input && input.lastErrorCode || ''),
          lastErrorMessage: String(input && input.lastErrorMessage || ''),
          originalPrintJobId: String(input && input.originalPrintJobId || ''),
          isReprint: input && input.isReprint === true,
          syncStatus: String(input && input.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          createdAt: String(input && input.createdAt || stamp),
          updatedAt: String(input && input.updatedAt || stamp)
        };

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINT_JOB_REFS, 'readwrite');
        var store = tx.objectStore(STORE_PRINT_JOB_REFS);
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));
        if (existing) {
          var next = Object.assign({}, existing, row, {
            id: existing.id,
            createdAt: existing.createdAt || row.createdAt,
            updatedAt: nowIso()
          });
          store.put(next);
          await txDone(tx);
          return next;
        }
        store.put(row);
        await txDone(tx);
        return row;
      },

      updateLocalPrintJobReference: async function(id: string, patch: any) {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINT_JOB_REFS, 'readwrite');
        var store = tx.objectStore(STORE_PRINT_JOB_REFS);
        var current = await requestResult(store.get(id));
        if (!current) {
          await txDone(tx);
          return null;
        }
        var next = Object.assign({}, current, patch || {}, {
          id: current.id,
          updatedAt: nowIso(),
          syncStatus: getPlanPersistenceMode() === 'persistent' ? 'pending' : current.syncStatus || 'local-only'
        });
        store.put(next);
        await txDone(tx);
        return next;
      },

      findLocalPrintJobReferenceByIdempotencyKey: async function(idempotencyKey: string) {
        await ensureHistoryPersistenceReady();
        var key = String(idempotencyKey || '').trim();
        if (!key) return null;
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PRINT_JOB_REFS, 'readonly');
        var row = await requestResult(tx.objectStore(STORE_PRINT_JOB_REFS).index('by_idempotencyKey').get(key));
        await txDone(tx);
        return row || null;
      },

      listLocalPrintJobReferences: async function(options?: any) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_PRINT_JOB_REFS);
        if (options && options.orderId) {
          rows = rows.filter(function(row: any) { return String(row.orderId || '') === String(options.orderId); });
        }
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.requestedAt || 0).getTime() - new Date(a && a.requestedAt || 0).getTime();
        });
        return rows;
      },

      loadRuntimePackage: function(input: any, seed?: any) {
        var runtime = buildLilposRuntimePackageFromLegacy(input, seed || {}, safeDeps);
        runtime.customers = Array.isArray(runtime.customers) && runtime.customers.length ? runtime.customers : ((seed && seed.customers) || []);
        this.runtimePackage = runtime;
        this.rebuildIndexes();
        return runtime;
      },

      rebuildIndexes: function() {
        var t0 = performance.now();
        var pkg = this.runtimePackage;
        if (!pkg) return;

        var categoriesById: any = new Map((pkg.categories || []).map(function(c: any) { return [c.id, c]; }));
        var itemsById: any = new Map((pkg.itemTiles || []).map(function(i: any) { return [i.id, i]; }));
        var itemsByCategoryId: any = new Map();
        var visibleCategoryIds = [];
        var outOfStockByItemId = new Set();
        var priceOverrideByItemId = new Map();

        (pkg.categories || []).forEach(function(c) {
          if (!c.hidden) visibleCategoryIds.push(c.id);
        });

        (pkg.itemTiles || []).forEach(function(item) {
          if (!itemsByCategoryId.has(item.categoryId)) itemsByCategoryId.set(item.categoryId, []);
          itemsByCategoryId.get(item.categoryId).push(item);
          if (isItemOutOfStock(item)) outOfStockByItemId.add(item.id);
          if (Number.isFinite(item.priceOverride) && item.priceOverride !== item.basePrice) {
            priceOverrideByItemId.set(item.id, item.priceOverride);
          }
        });

        var itemMods: any = new Map();
        (pkg.modifierFlows && pkg.modifierFlows.itemGroups ? pkg.modifierFlows.itemGroups : []).forEach(function(r) {
          if (!itemMods.has(r.itemId)) itemMods.set(r.itemId, []);
          itemMods.get(r.itemId).push(r.groupId);
        });
        var groupsById: any = Object.fromEntries((pkg.modifierFlows && pkg.modifierFlows.groups ? pkg.modifierFlows.groups : []).map(function(x: any) { return [x.id, x]; }));
        var optsByGroup: any = new Map();
        (pkg.modifierFlows && pkg.modifierFlows.options ? pkg.modifierFlows.options : []).forEach(function(o) {
          if (!optsByGroup.has(o.groupId)) optsByGroup.set(o.groupId, []);
          optsByGroup.get(o.groupId).push(o);
        });

        var normalize = function(v) { return String(v || '').toLowerCase().replace(/\s+/g, ' ').trim(); };
        var searchIndex = (pkg.itemTiles || []).map(function(item) {
          var catName = (categoriesById.get(item.categoryId) || {}).name || '';
          var modText = (itemMods.get(item.id) || []).map(function(gid) { return (groupsById[gid] || {}).name || ''; }).join(' ');
          var text = normalize(item.name + ' ' + (item.description || '') + ' ' + catName + ' ' + modText);
          return { itemId: item.id, text: text };
        });

        var favoriteCategoryIds = (pkg.favorites && pkg.favorites.categoryIds) || [];
        var favoriteItemIds = (pkg.favorites && pkg.favorites.itemIds) || [];
        var favoriteCategories = favoriteCategoryIds.map(function(id) { return categoriesById.get(id); }).filter(function(c) { return c && !c.hidden; });
        var favoriteItems = favoriteItemIds.map(function(id) { return itemsById.get(id); }).filter(function(i) { return i && !((categoriesById.get(i.categoryId) || {}).hidden); });

        this.indexes = {
          itemsById: itemsById,
          categoriesById: categoriesById,
          itemsByCategoryId: itemsByCategoryId,
          visibleCategoryIds: visibleCategoryIds,
          favoriteTiles: {
            categories: favoriteCategories,
            items: favoriteItems,
            mixed: [].concat(
              favoriteCategories.map(function(c) { return { type: 'category', value: c }; }),
              favoriteItems.map(function(i) { return { type: 'item', value: i }; })
            )
          },
          searchIndex: searchIndex,
          outOfStockByItemId: outOfStockByItemId,
          priceOverrideByItemId: priceOverrideByItemId,
          itemMods: itemMods,
          groupsById: groupsById,
          optsByGroup: optsByGroup,
          indexMs: +(performance.now() - t0).toFixed(2)
        };

        this.runtimePackage.counts = {
          categories: pkg.categories ? pkg.categories.length : 0,
          items: pkg.itemTiles ? pkg.itemTiles.length : 0,
          modifierGroups: pkg.modifierFlows && pkg.modifierFlows.groups ? pkg.modifierFlows.groups.length : 0,
          modifierOptions: pkg.modifierFlows && pkg.modifierFlows.options ? pkg.modifierFlows.options.length : 0,
          itemModifierGroups: pkg.modifierFlows && pkg.modifierFlows.itemGroups ? pkg.modifierFlows.itemGroups.length : 0
        };
      },

      getVisibleCategories: function() {
        var self = this;
        return this.indexes.visibleCategoryIds.map(function(id) { return self.indexes.categoriesById.get(id); }).filter(Boolean);
      },

      getCategoryTiles: function() {
        return this.getVisibleCategories().map(function(c) { return { id: c.id, name: c.name }; });
      },

      getItemsForCategory: function(categoryId) {
        var self = this;
        return (this.indexes.itemsByCategoryId.get(categoryId) || []).filter(function(i) { return !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      getAllItems: function() {
        var self = this;
        return Array.from<any>(this.indexes.itemsById.values()).filter(function(i: any) { return !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      searchItems: function(query) {
        var self = this;
        var q = String(query || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!q) return [];
        var itemIds = this.indexes.searchIndex.filter(function(doc) { return doc.text.includes(q); }).map(function(doc) { return doc.itemId; });
        return itemIds.map(function(id) { return self.indexes.itemsById.get(id); }).filter(function(i) { return i && !((self.indexes.categoriesById.get(i.categoryId) || {}).hidden); });
      },

      getFavoriteTiles: function() {
        return this.indexes.favoriteTiles;
      },

      getItemById: function(itemId) {
        return this.indexes.itemsById.get(itemId) || null;
      },

      updateItem: function(itemId: any, changes: any) {
        var item = this.getItemById(itemId);
        if (!item) return null;
        Object.assign(item, changes);
        this.rebuildIndexes();
        return item;
      },

      updateCategory: function(categoryId: any, changes: any) {
        var category = this.indexes.categoriesById.get(categoryId);
        if (!category) return null;
        Object.assign(category, changes);
        this.rebuildIndexes();
        return category;
      },

      addNewItem: function(item: any) {
        if (!this.runtimePackage) return null;
        this.runtimePackage.itemTiles.push(item);
        this.rebuildIndexes();
        return item;
      },

      lookupCustomerByPhone: function(phone: any) {
        var target = normalizePhone(phone);
        if (!target) return null;
        var source = (this.runtimePackage && this.runtimePackage.customers && this.runtimePackage.customers.length)
          ? this.runtimePackage.customers
          : getFallbackCustomers();
        return (source || []).find(function(c) { return normalizePhone(c.phone) === target; }) || null;
      },

      getCustomers: function() {
        var source = (this.runtimePackage && Array.isArray(this.runtimePackage.customers))
          ? this.runtimePackage.customers
          : getFallbackCustomers();
        return (source || []).map(function(c) { return Object.assign({}, c); });
      },

      upsertCustomer: function(customer) {
        if (!customer) return null;
        if (!this.runtimePackage) return null;
        if (!Array.isArray(this.runtimePackage.customers)) this.runtimePackage.customers = [];

        var next = Object.assign({}, customer);
        var targetPhone = normalizePhone(next.phone);
        var idx = this.runtimePackage.customers.findIndex(function(c) {
          if (next.id && c.id === next.id) return true;
          if (targetPhone && normalizePhone(c.phone) === targetPhone) return true;
          return false;
        });

        if (idx >= 0) {
          this.runtimePackage.customers[idx] = Object.assign({}, this.runtimePackage.customers[idx], next);
          return this.runtimePackage.customers[idx];
        }

        this.runtimePackage.customers.unshift(next);
        return next;
      },

      ensureHistoryPersistenceReady: ensureHistoryPersistenceReady,

      saveRuntimeCache: function(key: string, value: any) {
        return kvPut(key, value);
      },

      getRuntimeCache: function(key: string) {
        return kvGet(key);
      },

      clearRuntimeCache: function() {
        return kvClear();
      },

      getBusinessDate: function() {
        return businessDateNow();
      },

      getMerchantId: function() {
        return String(getMerchantId() || 'local-merchant');
      },

      getLocationId: function() {
        return String(getLocationId() || 'local-location');
      },

      getStationNumber: function() {
        return Number(getStationNumber() || 1);
      },

      buildOrderNumber: async function() {
        await ensureHistoryPersistenceReady();
        var station = Number(getStationNumber() || 1);
        var businessDate = businessDateNow();
        var rows = await listStoreAll(STORE_ORDER_HISTORY, 'by_businessDate', businessDate);
        var maxSequence = rows.reduce(function(best: number, row: any) {
          if (Number(row && row.stationId) !== station) return best;
          var seq = Number(row && row.internalOrderSequence);
          return Number.isFinite(seq) ? Math.max(best, seq) : best;
        }, -1);

        if (maxSequence < 0) {
          var legacyOrders = safeParseLegacyOrders();
          maxSequence = legacyOrders.reduce(function(best: number, order: any) {
            var parsed = parseDailySequence(order && order.orderNumber, station);
            return parsed == null ? best : Math.max(best, parsed);
          }, -1);
        }

        var nextSequence = maxSequence + 1;
        return String(station) + '-' + padOrderSequence(nextSequence);
      },

      saveOrderHistorySnapshot: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(input && (input.orderId || input.id) || '').trim();
        if (!orderId) throw new Error('saveOrderHistorySnapshot requires orderId');
        var historyId = String(input && input.historyId || ('hist_' + orderId)).trim();
        var record = {
          historyId: historyId,
          orderId: orderId,
          merchantId: String(input && input.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(input && input.stationId || getStationNumber() || 1),
          businessDate: String(input && input.businessDate || businessDateNow()),
          displayOrderNumber: normalizeDisplayOrderNumber(input && input.displayOrderNumber || input && input.orderNumber || orderId),
          internalOrderSequence: Number(input && input.internalOrderSequence || parseDailySequence(input && (input.orderNumber || input.displayOrderNumber), input && input.stationId || getStationNumber()) || 0),
          orderType: String(input && input.orderType || 'pickup'),
          orderStatus: String(input && input.orderStatus || normalizeOrderStatus(input)),
          paymentStatus: String(input && input.paymentStatus || (input && input.paid ? 'paid' : 'unpaid')),
          deliveryStatus: input && input.deliveryStatus || null,
          assignedDriverId: input && input.assignedDriverId || null,
          assignedAt: input && input.assignedAt || null,
          outForDeliveryAt: input && input.outForDeliveryAt || null,
          deliveredAt: input && input.deliveredAt || null,
          returnedAt: input && input.returnedAt || null,
          deliveryCanceledAt: input && input.deliveryCanceledAt || null,
          storedDisplayName: String(input && input.storedDisplayName || input && input.customerName || 'Guest'),
          storedPhone: normalizePhone(input && input.storedPhone || input && input.customerPhone),
          storedAddressSummary: String(input && input.storedAddressSummary || ''),
          subtotalCents: Number.isFinite(Number(input && input.subtotalCents)) ? Number(input.subtotalCents) : toIntCents(input && input.subtotal || 0),
          taxCents: Number.isFinite(Number(input && input.taxCents)) ? Number(input.taxCents) : toIntCents(input && input.tax || 0),
          discountCents: Number.isFinite(Number(input && input.discountCents)) ? Number(input.discountCents) : toIntCents(input && input.discount || 0),
          feeCents: Number.isFinite(Number(input && input.feeCents)) ? Number(input.feeCents) : toIntCents(input && input.fee || 0),
          tipCents: Number.isFinite(Number(input && input.tipCents)) ? Number(input.tipCents) : toIntCents(input && input.tip || 0),
          totalCents: Number.isFinite(Number(input && input.totalCents)) ? Number(input.totalCents) : toIntCents(input && input.total || 0),
          amountPaidCents: Number.isFinite(Number(input && input.amountPaidCents)) ? Number(input.amountPaidCents) : toIntCents(input && input.amountPaid || 0),
          remainingBalanceCents: Number.isFinite(Number(input && input.remainingBalanceCents)) ? Number(input.remainingBalanceCents) : Math.max(0, toIntCents(input && input.total || 0) - toIntCents(input && input.amountPaid || 0)),
          openedAt: input && input.openedAt || null,
          sentAt: input && input.sentAt || null,
          completedAt: input && input.completedAt || null,
          closedAt: input && input.closedAt || null,
          createdAt: input && input.createdAt || nowIso(),
          updatedAt: input && input.updatedAt || nowIso(),
          version: Number(input && input.version || 1),
          syncStatus: String(input && input.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(input && input.syncAttempts || 0),
          lastSyncError: input && input.lastSyncError || null,
          lastSyncedAt: input && input.lastSyncedAt || null,
          sourceSnapshot: input && input.sourceSnapshot || null,
          migration: input && input.migration || null
        };

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY, 'readwrite');
        tx.objectStore(STORE_ORDER_HISTORY).put(record);
        await txDone(tx);
        return record;
      },

      updateOrderHistorySnapshot: async function(historyId: string, changes: any) {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_HISTORY);
        var current = await requestResult(store.get(historyId));
        if (!current) {
          await txDone(tx);
          return null;
        }
        var next = Object.assign({}, current, changes || {}, { updatedAt: nowIso() });
        store.put(next);
        await txDone(tx);
        return next;
      },

      getOrderHistoryByOrderId: async function(orderId: string) {
        var rows = await listStoreAll(STORE_ORDER_HISTORY, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || 0).getTime() - new Date(a && a.updatedAt || 0).getTime();
        });
        return rows[0] || null;
      },

      listOrderHistory: async function(options?: any) {
        var rows = await listStoreAll(STORE_ORDER_HISTORY);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || b && b.createdAt || 0).getTime() - new Date(a && a.updatedAt || a && a.createdAt || 0).getTime();
        });
        if (options && options.businessDate) {
          rows = rows.filter(function(row: any) { return row.businessDate === options.businessDate; });
        }
        return rows;
      },

      saveOrderHistoryItems: async function(historyId: string, orderId: string, items: any[]) {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_HISTORY_ITEMS, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_HISTORY_ITEMS);
        var byHistoryReq = store.index('by_historyId').getAll(historyId);
        var existing = await requestResult(byHistoryReq);
        (existing || []).forEach(function(row: any) {
          store.delete(row.historyItemId);
        });

        (items || []).forEach(function(item: any, idx: number) {
          var row = {
            historyItemId: String(item && item.historyItemId || ('hist_item_' + historyId + '_' + idx)),
            historyId: historyId,
            orderId: orderId,
            sourceItemId: String(item && item.sourceItemId || item && item.itemId || item && item.lineId || ''),
            itemName: String(item && item.itemName || item && item.name || 'Item'),
            categoryName: String(item && item.categoryName || ''),
            sizeName: String(item && item.sizeName || item && item.size || ''),
            quantity: Number(item && item.quantity || item && item.qty || 1),
            unitPriceCents: Number.isFinite(Number(item && item.unitPriceCents)) ? Number(item.unitPriceCents) : toIntCents(item && item.unitPrice || item && item.price || 0),
            lineSubtotalCents: Number.isFinite(Number(item && item.lineSubtotalCents)) ? Number(item.lineSubtotalCents) : toIntCents((item && (item.unitPrice || item.price) || 0) * Number(item && (item.quantity || item.qty) || 1)),
            lineTotalCents: Number.isFinite(Number(item && item.lineTotalCents)) ? Number(item.lineTotalCents) : toIntCents((item && (item.unitPrice || item.price) || 0) * Number(item && (item.quantity || item.qty) || 1)),
            instructions: String(item && item.instructions || item && item.specialInstruction || ''),
            modifierSummary: String(item && item.modifierSummary || ''),
            sortOrder: Number(item && item.sortOrder || idx),
            createdAt: String(item && item.createdAt || nowIso())
          };
          store.put(row);
        });

        await txDone(tx);
        return true;
      },

      appendOrderEvent: async function(event: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(event && event.orderId || '').trim();
        if (!orderId) throw new Error('appendOrderEvent requires orderId');
        var eventType = eventLabelToType(event && (event.eventType || event.type || event.label));
        var timestamp = String(event && (event.eventTimestamp || event.timestamp || event.at) || nowIso());
        var idempotencyKey = String(event && event.idempotencyKey || deterministicKey([orderId, eventType, timestamp, event && event.employeeId || '', event && event.employeeShortName || '']));

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_ORDER_EVENTS, 'readwrite');
        var store = tx.objectStore(STORE_ORDER_EVENTS);
        var index = store.index('by_idempotencyKey');
        var existing = await requestResult(index.get(idempotencyKey));
        if (existing) {
          await txDone(tx);
          return existing;
        }

        var row = {
          eventId: String(event && event.eventId || ('evt_' + idempotencyKey.replace(/[^a-z0-9_\-]/gi, '_'))),
          orderId: orderId,
          historyId: String(event && event.historyId || ''),
          merchantId: String(event && event.merchantId || getMerchantId() || 'local-merchant'),
          stationId: String(event && event.stationId || getStationNumber() || 1),
          businessDate: String(event && event.businessDate || businessDateNow()),
          eventType: eventType,
          eventTimestamp: timestamp,
          employeeId: String(event && event.employeeId || ''),
          employeeShortName: String(event && event.employeeShortName || event && event.employeeCode || event && event.employeeInitials || event && event.employee || event && event.by || 'System'),
          actorType: String(event && event.actorType || 'employee'),
          idempotencyKey: idempotencyKey,
          metadata: event && event.metadata || null,
          createdAt: String(event && event.createdAt || nowIso()),
          syncStatus: String(event && event.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(event && event.syncAttempts || 0),
          lastSyncError: event && event.lastSyncError || null,
          lastSyncedAt: event && event.lastSyncedAt || null
        };
        store.put(row);
        await txDone(tx);
        return row;
      },

      listOrderEvents: async function(orderId: string) {
        var rows = await listStoreAll(STORE_ORDER_EVENTS, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(a && a.eventTimestamp || 0).getTime() - new Date(b && b.eventTimestamp || 0).getTime();
        });
        return rows;
      },

      savePaymentHistory: async function(payment: any) {
        await ensureHistoryPersistenceReady();
        var orderId = String(payment && payment.orderId || '').trim();
        if (!orderId) throw new Error('savePaymentHistory requires orderId');
        var paidAt = String(payment && payment.paidAt || nowIso());
        var idempotencyKey = String(payment && payment.idempotencyKey || deterministicKey([
          orderId,
          payment && payment.paymentId || '',
          payment && payment.paymentType || '',
          payment && payment.amountCents || toIntCents(payment && payment.amount || 0),
          paidAt
        ]));

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_PAYMENT_HISTORY, 'readwrite');
        var store = tx.objectStore(STORE_PAYMENT_HISTORY);
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));
        if (existing) {
          await txDone(tx);
          return existing;
        }

        var row = {
          paymentHistoryId: String(payment && payment.paymentHistoryId || ('pay_' + idempotencyKey.replace(/[^a-z0-9_\-]/gi, '_'))),
          orderId: orderId,
          historyId: String(payment && payment.historyId || ''),
          paymentId: String(payment && payment.paymentId || ''),
          paymentType: String(payment && payment.paymentType || 'Other'),
          tenderLabel: String(payment && payment.tenderLabel || payment && payment.paymentType || 'Other'),
          amountCents: Number.isFinite(Number(payment && payment.amountCents)) ? Number(payment.amountCents) : toIntCents(payment && payment.amount || 0),
          baseAmountCents: Number.isFinite(Number(payment && payment.baseAmountCents)) ? Number(payment.baseAmountCents) : (Number.isFinite(Number(payment && payment.amountCents)) ? Number(payment.amountCents) : toIntCents(payment && payment.amount || 0)),
          tipAmountCents: Number.isFinite(Number(payment && payment.tipAmountCents)) ? Number(payment.tipAmountCents) : toIntCents(payment && payment.tipAmount || 0),
          cardBrand: String(payment && payment.cardBrand || ''),
          cardLastFour: String(payment && payment.cardLastFour || payment && payment.lastFour || '').replace(/\D/g, '').slice(-4),
          processorReferenceId: String(payment && payment.processorReferenceId || ''),
          provider: String(payment && payment.provider || ''),
          providerTransactionReference: String(payment && payment.providerTransactionReference || ''),
          status: String(payment && payment.status || 'approved'),
          employeeId: String(payment && payment.employeeId || ''),
          employeeShortName: String(payment && payment.employeeShortName || payment && payment.employeeInitials || payment && payment.employee || 'System'),
          paidAt: paidAt,
          createdAt: String(payment && payment.createdAt || nowIso()),
          syncStatus: String(payment && payment.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only')),
          syncAttempts: Number(payment && payment.syncAttempts || 0),
          lastSyncError: payment && payment.lastSyncError || null,
          lastSyncedAt: payment && payment.lastSyncedAt || null,
          idempotencyKey: idempotencyKey
        };

        store.put(row);
        await txDone(tx);
        return row;
      },

      listPaymentHistory: async function(orderId: string) {
        var rows = await listStoreAll(STORE_PAYMENT_HISTORY, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(a && a.paidAt || a && a.createdAt || 0).getTime() - new Date(b && b.paidAt || b && b.createdAt || 0).getTime();
        });
        return rows;
      },

      markHistoryRecordPendingSync: async function(storeType: string, recordId: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'pending';
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      markHistoryRecordSynced: async function(storeType: string, recordId: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'synced';
          row.lastSyncedAt = nowIso();
          row.lastSyncError = null;
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      markHistoryRecordSyncFailed: async function(storeType: string, recordId: string, errorText: string) {
        await ensureHistoryPersistenceReady();
        var map: any = {
          ORDER_HISTORY: STORE_ORDER_HISTORY,
          ORDER_EVENT: STORE_ORDER_EVENTS,
          PAYMENT_HISTORY: STORE_PAYMENT_HISTORY
        };
        var storeName = map[storeType];
        if (!storeName) throw new Error('Unknown storeType: ' + storeType);
        var db = await openRuntimeDb();
        var tx = db.transaction(storeName, 'readwrite');
        var store = tx.objectStore(storeName);
        var row = await requestResult(store.get(recordId));
        if (row) {
          row.syncStatus = 'failed';
          row.syncAttempts = Number(row.syncAttempts || 0) + 1;
          row.lastSyncError = String(errorText || 'Sync failed');
          row.updatedAt = nowIso();
          store.put(row);
        }
        await txDone(tx);
        return !!row;
      },

      listPendingSyncEnvelopes: async function(limit?: number) {
        await ensureHistoryPersistenceReady();
        var max = Number(limit || 200);
        var historyRows = (await listStoreAll(STORE_ORDER_HISTORY)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var eventRows = (await listStoreAll(STORE_ORDER_EVENTS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var paymentRows = (await listStoreAll(STORE_PAYMENT_HISTORY)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var deliveryDrivers = (await listStoreAll(STORE_DELIVERY_DRIVERS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var deliverySettings = (await listStoreAll(STORE_DELIVERY_SETTINGS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var driverShifts = (await listStoreAll(STORE_DRIVER_SHIFTS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var settlements = (await listStoreAll(STORE_DRIVER_SETTLEMENTS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var deliveryEvents = (await listStoreAll(STORE_DELIVERY_EVENTS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var printerSettings = (await listStoreAll(STORE_PRINTER_SETTINGS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var printJobRefs = (await listStoreAll(STORE_PRINT_JOB_REFS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var posPrinters = (await listStoreAll(STORE_POS_PRINTER_CONFIGS)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var routingRules = (await listStoreAll(STORE_PRINTER_ROUTING_RULES)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });
        var printBatches = (await listStoreAll(STORE_LOCAL_PRINT_BATCHES)).filter(function(row: any) { return row.syncStatus === 'pending' || row.syncStatus === 'failed'; });

        var envelopes = [] as any[];
        historyRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.historyId,
            recordType: 'ORDER_HISTORY',
            merchantId: row.merchantId,
            stationId: row.stationId,
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.historyId,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          });
        });
        eventRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.eventId,
            recordType: 'ORDER_EVENT',
            merchantId: row.merchantId,
            stationId: row.stationId,
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.idempotencyKey,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || row.createdAt
          });
        });
        paymentRows.forEach(function(row: any) {
          envelopes.push({
            recordId: row.paymentHistoryId,
            recordType: 'PAYMENT_HISTORY',
            merchantId: row.merchantId || getMerchantId(),
            stationId: row.stationId || getStationNumber(),
            schemaVersion: 2,
            payload: row,
            idempotencyKey: row.idempotencyKey,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt || row.createdAt
          });
        });
        [[deliverySettings,'DELIVERY_SETTINGS','id'],[deliveryDrivers,'DELIVERY_DRIVER','driverId'],[driverShifts,'DRIVER_SHIFT','driverShiftId'],[settlements,'DRIVER_SETTLEMENT','settlementId'],[deliveryEvents,'DELIVERY_EVENT','deliveryEventId']].forEach(function(group:any) {
          group[0].forEach(function(row:any) { envelopes.push({ recordId: row[group[2]], recordType: group[1], merchantId: getMerchantId(), stationId: getStationNumber(), schemaVersion: 4, payload: row, idempotencyKey: row[group[2]], createdAt: row.createdAt, updatedAt: row.updatedAt || row.createdAt }); });
        });
        [[printerSettings,'PRINTER_SETTINGS','id'],[printJobRefs,'PRINT_JOB_REF','id']].forEach(function(group:any) {
          group[0].forEach(function(row:any) { envelopes.push({ recordId: row[group[2]], recordType: group[1], merchantId: getMerchantId(), stationId: getStationNumber(), schemaVersion: 5, payload: row, idempotencyKey: row.idempotencyKey || row[group[2]], createdAt: row.createdAt || row.requestedAt, updatedAt: row.updatedAt || row.lastStatusAt || row.createdAt }); });
        });
        [[posPrinters,'POS_PRINTER_CONFIG','id'],[routingRules,'PRINTER_ROUTING_RULE','id'],[printBatches,'LOCAL_PRINT_BATCH','id']].forEach(function(group:any) {
          group[0].forEach(function(row:any) { envelopes.push({ recordId: row[group[2]], recordType: group[1], merchantId: getMerchantId(), stationId: getStationNumber(), schemaVersion: 6, payload: row, idempotencyKey: row[group[2]], createdAt: row.createdAt || row.requestedAt, updatedAt: row.updatedAt || row.createdAt }); });
        });
        envelopes.sort(function(a: any, b: any) {
          return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
        });
        return envelopes.slice(0, Math.max(1, max));
      },

      getDeliverySettings: async function() {
        await ensureHistoryPersistenceReady();
        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_DELIVERY_SETTINGS, 'readonly');
        var row = await requestResult(tx.objectStore(STORE_DELIVERY_SETTINGS).get('delivery_manager_settings'));
        await txDone(tx);
        return row || null;
      },

      saveDeliverySettings: async function(input: any) {
        await ensureHistoryPersistenceReady();
        var current = await this.getDeliverySettings();
        var stamp = nowIso();
        var row = Object.assign({}, current || {}, input || {}, {
          id: 'delivery_manager_settings',
          inHouseDeliveryEnabled: input && input.inHouseDeliveryEnabled === true,
          deliveryQueueMode: input && input.deliveryQueueMode === 'dedicated_delivery_queue' ? 'dedicated_delivery_queue' : 'main_orders',
          driverBanksEnabled: input && input.driverBanksEnabled === true,
          driverBankReconciliationMode: input && input.driverBankReconciliationMode === 'per_order' ? 'per_order' : 'end_of_shift',
          createdAt: current && current.createdAt || stamp, updatedAt: stamp, version: Number(current && current.version || 0) + 1,
          syncStatus: 'pending', lastSyncAttemptAt: null, syncError: null
        });
        var db = await openRuntimeDb(); var tx = db.transaction(STORE_DELIVERY_SETTINGS, 'readwrite'); tx.objectStore(STORE_DELIVERY_SETTINGS).put(row); await txDone(tx); return row;
      },

      listDeliveryDrivers: async function() {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_DELIVERY_DRIVERS); rows.sort(function(a:any,b:any){ return String(a.displayName).localeCompare(String(b.displayName)); }); return rows;
      },

      createDeliveryDriver: async function(input: any) {
        await ensureHistoryPersistenceReady(); var stamp = nowIso();
        var row = { driverId: String(input && input.driverId || ('driver_' + Date.now() + '_' + Math.random().toString(36).slice(2,8))), displayName: String(input && input.displayName || '').trim(), phone: String(input && input.phone || '').trim(), active: true, createdAt: stamp, updatedAt: stamp, version: 1, syncStatus: 'pending', lastSyncAttemptAt: null, syncError: null };
        if (!row.displayName) throw new Error('Driver name is required.');
        var db = await openRuntimeDb(); var tx = db.transaction(STORE_DELIVERY_DRIVERS, 'readwrite'); tx.objectStore(STORE_DELIVERY_DRIVERS).add(row); await txDone(tx);
        await this.appendDeliveryEvent({ eventType: 'DRIVER_CREATED', driverId: row.driverId, metadata: { displayName: row.displayName } }); return row;
      },

      updateDeliveryDriver: async function(driverId: string, patch: any) {
        await ensureHistoryPersistenceReady(); var db = await openRuntimeDb(); var tx = db.transaction(STORE_DELIVERY_DRIVERS, 'readwrite'); var store = tx.objectStore(STORE_DELIVERY_DRIVERS); var row = await requestResult(store.get(driverId));
        if (!row) { await txDone(tx); throw new Error('Driver not found.'); }
        Object.assign(row, patch || {}, { driverId: driverId, updatedAt: nowIso(), version: Number(row.version || 0) + 1, syncStatus: 'pending', syncError: null });
        if (!String(row.displayName || '').trim()) { await txDone(tx); throw new Error('Driver name is required.'); }
        store.put(row); await txDone(tx); return row;
      },

      setDeliveryDriverActive: async function(driverId: string, active: boolean) {
        var row = await this.updateDeliveryDriver(driverId, { active: !!active });
        await this.appendDeliveryEvent({ eventType: active ? 'DRIVER_ACTIVATED' : 'DRIVER_DEACTIVATED', driverId: driverId }); return row;
      },

      listDriverShifts: async function(driverId?: string) {
        await ensureHistoryPersistenceReady(); var rows = driverId ? await listStoreAll(STORE_DRIVER_SHIFTS, 'by_driverId', driverId) : await listStoreAll(STORE_DRIVER_SHIFTS); rows.sort(function(a:any,b:any){ return new Date(b.openedAt || 0).getTime() - new Date(a.openedAt || 0).getTime(); }); return rows;
      },

      openDriverShift: async function(driverId: string, startingBankAmountCents: number, notes?: string) {
        var driverRows = await this.listDeliveryDrivers(); var driver = driverRows.find(function(row:any){ return row.driverId === driverId && row.active; }); if (!driver) throw new Error('An active driver is required.');
        var open = (await this.listDriverShifts(driverId)).find(function(row:any){ return row.status === 'OPEN'; }); if (open) throw new Error('Driver already has an open shift.');
        var settings = await this.getDeliverySettings() || {}; var stamp = nowIso();
        var row = { driverShiftId: 'shift_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), driverId: driverId, businessDate: businessDateNow(), status: 'OPEN', openedAt: stamp, closedAt: null, startingBankAmountCents: settings.driverBanksEnabled ? Math.max(0, Math.round(Number(startingBankAmountCents || 0))) : 0, bankEnabledAtShiftStart: settings.driverBanksEnabled === true, reconciliationModeAtShiftStart: settings.driverBankReconciliationMode === 'per_order' ? 'per_order' : 'end_of_shift', notes: String(notes || ''), createdAt: stamp, updatedAt: stamp, version: 1, syncStatus: 'pending', lastSyncAttemptAt: null, syncError: null };
        var db = await openRuntimeDb(); var tx = db.transaction(STORE_DRIVER_SHIFTS, 'readwrite'); tx.objectStore(STORE_DRIVER_SHIFTS).add(row); await txDone(tx); await this.appendDeliveryEvent({ eventType: 'DRIVER_SHIFT_OPENED', driverId: driverId, driverShiftId: row.driverShiftId }); return row;
      },

      closeDriverShift: async function(driverShiftId: string) {
        await ensureHistoryPersistenceReady(); var db = await openRuntimeDb(); var tx = db.transaction(STORE_DRIVER_SHIFTS, 'readwrite'); var store = tx.objectStore(STORE_DRIVER_SHIFTS); var row = await requestResult(store.get(driverShiftId)); if (!row) { await txDone(tx); throw new Error('Driver shift not found.'); }
        row.status = 'CLOSED'; row.closedAt = nowIso(); row.updatedAt = row.closedAt; row.version = Number(row.version || 0) + 1; row.syncStatus = 'pending'; store.put(row); await txDone(tx); await this.appendDeliveryEvent({ eventType: 'DRIVER_SHIFT_CLOSED', driverId: row.driverId, driverShiftId: driverShiftId }); return row;
      },

      appendDeliveryEvent: async function(input: any) {
        await ensureHistoryPersistenceReady(); var stamp = nowIso(); var row = Object.assign({}, input || {}, { deliveryEventId: String(input && input.deliveryEventId || ('delivery_event_' + Date.now() + '_' + Math.random().toString(36).slice(2,8))), orderId: String(input && input.orderId || ''), driverId: String(input && input.driverId || ''), driverShiftId: String(input && input.driverShiftId || ''), settlementId: String(input && input.settlementId || ''), eventType: String(input && input.eventType || 'DELIVERY_UPDATED'), businessDate: String(input && input.businessDate || businessDateNow()), createdAt: String(input && input.createdAt || stamp), updatedAt: stamp, version: 1, syncStatus: 'pending', lastSyncAttemptAt: null, syncError: null });
        var db = await openRuntimeDb(); var tx = db.transaction(STORE_DELIVERY_EVENTS, 'readwrite'); tx.objectStore(STORE_DELIVERY_EVENTS).add(row); await txDone(tx); return row;
      },

      listDeliveryOrders: async function(driverId?: string) {
        await ensureHistoryPersistenceReady(); var rows = (await listStoreAll(STORE_ORDER_HISTORY)).filter(function(row:any){ return String(row.orderType || '').toLowerCase() === 'delivery' && !!row.deliveryStatus && (!driverId || row.assignedDriverId === driverId); });
        var self = this; return Promise.all(rows.map(async function(row:any){ var payments = await self.listPaymentHistory(row.orderId); return Object.assign({}, row, { id: row.orderId, orderNumber: row.displayOrderNumber, paymentLines: payments }); }));
      },

      listPendingDeliveryOrders: async function() { return (await this.listDeliveryOrders()).filter(function(row:any){ return row.deliveryStatus === 'PENDING_DELIVERY'; }); },
      listDriverOrders: async function(driverId: string) { return this.listDeliveryOrders(driverId); },
      listActiveDriverOrders: async function() { return (await this.listDeliveryOrders()).filter(function(row:any){ return row.deliveryStatus === 'ASSIGNED' || row.deliveryStatus === 'OUT_FOR_DELIVERY'; }); },
      listDeliveryEvents: async function() { await ensureHistoryPersistenceReady(); var rows = await listStoreAll(STORE_DELIVERY_EVENTS); rows.sort(function(a:any,b:any){ return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(); }); return rows; },

      calculateDriverSettlement: async function(driverId: string, scope?: any) {
        var orders = await this.listDeliveryOrders(driverId); var settlements = await this.listDriverSettlements(driverId); var settled = new Set(settlements.filter(function(row:any){ return row.status === 'APPROVED'; }).reduce(function(all:any[],row:any){ return all.concat(row.orderIds || []); }, []));
        var shift = (await this.listDriverShifts(driverId)).find(function(row:any){ return row.status === 'OPEN'; }) || null;
        var settlementBusinessDate = String(scope && scope.businessDate || shift && shift.businessDate || businessDateNow());
        orders = orders.filter(function(order:any){ return String(order.businessDate || '') === settlementBusinessDate && !settled.has(String(order.id || order.orderId)) && (!scope || !Array.isArray(scope.orderIds) || scope.orderIds.indexOf(String(order.id || order.orderId)) >= 0); });
        if (!global.LilposDeliveryCalculations) throw new Error('Delivery settlement calculator is unavailable.');
        return global.LilposDeliveryCalculations.calculate({ orders: orders, shift: shift });
      },

      assignDeliveryOrder: async function(orderId: string, driverId: string) {
        var driver = (await this.listDeliveryDrivers()).find(function(row:any){ return row.driverId === driverId && row.active; }); if (!driver) throw new Error('Select an active driver.');
        var order = await this.getOrderHistoryByOrderId(orderId); if (!order || String(order.orderType).toLowerCase() !== 'delivery') throw new Error('Delivery order not found.');
        var currentStatus = String(order.deliveryStatus || 'PENDING_DELIVERY');
        if (currentStatus === 'DELIVERED' || currentStatus === 'RETURNED' || currentStatus === 'CANCELED') throw new Error('Completed delivery orders cannot be reassigned.');
        var stamp = nowIso(); var next = await this.updateOrderHistorySnapshot(order.historyId, { deliveryStatus: currentStatus === 'PENDING_DELIVERY' ? 'ASSIGNED' : currentStatus, assignedDriverId: driverId, assignedAt: stamp, updatedAt: stamp, syncStatus: 'pending' });
        await this.appendDeliveryEvent({ eventType: 'DELIVERY_ASSIGNED', orderId: orderId, driverId: driverId, metadata: { previousDriverId: order.assignedDriverId || null } }); return next;
      },

      updateDeliveryOrderStatus: async function(orderId: string, nextStatus: string) {
        var order = await this.getOrderHistoryByOrderId(orderId); if (!order) throw new Error('Delivery order not found.');
        var current = String(order.deliveryStatus || 'PENDING_DELIVERY'); var allowed:any = { PENDING_DELIVERY:['CANCELED'], ASSIGNED:['OUT_FOR_DELIVERY','RETURNED','CANCELED'], OUT_FOR_DELIVERY:['DELIVERED','RETURNED','CANCELED'], DELIVERED:[], RETURNED:[], CANCELED:[] };
        if ((allowed[current] || []).indexOf(nextStatus) < 0) throw new Error('That delivery status transition is not allowed.');
        if ((nextStatus === 'OUT_FOR_DELIVERY' || nextStatus === 'DELIVERED') && !order.assignedDriverId) throw new Error('Assign an active driver first.');
        var stamp = nowIso(); var patch:any = { deliveryStatus: nextStatus, updatedAt: stamp, syncStatus: 'pending' };
        if (nextStatus === 'OUT_FOR_DELIVERY') patch.outForDeliveryAt = stamp; if (nextStatus === 'DELIVERED') patch.deliveredAt = stamp; if (nextStatus === 'RETURNED') patch.returnedAt = stamp; if (nextStatus === 'CANCELED') patch.deliveryCanceledAt = stamp;
        var next = await this.updateOrderHistorySnapshot(order.historyId, patch); await this.appendDeliveryEvent({ eventType: 'DELIVERY_STATUS_CHANGED', orderId: orderId, driverId: order.assignedDriverId || '', metadata: { from: current, to: nextStatus } }); return next;
      },

      listDriverSettlements: async function(driverId?: string) {
        await ensureHistoryPersistenceReady(); var rows = driverId ? await listStoreAll(STORE_DRIVER_SETTLEMENTS, 'by_driverId', driverId) : await listStoreAll(STORE_DRIVER_SETTLEMENTS); rows.sort(function(a:any,b:any){ return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(); }); return rows;
      },

      createDriverSettlementDraft: async function(driverId: string, calculation: any) {
        if (!calculation || (calculation.warnings || []).length) throw new Error('Unable to calculate settlement for some orders due to missing payment details.');
        if ((await this.listDriverSettlements(driverId)).some(function(row:any){ return row.status === 'DRAFT'; })) throw new Error('Approve or void the existing settlement draft first.');
        var settings = await this.getDeliverySettings() || {}; var shift = (await this.listDriverShifts(driverId)).find(function(row:any){ return row.status === 'OPEN'; }) || null; var stamp = nowIso();
        var row = Object.assign({}, calculation, { settlementId: 'settlement_' + Date.now() + '_' + Math.random().toString(36).slice(2,8), driverId: driverId, driverShiftId: shift && shift.driverShiftId || null, businessDate: String(shift && shift.businessDate || businessDateNow()), reconciliationMode: settings.driverBankReconciliationMode === 'per_order' ? 'per_order' : 'end_of_shift', status: 'DRAFT', approvedByEmployeeId: null, approvedAt: null, notes: '', createdAt: stamp, updatedAt: stamp, version: 1, syncStatus: 'pending', lastSyncAttemptAt: null, syncError: null });
        var db = await openRuntimeDb(); var tx = db.transaction(STORE_DRIVER_SETTLEMENTS, 'readwrite'); tx.objectStore(STORE_DRIVER_SETTLEMENTS).add(row); await txDone(tx); await this.appendDeliveryEvent({ eventType: 'SETTLEMENT_DRAFT_CREATED', driverId: driverId, driverShiftId: row.driverShiftId || '', settlementId: row.settlementId }); return row;
      },

      approveDriverSettlement: async function(settlementId: string, employeeId: string) {
        await ensureHistoryPersistenceReady(); var db = await openRuntimeDb(); var tx = db.transaction(STORE_DRIVER_SETTLEMENTS, 'readwrite'); var store = tx.objectStore(STORE_DRIVER_SETTLEMENTS); var row = await requestResult(store.get(settlementId)); if (!row || row.status !== 'DRAFT') { await txDone(tx); throw new Error('Settlement draft not found.'); }
        row.status = 'APPROVED'; row.approvedByEmployeeId = String(employeeId || 'manager'); row.approvedAt = nowIso(); row.updatedAt = row.approvedAt; row.version = Number(row.version || 0) + 1; row.syncStatus = 'pending'; store.put(row); await txDone(tx);
        // V1 intentionally records settlement only. Future cash-drawer payout integration belongs here.
        await this.appendDeliveryEvent({ eventType: 'SETTLEMENT_APPROVED', driverId: row.driverId, driverShiftId: row.driverShiftId || '', settlementId: settlementId }); return row;
      },

      saveSplitPaymentPlan: async function(plan: any) {
        await ensureHistoryPersistenceReady();
        var id = String(plan && plan.id || '').trim();
        var orderId = String(plan && plan.orderId || '').trim();
        if (!id) throw new Error('saveSplitPaymentPlan requires id');
        if (!orderId) throw new Error('saveSplitPaymentPlan requires orderId');

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_SPLIT_PAYMENT_PLAN, 'readwrite');
        var store = tx.objectStore(STORE_SPLIT_PAYMENT_PLAN);
        var idempotencyKey = String(plan && plan.idempotencyKey || deterministicKey(['split-plan', id, orderId]));
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));

        var record = existing || {
          id: id,
          createdAt: String(plan && plan.createdAt || nowIso())
        };

        record.orderId = orderId;
        record.historyId = String(plan && plan.historyId || '');
        record.mode = String(plan && plan.mode || 'CUSTOM');
        record.originalBalanceCents = Number(plan && plan.originalBalanceCents || 0);
        record.paidCents = Number(plan && plan.paidCents || 0);
        record.remainingCents = Number(plan && plan.remainingCents || 0);
        record.requestedPaymentCount = Number(plan && plan.requestedPaymentCount || 0);
        record.status = String(plan && plan.status || 'ACTIVE');
        record.employeeId = String(plan && plan.employeeId || '');
        record.stationId = String(plan && plan.stationId || getStationNumber() || 1);
        record.syncStatus = String(plan && plan.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'));
        record.idempotencyKey = idempotencyKey;
        record.updatedAt = String(plan && plan.updatedAt || nowIso());

        store.put(record);
        await txDone(tx);
        return record;
      },

      getSplitPaymentPlanByOrderId: async function(orderId: string) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_SPLIT_PAYMENT_PLAN, 'by_orderId', orderId);
        rows.sort(function(a: any, b: any) {
          return new Date(b && b.updatedAt || b && b.createdAt || 0).getTime() - new Date(a && a.updatedAt || a && a.createdAt || 0).getTime();
        });
        return rows[0] || null;
      },

      saveSplitPaymentPortion: async function(portion: any) {
        await ensureHistoryPersistenceReady();
        var id = String(portion && portion.id || '').trim();
        if (!id) throw new Error('saveSplitPaymentPortion requires id');
        var planId = String(portion && portion.planId || '').trim();
        var orderId = String(portion && portion.orderId || '').trim();
        if (!planId) throw new Error('saveSplitPaymentPortion requires planId');
        if (!orderId) throw new Error('saveSplitPaymentPortion requires orderId');

        var db = await openRuntimeDb();
        var tx = db.transaction(STORE_SPLIT_PAYMENT_PORTION, 'readwrite');
        var store = tx.objectStore(STORE_SPLIT_PAYMENT_PORTION);
        var idempotencyKey = String(portion && portion.idempotencyKey || deterministicKey(['split-portion', id, planId, orderId]));
        var existing = await requestResult(store.index('by_idempotencyKey').get(idempotencyKey));
        var record = existing || {
          id: id,
          createdAt: String(portion && portion.createdAt || nowIso())
        };

        record.planId = planId;
        record.orderId = orderId;
        record.sequence = Number(portion && portion.sequence || 0);
        record.paymentMethod = String(portion && portion.paymentMethod || 'other');
        record.finalPaymentMethodLabel = String(portion && portion.finalPaymentMethodLabel || '');
        record.plannedAmountCents = Number(portion && portion.plannedAmountCents || 0);
        record.approvedAmountCents = Number(portion && portion.approvedAmountCents || 0);
        record.tipAmountCents = Number(portion && portion.tipAmountCents || 0);
        record.status = String(portion && portion.status || 'PENDING');
        record.paymentId = String(portion && portion.paymentId || '');
        record.provider = String(portion && portion.provider || '');
        record.providerTransactionReference = String(portion && portion.providerTransactionReference || '');
        record.cardBrand = String(portion && portion.cardBrand || '');
        record.cardLast4 = String(portion && portion.cardLast4 || '').replace(/\D/g, '').slice(-4);
        record.failureCode = String(portion && portion.failureCode || '');
        record.failureMessage = String(portion && portion.failureMessage || '');
        record.syncStatus = String(portion && portion.syncStatus || (getPlanPersistenceMode() === 'persistent' ? 'pending' : 'local-only'));
        record.idempotencyKey = idempotencyKey;
        record.updatedAt = String(portion && portion.updatedAt || nowIso());

        store.put(record);
        await txDone(tx);
        return record;
      },

      listSplitPaymentPortionsByPlanId: async function(planId: string) {
        await ensureHistoryPersistenceReady();
        var rows = await listStoreAll(STORE_SPLIT_PAYMENT_PORTION, 'by_planId', planId);
        rows.sort(function(a: any, b: any) {
          return Number(a && a.sequence || 0) - Number(b && b.sequence || 0);
        });
        return rows;
      },

      loadSplitPaymentWorkspaceByOrderId: async function(orderId: string) {
        var plan = await this.getSplitPaymentPlanByOrderId(orderId);
        if (!plan) return null;
        var portions = await this.listSplitPaymentPortionsByPlanId(plan.id);
        return {
          plan: plan,
          portions: portions
        };
      },

      persistSplitPaymentWorkspace: async function(workspace: any) {
        if (!workspace) return null;
        var planRecord = await this.saveSplitPaymentPlan({
          id: workspace.planId,
          orderId: workspace.orderId,
          historyId: workspace.historyId,
          mode: workspace.mode,
          originalBalanceCents: workspace.originalBalanceCents,
          paidCents: workspace.paidCents,
          remainingCents: workspace.remainingCents,
          requestedPaymentCount: workspace.requestedPaymentCount,
          status: workspace.status,
          createdAt: workspace.createdAt,
          updatedAt: workspace.updatedAt,
          idempotencyKey: workspace.idempotencyKey,
          syncStatus: workspace.syncStatus
        });

        var portions = Array.isArray(workspace.portions) ? workspace.portions : [];
        for (var idx = 0; idx < portions.length; idx += 1) {
          var portion = portions[idx] || {};
          await this.saveSplitPaymentPortion({
            id: portion.id,
            planId: workspace.planId,
            orderId: workspace.orderId,
            sequence: portion.sequence,
            paymentMethod: portion.paymentMethod,
            finalPaymentMethodLabel: portion.finalPaymentMethodLabel,
            plannedAmountCents: portion.plannedAmountCents,
            approvedAmountCents: portion.approvedAmountCents,
            tipAmountCents: portion.tipAmountCents,
            status: portion.status,
            paymentId: portion.paymentId,
            provider: portion.provider,
            providerTransactionReference: portion.providerTransactionReference,
            cardBrand: portion.cardBrand,
            cardLast4: portion.cardLast4,
            failureCode: portion.failureCode,
            failureMessage: portion.failureMessage,
            createdAt: portion.createdAt,
            updatedAt: portion.updatedAt,
            idempotencyKey: portion.idempotencyKey,
            syncStatus: portion.syncStatus
          });
        }

        return {
          plan: planRecord,
          portions: portions
        };
      },

      listHistoricalOrdersCompat: async function() {
        var rows = await this.listOrderHistory();
        return rows.map(function(row: any) {
          return {
            id: row.orderId,
            orderNumber: row.displayOrderNumber,
            number: row.displayOrderNumber,
            orderType: row.orderType,
            status: row.orderStatus,
            paymentStatus: row.paymentStatus,
            deliveryStatus: row.deliveryStatus || null,
            assignedDriverId: row.assignedDriverId || null,
            assignedAt: row.assignedAt || null,
            outForDeliveryAt: row.outForDeliveryAt || null,
            deliveredAt: row.deliveredAt || null,
            returnedAt: row.returnedAt || null,
            deliveryCanceledAt: row.deliveryCanceledAt || null,
            paid: row.paymentStatus === 'paid' || row.amountPaidCents >= row.totalCents,
            orderSource: row.sourceSnapshot && row.sourceSnapshot.orderSource || '',
            timingType: row.sourceSnapshot && row.sourceSnapshot.timingType || 'asap',
            asapTime: row.sourceSnapshot && row.sourceSnapshot.asapTime || null,
            futureDateTime: row.sourceSnapshot && row.sourceSnapshot.futureDateTime || null,
            orderSpecialInstructions: row.sourceSnapshot && row.sourceSnapshot.orderSpecialInstructions || '',
            customerSnapshot: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customerInfo: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customer: row.sourceSnapshot && row.sourceSnapshot.customer || {
              name: row.storedDisplayName,
              phone: row.storedPhone,
              address1: row.storedAddressSummary
            },
            customerName: row.storedDisplayName,
            subtotal: fromIntCents(row.subtotalCents),
            tax: fromIntCents(row.taxCents),
            tip: fromIntCents(row.tipCents),
            tipCents: Number(row.tipCents || 0),
            total: fromIntCents(row.totalCents),
            createdTimestamp: row.createdAt,
            updatedTimestamp: row.updatedAt,
            paymentMethodSummary: row.sourceSnapshot && row.sourceSnapshot.paymentMethodSummary || '',
            businessDate: row.businessDate,
            stationNumber: row.stationId,
            syncStatus: row.syncStatus,
            syncAttempts: row.syncAttempts,
            lastSyncError: row.lastSyncError,
            lastSyncedAt: row.lastSyncedAt,
            historyId: row.historyId,
            internalOrderSequence: row.internalOrderSequence
          };
        });
      },

      getHistoricalOrderByIdCompat: async function(orderId: string) {
        var row = await this.getOrderHistoryByOrderId(orderId);
        if (!row) return null;
        var items = await listStoreAll(STORE_ORDER_HISTORY_ITEMS, 'by_historyId', row.historyId);
        var events = await this.listOrderEvents(orderId);
        var payments = await this.listPaymentHistory(orderId);

        return {
          id: row.orderId,
          orderNumber: row.displayOrderNumber,
          number: row.displayOrderNumber,
          orderType: row.orderType,
          status: row.orderStatus,
          paymentStatus: row.paymentStatus,
          deliveryStatus: row.deliveryStatus || null,
          assignedDriverId: row.assignedDriverId || null,
          assignedAt: row.assignedAt || null,
          outForDeliveryAt: row.outForDeliveryAt || null,
          deliveredAt: row.deliveredAt || null,
          returnedAt: row.returnedAt || null,
          deliveryCanceledAt: row.deliveryCanceledAt || null,
          paid: row.paymentStatus === 'paid' || row.amountPaidCents >= row.totalCents,
          orderSource: row.sourceSnapshot && row.sourceSnapshot.orderSource || '',
          timingType: row.sourceSnapshot && row.sourceSnapshot.timingType || 'asap',
          asapTime: row.sourceSnapshot && row.sourceSnapshot.asapTime || null,
          futureDateTime: row.sourceSnapshot && row.sourceSnapshot.futureDateTime || null,
          orderSpecialInstructions: row.sourceSnapshot && row.sourceSnapshot.orderSpecialInstructions || '',
          customerSnapshot: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customerInfo: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customer: row.sourceSnapshot && row.sourceSnapshot.customer || {
            name: row.storedDisplayName,
            phone: row.storedPhone,
            address1: row.storedAddressSummary
          },
          customerName: row.storedDisplayName,
          subtotal: fromIntCents(row.subtotalCents),
          tax: fromIntCents(row.taxCents),
          tip: fromIntCents(row.tipCents),
          tipCents: Number(row.tipCents || 0),
          total: fromIntCents(row.totalCents),
          createdTimestamp: row.createdAt,
          updatedTimestamp: row.updatedAt,
          paymentMethodSummary: row.sourceSnapshot && row.sourceSnapshot.paymentMethodSummary || '',
          paymentLines: payments.map(function(payment: any) {
            return {
              paymentType: payment.paymentType,
              amount: fromIntCents(payment.baseAmountCents),
              baseAmount: fromIntCents(payment.baseAmountCents),
              tipAmount: fromIntCents(payment.tipAmountCents),
              cardBrand: payment.cardBrand,
              lastFour: payment.cardLastFour,
              provider: payment.provider,
              providerTransactionReference: payment.providerTransactionReference,
              paymentId: payment.paymentId,
              paidAt: payment.paidAt
            };
          }),
          lines: items.map(function(item: any) {
            return {
              lineId: item.historyItemId,
              itemId: item.sourceItemId,
              name: item.itemName,
              qty: item.quantity,
              price: fromIntCents(item.unitPriceCents),
              size: item.sizeName,
              specialInstruction: item.instructions,
              mods: item.modifierSummary
                ? item.modifierSummary.split(',').map(function(modName: string) {
                    return { optionName: String(modName || '').trim() };
                  }).filter(function(mod: any) { return mod.optionName; })
                : []
            };
          }),
          auditEvents: events.map(function(event: any) {
            return {
              event: toReadableEventLabel(event.eventType),
              eventType: event.eventType,
              timestamp: event.eventTimestamp,
              employeeShortName: event.employeeShortName || event.employeeId || 'System'
            };
          }),
          businessDate: row.businessDate,
          stationNumber: row.stationId,
          syncStatus: row.syncStatus,
          syncAttempts: row.syncAttempts,
          lastSyncError: row.lastSyncError,
          lastSyncedAt: row.lastSyncedAt,
          historyId: row.historyId,
          internalOrderSequence: row.internalOrderSequence
        };
      },

      __debugHistoryStores: function() {
        return {
          dbName: dbName,
          dbVersion: dbVersion,
          stores: [STORE_KV, STORE_META, STORE_ORDER_HISTORY, STORE_ORDER_HISTORY_ITEMS, STORE_ORDER_EVENTS, STORE_PAYMENT_HISTORY, STORE_SPLIT_PAYMENT_PLAN, STORE_SPLIT_PAYMENT_PORTION, STORE_DELIVERY_SETTINGS, STORE_DELIVERY_DRIVERS, STORE_DRIVER_SHIFTS, STORE_DRIVER_SETTLEMENTS, STORE_DELIVERY_EVENTS, STORE_PRINTER_SETTINGS, STORE_PRINT_JOB_REFS, STORE_POS_PRINTER_CONFIGS, STORE_PRINTER_ROUTING_RULES, STORE_LOCAL_PRINT_BATCHES],
          legacyOrdersKey: legacyOrdersKey,
          migrationMetaKey: LEGACY_IMPORT_META_KEY
        };
      },

      __debugReimportLegacy: function() {
        historyBootPromise = null;
        return ensureHistoryPersistenceReady(true);
      },

      getLegacyIndex: function() {
        return {
          catsById: Object.fromEntries(Array.from<any>(this.indexes.categoriesById.entries())),
          itemMods: this.indexes.itemMods,
          groupsById: this.indexes.groupsById,
          optsByGroup: this.indexes.optsByGroup,
          indexMs: this.indexes.indexMs
        };
      }
    };
  }

  global.LilposRuntime = {
    buildLilposRuntimePackageFromLegacy: buildLilposRuntimePackageFromLegacy,
    createLilposDataService: createLilposDataService
  };
})(window);
