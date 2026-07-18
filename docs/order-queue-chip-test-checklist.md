# Orders Queue Chips Test Checklist

Focused manual tests for Orders Management queue chips and counts.

## Chips and Count Rendering

- [ ] Orders Management shows four chips: Open, Completed, Online Only, Future Orders.
- [ ] Every chip displays a numeric count in parentheses.
- [ ] Zero values are displayed as (0).
- [ ] Active chip styling is preserved when switching chips.
- [ ] Chip width changes are minimal as counts change.
- [ ] Chips remain touch-friendly and wrap naturally on smaller screens.

## Count and List Consistency

- [ ] Open chip count equals the number of rows shown in Open when no search query is active.
- [ ] Completed chip count equals the number of rows shown in Completed when no search query is active.
- [ ] Online Only chip count equals the number of rows shown in Online Only when no search query is active.
- [ ] Future Orders chip count equals the number of rows shown in Future Orders when no search query is active.

## Future Orders Behavior

- [ ] Future Orders shows only scheduled orders that are not yet active.
- [ ] Future Orders rows are sorted by scheduled fulfilment date/time, earliest first.
- [ ] Creating a new scheduled order in the future increments Future Orders count.
- [ ] Canceling a future order decrements Future Orders count.
- [ ] Completing a future order decrements Future Orders count.
- [ ] Rescheduling a future order to outside the current future set updates Future Orders count.
- [ ] A future order that becomes due leaves Future Orders and appears in the appropriate active queue.
- [ ] A synchronized scheduled order that is already due does not remain in Future Orders.

## Existing Queue Semantics

- [ ] Completed queue behavior remains tied to existing screen date/business-day behavior.
- [ ] Online Only behavior remains consistent with existing source semantics.
- [ ] Open queue behavior remains consistent except for due/not-due future activation handling.

## Lifecycle and Reliability

- [ ] Creating an order updates the relevant chip counts.
- [ ] Receiving an online order updates the relevant chip counts.
- [ ] Completing an order updates Open/Completed counts.
- [ ] Reopening an order updates the affected counts.
- [ ] Canceling an order updates the affected counts.
- [ ] Synchronization updates adjust counts without manual refresh.
- [ ] Refreshing the app restores accurate queue counts.
- [ ] App restart rehydration restores accurate queue counts.
- [ ] Duplicate synchronization events do not inflate queue counts.

## Search Interaction

- [ ] Search filters the visible list as expected.
- [ ] Search does not incorrectly alter underlying queue chip totals.
