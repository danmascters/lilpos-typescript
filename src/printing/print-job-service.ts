/// <reference path="./printer-types.ts" />
/// <reference path="./lilprint-discovery.ts" />
/// <reference path="./lilprint-client.ts" />
/// <reference path="./receipt-renderer.ts" />
/// <reference path="./printer-routing-engine.ts" />
/// <reference path="./printer-profile-registry.ts" />

(function(global: any) {
  'use strict';

  function stableHash(input: string): string {
    var text = String(input || '');
    var hash = 2166136261;
    for (var i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return Math.abs(hash >>> 0).toString(16);
  }

  function nowIso(): string {
    return new Date().toISOString();
  }

  function normalizeStatus(value: any): LilPrintJobStatus {
    var raw = String(value || '').toUpperCase();
    if (raw === 'SENDING') return 'SENDING';
    if (raw === 'TRANSMITTED') return 'TRANSMITTED';
    if (raw === 'RETRY_WAIT') return 'RETRY_WAIT';
    if (raw === 'FAILED_FINAL') return 'FAILED_FINAL';
    if (raw === 'CANCELED') return 'CANCELED';
    if (raw === 'MANUALLY_RESOLVED') return 'MANUALLY_RESOLVED';
    return 'QUEUED';
  }

  function defaultReceiptDestination(settings: PrinterSettingsRecord): any {
    var printerId = String(settings.defaultReceiptPrinterId || settings.receiptPrinterId || '').trim();
    if (!printerId) return null;
    return {
      ruleId: 'legacy_default_receipt',
      printerId: printerId,
      ticketType: 'customer_receipt',
      matchedLineIds: [],
      ticketContentMode: 'full',
      copies: Math.max(1, Number(settings.copies || 1)),
      priority: (settings.priority || 'normal') as LilPrintPriority,
      required: true,
      includeCustomerName: true,
      includeCustomerPhone: false,
      includeDeliveryAddress: false,
      includeCustomerNotes: false
    };
  }

  function buildOriginalIdempotencyKey(context: any): string {
    return [
      'lilpos',
      context.merchantId,
      context.locationId,
      context.orderId,
      context.ticketType,
      context.printerId,
      'original'
    ].join(':');
  }

  function buildReprintIdempotencyKey(context: any): string {
    return [
      'lilpos',
      context.merchantId,
      context.locationId,
      context.orderId,
      context.ticketType,
      context.printerId,
      'reprint',
      context.reprintId
    ].join(':');
  }

  function buildReceiptCopyIdempotencyKey(context: any): string {
    return [
      'lilpos',
      context.merchantId,
      context.locationId,
      context.orderId,
      'receipt_copy',
      context.stationId,
      context.uniquePrintActionId
    ].join(':');
  }

  function buildJobId(idempotencyKey: string): string {
    return 'lilpos_job_' + stableHash(idempotencyKey);
  }

  function printerRequestFromConfig(printer: any): LilPrintRequestPrinter {
    var connectionType = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeConnectionTypeId
      ? global.LilposPrinterProfiles.normalizeConnectionTypeId(printer && printer.connectionType)
      : 'network_printer';
    var printMode = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizePrintModeId
      ? global.LilposPrinterProfiles.normalizePrintModeId(printer && printer.printMode, connectionType)
      : 'raw_escpos';
    var transport = global.LilposPrinterProfiles && global.LilposPrinterProfiles.effectiveTransport
      ? global.LilposPrinterProfiles.effectiveTransport(connectionType, printMode)
      : 'tcp_9100';
    return {
      id: String(printer && printer.id || ''),
      name: String(printer && printer.name || 'Printer'),
      ip: String(printer && printer.ip || '127.0.0.1'),
      port: Number(printer && printer.port || 9100),
      profile: String(printer && printer.profile || 'generic_escpos_thermal'),
      connectionType: connectionType,
      printMode: printMode,
      transport: transport
    };
  }

  function resolvePayloadTypeForPrinter(printer: any): LilPrintJobPayloadType {
    var connectionType = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeConnectionTypeId
      ? global.LilposPrinterProfiles.normalizeConnectionTypeId(printer && printer.connectionType)
      : 'network_printer';
    var mode = global.LilposPrinterProfiles && global.LilposPrinterProfiles.resolvePrintMode
      ? global.LilposPrinterProfiles.resolvePrintMode(printer && printer.printMode, connectionType)
      : { id: 'raw_escpos', payloadType: 'escpos_raw_base64', implemented: true };
    if (mode && mode.implemented === true) return mode.payloadType || 'escpos_raw_base64';
    return 'escpos_raw_base64';
  }

  function canPrintWithConfig(printer: any): { ok: boolean; message?: string } {
    var connectionType = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeConnectionTypeId
      ? global.LilposPrinterProfiles.normalizeConnectionTypeId(printer && printer.connectionType)
      : 'network_printer';
    var printMode = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizePrintModeId
      ? global.LilposPrinterProfiles.normalizePrintModeId(printer && printer.printMode, connectionType)
      : 'raw_escpos';
    var connectionSupported = global.LilposPrinterProfiles && global.LilposPrinterProfiles.supportsConnectionType
      ? global.LilposPrinterProfiles.supportsConnectionType(connectionType)
      : connectionType === 'network_printer';
    var modeSupported = global.LilposPrinterProfiles && global.LilposPrinterProfiles.supportsPrintMode
      ? global.LilposPrinterProfiles.supportsPrintMode(printMode, connectionType)
      : printMode === 'raw_escpos';

    if (!connectionSupported) {
      return { ok: false, message: 'Selected connection type is not supported in this build.' };
    }
    if (!modeSupported) {
      return { ok: false, message: 'Selected print mode is not supported in this build.' };
    }
    return { ok: true };
  }

  function createPrintJobService(input?: any) {
    var deps = input || {};
    var dataService = deps.dataService;

    async function resolveSettings(scope?: any): Promise<PrinterSettingsRecord> {
      if (!dataService || typeof dataService.loadPrinterSettings !== 'function') {
        return global.LilposPrinterSettingsService.defaults(scope || {});
      }
      var loaded = await dataService.loadPrinterSettings(scope || {});
      return global.LilposPrinterSettingsService.normalize(loaded || scope || {});
    }

    async function discoverClient(settings: PrinterSettingsRecord): Promise<any> {
      var discovery = await global.LilposLilPrintDiscovery.discoverLilPrintAgent({
        httpsUrl: settings.agentHttpsUrl,
        httpUrl: settings.agentHttpUrl,
        preferHttps: settings.preferHttps,
        fetchImpl: deps.fetchImpl || global.fetch,
        timeoutMs: 3000
      });
      if (!discovery.ok) return { ok: false, discovery: discovery, client: null };
      return {
        ok: true,
        discovery: discovery,
        client: global.LilposLilPrintClient.createLilPrintClient({
          baseUrl: discovery.baseUrl,
          fetchImpl: deps.fetchImpl || global.fetch,
          timeoutMs: 8000
        })
      };
    }

    async function listEnabledPrinters(scope: any): Promise<PosPrinterConfig[]> {
      if (!dataService || !dataService.listPosPrinterConfigs) return [];
      var rows = await dataService.listPosPrinterConfigs(Object.assign({ includeDisabled: false }, scope || {}));
      return Array.isArray(rows) ? rows : [];
    }

    async function listEnabledRules(scope: any): Promise<PrinterRoutingRule[]> {
      if (!dataService || !dataService.listPrinterRoutingRules) return [];
      var rows = await dataService.listPrinterRoutingRules(Object.assign({ includeDisabled: false }, scope || {}));
      return Array.isArray(rows) ? rows : [];
    }

    async function legacyReceiptPrinterFromSettings(printerId: string, settings: PrinterSettingsRecord): Promise<any> {
      var id = String(printerId || '').trim();
      if (!id) return null;
      var defaultReceiptId = String(settings.defaultReceiptPrinterId || settings.receiptPrinterId || '').trim();
      if (id !== defaultReceiptId) return null;
      if (dataService && typeof dataService.getPosPrinterConfigById === 'function') {
        var existing = await dataService.getPosPrinterConfigById(id);
        if (existing) return null;
      }
      if (!String(settings.receiptPrinterIp || '').trim() || !(Number(settings.receiptPrinterPort || 0) > 0)) return null;
      return {
        id: id,
        name: String(settings.receiptPrinterName || 'Receipt Printer'),
        enabled: true,
        primaryRole: 'receipt',
        secondaryRoles: settings.openCashDrawerWithCashSale ? ['cash_drawer'] : [],
        ip: String(settings.receiptPrinterIp || ''),
        port: Number(settings.receiptPrinterPort || 9100),
        connectionType: 'network_printer',
        printMode: 'raw_escpos',
        transport: 'tcp_9100',
        profile: String(settings.receiptPrinterProfile || 'generic_escpos_thermal'),
        paperWidth: settings.paperWidth,
        charactersPerLine: settings.charactersPerLine,
        defaultCopies: settings.copies,
        retryEnabled: settings.retryEnabled !== false,
        maxAttempts: Math.max(1, Number(settings.maxAttempts || 5)),
        cutPaper: settings.cutPaperAfterReceipt,
        cashDrawerConnected: settings.openCashDrawerWithCashSale
      };
    }

    async function resolveDestinations(inputRoute: any): Promise<any[]> {
      var order = inputRoute && inputRoute.order;
      var trigger = String(inputRoute && inputRoute.trigger || 'sale_completed');
      var settings = inputRoute && inputRoute.settings;
      var suppressFallback = inputRoute && inputRoute.suppressFallback === true;
      var scope = {
        merchantId: String(inputRoute && inputRoute.merchantId || settings.merchantId || ''),
        locationId: String(inputRoute && inputRoute.locationId || settings.locationId || '')
      };
      var printers = await listEnabledPrinters(scope);
      var rules = await listEnabledRules(scope);

      if (global.LilposPrinterRoutingEngine && global.LilposPrinterRoutingEngine.evaluatePrintRoutes) {
        var routed = global.LilposPrinterRoutingEngine.evaluatePrintRoutes({
          order: order,
          trigger: trigger,
          printers: printers,
          rules: rules
        });
        if (Array.isArray(routed) && routed.length) return routed;
      }

      if (suppressFallback) return [];
      var fallback = defaultReceiptDestination(settings);
      return fallback ? [fallback] : [];
    }

    async function persistJobReference(record: any): Promise<any> {
      if (!dataService || typeof dataService.saveLocalPrintJobReference !== 'function') return record;
      return dataService.saveLocalPrintJobReference(record);
    }

    async function updateJobReference(recordId: string, patch: any): Promise<any> {
      if (!dataService || typeof dataService.updateLocalPrintJobReference !== 'function') return null;
      return dataService.updateLocalPrintJobReference(recordId, patch);
    }

    async function submitJob(request: LilPrintJobCreateRequest, options?: any): Promise<any> {
      var submitResult = await options.client.submitPrintJob(request);
      if (!submitResult.ok) {
        return {
          ok: false,
          status: 0,
          errorMessage: submitResult.errorMessage || 'Unable to submit print job.',
          requestId: submitResult.requestId || '',
          remote: submitResult.data || null
        };
      }
      return {
        ok: true,
        status: submitResult.status,
        requestId: submitResult.requestId || '',
        remote: submitResult.data || null
      };
    }

    async function submitCustomerReceipt(inputReceipt: any): Promise<any> {
      var order = inputReceipt && inputReceipt.order;
      if (!order) return { ok: false, message: 'Order snapshot is required.' };

      var settings = await resolveSettings(inputReceipt && inputReceipt.settingsScope);
      if (inputReceipt && inputReceipt.bypassReceiptPrintingEnabled !== true && !settings.receiptPrintingEnabled) return { ok: false, skipped: true, message: 'Receipt printing is disabled.' };

      var merchantId = String((inputReceipt && inputReceipt.merchantId) || (dataService && dataService.getMerchantId && dataService.getMerchantId()) || settings.merchantId || 'local-merchant');
      var locationId = String((inputReceipt && inputReceipt.locationId) || (dataService && dataService.getLocationId && dataService.getLocationId()) || settings.locationId || 'local-location');
      var stationId = String((inputReceipt && inputReceipt.stationId) || (dataService && dataService.getStationNumber && dataService.getStationNumber()) || settings.stationId || '1');
      var businessDayId = String((inputReceipt && inputReceipt.businessDayId) || (dataService && dataService.getBusinessDate && dataService.getBusinessDate()) || order.businessDate || nowIso().slice(0, 10));
      var orderId = String(order.orderId || order.id || '').trim();
      if (!orderId) return { ok: false, message: 'Order id is required for receipt printing.' };

      var isReprint = inputReceipt && inputReceipt.isReprint === true;
      var reprintId = String(inputReceipt && inputReceipt.reprintId || ('r' + Date.now()));
      var requestedFrom = String(inputReceipt && inputReceipt.requestedFrom || '').trim() || (isReprint ? 'order_number_dialog' : 'sale_completed');
      var routeTrigger = String(inputReceipt && inputReceipt.trigger || (isReprint ? 'manual_print' : 'sale_completed'));
      var requestedFromExistingOrder = requestedFrom === 'existing_order';
      var explicitStationPrinterId = String(inputReceipt && (inputReceipt.forceStationPrinterId || inputReceipt.stationPrinterId) || '').trim();
      var uniquePrintActionId = String(inputReceipt && inputReceipt.uniquePrintActionId || reprintId || ('copy_' + Date.now()));

      var discoveryResult = await discoverClient(settings);
      if (!discoveryResult.ok) {
        return { ok: false, message: 'LilPrint Agent is not available.', discovery: discoveryResult.discovery };
      }

      var destinations: any[] = [];
      if (requestedFromExistingOrder || explicitStationPrinterId) {
        var stationPrinterId = explicitStationPrinterId;
        if (!stationPrinterId && dataService && typeof dataService.resolveStationPrinter === 'function') {
        var resolved = await dataService.resolveStationPrinter({
            merchantId: merchantId,
            locationId: locationId,
            stationId: stationId
          });
          stationPrinterId = String(resolved && resolved.id || '');
        }
        if (!stationPrinterId) {
          return { ok: false, message: 'No Station Printer is assigned to this workstation.' };
        }
        destinations = [{
          ruleId: 'station_printer_assignment',
          printerId: stationPrinterId,
          ticketType: 'customer_receipt',
          matchedLineIds: [],
          ticketContentMode: 'full',
          copies: Math.max(1, Number(inputReceipt && inputReceipt.copies || 1)),
          priority: (inputReceipt && inputReceipt.priority) || 'normal',
          required: true,
          includeCustomerName: true,
          includeCustomerPhone: true,
          includeDeliveryAddress: true,
          includeCustomerNotes: true
        }];
      } else {
        destinations = await resolveDestinations({
          order: order,
          trigger: routeTrigger,
          merchantId: merchantId,
          locationId: locationId,
          settings: settings,
          suppressFallback: inputReceipt && inputReceipt.suppressDefaultReceiptFallback === true
        });
      }

      if (!destinations.length) {
        return { ok: false, message: 'No matching receipt destination rule was found.' };
      }

      var printers = await listEnabledPrinters({ merchantId: merchantId, locationId: locationId, includeDisabled: false });
      var printersById: any = {};
      printers.forEach(function(printer: any) { printersById[String(printer.id)] = printer; });

      var batch = dataService && dataService.saveLocalPrintBatch
        ? await dataService.saveLocalPrintBatch({
            orderId: orderId,
            trigger: routeTrigger,
            requestedAt: nowIso(),
            requiredJobCount: destinations.filter(function(destination: any) { return destination.required !== false; }).length,
            optionalJobCount: destinations.filter(function(destination: any) { return destination.required === false; }).length,
            overallStatus: 'SUBMITTING'
          })
        : null;

      var jobs: any[] = [];
      for (var idx = 0; idx < destinations.length; idx += 1) {
        var destination = destinations[idx] || {};
        var destinationPrinterId = String(destination.printerId || '');
        var printerConfig = printersById[destinationPrinterId] || await legacyReceiptPrinterFromSettings(destinationPrinterId, settings);
        if (!printerConfig) {
          jobs.push({ ok: false, printerId: destinationPrinterId, message: 'Destination printer is disabled or unavailable.' });
          continue;
        }

        var ticketType = String(destination.ticketType || 'customer_receipt');
        var printability = canPrintWithConfig(printerConfig);
        if (!printability.ok) {
          jobs.push({ ok: false, printerId: String(destination.printerId || ''), message: printability.message || 'Printer configuration is not supported.' });
          continue;
        }
        var idempotencyKey = requestedFromExistingOrder
          ? buildReceiptCopyIdempotencyKey({
              merchantId: merchantId,
              locationId: locationId,
              orderId: orderId,
              stationId: stationId,
              uniquePrintActionId: uniquePrintActionId
            })
          : isReprint
          ? buildReprintIdempotencyKey({ merchantId: merchantId, locationId: locationId, orderId: orderId, ticketType: ticketType, printerId: printerConfig.id, reprintId: reprintId })
          : buildOriginalIdempotencyKey({ merchantId: merchantId, locationId: locationId, orderId: orderId, ticketType: ticketType, printerId: printerConfig.id });

        var existing = (!isReprint && dataService && dataService.findLocalPrintJobReferenceByIdempotencyKey)
          ? await dataService.findLocalPrintJobReferenceByIdempotencyKey(idempotencyKey)
          : null;
        var jobId = existing && existing.printJobId ? String(existing.printJobId) : buildJobId(idempotencyKey);

        var rendered = global.LilposReceiptRenderer.renderCustomerReceiptEscposBase64({
          settings: Object.assign({}, settings, {
            paperWidth: printerConfig.paperWidth || settings.paperWidth,
            charactersPerLine: Number(printerConfig.charactersPerLine || settings.charactersPerLine || 48),
            copies: Number(destination.copies || printerConfig.defaultCopies || settings.copies || 1),
            priority: destination.priority || settings.priority || 'normal'
          }),
          printer: printerConfig,
          order: order,
          isReprint: isReprint,
          changeDue: Number(inputReceipt && inputReceipt.changeDue || 0),
          allowDrawerPulse: inputReceipt && inputReceipt.allowDrawerPulse === true,
          matchedLineIds: destination.matchedLineIds || []
        });

        var printer = printerRequestFromConfig(printerConfig);
        var request: LilPrintJobCreateRequest = {
          appId: 'lilpos',
          merchantId: merchantId,
          locationId: locationId,
          jobId: jobId,
          idempotencyKey: idempotencyKey,
          printer: printer,
          payload: { type: resolvePayloadTypeForPrinter(printerConfig), data: rendered.base64 },
          metadata: {
            orderId: orderId,
            batchId: String(batch && batch.id || inputReceipt && inputReceipt.batchId || ''),
            stationId: stationId,
            businessDayId: businessDayId,
            jobType: requestedFromExistingOrder ? 'customer_receipt_copy' : (ticketType === 'customer_receipt' ? 'customer_receipt' : 'printer_test'),
            printerRole: requestedFromExistingOrder ? 'station_printer' : String(printerConfig.primaryRole || 'receipt') as any,
            source: 'lilpos',
            requestedFrom: requestedFrom,
            isReprint: isReprint,
            originalPrintJobId: String(inputReceipt && inputReceipt.originalPrintJobId || '')
          },
          options: {
            copies: Math.max(1, Number(destination.copies || printerConfig.defaultCopies || settings.copies || 1)),
            priority: (destination.priority || settings.priority || 'normal') as LilPrintPriority,
            retryEnabled: printerConfig.retryEnabled !== false,
            maxAttempts: Math.max(1, Number(printerConfig.maxAttempts || settings.maxAttempts || 5))
          }
        };

        var localRef = await persistJobReference({
          id: existing && existing.id ? existing.id : undefined,
          orderId: orderId,
          batchId: String(batch && batch.id || inputReceipt && inputReceipt.batchId || ''),
          printJobId: jobId,
          idempotencyKey: idempotencyKey,
          jobType: requestedFromExistingOrder ? 'customer_receipt_copy' : (ticketType === 'customer_receipt' ? 'customer_receipt' : 'printer_test'),
          printerRole: requestedFromExistingOrder ? 'station_printer' : String(printerConfig.primaryRole || 'receipt'),
          printerId: String(printer.id),
          requestedAt: nowIso(),
          lastKnownStatus: 'QUEUED',
          lastStatusAt: nowIso(),
          originalPrintJobId: String(inputReceipt && inputReceipt.originalPrintJobId || ''),
          isReprint: isReprint
        });

        var submitted = await submitJob(request, { client: discoveryResult.client });
        if (!submitted.ok) {
          if (localRef && localRef.id) {
            await updateJobReference(localRef.id, {
              lastKnownStatus: 'FAILED_FINAL',
              lastStatusAt: nowIso(),
              lastErrorMessage: submitted.errorMessage || 'Unable to submit print job.'
            });
          }
          jobs.push({
            ok: false,
            printerId: printer.id,
            printJobId: jobId,
            localRef: localRef,
            message: submitted.errorMessage || 'Unable to submit print job.'
          });
          continue;
        }

        var statusRaw = submitted.remote && (submitted.remote.status || submitted.remote.jobStatus) || 'QUEUED';
        var status = normalizeStatus(statusRaw);
        if (localRef && localRef.id) {
          await updateJobReference(localRef.id, {
            lastKnownStatus: status,
            lastStatusAt: nowIso(),
            lastErrorMessage: ''
          });
        }

        jobs.push({
          ok: true,
          printerId: printer.id,
          printJobId: jobId,
          idempotencyKey: idempotencyKey,
          status: status,
          localRef: localRef,
          ticketType: ticketType
        });
      }

      var succeeded = jobs.filter(function(job) { return job.ok; });
      var failed = jobs.filter(function(job) { return !job.ok; });

      if (batch && dataService && dataService.updateLocalPrintBatch) {
        await dataService.updateLocalPrintBatch(batch.id, {
          overallStatus: failed.length
            ? (succeeded.length ? 'PRINT_ISSUE' : 'PRINT_ISSUE')
            : 'IN_PROGRESS'
        });
      }

      if (!succeeded.length) {
        return {
          ok: false,
          message: failed[0] && failed[0].message ? failed[0].message : 'Unable to submit receipt jobs.',
          jobs: jobs,
          batch: batch,
          baseUrl: discoveryResult.discovery.baseUrl
        };
      }

      var primary = succeeded[0];
      return {
        ok: true,
        message: succeeded.length > 1 ? ('Queued ' + succeeded.length + ' receipt jobs.') : 'Receipt queued.',
        requestId: '',
        localRef: primary.localRef,
        printJobId: primary.printJobId,
        idempotencyKey: primary.idempotencyKey,
        status: primary.status,
        baseUrl: discoveryResult.discovery.baseUrl,
        settings: settings,
        batch: batch,
        jobs: jobs
      };
    }

    async function submitTestReceipt(inputTest: any): Promise<any> {
      var settings = await resolveSettings(inputTest && inputTest.settingsScope);
      var discoveryResult = await discoverClient(settings);
      if (!discoveryResult.ok) {
        return { ok: false, message: 'LilPrint Agent is not available.', discovery: discoveryResult.discovery };
      }

      var allPrinters = await listEnabledPrinters({
        merchantId: settings.merchantId,
        locationId: settings.locationId,
        includeDisabled: false
      });

      var preferredPrinterId = String(inputTest && inputTest.printerId || settings.defaultReceiptPrinterId || settings.receiptPrinterId || '').trim();
      var printerConfig = allPrinters.find(function(printer: any) { return String(printer.id) === preferredPrinterId; }) || allPrinters[0] || null;
      if (!printerConfig) return { ok: false, message: 'No printer is configured for test printing.' };

      var printability = canPrintWithConfig(printerConfig);
      if (!printability.ok) return { ok: false, message: printability.message || 'Printer configuration is not supported.' };

      var merchantId = String((dataService && dataService.getMerchantId && dataService.getMerchantId()) || settings.merchantId || 'local-merchant');
      var locationId = String((dataService && dataService.getLocationId && dataService.getLocationId()) || settings.locationId || 'local-location');
      var stationId = String((dataService && dataService.getStationNumber && dataService.getStationNumber()) || settings.stationId || '1');
      var businessDayId = String((dataService && dataService.getBusinessDate && dataService.getBusinessDate()) || nowIso().slice(0, 10));
      var testId = String(Date.now());
      var idempotencyKey = ['lilpos', merchantId, locationId, 'printer_test', printerConfig.id, testId].join(':');
      var jobId = buildJobId(idempotencyKey);
      var printer = printerRequestFromConfig(printerConfig);

      var rendered = global.LilposReceiptRenderer.renderPrinterTestEscposBase64({
        settings: Object.assign({}, settings, {
          paperWidth: printerConfig.paperWidth,
          charactersPerLine: printerConfig.charactersPerLine
        }),
        printerConfig: printerConfig,
        printer: printer
      });

      var request: LilPrintJobCreateRequest = {
        appId: 'lilpos',
        merchantId: merchantId,
        locationId: locationId,
        jobId: jobId,
        idempotencyKey: idempotencyKey,
        printer: printer,
        payload: { type: resolvePayloadTypeForPrinter(printerConfig), data: rendered.base64 },
        metadata: {
          orderId: 'printer_test',
          batchId: '',
          stationId: stationId,
          businessDayId: businessDayId,
          jobType: 'printer_test',
          printerRole: String(printerConfig.primaryRole || 'receipt') as any,
          source: 'lilpos',
          requestedFrom: 'printer_settings',
          isReprint: false
        },
        options: {
          copies: 1,
          priority: 'normal',
          retryEnabled: printerConfig.retryEnabled !== false,
          maxAttempts: Math.max(1, Number(printerConfig.maxAttempts || settings.maxAttempts || 5))
        }
      };

      var localRef = await persistJobReference({
        orderId: 'printer_test',
        batchId: '',
        printJobId: jobId,
        idempotencyKey: idempotencyKey,
        jobType: 'printer_test',
        printerRole: String(printerConfig.primaryRole || 'receipt'),
        printerId: String(printer.id),
        requestedAt: nowIso(),
        lastKnownStatus: 'QUEUED',
        lastStatusAt: nowIso(),
        isReprint: false
      });

      var submitted = await submitJob(request, { client: discoveryResult.client });
      if (!submitted.ok) {
        if (localRef && localRef.id) {
          await updateJobReference(localRef.id, {
            lastKnownStatus: 'FAILED_FINAL',
            lastStatusAt: nowIso(),
            lastErrorMessage: submitted.errorMessage || 'Unable to submit test receipt.'
          });
        }
        return { ok: false, message: submitted.errorMessage || 'Unable to submit test receipt.' };
      }

      var status = normalizeStatus(submitted.remote && submitted.remote.status || 'QUEUED');
      if (localRef && localRef.id) {
        await updateJobReference(localRef.id, {
          lastKnownStatus: status,
          lastStatusAt: nowIso(),
          lastErrorMessage: ''
        });
      }

      return {
        ok: true,
        printJobId: jobId,
        status: status,
        requestId: submitted.requestId || '',
        message: 'Test receipt queued.',
        printerId: printer.id,
        localRef: localRef,
        baseUrl: discoveryResult.discovery.baseUrl
      };
    }

    async function submitOrderTickets(inputOrder: any): Promise<any> {
      return submitCustomerReceipt(Object.assign({}, inputOrder || {}, {
        bypassReceiptPrintingEnabled: true,
        suppressDefaultReceiptFallback: true,
        requestedFrom: String(inputOrder && inputOrder.requestedFrom || 'send_order'),
        trigger: String(inputOrder && inputOrder.trigger || 'order_sent')
      }));
    }

    function resolveDrawerCapabilities(printer: any): any {
      var profileId = global.LilposPrinterProfiles && global.LilposPrinterProfiles.normalizeProfileId
        ? global.LilposPrinterProfiles.normalizeProfileId(printer && printer.profile)
        : String(printer && printer.profile || 'generic_escpos_thermal');
      var baseCaps = global.LilposPrinterProfiles && global.LilposPrinterProfiles.resolveProfileCapabilities
        ? global.LilposPrinterProfiles.resolveProfileCapabilities(profileId)
        : { supportsDrawerPulse: true };
      return global.LilposPrinterProfiles && global.LilposPrinterProfiles.applyCapabilityOverrides
        ? global.LilposPrinterProfiles.applyCapabilityOverrides(baseCaps, {
            cutterInstalled: printer && printer.cutterInstalledOverride,
            cashDrawerConnected: printer && printer.cashDrawerConnectedOverride,
            rasterImageSupport: printer && printer.rasterImageSupportOverride
          })
        : baseCaps;
    }

    async function submitCashDrawerPulse(inputDrawer: any): Promise<any> {
      var settings = await resolveSettings(inputDrawer && inputDrawer.settingsScope);
      if (!settings.openCashDrawerWithCashSale) return { ok: false, skipped: true, message: 'Cash drawer opening is disabled.' };

      var merchantId = String((inputDrawer && inputDrawer.merchantId) || (dataService && dataService.getMerchantId && dataService.getMerchantId()) || settings.merchantId || 'local-merchant');
      var locationId = String((inputDrawer && inputDrawer.locationId) || (dataService && dataService.getLocationId && dataService.getLocationId()) || settings.locationId || 'local-location');
      var stationId = String((inputDrawer && inputDrawer.stationId) || (dataService && dataService.getStationNumber && dataService.getStationNumber()) || settings.stationId || '1');
      var businessDayId = String((inputDrawer && inputDrawer.businessDayId) || (dataService && dataService.getBusinessDate && dataService.getBusinessDate()) || nowIso().slice(0, 10));
      var orderId = String(inputDrawer && inputDrawer.orderId || '').trim();
      var requestedFrom = String(inputDrawer && inputDrawer.requestedFrom || 'cash_payment_completed');
      var idempotencyKey = String(inputDrawer && inputDrawer.idempotencyKey || ['lilpos', merchantId, locationId, orderId || 'cash_drawer', stationId, 'cash_drawer'].join(':'));

      var printerConfig = dataService && typeof dataService.resolveCashDrawerPrinter === 'function'
        ? await dataService.resolveCashDrawerPrinter({ merchantId: merchantId, locationId: locationId, stationId: stationId })
        : null;
      if (!printerConfig && dataService && typeof dataService.resolveStationPrinter === 'function') {
        printerConfig = await dataService.resolveStationPrinter({ merchantId: merchantId, locationId: locationId, stationId: stationId });
      }
      if (!printerConfig) return { ok: false, message: 'No Cash Drawer printer is assigned to this workstation.' };

      var printability = canPrintWithConfig(printerConfig);
      if (!printability.ok) return { ok: false, message: printability.message || 'Cash drawer printer configuration is not supported.' };
      var capabilities = resolveDrawerCapabilities(printerConfig);
      if (capabilities.supportsDrawerPulse === false) return { ok: false, skipped: true, message: 'Assigned printer does not support cash drawer pulse.' };

      var discoveryResult = await discoverClient(settings);
      if (!discoveryResult.ok) return { ok: false, message: 'LilPrint Agent is not available.', discovery: discoveryResult.discovery };

      var jobId = buildJobId(idempotencyKey);
      var printer = printerRequestFromConfig(printerConfig);
      var builder = global.LilposEscposBuilder.createEscposBuilder({ capabilities: capabilities });
      var request: LilPrintJobCreateRequest = {
        appId: 'lilpos',
        merchantId: merchantId,
        locationId: locationId,
        jobId: jobId,
        idempotencyKey: idempotencyKey,
        printer: printer,
        payload: { type: resolvePayloadTypeForPrinter(printerConfig), data: builder.init().openDrawerPulse().base64() },
        metadata: {
          orderId: orderId || 'cash_drawer',
          batchId: '',
          stationId: stationId,
          businessDayId: businessDayId,
          jobType: 'cash_drawer' as any,
          printerRole: 'cash_drawer' as any,
          source: 'lilpos',
          requestedFrom: requestedFrom,
          isReprint: false
        },
        options: {
          copies: 1,
          priority: 'high',
          retryEnabled: printerConfig.retryEnabled !== false,
          maxAttempts: Math.max(1, Number(printerConfig.maxAttempts || settings.maxAttempts || 5))
        }
      };

      var localRef = await persistJobReference({
        orderId: orderId || 'cash_drawer',
        batchId: '',
        printJobId: jobId,
        idempotencyKey: idempotencyKey,
        jobType: 'cash_drawer' as any,
        printerRole: 'cash_drawer' as any,
        printerId: String(printer.id),
        requestedAt: nowIso(),
        lastKnownStatus: 'QUEUED',
        lastStatusAt: nowIso(),
        isReprint: false
      });

      var submitted = await submitJob(request, { client: discoveryResult.client });
      if (!submitted.ok) {
        if (localRef && localRef.id) {
          await updateJobReference(localRef.id, {
            lastKnownStatus: 'FAILED_FINAL',
            lastStatusAt: nowIso(),
            lastErrorMessage: submitted.errorMessage || 'Unable to submit cash drawer pulse.'
          });
        }
        return { ok: false, message: submitted.errorMessage || 'Unable to submit cash drawer pulse.' };
      }

      var status = normalizeStatus(submitted.remote && (submitted.remote.status || submitted.remote.jobStatus) || 'QUEUED');
      if (localRef && localRef.id) {
        await updateJobReference(localRef.id, {
          lastKnownStatus: status,
          lastStatusAt: nowIso(),
          lastErrorMessage: ''
        });
      }

      return {
        ok: true,
        printJobId: jobId,
        status: status,
        localRef: localRef,
        baseUrl: discoveryResult.discovery.baseUrl
      };
    }

    return {
      submitCustomerReceipt: submitCustomerReceipt,
      submitOrderTickets: submitOrderTickets,
      submitCashDrawerPulse: submitCashDrawerPulse,
      submitTestReceipt: submitTestReceipt,
      resolveSettings: resolveSettings,
      resolveDestinations: resolveDestinations
    };
  }

  global.LilposPrintJobService = {
    createPrintJobService: createPrintJobService
  };
})(window);
