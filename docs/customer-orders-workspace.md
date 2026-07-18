# Customer & Orders Workspace Design — LilPOS

## Overview

The center workspace area of LilPOS supports three modes:

| Mode      | Constant               | Renders                         |
| --------- | ---------------------- | ------------------------------- |
| Menu      | `MAIN_VIEWS.menu`      | Menu board + category rail      |
| Orders    | `MAIN_VIEWS.orders`    | Orders management list          |
| Customers | `MAIN_VIEWS.customers` | Customer management list + form |

Active mode is tracked in `state.mainView`.

---

## Switching Views

The right pane header contains three icon buttons:

| Button                  | ID                   | Action                                       |
| ----------------------- | -------------------- | -------------------------------------------- |
| Orders                  | `ordersViewBtn`      | Sets `state.mainView = MAIN_VIEWS.orders`    |
| Calendar (future order) | `calendarClassifier` | Opens future order schedule dialog           |
| Customer management     | `customerMgmtBtn`    | Sets `state.mainView = MAIN_VIEWS.customers` |

Switching to Orders or Customers changes the center area only. The right ticket pane persists.

---

## Orders Management View

Rendered by `renderOrdersManagementView()`.

### Filters

Four filter tabs:

| Filter        | Shows                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------- |
| Open          | Orders with `status === 'open'`                                                          |
| Completed     | Orders with `status === 'completed'`                                                     |
| Online Only   | Orders with `onlineOnly === true`                                                        |
| Future Orders | Scheduled orders with `timingType === 'future'` and `futureDateTime` still in the future |

Active filter is tracked in `state.ordersFilter`.

### Search

`state.ordersQuery` is a free-text filter applied across order number, customer name, order type, status, and source.

### Order Tile

Each order in the grid is a `.order-mgmt-tile` button showing:

- Order number (`#NNNN`)
- Status badge (open = green, completed = grey)
- Customer name
- Order type + time label
- Source (Online Only / Counter / Phone)
- Total price

Clicking a tile sets `state.selectedOrderId` and displays the order detail in the right pane.

### Order Detail in Right Pane

`renderOrderDetailInTicketPane()` renders the selected order detail as a `.order-detail-pane` section at the top of the right pane when `state.selectedOrderId` is set.

Includes: order number, customer info, type, status, time, line items, total, and a Close button.

> The Close button clears `state.selectedOrderId` only. It does NOT clear the active ticket.

---

## Customer Management View

Rendered by `renderCustomerManagementView()`.

### Layout

Two-column layout:

- Left: customer search results list
- Right: customer profile form

### Search

`state.customersQuery` filters customers by name, phone, address, city, state, or zip.

### Customer Profile Form

The form in the right column uses the same fields as the ticket pane customer editor:

- Name
- Phone
- Address 1
- City, State, ZIP
- Allergies
- Special Instructions

Three action buttons:

| Button        | ID                        | Action                                               |
| ------------- | ------------------------- | ---------------------------------------------------- |
| Save Customer | `customerMgmtApply`       | Saves draft without starting a ticket                |
| Cancel        | `customerMgmtCancel`      | Clears the draft form                                |
| Start Ticket  | `customerMgmtStartTicket` | Saves customer and loads them into the active ticket |

---

## Customer Panel in Right Ticket Pane

The right ticket pane always shows a customer section (`.customer-shell`) regardless of which workspace view is active.

Two modes for the customer section:

| Mode      | Class         | Shows                                                             |
| --------- | ------------- | ----------------------------------------------------------------- |
| `compact` | `.is-compact` | Customer summary (name, phone, address, allergy/instruction tags) |
| `entry`   | `.is-entry`   | Full customer edit form                                           |

### Compact Mode

Rendered by `compactCustomerSummaryHtml()`.

- If no customer is loaded: shows "No customer selected" placeholder.
- If a customer is loaded: shows name, phone, address, and allergy/instruction tags. An edit button opens entry mode.

### Entry Mode

Rendered by `expandedCustomerEntryHtml()`.

Form fields:

- Name, Phone
- Address, City, State, ZIP
- Allergies (inline input, no visible label)
- Customer Notes / Special Instructions (textarea, no visible label)

Action buttons (`.customer-entry-actions`):

| Button        | ID                    | Action                                |
| ------------- | --------------------- | ------------------------------------- |
| Save Customer | `saveCustomer`        | Calls `saveDraftCustomer(false)`      |
| Cancel        | `cancelCustomer`      | Closes entry form, returns to compact |
| Start Ticket  | `startTicketCustomer` | Calls `saveDraftCustomer(true)`       |

### Layout Rules

- The customer edit form must stay in normal document flow.
- It must push cart items down, not overlay them.
- The right pane as a whole scrolls; no nested scroll area inside the customer section.
- `.customer-shell` must have `overflow: visible` and no `max-height` cap.

---

## Active Ticket Preservation

> Never silently destroy an active ticket.

Switching to the Orders or Customers workspace view does not clear `state.cart`.

Selecting a historical/open order for detail view sets `state.selectedOrderId` and shows the order in the right pane, but does NOT replace the active ticket.

If a future feature loads a historical order into the active ticket (e.g., "edit this order"), it must require an explicit user confirmation if `state.cart.length > 0`.

---

## Rules for Future Agents

- Do not clear `state.cart` when switching workspace views.
- Do not clear `state.cart` when selecting an order for detail view.
- Do not change the customer management center view when working on the right-pane customer section, and vice versa — they share some logic but are rendered separately.
- Keep the customer edit form in normal document flow (no absolute/fixed/sticky positioning).
- Do not add nested scroll containers inside `.customer-shell`.
- The order detail in the right pane is read-only in the current design; do not add edit-in-place order functionality without an explicit task.
