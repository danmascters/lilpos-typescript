/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function clamp(value: any, min: number, max: number, fallback: number): number {
    var n = Number(value);
    if (!Number.isFinite(n)) n = fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function normalizeUrl(value: any, fallback: string): string {
    var raw = String(value || fallback || '').trim();
    if (!raw) return fallback;
    if (!/^https?:\/\//i.test(raw)) return fallback;
    return raw.replace(/\/$/, '');
  }

  function defaultPrinterSettings(input?: any): PrinterSettingsRecord {
    var source = input || {};
    var paperWidth: LilPosPaperWidth = String(source.paperWidth || '80mm') === '58mm' ? '58mm' : '80mm';
    var charactersPerLine = clamp(source.charactersPerLine, 20, 64, paperWidth === '58mm' ? 32 : 48);
    var now = String(source.updatedAt || new Date().toISOString());

    return {
      id: String(source.id || ''),
      merchantId: String(source.merchantId || 'local-merchant'),
      locationId: String(source.locationId || 'local-location'),
      stationId: String(source.stationId || '1'),
      agentHttpsUrl: normalizeUrl(source.agentHttpsUrl, 'https://localhost:3031'),
      agentHttpUrl: normalizeUrl(source.agentHttpUrl, 'http://localhost:3030'),
      preferHttps: source.preferHttps !== false,
      receiptPrintingEnabled: source.receiptPrintingEnabled !== false,
      promptForReceiptAfterSale: source.promptForReceiptAfterSale !== false,
      autoPrintReceiptAfterSale: source.autoPrintReceiptAfterSale === true,
      defaultReceiptPrinterId: String(source.defaultReceiptPrinterId || ''),
      defaultKitchenPrinterId: String(source.defaultKitchenPrinterId || ''),
      receiptPrinterId: String(source.receiptPrinterId || ''),
      receiptPrinterName: String(source.receiptPrinterName || ''),
      receiptPrinterIp: String(source.receiptPrinterIp || ''),
      receiptPrinterPort: clamp(source.receiptPrinterPort, 1, 65535, 9100),
      receiptPrinterProfile: String(source.receiptPrinterProfile || ''),
      receiptPrinterTransport: 'tcp_9100',
      paperWidth: paperWidth,
      charactersPerLine: charactersPerLine,
      leftMarginChars: clamp(source.leftMarginChars, 0, 8, 0),
      rightMarginChars: clamp(source.rightMarginChars, 0, 8, 0),
      fontFamilyMode: String(source.fontFamilyMode || 'font_a') === 'font_b' ? 'font_b' : 'font_a',
      defaultTextScale: String(source.defaultTextScale || 'normal') as LilPosTextScale,
      headerTextScale: String(source.headerTextScale || 'double_width') as LilPosTextScale,
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
      feedLinesBeforeCut: clamp(source.feedLinesBeforeCut, 0, 10, 4),
      cutPaperAfterReceipt: source.cutPaperAfterReceipt !== false,
      openCashDrawerWithCashSale: source.openCashDrawerWithCashSale === true,
      kitchenPaperWidth: String(source.kitchenPaperWidth || source.paperWidth || '80mm') === '58mm' ? '58mm' : '80mm',
      kitchenCharactersPerLine: clamp(source.kitchenCharactersPerLine, 20, 64, paperWidth === '58mm' ? 32 : 48),
      kitchenOrderNumberScale: String(source.kitchenOrderNumberScale || 'double_size'),
      kitchenItemTextScale: String(source.kitchenItemTextScale || 'normal'),
      kitchenModifierTextScale: String(source.kitchenModifierTextScale || 'normal'),
      kitchenShowPromisedTime: source.kitchenShowPromisedTime !== false,
      kitchenShowEmployeeName: source.kitchenShowEmployeeName !== false,
      kitchenShowStationName: source.kitchenShowStationName !== false,
      kitchenShowOrderNotes: source.kitchenShowOrderNotes !== false,
      kitchenShowItemNotes: source.kitchenShowItemNotes !== false,
      copies: clamp(source.copies, 1, 20, 1),
      priority: (['low', 'normal', 'high'].indexOf(String(source.priority || 'normal')) >= 0 ? String(source.priority || 'normal') : 'normal') as LilPrintPriority,
      retryEnabled: source.retryEnabled !== false,
      maxAttempts: clamp(source.maxAttempts, 1, 20, 5),
      migratedToMultiPrinterV2At: String(source.migratedToMultiPrinterV2At || ''),
      createdAt: String(source.createdAt || now),
      updatedAt: now,
      syncStatus: (source.syncStatus || 'LOCAL_ONLY') as LilPosSyncStatus
    };
  }

  function validatePrinterSettings(input: PrinterSettingsRecord): string[] {
    var settings = defaultPrinterSettings(input);
    var errors: string[] = [];

    if (!/^https?:\/\//i.test(settings.agentHttpsUrl)) errors.push('HTTPS agent URL must start with http:// or https://');
    if (!/^https?:\/\//i.test(settings.agentHttpUrl)) errors.push('HTTP fallback URL must start with http:// or https://');
    if (settings.charactersPerLine < 20 || settings.charactersPerLine > 64) errors.push('Characters per line must be 20-64.');
    if (settings.receiptPrinterPort < 1 || settings.receiptPrinterPort > 65535) errors.push('Printer port must be 1-65535.');
    if (settings.feedLinesBeforeCut < 0 || settings.feedLinesBeforeCut > 10) errors.push('Feed lines before cut must be 0-10.');
    if (settings.copies < 1 || settings.copies > 20) errors.push('Copies must be 1-20.');
    if (settings.maxAttempts < 1 || settings.maxAttempts > 20) errors.push('Max attempts must be 1-20.');
    if (settings.receiptPrintingEnabled && !settings.defaultReceiptPrinterId && !settings.receiptPrinterId) errors.push('A default receipt printer is required when receipt printing is enabled.');
    if (settings.autoPrintReceiptAfterSale && !settings.defaultReceiptPrinterId && !settings.receiptPrinterId) errors.push('Auto-print requires a selected receipt printer.');

    return errors;
  }

  function normalizePrinterSettings(input: any): PrinterSettingsRecord {
    return defaultPrinterSettings(input);
  }

  global.LilposPrinterSettingsService = {
    defaults: defaultPrinterSettings,
    normalize: normalizePrinterSettings,
    validate: validatePrinterSettings
  };
})(window);
