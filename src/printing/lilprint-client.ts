/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function makeRequestedBy(value: any): any {
    if (value && typeof value === 'object') {
      return {
        appId: String(value.appId || 'lilpos'),
        userId: String(value.userId || value.userName || 'manager'),
        userName: String(value.userName || value.userId || 'manager')
      };
    }

    var text = String(value || '').trim() || 'manager';
    return {
      appId: 'lilpos',
      userId: text,
      userName: text
    };
  }

  function encodeQuery(params: any): string {
    var input = params && typeof params === 'object' ? params : {};
    var parts: string[] = [];
    Object.keys(input).forEach(function(key) {
      var raw = input[key];
      if (raw == null) return;
      var value = String(raw).trim();
      if (!value) return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  function reprintDefaults(input?: any): any {
    var source = input && typeof input === 'object' ? Object.assign({}, input) : {};
    var stamp = String(Date.now());
    if (!source.newJobId) source.newJobId = 'lilpos_reprint_' + stamp;
    if (!source.newIdempotencyKey) source.newIdempotencyKey = 'lilpos:reprint:' + stamp;
    return source;
  }

  function safeParseJson(text: string): any {
    try {
      return text ? JSON.parse(text) : null;
    } catch (_err) {
      return null;
    }
  }

  function makeErrorMessage(status: number, payload: any): string {
    var code = payload && payload.error && payload.error.code ? String(payload.error.code) : '';
    if (payload && payload.error && payload.error.message) return String(payload.error.message);
    if (payload && payload.message) return String(payload.message);
    if (code === 'IDEMPOTENCY_CONFLICT') return 'LilPrint idempotency conflict.';
    if (code === 'INVALID_JOB_STATE') return 'LilPrint job state does not allow this action.';
    if (status === 503) return 'LilPrint queue database unavailable.';
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
          var requestId = response.headers.get('x-request-id')
            || (payload && payload.requestId ? String(payload.requestId) : '')
            || '';
          var errorPayload = payload && payload.error && typeof payload.error === 'object'
            ? payload.error
            : null;

          resolve({
            ok: response.ok,
            status: response.status,
            data: payload,
            errorMessage: response.ok ? '' : makeErrorMessage(response.status, payload),
            requestId: requestId,
            errorCode: !response.ok && errorPayload && errorPayload.code ? String(errorPayload.code) : '',
            errorRetryable: !response.ok && errorPayload ? !!errorPayload.retryable : false
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

      getHealth: function() {
        return request('/health');
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

      listPrintJobs: function(filters?: any) {
        return request('/v1/print-jobs' + encodeQuery(filters));
      },

      getQueueSummary: function(filters?: any) {
        return request('/v1/queue' + encodeQuery(filters));
      },

      retryJob: function(jobId: string, body?: any) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')) + '/retry', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body || {})
        });
      },

      reprintJob: function(jobId: string, body?: any) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')) + '/reprint', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(reprintDefaults(body))
        });
      },

      cancelJob: function(jobId: string, body?: any) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')) + '/cancel', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body || {})
        });
      },

      resolveJob: function(jobId: string, body?: any) {
        return request('/v1/print-jobs/' + encodeURIComponent(String(jobId || '')) + '/resolve', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body || {})
        });
      },

      pausePrinter: function(printerId: string, reason: string, requestedBy: any) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/pause', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: String(reason || '').trim(),
            requestedBy: makeRequestedBy(requestedBy)
          })
        });
      },

      resumePrinter: function(printerId: string, reason: string, requestedBy: any) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/resume', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            reason: String(reason || '').trim(),
            requestedBy: makeRequestedBy(requestedBy)
          })
        });
      },

      clearPrinterQueue: function(printerId: string, reason: string, requestedBy: any, statuses?: string[]) {
        return request('/v1/printers/' + encodeURIComponent(String(printerId || '')) + '/queue/clear', {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            statuses: Array.isArray(statuses) && statuses.length ? statuses : ['QUEUED', 'RETRY_WAIT'],
            reason: String(reason || '').trim(),
            requestedBy: makeRequestedBy(requestedBy)
          })
        });
      }
    };
  }

  global.LilposLilPrintClient = {
    createLilPrintClient: createLilPrintClient
  };
})(window);
