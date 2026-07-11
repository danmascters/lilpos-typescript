# LilPOS — Cline / Copilot / Codex Context

This file provides project context for AI coding agents working on LilPOS.

Read AGENTS.md first for full architecture and coding rules.

---

## Repo Structure

```
src/app.ts              Main frontend logic (state, rendering, events)
styles.css              All visual styling and layout
index.html              Single HTML entry point
src/lilpos-runtime-data.ts Runtime data service (customers, menu index, lookups)
src/sw.ts               Service worker source (PWA caching)
dist/                   Compiled JavaScript output consumed by index.html
manifest.webmanifest    PWA manifest
package.json            TypeScript build + dev/Cloudflare scripts
docs/                   Design docs for AI agents
AGENTS.md               AI agent coding rules and architecture
CLINE_CONTEXT.md        This file
```

---

## Running the Dev Server

```bash
npm run dev
```

This runs the TypeScript build first, then starts `http-server` on port 8001.

If port 8001 is already in use, the command will fail with EADDRINUSE. The server may already be running; open http://127.0.0.1:8001/ to verify.

---

## State Model

All UI state lives in a single `state` object in `src/app.ts`.

Key areas:

| Field | Purpose |
|---|---|
| `state.cart` | Active ticket line items |
| `state.orderType` | pickup / delivery / togo / tostay / dinein |
| `state.timingType` | asap / future |
| `state.asapTime` | Same-day time override string |
| `state.futureDateTime` | Future order ISO string |
| `state.activeCustomer` | Currently loaded customer record |
| `state.customerPanelMode` | compact / entry |
| `state.customerDraft` | In-progress customer form fields |
| `state.mainView` | menu / orders / customers |
| `state.selectedConfig` | Config for the open modifier popup |
| `state.paymentDialog` | Payment modal state |
| `state.phoneLines` | Caller ID line states |

---

## Rendering

LilPOS uses a single `render()` function that reconstructs the full DOM from state on every update.

There is no virtual DOM or framework. Do not add React, Vue, or any other framework.

Pattern for all state changes:

```js
state.someProp = newValue;
render();
```

---

## Key Functions

| Function | Purpose |
|---|---|
| `render()` | Full DOM re-render from state |
| `attachEvents()` | Re-binds all event listeners after render |
| `ticketPanelHtml()` | Right pane ticket/order HTML |
| `pizzaModifierModalHtml()` | Pizza-specific modifier popup |
| `modalHtml()` | Standard (non-pizza) modifier popup |
| `expandedCustomerEntryHtml()` | Customer edit form in right pane |
| `compactCustomerSummaryHtml()` | Compact customer summary in right pane |
| `renderCustomerManagementView()` | Customer management center workspace |
| `renderOrdersManagementView()` | Orders management center workspace |
| `ticketPayload()` | Builds structured order/print JSON |
| `saveDraftCustomer()` | Saves customer draft from right pane form |

---

## Modifier System

Two separate popup paths:

1. **Pizza modifier popup** — triggered when `itemUsesPizzaModifierUi(item)` returns true.
   - Identified by `item.modifierUiType === 'pizza'` or `item.isPizzaItem` or group with `pricingMode === 'pizza_half_whole'`.
   - Has three sections: Size + Toppings, Cooking / Prep, Special Instructions.
   - Supports whole/left/right side selection and 1X/2X/3X multiplier per topping.
   - Toppings are size-aware (price changes when size is selected).
   - See `docs/pizza-modifier-design.md`.

2. **Standard modifier popup** — all other items.
   - Triggered for items with simple multi-select modifier groups.
   - Does not support half/whole toppings or pizza-specific pricing.
   - Do not change this path when working on pizza changes.

---

## CSS Class Prefixes

| Prefix | Component |
|---|---|
| `.ticket-*` | Right ticket/order pane |
| `.customer-*` | Customer panel in ticket pane |
| `.entry-*` | Customer form fields |
| `.pizza-*` | Pizza modifier popup |
| `.line-*` | Caller ID line tiles and footer |
| `.order-*` | Order management and order-type selector |
| `.modal-*` | Modal backdrop and dialogs |
| `.call-modal` | Non-pizza popup dialogs |
| `.btn-*` | Global button variants |

---

## Do Not Change Without Explicit Instruction

- Payment dialog logic or payment totals calculation.
- Pizza topping pricing (`getPizzaUnitPrice`, `buildPizzaModifierEntry`).
- Standard modifier behavior (`renderModifierGroupStandard`).
- Login / auth flow (not present in mock, but do not stub real auth).
- IndexedDB/runtime data persistence (`src/lilpos-runtime-data.ts`).
- Service worker source (`src/sw.ts`).
- Ticket payload structure (`ticketPayload()`).

---

## Common Gotcha: Port Already In Use

The `npm run dev` command (build + http-server) will fail if port 8001 is already occupied.
This is not a code error. Check if a server is already running before reporting failures.

---

## Checkpoint Commit Reminder

Before any major pass:

```bash
git add .
git commit -m "Checkpoint before <task name>"
```
