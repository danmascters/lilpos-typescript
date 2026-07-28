/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function safeParseJson(text: string): any {
    try {
      return text ? JSON.parse(text) : null;
    } catch (_err) {
      return null;
    }
  }

  function makeErrorMessage(status: number, payload: any): string {
    if (payload && payload.error && payload.error.message) return String(payload.error.message);
    if (payload && payload.message) return String(payload.message);
    if (status >= 500) return 'LilPrint service error.';
    if (status === 404) return 'LilPrint endpoint not found.';
    if (status === 409) return 'LilPrint idempotency conflict.';
    return 'LilPrint request failed.';
  }

  function createLilPrintClient(input?: any): any {
    var opts = input || {};
    var fetchImpl = opts.fetchImpl || global.fetch;
    var baseUrl = String(opts.baseUrl || '').replace(/\/$/, '');
    var timeoutMs = Math.max(300, Number(opts.timeoutMs || 5000));

    function request(path: string, init?: any): Promise<LilPrintApiResponse<any>> {
      if (typeof fetchImpl !== 'function') {
        return Promise.resolve({ ok: false, status: 0, data: null, errorMessage: 'Fetch is unavailable.', requestId: '' });
      }
      var endpoint = baseUrl + path;
      return new Promise(function(resolve) {
        var done = false;
        var timer = global.setTimeout(function() {
          if (done) return;
          done = true;
          resolve({ ok: false, status: 0, data: null, errorMessage: 'Request timed out.', requestId: '' });
        }, timeoutMs);

        Promise.resolve(fetchImpl(endpoint, Object.assign({
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }, init || {}))).then(async function(response) {
          if (done) return;
          done = true;
          global.clearTimeout(timer);

          var bodyText = await response.text();
          var payload = safeParseJson(bodyText);
          var requestId = response.headers.get('x-request-id') || '';

          resolve({
            ok: response.ok,
            status: response.status,
            data: payload,
            errorMessage: response.ok ? '' : makeErrorMessage(response.status, payload),
            requestId: requestId
          });
        }).catch(function(err) {
          if (done) return;
          done = true;
          global.clearTimeout(timer);
          resolve({
            ok: false,
            status: 0,
            data: null,
            errorMessage: err instanceof Error ? err.message : String(err || 'Connection failed'),
            requestId: ''
          });
        });
      });
    }

    return {
      getBaseUrl: function() {
        return baseUrl;
      },

      getAgent: function() {
        return request('/v1/agent');
      },

      getPrinters: function() {
        return request('/v1/printers');
      },

      submitPrintJob: function(job: LilPrintJobCreateRequest) {
        return request('/v1/print-jobs', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(job)
        });
      },

      getPrintJob: function(jobId: string) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')));
      },

      reprintJob: function(jobId: string, body?: any) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')) + '/reprint', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body || {})
        });
      },

      pausePrinter: function(printerId: string, reason: string, requestedBy: string) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/pause', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: reason, requestedBy: requestedBy })
        });
      },

      resumePrinter: function(printerId: string, reason: string, requestedBy: string) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/resume', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: reason, requestedBy: requestedBy })
        });
      },

      clearPrinterQueue: function(printerId: string, reason: string, requestedBy: string) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/queue/clear', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ reason: reason, requestedBy: requestedBy })
        });
      }
    };
  }

  global.LilposLilPrintClient = {
    createLilPrintClient: createLilPrintClient
  };
})(window);
