/// <reference path="./printing/printer-types.ts" />

type DirectPrinterTone = 'neutral' | 'success' | 'warning' | 'failure';

type DirectPrinterCheck = {
  label: string;
  value: string;
  tone: DirectPrinterTone;
};

type DirectPrinterResultState = {
  title: string;
  startTime: string;
  endpoint: string;
  method: string;
  httpStatus: string;
  summary: string;
  elapsedMs: string;
  errorName: string;
  errorMessage: string;
  requestBody?: any;
  responseBody?: any;
  checks: DirectPrinterCheck[];
  log: string[];
};

type DirectPrinterFormState = {
  agentUrl: string;
  ip: string;
  port: string;
  message: string;
  profile: string;
  feedLines: string;
  cutPaper: boolean;
  openCashDrawer: boolean;
};

type DirectWebContentType =
  | 'application/json'
  | 'application/x-www-form-urlencoded'
  | 'text/plain'
  | 'application/octet-stream'
  | 'Custom';

type DirectWebPrinterFormState = {
  baseUrl: string;
  endpoint: string;
  method: 'POST' | 'GET';
  contentType: DirectWebContentType;
  customContentType: string;
  message: string;
  bodyTemplate: string;
  noCors: boolean;
  capturedNotes: string;
};

type DirectPrinterPayloadPreview = {
  message: string;
  feedLines: number;
  cutPaper: boolean;
  openCashDrawer: boolean;
  byteCount: number | null;
  hexPreview: string;
  note: string;
};

const DIRECT_PRINTER_DEFAULTS: DirectPrinterFormState = {
  agentUrl: 'http://127.0.0.1:3031',
  ip: '192.168.1.233',
  port: '9100',
  message: 'LILPOS VIA LILPRINT RAW ESC/POS TEST',
  profile: 'generic_escpos_thermal',
  feedLines: '3',
  cutPaper: false,
  openCashDrawer: false
};

const DIRECT_WEB_PRINTER_DEFAULTS: DirectWebPrinterFormState = {
  baseUrl: 'http://192.168.1.233',
  endpoint: '',
  method: 'POST',
  contentType: 'application/json',
  customContentType: '',
  message: 'LILPOS DIRECT WEB PRINTER API TEST',
  bodyTemplate: '{{message}}',
  noCors: false,
  capturedNotes: ''
};

const directPrinterState: {
  form: DirectPrinterFormState;
  directWeb: DirectWebPrinterFormState;
  result: DirectPrinterResultState | null;
  running: 'health' | 'print' | 'direct' | null;
} = {
  form: { ...DIRECT_PRINTER_DEFAULTS },
  directWeb: { ...DIRECT_WEB_PRINTER_DEFAULTS },
  result: null,
  running: null
};

function directPrinterEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function directPrinterTimestamp(date = new Date()): string {
  return date.toLocaleString();
}

function directPrinterNowIso(): string {
  return new Date().toISOString();
}

function directPrinterAppendLog(message: string): string[] {
  const entry = `[${directPrinterTimestamp()}] ${message}`;
  const current = directPrinterState.result?.log || [];
  return [entry, ...current].slice(0, 40);
}

function directPrinterNormalizeBaseUrl(value: string): string {
  return String(value || '').trim().replace(/\/+$/, '');
}

function directPrinterHealthEndpoint(): string {
  return `${directPrinterNormalizeBaseUrl(directPrinterState.form.agentUrl)}/health`;
}

function directPrinterPrintEndpoint(): string {
  return `${directPrinterNormalizeBaseUrl(directPrinterState.form.agentUrl)}/v1/print-jobs`;
}

function directPrinterWebUrl(): string {
  const ip = directPrinterState.form.ip.trim() || DIRECT_PRINTER_DEFAULTS.ip;
  return `http://${ip}/`;
}

function directWebPrinterContentType(): string {
  if (directPrinterState.directWeb.contentType === 'Custom') {
    return directPrinterState.directWeb.customContentType.trim();
  }
  return directPrinterState.directWeb.contentType;
}

