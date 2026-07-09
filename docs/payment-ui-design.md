# Payment UI Design — LilPOS

## Overview

The LilPOS payment UI is designed to be provider-neutral. The browser builds and submits a generic payment request. The Bringdat backend and a provider adapter handle the actual transaction.

> Do not hard-code any payment provider into the browser UI.

---

## Current Mock Implementation

The current `paymentDialog` in `app.js` is a mock-only flow used to demonstrate the UI concept. It does not connect to any real payment processor.

State shape:

```js
paymentDialog: {
  open: false,
  baseTotal: 0,
  paymentType: 'Cash',       // Cash | Card | Gift | Other
  tipMode: 'none',           // none | p10 | p15 | p20 | custom
  customTip: '0.00',
  entryAmount: '0.00',
  paymentLines: []           // { id, paymentType, amount, tipAmount }
}
```

---

## Two Send Actions

The ticket pane exposes two primary actions:

| Button | Label | Behavior |
|---|---|---|
| `sendPayNow` | Send & Pay Now | Validates ticket, opens payment dialog for immediate payment |
| `sendPayLater` | Send & Pay Later | Validates ticket, sends order without payment (pay at pickup/delivery) |

Both buttons are disabled until the cart has items and passes basic validation.

---

## Validation Before Payment

`getPayNowValidation()` checks:

- Cart must have at least one item.
- If order type is `delivery`, a name, phone, and address are required.
- If `timingType` is `future`, a valid future date and time are required.

`getPayLaterValidation()` calls the same function.

If validation fails, a "missing info" dialog appears (`payNowMissingDialog` / `payLaterMissingDialog`) allowing the cashier to fill in required fields inline before continuing.

---

## Payment Totals

`paymentTotals(dialog)` computes:

- `baseTotal` — cart grand total
- `tipTotal` — computed tip from selected tip mode
- `amountDue` — baseTotal + tipTotal
- `amountPaid` — sum of all payment lines (including tip amounts)
- `remaining` — amountDue − amountPaid
- `changeDue` — excess paid (cash overpayment)

The **Complete Order** button is enabled only when `remaining <= 0` and at least one payment line exists.

---

## Tip Modes

| Mode | Description |
|---|---|
| `none` | No tip |
| `p10` | 10% of base total |
| `p15` | 15% of base total |
| `p20` | 20% of base total |
| `custom` | Cashier-entered dollar amount |

---

## Amount Entry

The payment amount input uses an implied-decimal numeric keypad model:

- Digits shift left as entered (e.g., typing `5`, `0`, `0` → `5.00`).
- Backspace removes the last digit.
- `clear` resets to `0.00`.
- Input is capped at 9 digits before the implied decimal shift.

---

## Payment Lines

Multiple payment lines are supported (e.g., split cash + gift card).

Only the first payment line receives the tip amount. Subsequent lines add to the balance only.

---

## Ticket Payload

On completing payment, `completePayNowOrder()` builds a `ticketPayload('send-order')` and adds:

```js
payload.paymentIntent = 'pay_now';
payload.paymentActionLabel = 'Send & Pay Now';
payload.paymentStatus = 'paid';
payload.paymentMethodSummary = '<comma-separated payment types>';
```

This payload is the data that would be sent to the Bringdat backend in production.

---

## Future Architecture (Not Yet Implemented)

```
LilPOS Payment UI
→ LilPOS print/payment job JSON
→ POST to Bringdat backend /api/orders/submit
→ Bringdat validates merchant + tier + items
→ Payment middleware selects provider adapter
→ Provider adapter (NMI / CardPointe / PAX / etc.)
→ Normalized result returned to browser
```

The browser should never know which payment provider is in use.

---

## Rules for Future Agents

- Do not add real payment provider credentials or SDKs to the browser.
- Do not change payment totals logic without an explicit task.
- Do not change the tip mode UI without an explicit task.
- Do not change the payment keypad logic without an explicit task.
- Keep the payment flow provider-neutral.
