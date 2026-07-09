# Pizza Modifier Design — LilPOS

## Overview

Pizza items use a dedicated modifier popup with three sections navigated via a left sidebar. This popup is entirely separate from the standard modifier popup used by non-pizza items.

> Do not change pizza modifier behavior when working on standard modifier tasks, and vice versa.

---

## Activation

A menu item uses the pizza modifier popup when `itemUsesPizzaModifierUi(item)` returns `true`.

This is true when any of the following apply:

- `item.modifierUiType === 'pizza'`
- `item.usesPizzaModifier === true`
- `item.isPizzaItem === true`
- The item has a modifier group with `pricingMode === 'pizza_half_whole'`

The topping group with `pricingMode === 'pizza_half_whole'` is the "pizza toppings group" and is identified by `getPizzaToppingGroup(item)`.

---

## Modal Structure

The pizza modal (`.pizza-mod-modal`) uses a fixed-size CSS grid layout:

```
┌─────────────────────────────────────────────────┐
│  header (item name + close button)              │  auto
├─────────────────────────────────────────────────┤
│  pizza-summary-bar (Size, Whole, Left, Right)   │  auto
├───────────────┬─────────────────────────────────┤
│  pizza-nav    │  pizza-content                  │  1fr (scrollable)
│  (sidebar)    │  (section content)              │
├───────────────┴─────────────────────────────────┤
│  footer (totals + Add to ticket button)         │  auto
└─────────────────────────────────────────────────┘
```

Modal sizing (CSS):

```css
.pizza-mod-modal {
  width: min(980px, 94vw);
  height: min(680px, 90vh);
}
```

The modal frame is fixed. Switching between sections must **not** resize the modal. Only `.pizza-content` scrolls.

---

## Three Sections

| Nav key | Label | Content |
|---|---|---|
| `pizza` | Size + Toppings | Size chip selector + full topping grid |
| `prep` | Cooking / Prep | Standard multi-select groups (e.g., cooking instructions) |
| `notes` | Special Instructions | Free-text textarea for item-level notes |

Active section is tracked in `state.selectedConfig.pizzaNav`.

---

## Topping Grid

Toppings render in `.pizza-row-list` using a two-column CSS grid:

```css
.pizza-row-list {
  grid-template-columns: repeat(2, minmax(300px, 1fr));
}
```

Each topping card (`.pizza-top-row`) contains:

- Topping name (`.pizza-top-name`) — can ellipsis if very long
- Helper/selected text (`.pizza-top-sub`) — shows side and multiplier when selected
- Live price (`.pizza-top-price`) — updates on side/size/multiplier change
- L button — select left half
- R button — select right half
- 1X/2X/3X multiplier button — cycles 1 → 2 → 3 → back to 1

One-column layout applies below 760px viewport width.

---

## Topping Selection Model

Each topping can be in one of these states:

| State | How |
|---|---|
| Not selected | No entry in `state.selectedConfig.mods` for this topping |
| Whole selected | `side === 'whole'` — card background changes to accent color |
| Left selected | `side === 'left'` — L button highlights blue |
| Right selected | `side === 'right'` — R button highlights blue |
| Multiplied | `multiplier > 1` — multiplier button highlights blue |

Tapping the topping name/main area (`data-pizza-whole`) toggles whole selection or deselects.
Tapping L or R (`data-pizza-side`) selects/changes the side.
Tapping the multiplier button (`data-pizza-mult`) cycles 1X → 2X → 3X → 1X.

---

## Pricing Model

Topping price is size-aware and side-aware.

`getPizzaUnitPrice(option, item, side, sizeName)` computes the unit price based on:

- Base option price
- Side (`whole` = full price, `left`/`right` = half price)
- Size multiplier from `item.sizeSchema`

`selectedModifierTotal()` sums all selected topping and prep modifier prices.

Live totals in the footer:

```
Base <basePrice> | Mods <modsTotal> | Total <grandTotal>
```

These update on every state change (size selection, topping toggle, multiplier change).

---

## Summary Bar

The summary bar below the header shows currently selected items as chips:

- Size chip (always shown, "None" if not yet selected)
- Whole toppings chip (shows names)
- Left toppings chip (shows names)
- Right toppings chip (shows names)

Chips do not wrap; the bar scrolls horizontally if it overflows.

---

## Prep Section

The prep section renders `prepGroups` (all modifier groups that are NOT the pizza toppings group) using `renderModifierGroupStandard(group)` — the same renderer as the non-pizza popup, but scoped inside the pizza modal.

This is intentional. Cooking/prep groups use standard multi-select chip behavior.

---

## Adding to Ticket

`addToTicket` button in the footer triggers:

1. Builds line item from `state.selected` + `state.selectedConfig`.
2. If `state.selectedConfig.editingLineId` is set, updates an existing cart line.
3. Otherwise, pushes a new line to `state.cart`.
4. Closes the modal (`state.selected = null`).
5. Calls `render()`.

---

## Rules for Future Agents

- Do not change pizza pricing logic (`getPizzaUnitPrice`, `buildPizzaModifierEntry`) without an explicit task.
- Do not change topping side selection or multiplier cycling logic without an explicit task.
- Do not change the pizza summary bar behavior without an explicit task.
- Do not change the standard modifier popup when making pizza changes.
- Do not let the pizza modal resize when switching between sections.
- Keep the footer always visible within the fixed modal frame.
- Keep the two-column topping grid on desktop. One-column below 760px only.
