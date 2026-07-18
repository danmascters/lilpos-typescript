# Order-Type Flow Test Checklist

Manual regression checklist for order-type selection behavior.

## Pickup

- [ ] Pickup with no selected caller/customer opens the existing Add Customer form in the ticket panel.
- [ ] Pickup allows Send flow with both name and phone blank.
- [ ] Pickup with selected customer/caller line keeps existing flow and does not force another dialog.
- [ ] Pickup never shows order-number confirmation dialog after send.

## Delivery

- [ ] Delivery with no selected caller/customer opens the existing Add Customer form in the ticket panel.
- [ ] Delivery blocks send when name is missing.
- [ ] Delivery blocks send when phone is missing.
- [ ] Delivery blocks send when address is missing.
- [ ] Delivery continues when name, phone, and address are all present.
- [ ] Delivery never shows order-number confirmation dialog after send.

## To-Go

- [ ] Selecting To-Go opens the compact To-Go start dialog.
- [ ] To-Go dialog accepts blank name and blank phone.
- [ ] To-Go stores entered name/phone as order-level details (not customer profile save).
- [ ] Cancel in To-Go dialog keeps prior order type and existing confirmed order data unchanged.
- [ ] To-Go shows order-number confirmation dialog after Send & Pay Later.
- [ ] To-Go shows order-number confirmation dialog after Send & Pay Now.

## To-Stay

- [ ] Selecting To-Stay starts immediately (no initial dialog).
- [ ] To-Stay shows order-number confirmation dialog after Send & Pay Later.
- [ ] To-Stay shows order-number confirmation dialog after Send & Pay Now.

## Dine-In

- [ ] Selecting Dine-In opens the compact Dine-In start dialog.
- [ ] Dine-In dialog accepts blank table number.
- [ ] Dine-In stores entered table number as order-level detail.
- [ ] Cancel in Dine-In dialog keeps prior order type and existing confirmed order data unchanged.
- [ ] Dine-In never shows order-number confirmation dialog after send.

## State Safety

- [ ] Switching types leaves no unconfirmed stale To-Go or Dine-In dialog values.
- [ ] Delivery validation only applies while Delivery is active.
- [ ] Pickup does not inherit Delivery required-field behavior.
- [ ] Repeated Send taps do not create duplicate persisted orders or duplicate order-number dialogs.
