/// <reference path="./printer-types.ts" />

(function(global: any) {
  'use strict';

  function timeoutFetch(fetchImpl: any, url: string, options: any, timeoutMs: number): Promise<Response> {
    return new Promise(function(resolve, reject) {
      var done = false;
      var timer = global.setTimeout(function() {
        if (done) return;
        done = true;
        reject(new Error('Request timed out'));
      }, Math.max(200, Number(timeoutMs || 2500)));

      Promise.resolve(fetchImpl(url, options || {})).then(function(response) {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        resolve(response);
      }).catch(function(err) {
        if (done) return;
        done = true;
        global.clearTimeout(timer);
        reject(err);
      });
    });
  }

  async function healthCheck(fetchImpl: any, baseUrl: string, timeoutMs: number): Promise<any> {
    var endpoint = String(baseUrl || '').replace(/\/$/, '') + '/health';
    var response = await timeoutFetch(fetchImpl, endpoint, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, timeoutMs);

    var text = await response.text();
    var payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch (_err) {
      payload = { raw: text };
    }

    return {
      ok: response.ok,
      status: response.status,
      endpoint: endpoint,
      payload: payload,
      requestId: response.headers.get('x-request-id') || ''
    };
  }

  async function discoverLilPrintAgent(input?: any): Promise<any> {
    var opts = input || {};
    var fetchImpl = opts.fetchImpl || global.fetch;
    if (typeof fetchImpl !== 'function') {
      return {
        ok: false,
        connectionState: 'disconnected',
        message: 'Fetch is unavailable in this environment.',
        checkedAt: new Date().toISOString(),
        requestId: ''
      };
    }

    var preferHttps = opts.preferHttps !== false;
    var httpsUrl = String(opts.httpsUrl || 'https://localhost:3031').replace(/\/$/, '');
    var httpUrl = String(opts.httpUrl || 'http://localhost:3030').replace(/\/$/, '');
    var timeoutMs = Math.max(200, Number(opts.timeoutMs || 2500));
    var ordered = preferHttps ? [httpsUrl, httpUrl] : [httpUrl, httpsUrl];

    var firstError = '';

    for (var i = 0; i < ordered.length; i += 1) {
      var baseUrl = ordered[i];
      try {
        var result = await healthCheck(fetchImpl, baseUrl, timeoutMs);
        if (result.ok) {
          var degraded = false;
          var queueStatus = String(result.payload && (result.payload.queueDatabaseStatus || result.payload.queueDbStatus || result.payload.queueStatus) || '').toLowerCase();
          if (queueStatus && queueStatus !== 'ok' && queueStatus !== 'healthy') degraded = true;

          return {
            ok: true,
            baseUrl: baseUrl,
            healthUrl: result.endpoint,
            protocol: /^https:/i.test(baseUrl) ? 'https' : 'http',
            payload: result.payload,
            requestId: result.requestId,
            checkedAt: new Date().toISOString(),
            connectionState: degraded ? 'degraded' : 'connected',
            message: degraded ? 'LilPrint Agent is reachable but queue database is degraded.' : 'LilPrint Agent is available.'
          };
        }
        if (!firstError) firstError = 'Health check failed with status ' + result.status;
      } catch (err) {
        if (!firstError) firstError = err instanceof Error ? err.message : String(err || 'Connection failed');
      }
    }

    return {
      ok: false,
      baseUrl: '',
      healthUrl: '',
      protocol: '',
      payload: null,
      requestId: '',
      checkedAt: new Date().toISOString(),
      connectionState: 'disconnected',
      message: firstError || 'LilPrint Agent is not available.'
    };
  }

  global.LilposLilPrintDiscovery = {
    discoverLilPrintAgent: discoverLilPrintAgent
  };
})(window);
