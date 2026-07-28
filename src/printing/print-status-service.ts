/// <reference path="./printer-types.ts" />
/// <reference path="./lilprint-client.ts" />

(function(global: any) {
  'use strict';

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

  function isTerminalStatus(status: LilPrintJobStatus): boolean {
    return status === 'TRANSMITTED' || status === 'FAILED_FINAL' || status === 'CANCELED' || status === 'MANUALLY_RESOLVED';
  }

  function statusUiText(status: LilPrintJobStatus): string {
    if (status === 'SENDING') return 'Sending to printer';
    if (status === 'TRANSMITTED') return 'Sent to printer';
    if (status === 'RETRY_WAIT') return 'Printer unavailable, retrying';
    if (status === 'FAILED_FINAL') return 'Receipt could not be sent';
    if (status === 'CANCELED') return 'Receipt canceled';
    if (status === 'MANUALLY_RESOLVED') return 'Print issue resolved';
    return 'Receipt queued';
  }

  function createPrintStatusService(input?: any) {
    var opts = input || {};
    var dataService = opts.dataService || null;

    async function fetchJobStatus(baseUrl: string, jobId: string): Promise<any> {
      var client = global.LilposLilPrintClient.createLilPrintClient({
        baseUrl: String(baseUrl || '').replace(/\/$/, ''),
        fetchImpl: opts.fetchImpl || global.fetch,
        timeoutMs: Number(opts.timeoutMs || 5000)
      });

      var result = await client.getPrintJob(jobId);
      if (!result.ok) {
        return {
          ok: false,
          status: 'QUEUED',
          message: result.errorMessage || 'Unable to fetch print-job status.',
          requestId: result.requestId || ''
        };
      }

      var status = normalizeStatus(result.data && (result.data.status || result.data.jobStatus || result.data.lastKnownStatus));
      return {
        ok: true,
        status: status,
        message: statusUiText(status),
        requestId: result.requestId || '',
        raw: result.data || null
      };
    }

    async function persistStatus(localRef: any, status: LilPrintJobStatus, message: string) {
      if (!localRef || !localRef.id || !dataService || typeof dataService.updateLocalPrintJobReference !== 'function') return;
      await dataService.updateLocalPrintJobReference(localRef.id, {
        lastKnownStatus: status,
        lastStatusAt: new Date().toISOString(),
        lastErrorMessage: status === 'FAILED_FINAL' ? message : ''
      });
    }

    async function pollUntilTerminal(inputPoll: any): Promise<any> {
      var cfg = inputPoll || {};
      var baseUrl = String(cfg.baseUrl || '');
      var jobId = String(cfg.jobId || '');
      var localRef = cfg.localRef || null;
      var onUpdate = typeof cfg.onUpdate === 'function' ? cfg.onUpdate : function() {};
      var fastWindowMs = Math.max(1000, Number(cfg.fastWindowMs || 15000));
      var intervalFastMs = Math.max(500, Number(cfg.intervalFastMs || 1500));
      var intervalSlowMs = Math.max(3000, Number(cfg.intervalSlowMs || 6000));
      var maxRuntimeMs = Math.max(3000, Number(cfg.maxRuntimeMs || 90000));

      if (!baseUrl || !jobId) return { ok: false, message: 'Missing baseUrl or jobId.' };

      var started = Date.now();
      while (Date.now() - started < maxRuntimeMs) {
        var statusResult = await fetchJobStatus(baseUrl, jobId);
        var status = normalizeStatus(statusResult.status);
        await persistStatus(localRef, status, statusResult.message || '');
        onUpdate({
          status: status,
          message: statusUiText(status),
          raw: statusResult.raw || null
        });

        if (isTerminalStatus(status)) {
          return {
            ok: true,
            status: status,
            message: statusUiText(status)
          };
        }

        var elapsed = Date.now() - started;
        var waitMs = elapsed < fastWindowMs ? intervalFastMs : intervalSlowMs;
        await new Promise(function(resolve) { global.setTimeout(resolve, waitMs); });
      }

      return {
        ok: false,
        status: 'QUEUED',
        message: 'Print status check timed out.'
      };
    }

    return {
      fetchJobStatus: fetchJobStatus,
      pollUntilTerminal: pollUntilTerminal,
      statusUiText: statusUiText,
      normalizeStatus: normalizeStatus
    };
  }

  global.LilposPrintStatusService = {
    createPrintStatusService: createPrintStatusService
  };
})(window);