function directWebPrinterTargetUrl(): string {
  const baseUrl = directPrinterNormalizeBaseUrl(directPrinterState.directWeb.baseUrl || DIRECT_WEB_PRINTER_DEFAULTS.baseUrl);
  const endpoint = directPrinterState.directWeb.endpoint.trim();
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${baseUrl}${normalizedEndpoint}`;
}

function directWebPrinterRequestBody(): string {
  return String(directPrinterState.directWeb.bodyTemplate || '').replace(/\{\{message\}\}/g, directPrinterState.directWeb.message);
}

function directPrinterSafeId(value: string): string {
  const safe = String(value || '').replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  return safe || 'printer';
}

function directPrinterJson(value: unknown): string {
  if (value == null) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function directPrinterStatusFromResponse(data: any): string {
  const job = data && data.job ? data.job : data;
  return String(job?.status || data?.status || data?.jobStatus || '').toUpperCase();
}

function directPrinterJobIdFromResponse(data: any): string {
  const job = data && data.job ? data.job : data;
  return String(job?.jobId || data?.jobId || '');
}

function directPrinterErrorFromResponse(data: any): { code: string; message: string } {
  const job = data && data.job ? data.job : data;
  const lastError = job?.lastError || data?.lastError || data?.error || null;
  return {
    code: String(lastError?.code || data?.errorCode || ''),
    message: String(lastError?.message || data?.message || '')
  };
}

function directPrinterSummaryFromPrintResponse(response: any): string {
  const data = response?.data;
  const status = directPrinterStatusFromResponse(data);
  const jobId = directPrinterJobIdFromResponse(data);
  const error = directPrinterErrorFromResponse(data);

  if (!response?.ok) {
    if (response?.status === 0) return 'Failed. LilPrint Agent was not reachable from this browser.';
    return `Failed. LilPrint rejected the request${error.code ? ` (${error.code})` : ''}.`;
  }

  if (status === 'TRANSMITTED') {
    return `Sent to printer by LilPrint${jobId ? ` as job ${jobId}` : ''}. This confirms socket transmission only, not physical paper output.`;
  }
  if (status === 'QUEUED' || status === 'SENDING' || status === 'RETRY_WAIT') {
    return `Accepted by LilPrint${jobId ? ` as job ${jobId}` : ''}. Unknown physical print result until the job reaches TRANSMITTED or FAILED_FINAL.`;
  }
  if (status === 'FAILED_FINAL' || status === 'CANCELED') {
    return `Failed. LilPrint returned job status ${status}${error.message ? `: ${error.message}` : ''}.`;
  }
  return `Accepted by LilPrint${jobId ? ` as job ${jobId}` : ''}. Unknown physical print result.`;
}

function directPrinterClassify(response: any, error: unknown, endpoint: string): DirectPrinterCheck[] {
  const err = error instanceof Error ? error : null;
  const errorText = `${err?.name || ''} ${err?.message || ''} ${response?.errorMessage || ''} ${response?.errorCode || ''}`.toLowerCase();
  const status = Number(response?.status || 0);
  const dataError = directPrinterErrorFromResponse(response?.data);
  const dataErrorText = `${dataError.code} ${dataError.message}`.toLowerCase();
  const combined = `${errorText} ${dataErrorText}`;
  const mixedContent = window.location.protocol === 'https:' && endpoint.startsWith('http://');
  const unavailable = status === 0 || combined.includes('failed to fetch') || combined.includes('networkerror') || combined.includes('request timed out');
  const cors = combined.includes('cors') || combined.includes('cross-origin') || (unavailable && !mixedContent);
  const invalid = status === 400 || combined.includes('invalid_request') || combined.includes('invalid request');
  const auth = status === 401 || status === 403 || combined.includes('unauthorized') || combined.includes('forbidden');
  const printerTimeout = combined.includes('printer_connection_timeout') || combined.includes('timeout');
  const printerConnection = combined.includes('printer_connection_refused')
    || combined.includes('network_unreachable')
    || combined.includes('host_unreachable')
    || combined.includes('socket_write_failure')
    || combined.includes('printer_socket_error')
    || combined.includes('econnrefused')
    || combined.includes('ehostunreach')
    || combined.includes('enetunreach');
  const rejected = status >= 400 && status !== 401 && status !== 403;
  const unknown = Boolean(error || !response?.ok) && !unavailable && !mixedContent && !invalid && !auth && !printerTimeout && !printerConnection && !rejected;

  return [
    { label: 'LilPrint Agent unavailable', value: unavailable ? 'Possible; browser could not complete the LilPrint HTTP request' : 'Not indicated', tone: unavailable ? 'failure' : 'neutral' },
    { label: 'CORS failure', value: cors ? 'Possible; inspect Console and Network details to confirm' : 'Not indicated', tone: cors ? 'warning' : 'neutral' },
    { label: 'Mixed-content failure', value: mixedContent ? 'Possible when LilPOS is loaded over HTTPS and LilPrint URL is HTTP' : 'Not indicated', tone: mixedContent ? 'warning' : 'neutral' },
    { label: 'Invalid request', value: invalid ? 'Likely based on HTTP status or LilPrint error code' : 'Not indicated', tone: invalid ? 'failure' : 'neutral' },
    { label: 'Authentication failure', value: auth ? 'Likely based on HTTP status; current LilPrint spec does not require auth' : 'Not indicated', tone: auth ? 'failure' : 'neutral' },
    { label: 'Printer connection failure', value: printerConnection ? 'Likely based on LilPrint printer error details' : 'Not indicated', tone: printerConnection ? 'failure' : 'neutral' },
    { label: 'Printer timeout', value: printerTimeout ? 'Likely based on timeout details' : 'Not indicated', tone: printerTimeout ? 'failure' : 'neutral' },
    { label: 'LilPrint rejected request', value: rejected ? `HTTP ${status}` : 'Not indicated', tone: rejected ? 'failure' : 'neutral' },
    { label: 'Unknown error', value: unknown ? 'Possible; inspect full response and console details' : 'Not indicated', tone: unknown ? 'warning' : 'neutral' }
  ];
}

function directWebPrinterClassify(response: Response | null, error: unknown, endpoint: string, noCors: boolean): DirectPrinterCheck[] {
  const err = error instanceof Error ? error : null;
  const status = Number(response?.status || 0);
  const errorText = `${err?.name || ''} ${err?.message || ''}`.toLowerCase();
  const mixedContent = window.location.protocol === 'https:' && endpoint.startsWith('http://');
  const localNetwork = errorText.includes('local network') || errorText.includes('private network') || errorText.includes('permission');
  const timeout = err?.name === 'AbortError' || errorText.includes('timeout') || errorText.includes('abort');
  const blocked = Boolean(error) && (mixedContent || localNetwork || errorText.includes('failed to fetch') || errorText.includes('networkerror'));
  const cors = Boolean(error) && !mixedContent && !localNetwork && !timeout && (errorText.includes('cors') || errorText.includes('failed to fetch') || errorText.includes('networkerror'));
  const connectionFailure = Boolean(error) && !mixedContent && !localNetwork && !timeout && !cors;
  const printerHttpError = status >= 400;
  const responded = Boolean(response) && !noCors && status > 0 && status < 400;
  const unknown = Boolean(error) && !mixedContent && !localNetwork && !timeout && !cors && !connectionFailure;

  return [
    { label: 'Printer HTTP API responded', value: responded ? `Readable HTTP ${status}` : 'Not confirmed', tone: responded ? 'success' : 'neutral' },
    { label: 'Request submitted with opaque response', value: noCors && !error ? 'Yes; response and physical print result cannot be verified' : 'No', tone: noCors && !error ? 'warning' : 'neutral' },
    { label: 'Browser blocked request', value: blocked ? 'Possible; inspect Console and Network details' : 'Not indicated', tone: blocked ? 'failure' : 'neutral' },
    { label: 'CORS restriction', value: cors ? 'Possible; TypeError alone does not prove CORS' : 'Not indicated', tone: cors ? 'warning' : 'neutral' },
    { label: 'Mixed-content restriction', value: mixedContent ? 'Possible because LilPOS is HTTPS and the printer URL is HTTP' : 'Not indicated', tone: mixedContent ? 'warning' : 'neutral' },
    { label: 'Local Network Access permission', value: localNetwork ? 'Possible based on browser error text' : 'Not indicated', tone: localNetwork ? 'warning' : 'neutral' },
    { label: 'HTTP connection failure', value: connectionFailure ? 'Possible; browser could not complete the HTTP request' : 'Not indicated', tone: connectionFailure ? 'failure' : 'neutral' },
    { label: 'Timeout', value: timeout ? 'Likely; request was aborted by the diagnostic timeout' : 'Not indicated', tone: timeout ? 'failure' : 'neutral' },
    { label: 'Printer HTTP error', value: printerHttpError ? `HTTP ${status}` : 'Not indicated', tone: printerHttpError ? 'failure' : 'neutral' },
    { label: 'Unknown browser error', value: unknown ? 'Possible; inspect full browser details' : 'Not indicated', tone: unknown ? 'warning' : 'neutral' },
    { label: 'Physical printing not confirmed', value: 'Check printer physically', tone: 'warning' }
  ];
}

function directPrinterValidateForm(): string[] {
  const errors: string[] = [];
  const baseUrl = directPrinterNormalizeBaseUrl(directPrinterState.form.agentUrl);
  const ip = directPrinterState.form.ip.trim();
  const port = Number(directPrinterState.form.port);
  const message = directPrinterState.form.message.trim();

  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push('LilPrint Agent URL must start with http:// or https://.');
  } catch {
    errors.push('LilPrint Agent URL is not a valid URL.');
  }
  if (!ip) errors.push('Printer IP is required.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('Printer port must be a whole number from 1 to 65535.');
  if (!message) errors.push('Test message is required.');
  return errors;
}

function directWebPrinterValidateForm(): string[] {
  const errors: string[] = [];
  const baseUrl = directPrinterNormalizeBaseUrl(directPrinterState.directWeb.baseUrl);
  const endpoint = directPrinterState.directWeb.endpoint.trim();
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') errors.push('Printer HTTP Base URL must start with http:// or https://.');
  } catch {
    errors.push('Printer HTTP Base URL is not a valid URL.');
  }
  if (!endpoint) {
    errors.push("Print Endpoint is required. Capture the printer web page's Print Test request in browser DevTools and enter its endpoint and request format here.");
  } else {
    try {
      const target = new URL(directWebPrinterTargetUrl());
      if (target.protocol !== 'http:' && target.protocol !== 'https:') errors.push('Complete target URL must use http:// or https://.');
    } catch {
      errors.push('Print Endpoint does not build a valid HTTP URL.');
    }
  }
  if (directPrinterState.directWeb.contentType === 'Custom' && !directPrinterState.directWeb.customContentType.trim()) {
    errors.push('Custom content type is required when Content Type is Custom.');
  }
  return errors;
}

function directPrinterProfileOptions(): string {
  const profiles = window.LilposPrinterProfiles?.profileCapabilities || [];
  const rows = profiles.length
    ? profiles
    : [{ id: 'generic_escpos_thermal', label: 'Generic ESC/POS Thermal' }];
  return rows.map((profile: any) => {
    const id = String(profile.id || 'generic_escpos_thermal');
    const selected = id === directPrinterState.form.profile ? 'selected' : '';
    return `<option value="${directPrinterEscape(id)}" ${selected}>${directPrinterEscape(profile.label || id)}</option>`;
  }).join('');
}

function directPrinterBuildPayload(): { base64: string; bytes: number[]; hexPreview: string } {
  const caps = window.LilposPrinterProfiles?.resolveProfileCapabilities
    ? window.LilposPrinterProfiles.resolveProfileCapabilities(directPrinterState.form.profile)
    : null;
  const builder = window.LilposEscposBuilder.createEscposBuilder({ capabilities: caps });
  const feedLines = Math.max(0, Math.min(20, Number(directPrinterState.form.feedLines || 0)));

  builder
    .init()
    .alignCenter()
    .boldOn()
    .line('LilPrint Raw ESC/POS Test')
    .boldOff()
    .feed(1)
    .alignLeft()
    .line(directPrinterState.form.message)
    .line('Printer: ' + directPrinterState.form.ip.trim() + ':' + String(Number(directPrinterState.form.port || 9100)))
    .line('Time: ' + directPrinterNowIso())
    .feed(feedLines);

  if (directPrinterState.form.cutPaper) builder.cut();
  if (directPrinterState.form.openCashDrawer) builder.openDrawerPulse();

  const bytes = builder.bytes();
  return {
    base64: builder.base64(),
    bytes,
    hexPreview: bytes.slice(0, 160).map((byte: number) => byte.toString(16).padStart(2, '0').toUpperCase()).join(' ')
  };
}

function directPrinterBuildPreview(): DirectPrinterPayloadPreview {
  const feedLines = Math.max(0, Math.min(20, Number(directPrinterState.form.feedLines || 0)));
  if (!window.LilposEscposBuilder?.createEscposBuilder) {
    return {
      message: directPrinterState.form.message,
      feedLines,
      cutPaper: directPrinterState.form.cutPaper,
      openCashDrawer: directPrinterState.form.openCashDrawer,
      byteCount: null,
      hexPreview: '',
      note: 'Payload construction occurs inside LilPrint.'
    };
  }

  try {
    const payload = directPrinterBuildPayload();
    return {
      message: directPrinterState.form.message,
      feedLines,
      cutPaper: directPrinterState.form.cutPaper,
      openCashDrawer: directPrinterState.form.openCashDrawer,
      byteCount: payload.bytes.length,
      hexPreview: payload.hexPreview,
      note: 'Payload is built with the existing LilPOS ESC/POS builder and sent to LilPrint as escpos_raw_base64.'
    };
  } catch (error) {
    return {
      message: directPrinterState.form.message,
      feedLines,
      cutPaper: directPrinterState.form.cutPaper,
      openCashDrawer: directPrinterState.form.openCashDrawer,
      byteCount: null,
      hexPreview: '',
      note: error instanceof Error ? error.message : 'Unable to build preview.'
    };
  }
}

function directPrinterBuildRequestBody(): LilPrintJobCreateRequest {
  const stamp = Date.now();
  const printerIp = directPrinterState.form.ip.trim();
  const printerPort = Number(directPrinterState.form.port || 9100);
  const printerId = `lilpos_direct_test_${directPrinterSafeId(printerIp)}_${printerPort}`;
  const payload = directPrinterBuildPayload();
  const idempotencyKey = `lilpos:direct-printer-test:${stamp}`;

  return {
    appId: 'lilpos',
    merchantId: 'local-merchant',
    locationId: 'local-location',
    jobId: `lilpos_direct_test_${stamp}`,
    idempotencyKey,
    printer: {
      id: printerId,
      name: 'Direct Test Printer',
      ip: printerIp,
      port: printerPort,
      profile: directPrinterState.form.profile,
      connectionType: 'network_printer',
      printMode: 'raw_escpos',
      transport: 'tcp_9100'
    },
    payload: {
      type: 'escpos_raw_base64',
      data: payload.base64
    },
    metadata: {
      orderId: 'direct_printer_test',
      batchId: '',
      stationId: 'diagnostic',
      businessDayId: directPrinterNowIso().slice(0, 10),
      jobType: 'printer_test',
      printerRole: 'receipt',
      source: 'lilpos',
      requestedFrom: 'direct_printer_test',
      isReprint: false,
      originalPrintJobId: ''
    },
    options: {
      copies: 1,
      priority: 'normal',
      retryEnabled: true,
      maxAttempts: 1
    }
  };
}

function directPrinterRenderResult(result: DirectPrinterResultState | null): string {
  if (!result) {
    return `
      <section class="direct-printer-panel direct-printer-results" aria-live="polite">
        <h2>Results</h2>
        <p class="direct-printer-muted">No diagnostic request has been run in this browser tab.</p>
      </section>
    `;
  }

  return `
    <section class="direct-printer-panel direct-printer-results" aria-live="polite">
      <div class="direct-printer-panel-heading">
        <h2>${directPrinterEscape(result.title)}</h2>
        <span class="direct-printer-badge ${result.httpStatus.startsWith('2') ? 'success' : result.httpStatus === '0' ? 'failure' : 'warning'}">${directPrinterEscape(result.httpStatus || 'No status')}</span>
      </div>
      <dl class="direct-printer-result-grid">
        <div><dt>Start time</dt><dd>${directPrinterEscape(result.startTime)}</dd></div>
        <div><dt>Endpoint used</dt><dd>${directPrinterEscape(result.endpoint)}</dd></div>
        <div><dt>Request method</dt><dd>${directPrinterEscape(result.method)}</dd></div>
        <div><dt>HTTP status</dt><dd>${directPrinterEscape(result.httpStatus)}</dd></div>
        <div><dt>Browser result</dt><dd>${directPrinterEscape(result.summary)}</dd></div>
        <div><dt>Elapsed milliseconds</dt><dd>${directPrinterEscape(result.elapsedMs)}</dd></div>
        <div><dt>Error name/message</dt><dd>${directPrinterEscape(result.errorName || 'None')} / ${directPrinterEscape(result.errorMessage || 'None')}</dd></div>
      </dl>
      <div class="direct-printer-classifications">
        ${result.checks.map((item) => `
          <div class="direct-printer-classification ${item.tone}">
            <b>${directPrinterEscape(item.label)}</b>
            <span>${directPrinterEscape(item.value)}</span>
          </div>
        `).join('')}
      </div>
      ${result.requestBody ? `
        <div class="direct-printer-json-block">
          <h3>Request Body</h3>
          <pre>${directPrinterEscape(directPrinterJson(result.requestBody))}</pre>
        </div>
      ` : ''}
      <div class="direct-printer-json-block">
        <h3>Parsed Response</h3>
        <pre>${directPrinterEscape(directPrinterJson(result.responseBody) || 'No response body')}</pre>
      </div>
      <div class="direct-printer-log">
        <h3>Activity Log</h3>
        ${result.log.length
          ? `<ol>${result.log.map((entry) => `<li>${directPrinterEscape(entry)}</li>`).join('')}</ol>`
          : '<p class="direct-printer-muted">No activity recorded.</p>'}
      </div>
    </section>
  `;
}

function directPrinterRenderPayloadPreview(): string {
  const preview = directPrinterBuildPreview();
  return `
    <div class="direct-printer-preview">
      <h2>ESC/POS Payload Preview</h2>
      <dl class="direct-printer-result-grid">
        <div><dt>Plain-text message</dt><dd>${directPrinterEscape(preview.message)}</dd></div>
        <div><dt>Feed-line count</dt><dd>${directPrinterEscape(preview.feedLines)}</dd></div>
        <div><dt>Cut</dt><dd>${preview.cutPaper ? 'Enabled' : 'Disabled'}</dd></div>
        <div><dt>Drawer</dt><dd>${preview.openCashDrawer ? 'Enabled' : 'Disabled'}</dd></div>
        <div><dt>Approx. byte count</dt><dd>${preview.byteCount == null ? 'Unavailable' : directPrinterEscape(preview.byteCount)}</dd></div>
      </dl>
      ${preview.hexPreview ? `
        <div class="direct-printer-json-block">
          <h3>Hex Preview</h3>
          <pre>${directPrinterEscape(preview.hexPreview)}</pre>
        </div>
      ` : ''}
      <p class="direct-printer-muted">${directPrinterEscape(preview.note)}</p>
    </div>
  `;
}

function directPrinterRenderDirectWebSection(): string {
  const contentType = directPrinterState.directWeb.contentType;
  return `
    <section class="direct-printer-panel direct-printer-section direct-printer-direct-web">
      <div class="direct-printer-panel-heading">
        <div>
          <h2>Direct Web Printer API Test</h2>
          <p class="direct-printer-muted">Browser -> printer HTTP API -> printer. This is not raw TCP printing and does not use LilPrint.</p>
        </div>
      </div>
      <div class="direct-printer-callout">
        <span>Capture the printer web page's Print Test request in browser DevTools and enter its endpoint and request format here.</span>
      </div>
      <div class="direct-printer-fields">
        <label class="direct-printer-wide-field">
          <span>Printer HTTP Base URL</span>
          <input id="directWebBaseUrl" value="${directPrinterEscape(directPrinterState.directWeb.baseUrl)}" inputmode="url" autocomplete="off" spellcheck="false" />
        </label>
        <label class="direct-printer-wide-field">
          <span>Print Endpoint</span>
          <input id="directWebEndpoint" value="${directPrinterEscape(directPrinterState.directWeb.endpoint)}" autocomplete="off" spellcheck="false" placeholder="/captured/print/path" />
        </label>
        <label>
          <span>HTTP Method</span>
          <select id="directWebMethod">
            <option value="POST" ${directPrinterState.directWeb.method === 'POST' ? 'selected' : ''}>POST</option>
            <option value="GET" ${directPrinterState.directWeb.method === 'GET' ? 'selected' : ''}>GET</option>
          </select>
        </label>
        <label>
          <span>Content Type</span>
          <select id="directWebContentType">
            ${['application/json', 'application/x-www-form-urlencoded', 'text/plain', 'application/octet-stream', 'Custom'].map((value) => `
              <option value="${directPrinterEscape(value)}" ${contentType === value ? 'selected' : ''}>${directPrinterEscape(value)}</option>
            `).join('')}
          </select>
        </label>
        <label class="direct-printer-wide-field">
          <span>Custom Content Type</span>
          <input id="directWebCustomContentType" value="${directPrinterEscape(directPrinterState.directWeb.customContentType)}" autocomplete="off" spellcheck="false" placeholder="Only used when Content Type is Custom" />
        </label>
        <label class="direct-printer-message-field">
          <span>Test Message</span>
          <textarea id="directWebMessage" rows="3" autocomplete="off" spellcheck="false">${directPrinterEscape(directPrinterState.directWeb.message)}</textarea>
        </label>
        <label class="direct-printer-message-field">
          <span>Request Body Template</span>
          <textarea id="directWebBodyTemplate" rows="5" autocomplete="off" spellcheck="false">${directPrinterEscape(directPrinterState.directWeb.bodyTemplate)}</textarea>
        </label>
        <label class="direct-printer-toggle direct-printer-wide-field">
          <input id="directWebNoCors" type="checkbox" ${directPrinterState.directWeb.noCors ? 'checked' : ''} />
          <span>Use no-cors diagnostic mode</span>
        </label>
        <label class="direct-printer-message-field">
          <span>Captured Request Notes</span>
          <textarea id="directWebCapturedNotes" rows="5" autocomplete="off" spellcheck="false" placeholder="Paste Copy as fetch or Copy as cURL notes for manual review only. This field is never executed.">${directPrinterEscape(directPrinterState.directWeb.capturedNotes)}</textarea>
        </label>
      </div>
      <div class="direct-printer-actions">
        <button type="button" class="btn-primary" id="directWebSend" ${directPrinterState.running ? 'disabled' : ''}>${directPrinterState.running === 'direct' ? 'Sending...' : 'Send Directly to Printer Web API'}</button>
      </div>
      ${directPrinterState.directWeb.noCors ? `
        <p class="direct-printer-muted">The browser submitted an opaque request. The response and physical print result cannot be verified.</p>
      ` : ''}
      <details class="direct-printer-devtools direct-printer-inline-help">
        <summary>Request Body Template Examples</summary>
        <p class="direct-printer-muted">Do not assume any example matches the actual printer API.</p>
        <div class="direct-printer-json-block">
          <h3>Plain text</h3>
          <pre>{{message}}</pre>
        </div>
        <div class="direct-printer-json-block">
          <h3>JSON</h3>
          <pre>{
  "content": "{{message}}"
}</pre>
        </div>
        <div class="direct-printer-json-block">
          <h3>Form body</h3>
          <pre>content={{message}}</pre>
        </div>
      </details>
    </section>
  `;
}

function directPrinterRenderWebInterfaceSection(): string {
  return `
    <section class="direct-printer-panel direct-printer-section">
      <h2>Printer Web Interface</h2>
      <p class="direct-printer-muted">Opens ${directPrinterEscape(directPrinterWebUrl())}. This checks the printer's configuration webpage only, not raw printing.</p>
      <div class="direct-printer-actions">
        <button type="button" class="btn-dark" id="directPrinterWeb">Open Printer Web Interface</button>
      </div>
    </section>
  `;
}

function directPrinterRenderCaptureHelp(): string {
  return `
    <details class="direct-printer-panel direct-printer-devtools">
      <summary>Capture the Printer Print Request</summary>
      <ol>
        <li>Open http://192.168.1.233 in Chrome or Edge.</li>
        <li>Open DevTools.</li>
        <li>Select Network.</li>
        <li>Clear the existing requests.</li>
        <li>Enter unique text in the printer page.</li>
        <li>Press the printer page's Print Test button.</li>
        <li>Select the new network request.</li>
        <li>Record the Request URL, HTTP method, Content-Type, and request payload or form data.</li>
        <li>Use Copy as fetch or Copy as cURL when available.</li>
        <li>Enter those exact values into this diagnostic page.</li>
      </ol>
    </details>
  `;
}

function directPrinterRenderApp(root: HTMLElement): void {
  root.innerHTML = `
    <main class="direct-printer-page">
      <header class="direct-printer-header">
        <div>
          <p class="direct-printer-kicker">Temporary diagnostic utility</p>
          <h1>LilPrint Raw ESC/POS Test</h1>
          <p>
            Port 9100 is a raw TCP ESC/POS socket. A standard LilPOS browser page cannot open an unrestricted raw TCP connection.
            This page sends a browser-safe HTTP request to the LilPrint Agent. LilPrint then sends the raw ESC/POS bytes to the printer.
          </p>
        </div>
        <button type="button" class="btn-secondary direct-printer-back" id="directPrinterBack">Back to LilPOS</button>
      </header>

      <section class="direct-printer-callout warning">
        <b>Browser boundary</b>
        <span>Raw TCP printing must go through LilPrint. This page never sends fetch() requests directly to printer port 9100.</span>
      </section>

      <section class="direct-printer-panel direct-printer-section">
        <h2>LilPrint Agent Test</h2>
        <p class="direct-printer-muted">Browser -> LilPrint HTTP API -> raw ESC/POS TCP 9100 -> printer.</p>
        <div class="direct-printer-layout">
          <div>
          <div class="direct-printer-fields">
            <label class="direct-printer-wide-field">
              <span>LilPrint Agent URL</span>
              <input id="directPrinterAgentUrl" value="${directPrinterEscape(directPrinterState.form.agentUrl)}" inputmode="url" autocomplete="off" spellcheck="false" />
            </label>
            <label>
              <span>Printer IP</span>
              <input id="directPrinterIp" value="${directPrinterEscape(directPrinterState.form.ip)}" inputmode="decimal" autocomplete="off" spellcheck="false" />
            </label>
            <label>
              <span>Printer port</span>
              <input id="directPrinterPort" value="${directPrinterEscape(directPrinterState.form.port)}" inputmode="numeric" autocomplete="off" spellcheck="false" />
            </label>
            <label class="direct-printer-wide-field">
              <span>Printer profile</span>
              <select id="directPrinterProfile">${directPrinterProfileOptions()}</select>
            </label>
            <label class="direct-printer-message-field">
              <span>Test message</span>
              <textarea id="directPrinterMessage" rows="4" autocomplete="off" spellcheck="false">${directPrinterEscape(directPrinterState.form.message)}</textarea>
            </label>
            <label>
              <span>Feed lines</span>
              <input id="directPrinterFeedLines" value="${directPrinterEscape(directPrinterState.form.feedLines)}" inputmode="numeric" autocomplete="off" spellcheck="false" />
            </label>
            <label class="direct-printer-toggle">
              <input id="directPrinterCutPaper" type="checkbox" ${directPrinterState.form.cutPaper ? 'checked' : ''} />
              <span>Cut paper</span>
            </label>
            <label class="direct-printer-toggle">
              <input id="directPrinterOpenDrawer" type="checkbox" ${directPrinterState.form.openCashDrawer ? 'checked' : ''} />
              <span>Open cash drawer</span>
            </label>
          </div>
          <div class="direct-printer-actions">
            <button type="button" class="btn-primary" id="directPrinterSendRaw" ${directPrinterState.running ? 'disabled' : ''}>${directPrinterState.running === 'print' ? 'Sending...' : 'Send Raw ESC/POS Through LilPrint'}</button>
            <button type="button" class="btn-success" id="directPrinterHealth" ${directPrinterState.running ? 'disabled' : ''}>${directPrinterState.running === 'health' ? 'Testing...' : 'Test LilPrint Health'}</button>
          </div>
          </div>
          ${directPrinterRenderPayloadPreview()}
        </div>
      </section>

      ${directPrinterRenderDirectWebSection()}
      ${directPrinterRenderWebInterfaceSection()}

      <section class="direct-printer-section">
        <div class="direct-printer-panel-heading">
          <h2>Activity Log</h2>
          <button type="button" class="btn-secondary" id="directPrinterClear">Clear Results</button>
        </div>
        ${directPrinterRenderResult(directPrinterState.result)}
      </section>

      ${directPrinterRenderCaptureHelp()}
    </main>
  `;
}

function directPrinterSyncFormFromDom(root: HTMLElement): void {
  directPrinterState.form.agentUrl = (root.querySelector('#directPrinterAgentUrl') as HTMLInputElement | null)?.value || '';
  directPrinterState.form.ip = (root.querySelector('#directPrinterIp') as HTMLInputElement | null)?.value || '';
  directPrinterState.form.port = (root.querySelector('#directPrinterPort') as HTMLInputElement | null)?.value || '';
  directPrinterState.form.profile = (root.querySelector('#directPrinterProfile') as HTMLSelectElement | null)?.value || 'generic_escpos_thermal';
  directPrinterState.form.message = (root.querySelector('#directPrinterMessage') as HTMLTextAreaElement | null)?.value || '';
  directPrinterState.form.feedLines = (root.querySelector('#directPrinterFeedLines') as HTMLInputElement | null)?.value || '0';
  directPrinterState.form.cutPaper = !!(root.querySelector('#directPrinterCutPaper') as HTMLInputElement | null)?.checked;
  directPrinterState.form.openCashDrawer = !!(root.querySelector('#directPrinterOpenDrawer') as HTMLInputElement | null)?.checked;

  directPrinterState.directWeb.baseUrl = (root.querySelector('#directWebBaseUrl') as HTMLInputElement | null)?.value || '';
  directPrinterState.directWeb.endpoint = (root.querySelector('#directWebEndpoint') as HTMLInputElement | null)?.value || '';
  directPrinterState.directWeb.method = ((root.querySelector('#directWebMethod') as HTMLSelectElement | null)?.value === 'GET' ? 'GET' : 'POST');
  const contentTypeValue = (root.querySelector('#directWebContentType') as HTMLSelectElement | null)?.value || 'application/json';
  directPrinterState.directWeb.contentType = (['application/json', 'application/x-www-form-urlencoded', 'text/plain', 'application/octet-stream', 'Custom'].includes(contentTypeValue)
    ? contentTypeValue
    : 'application/json') as DirectWebContentType;
  directPrinterState.directWeb.customContentType = (root.querySelector('#directWebCustomContentType') as HTMLInputElement | null)?.value || '';
  directPrinterState.directWeb.message = (root.querySelector('#directWebMessage') as HTMLTextAreaElement | null)?.value || '';
  directPrinterState.directWeb.bodyTemplate = (root.querySelector('#directWebBodyTemplate') as HTMLTextAreaElement | null)?.value || '';
  directPrinterState.directWeb.noCors = !!(root.querySelector('#directWebNoCors') as HTMLInputElement | null)?.checked;
  directPrinterState.directWeb.capturedNotes = (root.querySelector('#directWebCapturedNotes') as HTMLTextAreaElement | null)?.value || '';
}

function directPrinterClient(): any {
  return window.LilposLilPrintClient.createLilPrintClient({
    baseUrl: directPrinterNormalizeBaseUrl(directPrinterState.form.agentUrl),
    timeoutMs: 8000
  });
}

async function directPrinterRunHealth(root: HTMLElement): Promise<void> {
  directPrinterSyncFormFromDom(root);
  const errors = directPrinterValidateForm().filter((message) => !message.includes('Printer'));
  const endpoint = directPrinterHealthEndpoint();
  const startDate = new Date();
  const startMark = performance.now();

  if (errors.length) {
    directPrinterState.result = {
      title: 'Health Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'GET',
      httpStatus: 'Not sent',
      summary: errors.join(' '),
      elapsedMs: '0',
      errorName: 'ValidationError',
      errorMessage: errors.join(' '),
      responseBody: null,
      checks: [{ label: 'Invalid request', value: errors.join(' '), tone: 'failure' }],
      log: directPrinterAppendLog(`Health test blocked by validation: ${errors.join(' ')}`)
    };
    directPrinterRender(root.id || 'app');
    return;
  }

  directPrinterState.running = 'health';
  directPrinterState.result = {
    title: 'Health Result',
    startTime: directPrinterTimestamp(startDate),
    endpoint,
    method: 'GET',
    httpStatus: 'Pending',
    summary: 'Health test started.',
    elapsedMs: '0',
    errorName: '',
    errorMessage: '',
    responseBody: null,
    checks: [],
    log: directPrinterAppendLog(`Health test started. Target LilPrint URL: ${endpoint}`)
  };
  directPrinterRender(root.id || 'app');

  try {
    const response = await directPrinterClient().getHealth();
    const elapsed = Math.round(performance.now() - startMark);
    const statusText = response.status ? String(response.status) : '0';
    const data = response.data || null;
    const queue = data?.queueDatabase || data?.queueDatabaseStatus || data?.queue?.status || '';
    directPrinterState.result = {
      title: 'Health Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'GET',
      httpStatus: statusText,
      summary: response.ok
        ? `Agent reachable. Version: ${data?.version || 'not returned'}. Uptime: ${data?.uptimeSeconds ?? 'not returned'}. Queue status: ${queue || 'not returned'}.`
        : `Failed. ${response.errorMessage || 'LilPrint health request failed.'}`,
      elapsedMs: String(elapsed),
      errorName: response.ok ? '' : 'LilPrintHealthError',
      errorMessage: response.ok ? '' : String(response.errorMessage || ''),
      responseBody: data,
      checks: directPrinterClassify(response, null, endpoint),
      log: [
        `[${directPrinterTimestamp()}] Health test response. HTTP status: ${statusText}. Body: ${directPrinterJson(data)}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } catch (error) {
    const elapsed = Math.round(performance.now() - startMark);
    const err = error instanceof Error ? error : new Error(String(error));
    directPrinterState.result = {
      title: 'Health Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'GET',
      httpStatus: '0',
      summary: 'Failed. LilPrint Agent was not reachable from this browser.',
      elapsedMs: String(elapsed),
      errorName: err.name,
      errorMessage: err.message,
      responseBody: null,
      checks: directPrinterClassify(null, err, endpoint),
      log: [
        `[${directPrinterTimestamp()}] Error name and message: ${err.name}: ${err.message}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } finally {
    directPrinterState.running = null;
    directPrinterRender(root.id || 'app');
  }
}

async function directPrinterRunPrint(root: HTMLElement): Promise<void> {
  directPrinterSyncFormFromDom(root);
  const endpoint = directPrinterPrintEndpoint();
  const errors = directPrinterValidateForm();
  const startDate = new Date();
  const startMark = performance.now();

  if (!window.LilposLilPrintClient?.createLilPrintClient) errors.push('LilPrint client is not loaded.');
  if (!window.LilposEscposBuilder?.createEscposBuilder) errors.push('ESC/POS builder is not loaded.');

  if (errors.length) {
    directPrinterState.result = {
      title: 'Raw Print Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'POST',
      httpStatus: 'Not sent',
      summary: errors.join(' '),
      elapsedMs: '0',
      errorName: 'ValidationError',
      errorMessage: errors.join(' '),
      responseBody: null,
      checks: [{ label: 'Invalid request', value: errors.join(' '), tone: 'failure' }],
      log: directPrinterAppendLog(`Raw-print request blocked by validation: ${errors.join(' ')}`)
    };
    directPrinterRender(root.id || 'app');
    return;
  }

  let requestBody: LilPrintJobCreateRequest;
  try {
    requestBody = directPrinterBuildRequestBody();
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    directPrinterState.result = {
      title: 'Raw Print Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'POST',
      httpStatus: 'Not sent',
      summary: 'Failed. Unable to build the ESC/POS payload.',
      elapsedMs: '0',
      errorName: err.name,
      errorMessage: err.message,
      responseBody: null,
      checks: [{ label: 'Invalid request', value: err.message, tone: 'failure' }],
      log: directPrinterAppendLog(`Error name and message: ${err.name}: ${err.message}`)
    };
    directPrinterRender(root.id || 'app');
    return;
  }

  directPrinterState.running = 'print';
  directPrinterState.result = {
    title: 'Raw Print Result',
    startTime: directPrinterTimestamp(startDate),
    endpoint,
    method: 'POST',
    httpStatus: 'Pending',
    summary: 'Raw-print request started.',
    elapsedMs: '0',
    errorName: '',
    errorMessage: '',
    requestBody,
    responseBody: null,
    checks: [],
    log: [
      `[${directPrinterTimestamp()}] Raw-print request started.`,
      `[${directPrinterTimestamp()}] Target LilPrint URL: ${directPrinterNormalizeBaseUrl(directPrinterState.form.agentUrl)}`,
      `[${directPrinterTimestamp()}] Printer IP and port: ${directPrinterState.form.ip.trim()}:${Number(directPrinterState.form.port || 9100)}`,
      `[${directPrinterTimestamp()}] Endpoint used: /v1/print-jobs`,
      ...directPrinterAppendLog('Prepared LilPrint request body using the existing /v1/print-jobs contract.')
    ]
  };
  directPrinterRender(root.id || 'app');

  try {
    const response = await directPrinterClient().submitPrintJob(requestBody);
    const elapsed = Math.round(performance.now() - startMark);
    const statusText = response.status ? String(response.status) : '0';
    const data = response.data || null;
    directPrinterState.result = {
      title: 'Raw Print Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'POST',
      httpStatus: statusText,
      summary: directPrinterSummaryFromPrintResponse(response),
      elapsedMs: String(elapsed),
      errorName: response.ok ? '' : 'LilPrintPrintJobError',
      errorMessage: response.ok ? '' : String(response.errorMessage || ''),
      requestBody,
      responseBody: data,
      checks: directPrinterClassify(response, null, endpoint),
      log: [
        `[${directPrinterTimestamp()}] HTTP status: ${statusText}`,
        `[${directPrinterTimestamp()}] LilPrint response body: ${directPrinterJson(data)}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } catch (error) {
    const elapsed = Math.round(performance.now() - startMark);
    const err = error instanceof Error ? error : new Error(String(error));
    directPrinterState.result = {
      title: 'Raw Print Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: 'POST',
      httpStatus: '0',
      summary: 'Failed. LilPrint Agent was not reachable from this browser.',
      elapsedMs: String(elapsed),
      errorName: err.name,
      errorMessage: err.message,
      requestBody,
      responseBody: null,
      checks: directPrinterClassify(null, err, endpoint),
      log: [
        `[${directPrinterTimestamp()}] Error name and message: ${err.name}: ${err.message}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } finally {
    directPrinterState.running = null;
    directPrinterRender(root.id || 'app');
  }
}

async function directWebPrinterRun(root: HTMLElement): Promise<void> {
  directPrinterSyncFormFromDom(root);
  const errors = directWebPrinterValidateForm();
  const startDate = new Date();
  const startMark = performance.now();
  let endpoint = '';

  try {
    endpoint = directWebPrinterTargetUrl();
  } catch {
    endpoint = `${directPrinterNormalizeBaseUrl(directPrinterState.directWeb.baseUrl)}/${directPrinterState.directWeb.endpoint.trim()}`;
  }

  if (errors.length) {
    directPrinterState.result = {
      title: 'Direct Web Printer Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method: directPrinterState.directWeb.method,
      httpStatus: 'Not sent',
      summary: errors.join(' '),
      elapsedMs: '0',
      errorName: 'ValidationError',
      errorMessage: errors.join(' '),
      responseBody: null,
      checks: [{ label: 'Invalid URL', value: errors.join(' '), tone: 'failure' }],
      log: directPrinterAppendLog(`Direct web-printer request blocked by validation: ${errors.join(' ')}`)
    };
    directPrinterRender(root.id || 'app');
    return;
  }

  const method = directPrinterState.directWeb.method;
  const contentType = directWebPrinterContentType();
  const requestBodyText = method === 'GET' ? '' : directWebPrinterRequestBody();
  const noCors = directPrinterState.directWeb.noCors === true;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  const requestPreview = {
    url: endpoint,
    method,
    contentType: method === 'GET' ? 'Not sent for GET' : contentType,
    noCors,
    body: method === 'GET' ? 'GET request sends no body. Put captured query parameters in the endpoint.' : requestBodyText,
    capturedNotesStoredOnly: directPrinterState.directWeb.capturedNotes ? 'Captured Request Notes present; not executed or interpreted.' : 'No captured notes.'
  };

  directPrinterState.running = 'direct';
  directPrinterState.result = {
    title: 'Direct Web Printer Result',
    startTime: directPrinterTimestamp(startDate),
    endpoint,
    method,
    httpStatus: 'Pending',
    summary: 'Direct web-printer HTTP request started.',
    elapsedMs: '0',
    errorName: '',
    errorMessage: '',
    requestBody: requestPreview,
    responseBody: null,
    checks: [],
    log: [
      `[${directPrinterTimestamp()}] Direct web-printer request started.`,
      `[${directPrinterTimestamp()}] Complete target URL: ${endpoint}`,
      `[${directPrinterTimestamp()}] HTTP method: ${method}`,
      `[${directPrinterTimestamp()}] Content type: ${method === 'GET' ? 'Not sent for GET' : contentType}`,
      ...directPrinterAppendLog('Direct Web Printer API Test uses browser HTTP only. It is not raw TCP printing.')
    ]
  };
  directPrinterRender(root.id || 'app');

  try {
    const headers: Record<string, string> = {};
    if (method !== 'GET' && contentType && !(noCors && !['text/plain', 'application/x-www-form-urlencoded'].includes(contentType))) {
      headers['Content-Type'] = contentType;
    }

    const init: RequestInit = {
      method,
      cache: 'no-store',
      signal: controller.signal
    };
    if (noCors) init.mode = 'no-cors';
    if (Object.keys(headers).length) init.headers = headers;
    if (method !== 'GET') init.body = requestBodyText;

    const response = await fetch(endpoint, init);
    const elapsed = Math.round(performance.now() - startMark);
    let responseBody: any = null;
    let responseText = '';

    if (!noCors && response.type !== 'opaque') {
      responseText = await response.text();
      try {
        responseBody = responseText ? JSON.parse(responseText) : '';
      } catch {
        responseBody = responseText;
      }
    }

    const opaque = noCors || response.type === 'opaque';
    const statusText = opaque ? 'Opaque' : String(response.status);
    directPrinterState.result = {
      title: 'Direct Web Printer Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method,
      httpStatus: statusText,
      summary: opaque
        ? 'Request submitted with opaque response. The browser submitted an opaque request. The response and physical print result cannot be verified. Check printer physically.'
        : response.ok
          ? 'Printer HTTP API responded. Physical printing not confirmed. Check printer physically.'
          : 'Printer rejected request or returned an HTTP error. Physical printing not confirmed.',
      elapsedMs: String(elapsed),
      errorName: '',
      errorMessage: '',
      requestBody: requestPreview,
      responseBody: opaque ? 'Opaque response; body is not readable in no-cors diagnostic mode.' : responseBody,
      checks: directWebPrinterClassify(response, null, endpoint, opaque),
      log: [
        `[${directPrinterTimestamp()}] HTTP status: ${statusText}`,
        `[${directPrinterTimestamp()}] Response body: ${opaque ? 'Opaque response; not readable.' : directPrinterJson(responseBody)}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        `[${directPrinterTimestamp()}] Physical printing not confirmed. Check printer physically.`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } catch (error) {
    const elapsed = Math.round(performance.now() - startMark);
    const err = error instanceof Error ? error : new Error(String(error));
    directPrinterState.result = {
      title: 'Direct Web Printer Result',
      startTime: directPrinterTimestamp(startDate),
      endpoint,
      method,
      httpStatus: '0',
      summary: 'Browser blocked request or the printer HTTP endpoint was unreachable. Physical printing not confirmed.',
      elapsedMs: String(elapsed),
      errorName: err.name,
      errorMessage: err.message,
      requestBody: requestPreview,
      responseBody: null,
      checks: directWebPrinterClassify(null, err, endpoint, noCors),
      log: [
        `[${directPrinterTimestamp()}] Error name and message: ${err.name}: ${err.message}`,
        `[${directPrinterTimestamp()}] Elapsed time: ${elapsed} ms`,
        `[${directPrinterTimestamp()}] Physical printing not confirmed. Check printer physically.`,
        ...(directPrinterState.result?.log || [])
      ]
    };
  } finally {
    window.clearTimeout(timeoutId);
    directPrinterState.running = null;
    directPrinterRender(root.id || 'app');
  }
}

function directPrinterOpenWebInterface(root: HTMLElement): void {
  directPrinterSyncFormFromDom(root);
  const webUrl = directPrinterWebUrl();
  window.open(webUrl, '_blank', 'noopener,noreferrer');
  directPrinterState.result = {
    title: 'Printer Web Interface',
    startTime: directPrinterTimestamp(),
    endpoint: webUrl,
    method: 'GET in new browser tab',
    httpStatus: 'Not measured',
    summary: "Opened the printer configuration webpage. This is separate from raw printing and does not use port 9100.",
    elapsedMs: 'Not measured',
    errorName: '',
    errorMessage: '',
    responseBody: null,
    checks: [],
    log: directPrinterAppendLog(`Opened printer web interface URL ${webUrl}`)
  };
  directPrinterRender(root.id || 'app');
}

function directPrinterAttachEvents(root: HTMLElement): void {
  root.querySelector('#directPrinterBack')?.addEventListener('click', () => {
    window.location.assign('/');
  });
  root.querySelector('#directPrinterSendRaw')?.addEventListener('click', () => {
    void directPrinterRunPrint(root);
  });
  root.querySelector('#directPrinterHealth')?.addEventListener('click', () => {
    void directPrinterRunHealth(root);
  });
  root.querySelector('#directWebSend')?.addEventListener('click', () => {
    void directWebPrinterRun(root);
  });
  root.querySelector('#directPrinterWeb')?.addEventListener('click', () => {
    directPrinterOpenWebInterface(root);
  });
  root.querySelector('#directPrinterClear')?.addEventListener('click', () => {
    directPrinterSyncFormFromDom(root);
    directPrinterState.result = null;
    directPrinterRender(root.id || 'app');
  });
  root.querySelectorAll('input, textarea, select').forEach((field) => {
    field.addEventListener('input', () => {
      directPrinterSyncFormFromDom(root);
    });
    field.addEventListener('change', () => {
      directPrinterSyncFormFromDom(root);
      directPrinterRender(root.id || 'app');
    });
  });
}

function directPrinterRender(rootId = 'app'): void {
  const root = document.getElementById(rootId);
  if (!root) return;
  directPrinterRenderApp(root);
  directPrinterAttachEvents(root);
}

window.LilposDirectPrinterTest = {
  render: directPrinterRender
};
