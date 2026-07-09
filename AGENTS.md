# LilPOS Agent Instructions

## Project

LilPOS is a lightweight browser-first POS/register for pizzerias and restaurants.

Product positioning:

> More than a cash register, less bloated than a full POS.

LilPOS should be fast, simple, print/KDS-first, and optimized for real pizzeria workflows.

## Tier Names

The product tiers are:

- Lil POS — free/basic version
- Lil Bigger POS — mid-tier with additional features
- Lil POS Pro — pro tier

The free/basic version still requires a valid login/account to pull merchant data from Bringdat. Free/basic does not offer long-term order persistence.

## Core Architecture

LilPOS is browser-first, not browser-only.

The intended architecture is:

- Browser/PWA: register UI, menu display, cart/ticket state, modifiers, payment UI, print/payment job requests.
- Bringdat backend: login/auth, merchant authorization, menu/customer data, tier/feature flags, persistence, payment middleware, token handling.
- Local agent/adapter: ESC/POS printers, cash drawer, caller ID hardware, payment terminals, local device status.

The browser must never connect directly to the database.

## Important Coding Rules

- Keep app.js focused on UI, state, rendering, and event handling.
- Keep styles.css focused on layout and visual styling.
- Do not redesign unrelated areas during focused tasks.
- Do not convert the project to TypeScript unless explicitly requested.
- Do not introduce backend work unless explicitly requested.
- Do not introduce real payment or printer integrations unless explicitly requested.
- Do not change pizza modifier behavior unless the task explicitly says so.
- Do not change standard/non-pizza modifier behavior unless the task explicitly says so.
- Keep change sets small and focused.
- Preserve existing functionality unless the task says to change it.
- Run npm run dev or available validation after changes when possible.
- Report changed files and validation results after the task.

## Data / Security Rules

Browser code can be inspected/copied. Therefore:

- Do not put secrets in the browser.
- Do not put database credentials in the browser.
- Do not put payment provider secrets in the browser.
- Do not put raw card data in the browser.
- Do not put private Bringdat backend logic in the browser.
- Browser should only receive authorized merchant operating data from Bringdat backend.

Longer-term goal:
Move from raw DB-shaped browser data to a lean LilPOS runtime package that avoids exposing Bringdat schema/table names in browser storage.

## Current UI Areas

Current app structure includes:

- Top/status/navigation area
- Left category rail
- Center workspace/main area
- Right ticket/order pane
- Bottom Caller ID line strip
- Pizza-specific modifier popup
- Standard/simple modifier popup
- Customer management workspace
- Orders management workspace

## Workspace Model

The center area is a workspace with modes such as:

- Menu
- Orders
- Customers

The right pane is the active ticket/order detail area.

Important rule:

> Never silently destroy an active ticket.

Selecting historical/open orders should not wipe the current ticket unless explicitly confirmed.

## Payment Direction

Build payment UI first with a mock/provider-neutral model.

Do not hard-code NMI, TSYS, Braintree, CardPointe, Dejavoo, PAX, Stripe, etc. into the UI.

Payment architecture should be:

LilPOS Payment UI
→ generic payment request
→ Bringdat/LilPOS payment middleware
→ provider adapter
→ normalized payment result

## Printing Direction

Browser should not speak raw ESC/POS directly.

Browser should emit LilPOS print job JSON.
The local printer adapter translates it into ESC/POS/raw TCP/USB/Android QuickPrinter/etc.

## Before Any Major AI Coding Pass

Recommended workflow:

```bash
git add .
git commit -m "Checkpoint before next LilPOS pass"
```
