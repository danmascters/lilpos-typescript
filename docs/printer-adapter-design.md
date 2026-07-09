# Printer Adapter Design — LilPOS

## Overview

LilPOS does not speak raw ESC/POS directly from the browser.

The browser emits a structured LilPOS print job JSON object. A local printer adapter (running outside the browser) receives this job and translates it to the appropriate output format for the connected hardware.

> The browser layer must remain hardware-agnostic.

---

## Print Job Flow

```
LilPOS Browser
  └── ticketPayload('send-order')
        └── POST to Bringdat backend (future)
              └── Bringdat routes print job to local adapter
                    └── Local adapter
                          ├── ESC/POS over TCP/USB
                          ├── Android QuickPrinter
                          ├── Star CloudPRNT
                          └── Windows raw print queue
```

---

## Current Mock Behavior

In the current mock implementation, `ticketPayload()` builds a structured JSON object that represents the full order.

The payload is currently previewed in the Dev Tools raw payload box. In production, it would be submitted to the Bringdat backend via an authenticated API call.

---

## Printer Route IDs

Each menu category (and item) carries a `printerRouteId` that indicates which printer station should receive the job for that category.

Current mock printer route IDs:

| Route ID | Station |
|---|---|
| `printer_pizza` | Pizza station printer |
| `printer_cold` | Cold station printer |
| `printer_kitchen` | General kitchen printer |

Each category also carries a `kitchenPrinter` label (display name) and a `receiptPrinter` label for front-of-house receipts.

---

## Ticket Payload Structure

`ticketPayload(mode)` in `app.js` builds the full order object.

Key fields:

```js
{
  orderId: '<generated>',
  orderType: 'pickup' | 'delivery' | 'togo' | 'tostay' | 'dinein',
  timingType: 'asap' | 'future',
  asapTime: '<time string or empty>',
  futureDateTime: '<ISO string or null>',
  customerName: '<string>',
  customerPhone: '<string>',
  cart: [
    {
      lineId: '<string>',
      name: '<item name>',
      size: '<size name or null>',
      qty: <number>,
      price: <unit price>,
      mods: [<modifier entries>],
      specialInstruction: '<string>',
      forName: '<string>',
      printerRouteId: '<route id>'
    }
  ],
  subtotal: <number>,
  tax: <number>,
  grandTotal: <number>,
  paymentIntent: 'pay_now' | 'pay_later' | null,
  paymentStatus: 'paid' | 'unpaid' | null,
  paymentMethodSummary: '<string>',
  printerSettings: {
    mode: 'PRINT_ONLY',
    keepReprintMinutes: 60
  }
}
```

---

## Adapter Targets (Future)

The local printer adapter is expected to support:

- **ESC/POS over TCP** — Epson, Star, Bixolon, etc. on local network
- **ESC/POS over USB** — direct USB connection to register machine
- **Android QuickPrinter** — mobile/tablet setups using Bluetooth thermal printers
- **Star CloudPRNT** — cloud-print-capable Star models
- **Windows raw print queue** — USB-connected printers on Windows POS terminals

The adapter format is not finalized. The browser should emit the job JSON; adapter translation is out of scope for the browser layer.

---

## KDS (Kitchen Display System)

KDS routing is a future feature. The printer route concept already supports the idea: each order line carries a `printerRouteId` that could map to a KDS display instead of (or in addition to) a printer.

---

## Rules for Future Agents

- Do not add ESC/POS generation code to the browser.
- Do not add TCP socket code to the browser.
- Do not add USB serial/HID code to the browser.
- Do not change the `ticketPayload()` structure without an explicit task.
- Do not change `printerRouteId` assignments without an explicit task.
- The browser emits jobs; the adapter layer executes them.
