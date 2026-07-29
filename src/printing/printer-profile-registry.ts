/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  var CONNECTION_TYPES: PrinterConnectionTypeDefinition[] = [
    { id: 'network_printer', label: 'Network Printer', implemented: true },
    { id: 'android_quickprinter', label: 'Android App / QuickPrinter', implemented: false },
    { id: 'bluetooth_escpos', label: 'Bluetooth ESC/POS', implemented: false },
    { id: 'windows_printer', label: 'Windows Printer', implemented: false },
    { id: 'usb_serial', label: 'USB / Serial', implemented: false }
  ];

  var PRINT_MODES: PrinterPrintModeDefinition[] = [
    {
      id: 'raw_escpos',
      label: 'Raw ESC/POS',
      connectionTypes: ['network_printer'],
      implemented: true,
      payloadType: 'escpos_raw_base64',
      transport: 'tcp_9100'
    },
    {
      id: 'epson_epos_xml',
      label: 'Epson ePOS XML',
      connectionTypes: ['network_printer'],
      implemented: false,
      payloadType: 'epos_xml',
      transport: 'tcp_9100'
    },
    {
      id: 'android_quickprinter_intent',
      label: 'Android QuickPrinter Intent',
      connectionTypes: ['android_quickprinter'],
      implemented: false,
      payloadType: 'plain_text'
    }
  ];

  var PROFILE_CAPABILITIES: PrinterProfileCapabilities[] = [
    {
      id: 'generic_escpos_thermal',
      label: 'Generic ESC/POS Thermal',
      description: 'General thermal receipt profile for ESC/POS printers.',
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
    },
    {
      id: 'epson_tm_t20',
      label: 'Epson TM-T20 Series',
      description: 'Thermal Epson profile for common front-counter receipt printers.',
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
    },
    {
      id: 'epson_tm_t88',
      label: 'Epson TM-T88 Series',
      description: 'Thermal Epson profile for high-volume receipt lanes.',
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
    },
    {
      id: 'epson_tm_m30',
      label: 'Epson TM-M30 Series',
      description: 'Compact thermal Epson profile for front-counter receipt printing.',
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
    },
    {
      id: 'epson_tm_u220',
      label: 'Epson TM-U220 Impact',
      description: 'Designed for kitchen printing. Impact printer with model-dependent cutter support.',
      technology: 'impact',
      supportsFontA: true,
      supportsFontB: false,
      supportsDoubleWidth: true,
      supportsDoubleHeight: true,
      supportsBold: true,
      supportsUnderline: true,
      supportsReverse: false,
      supportsCut: false,
      supportsDrawerPulse: true,
      supportsRasterLogo: false,
      defaultPaperWidth: '76mm',
      defaultCharactersPerLine: 40
    },
    {
      id: 'star_escpos',
      label: 'Star ESC/POS Compatible',
      description: 'Star-compatible ESC/POS profile for thermal ticket workflows.',
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
    },
    {
      id: 'bixolon_escpos',
      label: 'Bixolon ESC/POS Compatible',
      description: 'Bixolon-compatible thermal ESC/POS profile.',
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
    },
    {
      id: 'custom_escpos',
      label: 'Custom ESC/POS',
      description: 'Custom ESC/POS profile with conservative defaults.',
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
    }
  ];

  function normalizeConnectionTypeId(value: any): PrinterConnectionTypeId {
    var raw = String(value || '').trim().toLowerCase();
    if (raw === 'network_printer' || raw === 'network') return 'network_printer';
    if (raw === 'android_quickprinter' || raw === 'android') return 'android_quickprinter';
    if (raw === 'bluetooth_escpos' || raw === 'bluetooth') return 'bluetooth_escpos';
    if (raw === 'windows_printer' || raw === 'windows') return 'windows_printer';
    if (raw === 'usb_serial' || raw === 'usb') return 'usb_serial';
    return 'network_printer';
  }

  function normalizeProfileId(value: any): string {
    var raw = String(value || '').trim().toLowerCase();
    if (!raw) return 'generic_escpos_thermal';
    if (raw === 'generic_escpos' || raw === 'epson_escpos' || raw === 'epson_thermal') return 'generic_escpos_thermal';
    if (raw === 'star_tsp100') return 'star_escpos';
    if (raw === 'bixolon') return 'bixolon_escpos';
    if (raw === 'tm_u220' || raw === 'u220' || raw === 'epson_u220') return 'epson_tm_u220';
    return raw;
  }

  function resolveProfileCapabilities(profileId: any): PrinterProfileCapabilities {
    var normalized = normalizeProfileId(profileId);
    var found = PROFILE_CAPABILITIES.find(function(profile) { return profile.id === normalized; });
    return found || PROFILE_CAPABILITIES[0];
  }

  function connectionTypeById(connectionTypeId: any): PrinterConnectionTypeDefinition {
    var normalized = normalizeConnectionTypeId(connectionTypeId);
    return CONNECTION_TYPES.find(function(row) { return row.id === normalized; }) || CONNECTION_TYPES[0];
  }

  function printModesForConnection(connectionTypeId: any): PrinterPrintModeDefinition[] {
    var normalized = normalizeConnectionTypeId(connectionTypeId);
    return PRINT_MODES.filter(function(mode) {
      return Array.isArray(mode.connectionTypes) && mode.connectionTypes.indexOf(normalized) >= 0;
    });
  }

  function normalizePrintModeId(modeId: any, connectionTypeId: any): string {
    var normalizedConnection = normalizeConnectionTypeId(connectionTypeId);
    var available = printModesForConnection(normalizedConnection);
    if (!available.length) return 'raw_escpos';
    var raw = String(modeId || '').trim().toLowerCase();
    var found = available.find(function(mode) { return mode.id === raw; });
    if (found) return found.id;
    return available[0].id;
  }

  function resolvePrintMode(modeId: any, connectionTypeId: any): PrinterPrintModeDefinition {
    var normalizedMode = normalizePrintModeId(modeId, connectionTypeId);
    var normalizedConnection = normalizeConnectionTypeId(connectionTypeId);
    var list = printModesForConnection(normalizedConnection);
    return list.find(function(mode) { return mode.id === normalizedMode; }) || list[0] || PRINT_MODES[0];
  }

  function supportsConnectionType(connectionTypeId: any): boolean {
    return connectionTypeById(connectionTypeId).implemented === true;
  }

  function supportsPrintMode(modeId: any, connectionTypeId: any): boolean {
    var mode = resolvePrintMode(modeId, connectionTypeId);
    return mode.implemented === true;
  }

  function effectiveTransport(connectionTypeId: any, modeId: any): LilPrintTransport {
    var mode = resolvePrintMode(modeId, connectionTypeId);
    return String(mode.transport || 'tcp_9100') as LilPrintTransport;
  }

  function parseOverride(value: any): boolean | null {
    if (value === true || String(value).toLowerCase() === 'yes') return true;
    if (value === false || String(value).toLowerCase() === 'no') return false;
    return null;
  }

  function applyCapabilityOverrides(base: PrinterProfileCapabilities, overrides?: any): PrinterProfileCapabilities {
    var cutter = parseOverride(overrides && overrides.cutterInstalled);
    var drawer = parseOverride(overrides && overrides.cashDrawerConnected);
    var raster = parseOverride(overrides && overrides.rasterImageSupport);

    return Object.assign({}, base, {
      supportsCut: cutter == null ? base.supportsCut : cutter,
      supportsDrawerPulse: drawer == null ? base.supportsDrawerPulse : drawer,
      supportsRasterLogo: raster == null ? base.supportsRasterLogo : raster
    });
  }

  global.LilposPrinterProfiles = {
    connectionTypes: CONNECTION_TYPES,
    printModes: PRINT_MODES,
    profileCapabilities: PROFILE_CAPABILITIES,
    normalizeConnectionTypeId: normalizeConnectionTypeId,
    normalizePrintModeId: normalizePrintModeId,
    normalizeProfileId: normalizeProfileId,
    connectionTypeById: connectionTypeById,
    printModesForConnection: printModesForConnection,
    resolvePrintMode: resolvePrintMode,
    resolveProfileCapabilities: resolveProfileCapabilities,
    supportsConnectionType: supportsConnectionType,
    supportsPrintMode: supportsPrintMode,
    effectiveTransport: effectiveTransport,
    applyCapabilityOverrides: applyCapabilityOverrides
  };
})(window);
