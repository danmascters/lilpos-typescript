# LilPrint Print Agent API Specification

> **Version:** 1.0.0 | **OpenAPI:** 3.1.0
> **Repository:** dash1-print-agent
> **Primary Purpose:** Durable local print delivery for MerchantDash, LilPOS, and future Bringdat applications.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Network and Security Model](#network-and-security-model)
3. [Agent Discovery](#agent-discovery)
4. [Printer Identity Model](#printer-identity-model)
5. [Print Job Lifecycle](#print-job-lifecycle)
6. [Durability Model](#durability-model)
7. [Retry Policy](#retry-policy)
8. [Queue Clear Semantics](#queue-clear-semantics)
9. [Pause and Resume](#pause-and-resume)
10. [Error Model](#error-model)
11. [Filtering and Pagination](#filtering-and-pagination)
12. [Supported Payload Types](#supported-payload-types)
13. [Supported Transports](#supported-transports)
14. [Capabilities Matrix](#capabilities-matrix)
15. [Legacy Versus Current API](#legacy-versus-current-api)
16. [Client Integration Guide — LilPOS](#client-integration-guide--lilpos)
17. [Client Integration Guide — MerchantDash](#client-integration-guide--merchantdash)
18. [Complete Endpoint Reference](#complete-endpoint-reference)
19. [Request and Response Examples](#request-and-response-examples)

---

## Architecture Overview

```
┌──────────────┐     ┌───────────────────┐     ┌─────────────────┐
│  LilPOS /     │────▶│  LilPrint Agent   │────▶│  Network Printer │
│  MerchantDash │     │  (Local Service)  │     │  (TCP 9100)     │
│  (Browser)    │     │                   │     └─────────────────┘
└──────────────┘     │  ┌─────────────┐   │
                     │  │   SQLite    │   │
                     │  │  Durable    │   │
                     │  │   Queue     │   │
                     │  └─────────────┘   │
                     └───────────────────┘
```

The LilPrint Agent is a **local Node.js service** that:
- Listens on HTTP (default `127.0.0.1:3030`) and optionally HTTPS (default `127.0.0.1:3031`)
- Accepts print jobs from browser-based applications via HTTP REST
- Stores jobs durably in SQLite (WAL mode, FULL synchronous)
- Processes per-printer FIFO queues with concurrency isolation (one send at a time per printer endpoint)
- Retries transient failures with fixed backoff
- Transmits ESC/POS data to network printers over TCP port 9100
- Recovers gracefully after process restart (abandoned SENDING jobs -> FAILED_FINAL)

---

## Network and Security Model

| Aspect | Current Implementation |
|---|---|
| **HTTP listener** | Always bound to `127.0.0.1:3030` (localhost only) |
| **HTTPS listener** | Default `127.0.0.1:3031`, requires TLS cert+key at `certs/localhost-cert.pem` and `certs/localhost-key.pem` |
| **CORS** | `Access-Control-Allow-Origin: *` — open to all origins |
| **Authentication** | **None.** No API keys, tokens, or origin validation. Agent trusts local clients. |
| **TLS** | Optional. Not enabled by default; configurable via config file. |
| **Windows Firewall** | No automatic firewall rules. If the agent binds to `0.0.0.0` for LAN access, firewall exceptions must be configured manually. |
| **Android** | Runs as a Node.js process. No Android-specific permission enforcement. |

### Production Security Gap

The agent has **no authentication mechanism**. Any application that can reach the agent's address can submit print jobs. This is acceptable for localhost-only deployments but becomes a security concern if the agent is exposed to the LAN.

---

## Agent Discovery

Clients discover the agent by:

1. **Health check:** `GET /health` on the known address (default `http://127.0.0.1:3030/health`)
2. **Agent info:** `GET /v1/agent` to read capabilities, payload types, and supported transports
3. **Port scanning:** The HTTP port (`3030`) is always available. The HTTPS port (`3031`) is available only if TLS is configured.

**Recommended discovery flow:**

```
1. Try https://localhost:3031/health
2. If that fails, try http://localhost:3030/health
3. If both fail, agent is not running
```

---

## Printer Identity Model

### Stable vs. Generated Printer IDs

The agent supports two printer identity modes:

#### 1. Client-Provided Stable ID (`printerId`)

When the client provides a `printer.id` field (in the primary `POST /v1/print-jobs` API), that ID is used as the durable internal identity. This ID is:
- Stable across IP or name changes
- Used as the SQLite `printers.printer_id` primary key
- Limited to 128 characters: `[A-Za-z0-9_-]+`

Clients **should** generate and store a stable ID per physical printer and reuse it on every request.

#### 2. Generated Fallback ID (Legacy Only)

When the legacy `/print/epson-raw` endpoint is called **without** `printerId`, the agent generates a deterministic ID:

```
tcp-{sanitized-ip}-{port}
```

Where `sanitized-ip` replaces non-alphanumeric characters with hyphens. Example:
- Input: `192.168.1.234`, port `9100`
- Generated: `tcp-192-168-1-234-9100`

#### 3. Fallback ID Reassignment

When a legacy request arrives with a new stable `printerId` that maps to the same IP+port as an existing generated ID:
- The agent **reassigns** the generated ID to the new stable ID
- All print jobs and events linked to the generated ID are migrated to the new stable ID
- A `PRINTER_ID_REASSIGNED` event is recorded

This allows a smooth transition from legacy to stable identity.

### Printer Object Structure

```json
{
  "id": "printer_1780828559134_9bkk66",
  "name": "Pizza",
  "ip": "192.168.1.234",
  "port": 9100,
  "profile": "epson_tm_u220",
  "transport": "tcp_9100"
}
```

### Printer Status Values

| Status | Meaning |
|---|---|
| `UNKNOWN` | Initial state; no connection attempt yet |
| `AVAILABLE` | Last connection was successful |
| `UNREACHABLE` | Last connection failed |
| `PAUSED` | Printer manually paused; no jobs will be sent |
| `PAPER_OUT` | Defined in enum but never set by current code |
| `COVER_OPEN` | Defined in enum but never set by current code |
| `CUTTER_ERROR` | Defined in enum but never set by current code |

---

## Print Job Lifecycle

### Status Enum

| Status | Meaning | Terminal | Active | Can Retry | Can Cancel | Can Resolve |
|---|---|---|---|---|---|---|
| `QUEUED` | Accepted durably, waiting for delivery | No | Yes | N/A | Yes | No |
| `SENDING` | Delivery attempt in progress | No | Yes | No | No | No |
| `TRANSMITTED` | Bytes sent successfully to printer connection | **Yes** | No | No | No | No |
| `RETRY_WAIT` | Failed, waiting for next retry | No | Yes | Yes | Yes | No |
| `FAILED_FINAL` | Retry policy exhausted | **Yes** | No | **Yes** | No | **Yes** |
| `CANCELED` | Canceled by user action | **Yes** | No | No | No | No |
| `MANUALLY_RESOLVED` | Manually resolved by operator | **Yes** | No | No | No | No |

### State Machine

```
    ┌─────┐
    │ New │
    └──┬──┘
       │
       ▼
   ┌─────────┐    failure     ┌────────────┐   retry      ┌─────────┐
   │  QUEUED │───────────────▶│ RETRY_WAIT  │────────────▶│  QUEUED │
   └────┬────┘                └──────┬──────┘             └────┬────┘
        │                            │                         │
        │ claim                      │ exhausted                │
        ▼                            ▼                         │
   ┌─────────┐                 ┌──────────────┐               │
   │ SENDING │                 │ FAILED_FINAL │───────────────┘
   └────┬────┘                 └──────┬───────┘     retry
        │                             │
        │ success                     │ resolve
        ▼                             ▼
   ┌──────────────┐           ┌──────────────────┐
   │ TRANSMITTED  │           │ MANUALLY_RESOLVED │
   └──────────────┘           └──────────────────┘

   QUEUED ──cancel──▶ CANCELED
   RETRY_WAIT ──cancel──▶ CANCELED
```

### Important Distinctions

- **TRANSMITTED** means the agent opened a TCP connection to the printer, wrote all payload bytes, and closed the connection without a transport error. It does **not** confirm that paper physically emerged, that the print was readable, or that the printer had paper.
- **SENDING** jobs that are abandoned due to agent restart are moved to `FAILED_FINAL` with code `AMBIGUOUS_TRANSMISSION` during startup recovery. This is a safe default: the job *might* have been sent, so the agent will not automatically retry.
- **QUEUED** is the only non-terminal status that jobs enter initially. Jobs enter `RETRY_WAIT` only after a failed delivery attempt with retry remaining.

### Status Transition Rules

| Operation | From | To | Notes |
|---|---|---|---|
| Create job | — | QUEUED | Initial state |
| Worker claims job | QUEUED, RETRY_WAIT | SENDING | Only if next_attempt_at <= now |
| Send succeeds | SENDING | TRANSMITTED | Terminal |
| Send fails (retryable) | SENDING | RETRY_WAIT | next_attempt_at set per backoff |
| Send fails (exhausted) | SENDING | FAILED_FINAL | Terminal |
| Cancel | QUEUED, RETRY_WAIT | CANCELED | Terminal |
| Retry | FAILED_FINAL, RETRY_WAIT | QUEUED | Resets completed_at, resolution_note |
| Resolve | FAILED_FINAL | MANUALLY_RESOLVED | Terminal |
| Reprint | any | QUEUED (new job) | Creates separate job linked via originalJobId |
| Crash recovery | SENDING | FAILED_FINAL | Code: AMBIGUOUS_TRANSMISSION |

---

## Durability Model

### What "API Accepted" Means

When `POST /v1/print-jobs` returns `202 Accepted`, the job has been:

1. **Validated** — all required fields checked, payload format verified
2. **Deduplicated** — idempotency key checked against existing jobs
3. **Persisted** — written to SQLite inside a `BEGIN IMMEDIATE` transaction
4. **Queued** — the queue manager is notified to begin delivery

The job is **durable** at this point. If the agent crashes or is restarted, the job survives and will be delivered after recovery.

### Idempotency

- Idempotency keys are scoped to `(appId, idempotencyKey)`.
- If the same key is reused with **identical** printer and payload data, the existing job is returned with `duplicate: true`. No new job is created.
- If the key is reused with **different** data, the API responds with `409 IDEMPOTENCY_CONFLICT`.
- Idempotency keys are stored in SQLite with a `UNIQUE(app_id, idempotency_key)` constraint.

### Crash Recovery

On startup:
1. SQLite integrity check is performed (`PRAGMA integrity_check`)
2. All `SENDING` jobs are moved to `FAILED_FINAL` with code `AMBIGUOUS_TRANSMISSION`
3. All `QUEUED` and eligible `RETRY_WAIT` jobs remain in the queue and will be picked up
4. Paused printers remain paused (paused state is persisted in SQLite)

### Attempt and Event History

- Each delivery attempt is recorded in the `print_attempts` table
- Attempts include status, bytes sent, duration, error code, and retryable flag
- Events are recorded in the `agent_events` table with event type, status, error code, and metadata
- Attempt history is accessible via `GET /v1/print-jobs/{jobId}` (via `attemptCount` only); a dedicated attempts-list endpoint is **not** exposed
- A dedicated events-list endpoint is **not** exposed

### What Is NOT Durable

- **In-flight SENDING jobs:** If the agent crashes while a payload is being written to the TCP socket, the job becomes `FAILED_FINAL` (AMBIGUOUS_TRANSMISSION). The agent cannot determine whether the bytes reached the printer.
- **Transport-layer acknowledgments:** TCP delivery acknowledgment is handled by the OS. The agent confirms the socket `write` callback succeeded, not that the printer processed the data.

---

## Retry Policy

### Default Configuration

| Parameter | Default | Environment Variable | Description |
|---|---|---|---|
| Max attempts | 5 | — | Per-job via `options.maxAttempts` (1-20) |
| Socket timeout | 10000 ms | `PRINT_AGENT_SOCKET_TIMEOUT_MS` | TCP connect+write timeout |
| Queue poll interval | 250 ms | `PRINT_AGENT_QUEUE_POLL_MS` | How often the queue manager checks for due jobs |

### Backoff Intervals

Fixed delays (not exponential), indexed by attempt number (0-based):

| Attempt Number | Delay Before Next |
|---|---|
| 1st failure -> 2nd attempt | 0 ms (immediate) |
| 2nd failure -> 3rd attempt | 5000 ms |
| 3rd failure -> 4th attempt | 15000 ms |
| 4th failure -> 5th attempt | 30000 ms |
| 5th failure -> 6th+ attempts | 60000 ms |

### Retryable vs. Terminal Errors

**Retryable errors** (job goes to `RETRY_WAIT` if attempts remain):
- `PRINTER_CONNECTION_TIMEOUT` — connect timed out
- `PRINTER_CONNECTION_REFUSED` — ECONNREFUSED
- `NETWORK_UNREACHABLE` — ENETUNREACH
- `HOST_UNREACHABLE` — EHOSTUNREACH
- `SOCKET_WRITE_FAILURE` — EPIPE or ECONNRESET during write
- `PRINTER_SOCKET_ERROR` — any other socket error

**Terminal errors** (job goes to `FAILED_FINAL`):
- `AMBIGUOUS_TRANSMISSION` — failure occurred after some bytes were written. The agent cannot safely retry.
- Non-retryable errors with `retryable=false`
- Exhausted `maxAttempts`

### Per-Printer Concurrency

- **One send at a time per printer endpoint.** The queue manager tracks both `activePrinters` (per-printer-ID) and `activeEndpoints` (per-IP+port+transport). Two logical printers sharing the same physical endpoint will not send concurrently.
- **Cross-printer concurrency.** Sends to different printers run concurrently in separate async loops.
- The worker loop processes the FIFO queue for each printer: if a `RETRY_WAIT` job's timer has not fired, the next `QUEUED` job for the same printer is picked up instead (does not block the queue).

---

## Queue Clear Semantics

The `POST /v1/printers/{printerId}/queue/clear` operation:

### What It Affects
- Cancels all `QUEUED` jobs for the printer
- Cancels all `RETRY_WAIT` jobs for the printer
- Default status list: `["QUEUED", "RETRY_WAIT"]`
- Does **not** cancel `SENDING` jobs
- Does **not** affect `TRANSMITTED`, `FAILED_FINAL`, `CANCELED`, or `MANUALLY_RESOLVED` jobs
- Does **not** delete records — all records are preserved as `CANCELED`
- Is **transactional** — if event recording fails, all changes are rolled back

### Response Fields

| Field | Description |
|---|---|
| `canceledCount` | Number of jobs moved to `CANCELED` |
| `skippedSendingCount` | Number of `SENDING` jobs left untouched |
| `remainingQueuedCount` | Jobs still in target statuses after operation (should be 0 for a full clear) |
| `status` | `"CLEARED"` if `remainingQueuedCount === 0`, else `"PARTIALLY_CLEARED"` |

### Race Condition Protection

If a clear operation races with a queue worker that has already selected a job but not yet claimed it:
- The `startAttempt` SQL update includes a `WHERE status = 'QUEUED' OR ...` guard, so the claim fails if the clear already changed the status
- The clear operation cancels based on the current status at execution time
- Result: the job is either canceled or transmitted, but never both

---

## Pause and Resume

### Pause (`POST /v1/printers/{printerId}/pause`)

- Affects **one printer** (not the whole agent)
- The queue manager will **not claim new jobs** for this printer (paused printers are excluded by `WHERE p.paused = 0`)
- Any currently `SENDING` job **continues** its delivery attempt
- Queued and `RETRY_WAIT` jobs remain durable (not canceled)
- Retry timers are not explicitly canceled — when a `RETRY_WAIT` timer fires, the job stays `RETRY_WAIT` because the printer is paused
- Requires `reason` and `requestedBy` for audit trail
- Returns `{ ok: true, printerId, paused: true, status: "PAUSED" }`

### Resume (`POST /v1/printers/{printerId}/resume`)

- The queue manager will **resume claiming jobs** for this printer
- `QUEUED` jobs are delivered in FIFO order
- `RETRY_WAIT` jobs whose timer has already fired become eligible immediately
- Requires `reason` and `requestedBy` for audit trail
- Returns `{ ok: true, printerId, paused: false, status: "UNKNOWN" }` (status resets to UNKNOWN)

### Persistence

Pause state is persisted in SQLite (`printers.paused` column). After agent restart:
- Paused printers remain paused
- The queue manager will not claim jobs for paused printers until they are explicitly resumed

---

## Error Model

### Error Response Format

All error responses use this structure:

```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing printer.ip",
    "retryable": false,
    "field": "printer.ip"
  },
  "requestId": "req-a1b2c3d4"
}
```

### HTTP Status Codes

| Status | Meaning |
|---|---|
| **200** | Success (or job returned) |
| **202** | Accepted (job created, processing async) |
| **400** | Validation error (missing fields, invalid values) |
| **404** | Job or printer not found |
| **409** | State conflict (wrong status, idempotency conflict) |
| **413** | Payload too large (max 5 MB + 64 KB buffer) |
| **422** | Conversion failure (malformed ePOS XML during send) |
| **500** | Internal agent error |
| **503** | Queue database unavailable |

### Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `INVALID_JSON` | 400 | Request body is not valid JSON |
| `INVALID_REQUEST` | 400 | Missing or invalid required field |
| `INVALID_PRINTER_IP` | 400 | Invalid printer IP or hostname |
| `INVALID_PRINTER_PORT` | 400 | Invalid printer port |
| `INVALID_PRINTER_ID` | 400 | Invalid printer ID format |
| `UNSUPPORTED_PAYLOAD_TYPE` | 400 | Unsupported payload type |
| `UNSUPPORTED_PRINTER_TRANSPORT` | 400 | Unsupported transport (only tcp_9100) |
| `PAYLOAD_TOO_LARGE` | 413 | Payload exceeds 5 MB |
| `MALFORMED_BASE64` | 400 | Invalid Base64 encoding |
| `MALFORMED_EPOS_XML` | 400/422 | Invalid ePOS XML |
| `IDEMPOTENCY_CONFLICT` | 409 | Idempotency key reused with different data |
| `JOB_ID_CONFLICT` | 409 | Job ID already in use |
| `JOB_NOT_FOUND` | 404 | Job does not exist |
| `PRINTER_NOT_FOUND` | 404 | Printer does not exist |
| `INVALID_JOB_STATE` | 409 | Job status does not permit the operation |
| `INVALID_CLEAR_STATUS` | 400 | Invalid status in clear request |
| `AGENT_INTERNAL_ERROR` | 500 | Unexpected agent error |
| `QUEUE_DATABASE_ERROR` | 503 | SQLite unavailable |

---

## Filtering and Pagination

### List Jobs Filters (`GET /v1/print-jobs`)

| Parameter | Type | Description |
|---|---|---|
| `appId` | string | Filter by application |
| `merchantId` | string | Filter by merchant |
| `locationId` | string | Filter by location |
| `printerId` | string | Filter by printer |
| `status` | string (enum) | Filter by job status |
| `createdAfter` | ISO 8601 | Jobs created at or after this timestamp |
| `createdBefore` | ISO 8601 | Jobs created at or before this timestamp |
| `limit` | integer (1-200, default 50) | Max results to return |
| `cursor` | string | **Not implemented.** Always returns `nextCursor: null`. |

### Queue Summary Filters (`GET /v1/queue`)

| Parameter | Type | Description |
|---|---|---|
| `appId` | string | Scope summary to a specific app |
| `printerId` | string | Scope summary to a specific printer |

### Default Ordering

- List jobs: `ORDER BY created_at DESC`
- Queue: grouped by status and printer
- Printers: `ORDER BY printer_name`

---

## Supported Payload Types

| Type | Description | Validation |
|---|---|---|
| `epos_xml` | Epson ePOS XML string | Must contain `<` and `>` characters; converted to ESC/POS at send time |
| `escpos_raw_base64` | Raw ESC/POS bytes as Base64 | Valid Base64 (no whitespace, correct padding, 4-char alignment) |
| `plain_text` | Plain UTF-8 text | No special validation; prefixed with ESC/POS initialize `0x1B 0x40` at send time |

### Maximum Payload Size

5 MB (configurable via `PRINT_AGENT_MAX_PAYLOAD_BYTES`). An additional 64 KB buffer is allowed during body parsing to avoid false rejections at the exact boundary.

---

## Supported Transports

| Transport | Target | Status |
|---|---|---|
| `tcp_9100` | Raw TCP socket to printer port 9100 | **Implemented** |

Only `tcp_9100` is currently supported. Requests specifying any other transport are rejected with `400 UNSUPPORTED_PRINTER_TRANSPORT`.

---

## Capabilities Matrix

| Capability | Status | Notes |
|---|---|---|
| Raw ESC/POS over TCP 9100 | **Implemented** | Primary transport |
| Epson ePOS XML conversion | **Implemented** | Converted to ESC/POS at send time |
| Star printer support | **Partial** | Profile name accepted; no Star-specific code |
| Windows spooler | **Not implemented** | — |
| Android QuickPrinter | **Not implemented** | — |
| USB printing | **Not implemented** | — |
| Serial printing | **Not implemented** | — |
| Cash drawer | **Not implemented** | — |
| Label printing | **Partial** | Generic ESC/POS may work |
| Printer tests | **Not implemented** | No test-printer endpoint exists |
| Print confirmation (paper-out) | **Not implemented** | `physicalPrintConfirmation: false` |
| Queue durability | **Implemented** | SQLite WAL mode + FULL sync |
| Multi-printer concurrency | **Implemented** | One send per endpoint at a time |
| Idempotency | **Implemented** | `(appId, idempotencyKey)` scoped |
| Reprint | **Implemented** | New job from existing job |
| Manual resolve | **Implemented** | FAILED_FINAL -> MANUALLY_RESOLVED |
| Cancel | **Implemented** | QUEUED and RETRY_WAIT only |
| Pause/Resume | **Implemented** | Per-printer, persisted across restarts |
| Clear queue | **Implemented** | QUEUED and RETRY_WAIT, transactional |
| Cursor pagination | **Not implemented** | Declared but not functional |
| Authentication | **Not implemented** | No API keys or tokens |
| TLS | **Implemented** | Optional, certificate-based |

---

## Legacy Versus Current API

### Recommended Durable API

`POST /v1/print-jobs` — the primary durable endpoint. Accepts structured requests with explicit `appId`, `merchantId`, `jobId`, `idempotencyKey`, printer target, and payload. Returns `202 Accepted` immediately after persistence. Job delivery is asynchronous.

### Legacy Compatibility API

`POST /print/epson-raw` — backward-compatible endpoint used by existing MerchantDash installations. Internally calls the same `createLegacyJob` -> `repository.createJob` -> `queueManager.kick()` path as the modern API. Additionally, it waits up to 12 seconds (`PRINT_AGENT_LEGACY_WAIT_MS`) for the job to reach a terminal status before responding.

Key differences:
- Uses auto-generated `appId: "legacy-epson-raw"` and `merchantId: "legacy"`
- Accepts `eposXml` string or `receiptCommands` array instead of structured payload
- When `printerId` is omitted, generates a deterministic fallback ID from ip+port
- Blocks waiting for delivery (up to 12 seconds)
- Supports legacy copy count aliases: `copies`, `quantity`, `qty`, `copyCount`, `numberOfCopies`, `numCopies`, `printCopies`, `ticketCopies`, and nested `options.<alias>`
- Returns different response shapes depending on outcome (200 = transmitted, 202 = accepted/queued, 500 = failed)

### Migration Guidance

New integrations **should** use `POST /v1/print-jobs`. The legacy endpoint should be considered stable but not recommended for new development. Legacy clients that cannot immediately migrate will continue to work.

---

## Client Integration Guide — LilPOS

### Recommended Flow

1. **Discover or verify the agent**
   - `GET /health`
   - Expected: `200` with `"status": "running"`
   - If `503`, the agent is degraded (no queue)

2. **Load printers**
   - `GET /v1/printers`
   - Returns all known printers with their current state
   - Store the `id` field for each printer — this is the stable identity

3. **Match logical printer roles to stable printer IDs**
   - Map logical roles (e.g., "Kitchen Printer", "Bar Printer", "Office Printer") to the `id` values returned by the agent
   - Store this mapping in LilPOS configuration

4. **Submit a durable print job**
   - `POST /v1/print-jobs` with structured request
   - Expected: `202 Accepted` with `"accepted": true`

5. **Store the returned job ID**
   - Save `job.jobId` in LilPOS order state for later status checks

6. **Poll for status (if needed)**
   - `GET /v1/print-jobs/{jobId}`
   - Check `status` field. For most successful prints, the job will reach `TRANSMITTED` within seconds
   - Poll at a reasonable interval (e.g., every 1-2 seconds, up to 15 seconds)

7. **Handle RETRY_WAIT**
   - If `status` is `RETRY_WAIT`, the agent is retrying automatically
   - Surface this in the UI as "Printing — retrying" but do not resubmit the job
   - The agent will retry up to `maxAttempts` times

8. **Surface FAILED_FINAL**
   - If `status` is `FAILED_FINAL`, show a clear error in the UI
   - Include the `lastError` message (e.g., "Printer unreachable — check network connection")

9. **Retry or manually resolve failures**
   - **Automatic retry:** Use `POST /v1/print-jobs/{jobId}/retry` to put the job back in the queue
   - **Reprint:** Use `POST /v1/print-jobs/{jobId}/reprint` (requires new `newJobId` and `newIdempotencyKey`)
   - **Manual resolve:** Use `POST /v1/print-jobs/{jobId}/resolve` if the problem was handled outside the agent

10. **Clear pending queue safely**
    - Use `POST /v1/printers/{printerId}/queue/clear` when you need to cancel all pending jobs for a printer (e.g., at shift change or when the printer is going offline for maintenance)

11. **Handle agent disconnection**
    - If the health endpoint is unreachable, the agent is down
    - Show a "Print agent not available" message
    - Set up a retry loop (e.g., try every 5 seconds) to re-discover the agent
    - Once it comes back, pending jobs are durable and will be delivered automatically

12. **Avoid duplicate job submission**
    - Always use the `idempotencyKey` field
    - Generate it from order/receipt identity (e.g., `order_{id}_{type}`)
    - If a `POST /v1/print-jobs` request times out or fails with a network error, retry with the same `idempotencyKey`
    - The agent will deduplicate and return the existing job

13. **Preserve client-side idempotency keys**
    - Store the idempotency key alongside the order until the job reaches a terminal status
    - This allows safe retry of any API call that may have succeeded server-side but failed to return a response

---

## Client Integration Guide — MerchantDash

### Differences from LilPOS

MerchantDash is a management/administration application rather than an order-taking application. Its integration flow differs in emphasis:

1. **Agent discovery:** Same as LilPOS (`GET /health`).

2. **Queue monitoring:** MerchantDash should poll `GET /v1/queue` regularly to display the queue state dashboard (total queued, sending, retry-waiting, failed). Filter by `appId=merchantdash` to scope to MerchantDash's own jobs.

3. **Printer management:** Use `GET /v1/printers` to display printer status. Use pause/resume for maintenance operations:
   ```json
   POST /v1/printers/{printerId}/pause
   { "reason": "Printer maintenance", "requestedBy": { "appId": "merchantdash", "userId": "admin" } }
   ```

4. **Bulk queue operations:** Use `POST /v1/printers/{printerId}/queue/clear` at shift change.

5. **Legacy compatibility:** MerchantDash may still use `POST /print/epson-raw`. Migration to `POST /v1/print-jobs` is recommended.

---

## Complete Endpoint Reference

| Method | Path | OperationId | Purpose | Auth Required | Implementation File |
|---|---|---|---|---|---|
| GET | `/health` | `getHealth` | Agent health check | No | `src/server.js:306` |
| GET | `/v1/agent` | `getAgentInfo` | Agent capabilities | No | `src/server.js:334` |
| POST | `/v1/print-jobs` | `createPrintJob` | Create durable print job | No | `src/server.js:360` |
| GET | `/v1/print-jobs` | `listPrintJobs` | List print jobs | No | `src/server.js:374` |
| GET | `/v1/print-jobs/{jobId}` | `getPrintJob` | Get job details | No | `src/server.js:395` |
| POST | `/v1/print-jobs/{jobId}/retry` | `retryPrintJob` | Retry a failed job | No | `src/server.js:403` |
| POST | `/v1/print-jobs/{jobId}/reprint` | `reprintPrintJob` | Reprint a job | No | `src/server.js:406` |
| POST | `/v1/print-jobs/{jobId}/cancel` | `cancelPrintJob` | Cancel a queued job | No | `src/server.js:410` |
| POST | `/v1/print-jobs/{jobId}/resolve` | `resolvePrintJob` | Resolve a failed job | No | `src/server.js:413` |
| GET | `/v1/queue` | `getQueueSummary` | Queue summary | No | `src/server.js:418` |
| GET | `/v1/printers` | `listPrinters` | List printers | No | `src/server.js:426` |
| POST | `/v1/printers/{printerId}/queue/clear` | `clearPrinterQueue` | Clear printer queue | No | `src/server.js:431` |
| POST | `/v1/printers/{printerId}/pause` | `pausePrinter` | Pause a printer | No | `src/server.js:439` |
| POST | `/v1/printers/{printerId}/resume` | `resumePrinter` | Resume a printer | No | `src/server.js:439` |
| POST | `/print/epson-raw` | `legacyEpsonRawPrint` | Legacy print endpoint | No | `src/server.js:450` |
| POST | `/debug/convert-epos-to-escpos` | `debugConvertEposToEscpos` | Debug conversion | No | `src/server.js:454` |

**Totals:**
- **Total routes found:** 16
- **Total routes documented in openapi.yaml:** 16
- **Total undocumented routes:** 0
- **Schemas added or updated:** 28 (all schemas in openapi.yaml)
- **Routes requiring authentication:** 0

---

## Request and Response Examples

### 1. Health Check

**Request:**
```
GET /health
```

**Response (200):**
```json
{
  "ok": true,
  "success": true,
  "service": "Dash1 Print Agent",
  "status": "running",
  "version": "1.0.0",
  "apiVersion": "v1",
  "debug": false,
  "agentId": "dash1-agent-front-counter-01",
  "hostname": "FRONT-COUNTER-01",
  "platform": "win32",
  "uptimeSeconds": 84321,
  "queueDatabase": "available",
  "printerHealth": {
    "total": 3,
    "unreachable": 0,
    "paused": 1,
    "degraded": true
  },
  "listener": {
    "host": "127.0.0.1",
    "port": 3031,
    "https": true
  },
  "agentHttpHost": "127.0.0.1",
  "agentHttpPort": 3030,
  "agentHttpsHost": "127.0.0.1",
  "agentHttpsPort": 3031,
  "requestHost": "localhost:3030",
  "requestOrigin": "",
  "clientIp": "127.0.0.1",
  "timestamp": "2026-07-27T17:30:00.000Z"
}
```

### 2. List Printers

**Request:**
```
GET /v1/printers
```

**Response (200):**
```json
{
  "printers": [
    {
      "id": "printer_1780828559134_9bkk66",
      "name": "Pizza",
      "ip": "192.168.1.234",
      "port": 9100,
      "profile": "epson_tm_u220",
      "transport": "tcp_9100",
      "status": "AVAILABLE",
      "paused": false,
      "consecutiveFailures": 0,
      "lastCheckedAt": "2026-07-27T17:30:05.000Z",
      "lastSuccessfulConnectionAt": "2026-07-27T17:30:05.000Z",
      "lastTransmittedAt": "2026-07-27T17:30:05.000Z",
      "createdAt": "2026-07-01T08:00:00.000Z",
      "updatedAt": "2026-07-27T17:30:05.000Z",
      "queuedJobs": 1,
      "retryWaitJobs": 0,
      "sendingJobs": 0,
      "failedJobs": 0
    }
  ]
}
```

### 3. Create Print Job

**Request:**
```
POST /v1/print-jobs
Content-Type: application/json

{
  "appId": "lilpos",
  "merchantId": "merchant-42",
  "locationId": "location-main",
  "jobId": "job_1720550000000_abc123",
  "idempotencyKey": "order_9876_receipt",
  "printer": {
    "id": "printer_1780828559134_9bkk66",
    "name": "Pizza",
    "ip": "192.168.1.234",
    "port": 9100,
    "profile": "epson_tm_u220",
    "transport": "tcp_9100"
  },
  "payload": {
    "type": "escpos_raw_base64",
    "data": "GwAAAAEAAAACAAAAAwAAAAQAAAA="
  },
  "metadata": {
    "orderId": "order-9876"
  },
  "options": {
    "copies": 1,
    "priority": "normal",
    "retryEnabled": true,
    "maxAttempts": 5
  }
}
```

`options.copies` defaults to `1` and accepts integers from `1` through `99`.
Copies are sent sequentially as complete payload transmissions. A job reaches
`TRANSMITTED` only after all requested copies succeed. If a later copy fails
after an earlier copy was transmitted, the job is marked `FAILED_FINAL` with
`PARTIAL_COPY_TRANSMISSION` and is not automatically retried, because resending
the whole job could duplicate tickets that already printed.

The legacy `POST /print/epson-raw` endpoint also accepts copy counts from `1`
through `99` using top-level `copies`, `quantity`, `qty`, `copyCount`,
`numberOfCopies`, `numCopies`, `printCopies`, `ticketCopies`, or the same names
nested under `options`. Numeric strings are accepted on this legacy endpoint for
compatibility. If more than one alias is provided, top-level aliases win in the
order listed above, followed by nested `options.<alias>` values.

**Response (202):**
```json
{
  "accepted": true,
  "duplicate": false,
  "job": {
    "jobId": "job_1720550000000_abc123",
    "idempotencyKey": "order_9876_receipt",
    "status": "QUEUED",
    "printerId": "printer_1780828559134_9bkk66",
    "createdAt": "2026-07-27T17:30:00.000Z",
    "attemptCount": 0
  }
}
```

### 4. Get Print Job

**Request:**
```
GET /v1/print-jobs/job_1720550000000_abc123
```

**Response (200) — Transmitted:**
```json
{
  "jobId": "job_1720550000000_abc123",
  "idempotencyKey": "order_9876_receipt",
  "status": "TRANSMITTED",
  "printerId": "printer_1780828559134_9bkk66",
  "createdAt": "2026-07-27T17:30:00.000Z",
  "attemptCount": 1,
  "appId": "lilpos",
  "merchantId": "merchant-42",
  "locationId": "location-main",
  "printer": {
    "id": "printer_1780828559134_9bkk66",
    "name": "Pizza",
    "ip": "192.168.1.234",
    "port": 9100,
    "profile": "epson_tm_u220",
    "transport": "tcp_9100"
  },
  "maxAttempts": 5,
  "retryEnabled": true,
  "updatedAt": "2026-07-27T17:30:05.000Z",
  "lastAttemptAt": "2026-07-27T17:30:05.000Z",
  "transmittedAt": "2026-07-27T17:30:05.000Z",
  "completedAt": "2026-07-27T17:30:05.000Z",
  "nextAttemptAt": null,
  "originalJobId": null,
  "resolutionNote": null,
  "lastError": null,
  "metadata": {
    "orderId": "order-9876",
    "source": "lilpos"
  }
}
```

### 5. List Jobs

**Request:**
```
GET /v1/print-jobs?printerId=printer_1780828559134_9bkk66&limit=5
```

**Response (200):**
```json
{
  "jobs": [
    {
      "jobId": "job_1720550000000_abc123",
      "idempotencyKey": "order_9876_receipt",
      "status": "TRANSMITTED",
      "printerId": "printer_1780828559134_9bkk66",
      "createdAt": "2026-07-27T17:30:00.000Z",
      "attemptCount": 1,
      "appId": "lilpos",
      "merchantId": "merchant-42",
      "locationId": "location-main",
      "printer": {
        "id": "printer_1780828559134_9bkk66",
        "name": "Pizza",
        "ip": "192.168.1.234",
        "port": 9100,
        "profile": "epson_tm_u220",
        "transport": "tcp_9100"
      },
      "maxAttempts": 5,
      "retryEnabled": true,
      "updatedAt": "2026-07-27T17:30:05.000Z",
      "lastAttemptAt": "2026-07-27T17:30:05.000Z",
      "transmittedAt": "2026-07-27T17:30:05.000Z",
      "completedAt": "2026-07-27T17:30:05.000Z",
      "nextAttemptAt": null,
      "originalJobId": null,
      "resolutionNote": null,
      "lastError": null,
      "metadata": {
        "orderId": "order-9876",
        "source": "lilpos"
      }
    }
  ],
  "paging": {
    "limit": 5,
    "nextCursor": null
  }
}
```

### 6. Retry Failed Job

**Request:**
```
POST /v1/print-jobs/job_1720550000000_abc123/retry
Content-Type: application/json

{
  "reason": "Printer cable replaced",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "employee-42",
    "userName": "Dee"
  }
}
```

**Response (200):**
```json
{
  "jobId": "job_1720550000000_abc123",
  "idempotencyKey": "order_9876_receipt",
  "status": "QUEUED",
  "printerId": "printer_1780828559134_9bkk66",
  "createdAt": "2026-07-27T17:30:00.000Z",
  "attemptCount": 5,
  "appId": "lilpos",
  "merchantId": "merchant-42",
  "locationId": "location-main",
  "printer": {
    "id": "printer_1780828559134_9bkk66",
    "name": "Pizza",
    "ip": "192.168.1.234",
    "port": 9100,
    "profile": "epson_tm_u220",
    "transport": "tcp_9100"
  },
  "maxAttempts": 5,
  "retryEnabled": true,
  "updatedAt": "2026-07-27T17:35:05.000Z",
  "lastAttemptAt": "2026-07-27T17:34:55.000Z",
  "transmittedAt": null,
  "completedAt": null,
  "nextAttemptAt": null,
  "originalJobId": null,
  "resolutionNote": null,
  "lastError": {
    "code": "PRINTER_CONNECTION_REFUSED",
    "message": "connect ECONNREFUSED 192.168.1.234:9100",
    "retryable": false
  },
  "metadata": {
    "orderId": "order-9876",
    "source": "lilpos"
  }
}
```

### 7. Manually Resolve Failed Job

**Request:**
```
POST /v1/print-jobs/job_1720550000000_abc123/resolve
Content-Type: application/json

{
  "resolution": "Re-printed from LilPOS after printer came back online",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "employee-42",
    "userName": "Dee"
  }
}
```

**Response (200):**
```json
{
  "jobId": "job_1720550000000_abc123",
  "idempotencyKey": "order_9876_receipt",
  "status": "MANUALLY_RESOLVED",
  "printerId": "printer_1780828559134_9bkk66",
  "createdAt": "2026-07-27T17:30:00.000Z",
  "attemptCount": 5,
  "appId": "lilpos",
  "merchantId": "merchant-42",
  "locationId": "location-main",
  "printer": {
    "id": "printer_1780828559134_9bkk66",
    "name": "Pizza",
    "ip": "192.168.1.234",
    "port": 9100,
    "profile": "epson_tm_u220",
    "transport": "tcp_9100"
  },
  "maxAttempts": 5,
  "retryEnabled": true,
  "updatedAt": "2026-07-27T17:36:00.000Z",
  "lastAttemptAt": "2026-07-27T17:34:55.000Z",
  "transmittedAt": null,
  "completedAt": "2026-07-27T17:36:00.000Z",
  "nextAttemptAt": null,
  "originalJobId": null,
  "resolutionNote": "Re-printed from LilPOS after printer came back online",
  "lastError": {
    "code": "PRINTER_CONNECTION_REFUSED",
    "message": "connect ECONNREFUSED 192.168.1.234:9100",
    "retryable": false
  },
  "metadata": {
    "orderId": "order-9876",
    "source": "lilpos"
  }
}
```

### 8. Pause Printer

**Request:**
```
POST /v1/printers/printer_1780828559134_9bkk66/pause
Content-Type: application/json

{
  "reason": "Printer maintenance",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "employee-18",
    "userName": "Manager"
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "printerId": "printer_1780828559134_9bkk66",
  "paused": true,
  "status": "PAUSED"
}
```

### 9. Resume Printer

**Request:**
```
POST /v1/printers/printer_1780828559134_9bkk66/resume
Content-Type: application/json

{
  "reason": "Printer maintenance completed",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "employee-18",
    "userName": "Manager"
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "printerId": "printer_1780828559134_9bkk66",
  "paused": false,
  "status": "UNKNOWN"
}
```

### 10. Clear Printer Queue

**Request:**
```
POST /v1/printers/printer_1780828559134_9bkk66/queue/clear
Content-Type: application/json

{
  "statuses": ["QUEUED", "RETRY_WAIT"],
  "reason": "Shift change",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "employee-18",
    "userName": "Manager"
  }
}
```

**Response (200):**
```json
{
  "ok": true,
  "printerId": "printer_1780828559134_9bkk66",
  "canceledCount": 3,
  "skippedSendingCount": 1,
  "remainingQueuedCount": 0,
  "status": "CLEARED"
}
```

### 11. Validation Error

**Request:**
```
POST /v1/print-jobs
Content-Type: application/json

{
  "appId": "lilpos"
}
```

**Response (400):**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Missing or invalid merchantId",
    "retryable": false,
    "field": "merchantId"
  },
  "requestId": "req-a1b2c3d4"
}
```

### 12. Printer Not Found

**Request:**
```
POST /v1/printers/missing-printer/pause
Content-Type: application/json

{
  "reason": "Test",
  "requestedBy": {
    "appId": "merchantdash",
    "userId": "admin"
  }
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": {
    "code": "PRINTER_NOT_FOUND",
    "message": "Printer not found",
    "retryable": false,
    "field": null
  },
  "requestId": "req-a1b2c3d4"
}
```

### 13. Job Not Found

**Request:**
```
GET /v1/print-jobs/nonexistent-job
```

**Response (404):**
```json
{
  "ok": false,
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "Print job not found",
    "retryable": false,
    "field": null
  },
  "requestId": "req-a1b2c3d4"
}
```

### 14. Invalid State Transition

**Request:**
```
POST /v1/print-jobs/job_1720550000000_abc123/cancel
Content-Type: application/json

{
  "reason": "Test"
}
```
(Where the job is already TRANSMITTED)

**Response (409):**
```json
{
  "ok": false,
  "error": {
    "code": "INVALID_JOB_STATE",
    "message": "Only QUEUED or RETRY_WAIT jobs can be canceled",
    "retryable": false,
    "field": null
  },
  "requestId": "req-a1b2c3d4"
}
```

### 15. Agent Unavailable

**Request:**
```
GET /health
```
(When queue database is unavailable)

**Response (503):**
```json
{
  "ok": false,
  "success": false,
  "service": "Dash1 Print Agent",
  "status": "degraded",
  "version": "1.0.0",
  "apiVersion": "v1",
  "debug": false,
  "agentId": "dash1-agent-front-counter-01",
  "hostname": "FRONT-COUNTER-01",
  "platform": "win32",
  "uptimeSeconds": 12,
  "queueDatabase": "unavailable",
  "printerHealth": {
    "total": 0,
    "unreachable": 0,
    "paused": 0,
    "degraded": false
  },
  "listener": {
    "host": "127.0.0.1",
    "port": 3031,
    "https": true
  },
  "agentHttpHost": "127.0.0.1",
  "agentHttpPort": 3030,
  "agentHttpsHost": "127.0.0.1",
  "agentHttpsPort": 3031,
  "requestHost": "localhost:3030",
  "requestOrigin": "",
  "clientIp": "127.0.0.1",
  "timestamp": "2026-07-27T17:30:00.000Z"
}
