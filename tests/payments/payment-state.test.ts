import { describe, it, expect } from 'vitest';

declare const createStateFromInput: (input: any) => any;
declare const reducer: (state: any, action: any) => any;

describe('payment state', () => {
  const input = {
    displayOrderNumber: '1-00042',
    orderTypeLabel: 'To-Go',
    stationName: 'Main Station',
    subtotalCents: 2499,
    taxCents: 206,
    totalCents: 2705,
    paymentsAppliedCents: 0,
    remainingBalanceCents: 2705,
    customer: { name: 'Jane', phone: '(555) 123-4567' },
    items: [{ name: 'Item', qty: 1, priceCents: 2705 }],
    orderType: 'togo',
    selectedMethod: 'cash'
  };

  it('defaults to cash mode and zero cash received', () => {
    const state = createStateFromInput(input);
    expect(state.selectedPaymentMethod).toBe('cash');
    expect(state.cashReceivedCents).toBe(0);
    expect(state.textPaymentLinkPhoneDigits).toBe('5551234567');
  });

  it('cash exact sets received to remaining', () => {
    const state = createStateFromInput(input);
    const next = reducer(state, { type: 'cash-exact' });
    expect(next.cashReceivedCents).toBe(2705);
    expect(next.changeDueCents).toBe(0);
  });

  it('switches methods', () => {
    const state = createStateFromInput(input);
    const next = reducer(state, { type: 'select-method', method: 'text-payment-link' });
    expect(next.selectedPaymentMethod).toBe('text-payment-link');
  });

  it('resets text link status when the phone changes', () => {
    const state = createStateFromInput(input);
    const sent = reducer(state, { type: 'text-link-set-status', status: 'pending' });
    const next = reducer(sent, { type: 'text-link-set-phone', value: '(555) 987-6543' });
    expect(next.textPaymentLinkPhoneDigits).toBe('5559876543');
    expect(next.textPaymentLinkStatus).toBe('ready');
  });

  it('initializes COF fields to null/empty', () => {
    const state = createStateFromInput(input);
    expect(state.selectedSavedCardId).toBeNull();
    expect(state.removingCardId).toBeNull();
    expect(state.removingCardError).toBe('');
  });

  it('selects a saved card and clears on method switch', () => {
    const state = createStateFromInput(input);
    const selected = reducer(state, { type: 'cof-select-card', id: 'pm_001' });
    expect(selected.selectedSavedCardId).toBe('pm_001');
    expect(selected.cardStatus).toBe('ready');
    const switched = reducer(selected, { type: 'select-method', method: 'cash' });
    expect(switched.selectedSavedCardId).toBeNull();
  });

  it('keeps selectedSavedCardId when staying on card method', () => {
    const state = { ...createStateFromInput(input), selectedSavedCardId: 'pm_001' };
    const stayed = reducer(state, { type: 'select-method', method: 'card' });
    expect(stayed.selectedSavedCardId).toBe('pm_001');
  });

  it('supports manual card entry keypad field input and enter validation', () => {
    let state = createStateFromInput(input);
    state = reducer(state, { type: 'select-method', method: 'card' });
    state = reducer(state, { type: 'card-manual-open' });

    for (const d of '4111111111111111') {
      state = reducer(state, { type: 'card-manual-digit', digit: d });
    }
    state = reducer(state, { type: 'card-manual-focus-field', field: 'exp' });
    for (const d of '1229') {
      state = reducer(state, { type: 'card-manual-digit', digit: d });
    }
    state = reducer(state, { type: 'card-manual-focus-field', field: 'cvv' });
    for (const d of '123') {
      state = reducer(state, { type: 'card-manual-digit', digit: d });
    }

    const confirmed = reducer(state, { type: 'card-manual-enter' });
    expect(confirmed.cardStatus).toBe('ready');
    expect(confirmed.errorMessage).toBe('');
    expect(confirmed.manualCardDigits.endsWith('1111')).toBe(true);
  });

  it('initiates and cancels card removal', () => {
    const state = createStateFromInput(input);
    const removing = reducer(state, { type: 'cof-initiate-remove', id: 'pm_001' });
    expect(removing.removingCardId).toBe('pm_001');
    const cancelled = reducer(removing, { type: 'cof-cancel-remove' });
    expect(cancelled.removingCardId).toBeNull();
  });

  it('remove success clears removingCardId and selectedSavedCardId when they match', () => {
    const state = { ...createStateFromInput(input), selectedSavedCardId: 'pm_001', removingCardId: 'pm_001' };
    const removed = reducer(state, { type: 'cof-remove-success', id: 'pm_001' });
    expect(removed.removingCardId).toBeNull();
    expect(removed.selectedSavedCardId).toBeNull();
  });

  it('remove success preserves selectedSavedCardId when a different card is removed', () => {
    const state = { ...createStateFromInput(input), selectedSavedCardId: 'pm_002', removingCardId: 'pm_001' };
    const removed = reducer(state, { type: 'cof-remove-success', id: 'pm_001' });
    expect(removed.selectedSavedCardId).toBe('pm_002');
  });

  it('remove failed sets removingCardError', () => {
    const state = { ...createStateFromInput(input), removingCardId: 'pm_001' };
    const failed = reducer(state, { type: 'cof-remove-failed', id: 'pm_001', message: 'Server error.' });
    expect(failed.removingCardError).toBe('Server error.');
    expect(failed.removingCardId).toBe('pm_001');
  });

  it('card tip defaults to $0.00 with No Tip selected', () => {
    const state = createStateFromInput(input);
    expect(state.cardTipAmountCents).toBe(0);
    expect(state.cardTipSelection).toBe('no-tip');
  });

  it('10%, 15%, and 20% tips are calculated in cents with deterministic rounding', () => {
    const state = createStateFromInput(input);
    const p10 = reducer(state, { type: 'card-tip-set-percent', percent: 10 });
    const p15 = reducer(state, { type: 'card-tip-set-percent', percent: 15 });
    const p20 = reducer(state, { type: 'card-tip-set-percent', percent: 20 });
    expect(p10.cardTipAmountCents).toBe(271);
    expect(p15.cardTipAmountCents).toBe(406);
    expect(p20.cardTipAmountCents).toBe(541);
  });

  it('selecting a new percentage replaces the previous percentage preset', () => {
    const state = createStateFromInput(input);
    const p20 = reducer(state, { type: 'card-tip-set-percent', percent: 20 });
    const p10 = reducer(p20, { type: 'card-tip-set-percent', percent: 10 });
    expect(p10.cardTipAmountCents).toBe(271);
    expect(p10.cardTipSelection).toBe('percent-10');
  });

  it('repeated +1% presses increment current tip percentage contribution', () => {
    const state = createStateFromInput(input);
    const p20 = reducer(state, { type: 'card-tip-set-percent', percent: 20 });
    const plusOneA = reducer(p20, { type: 'card-tip-increment-percent', percent: 1 });
    const plusOneB = reducer(plusOneA, { type: 'card-tip-increment-percent', percent: 1 });
    expect(plusOneA.cardTipAmountCents).toBe(568);
    expect(plusOneB.cardTipAmountCents).toBe(595);
    expect(plusOneB.cardTipSelection).toBe('mixed');
  });

  it('$5, $10, and $20 set fixed tips and replace one another', () => {
    const state = createStateFromInput(input);
    const twenty = reducer(state, { type: 'card-tip-set-fixed', cents: 2000 });
    const five = reducer(twenty, { type: 'card-tip-set-fixed', cents: 500 });
    expect(twenty.cardTipAmountCents).toBe(2000);
    expect(five.cardTipAmountCents).toBe(500);
    expect(five.cardTipSelection).toBe('fixed-5');
  });

  it('repeated +$1 presses increment tip and clear exact preset highlighting', () => {
    const state = createStateFromInput(input);
    const ten = reducer(state, { type: 'card-tip-set-fixed', cents: 1000 });
    const plusOneA = reducer(ten, { type: 'card-tip-increment-fixed', cents: 100 });
    const plusOneB = reducer(plusOneA, { type: 'card-tip-increment-fixed', cents: 100 });
    expect(plusOneA.cardTipAmountCents).toBe(1100);
    expect(plusOneB.cardTipAmountCents).toBe(1200);
    expect(plusOneB.cardTipSelection).toBe('mixed');
  });

  it('No Tip resets tip state to zero', () => {
    const state = createStateFromInput(input);
    const tipped = reducer(state, { type: 'card-tip-set-fixed', cents: 1000 });
    const reset = reducer(tipped, { type: 'card-tip-no-tip' });
    expect(reset.cardTipAmountCents).toBe(0);
    expect(reset.cardTipFixedCents).toBe(0);
    expect(reset.cardTipPercentBasisPoints).toBe(0);
    expect(reset.cardTipSelection).toBe('no-tip');
  });

  it('Custom Amount opens editor and resets current tip to $0.00 before entry', () => {
    const state = createStateFromInput(input);
    const tipped = reducer(state, { type: 'card-tip-set-fixed', cents: 1000 });
    const customOpen = reducer(tipped, { type: 'card-tip-open-custom' });
    expect(customOpen.cardTipCustomEditorOpen).toBe(true);
    expect(customOpen.cardTipAmountCents).toBe(0);
    expect(customOpen.cardTipSelection).toBe('custom');
  });

  it('Custom Amount stores entered value in cents and supports +$1 and +1% afterward', () => {
    let state = createStateFromInput(input);
    state = reducer(state, { type: 'card-tip-open-custom' });
    state = reducer(state, { type: 'card-tip-editor-digit', digit: '1' });
    state = reducer(state, { type: 'card-tip-editor-digit', digit: '2' });
    state = reducer(state, { type: 'card-tip-editor-digit', digit: '3' });
    state = reducer(state, { type: 'card-tip-editor-digit', digit: '4' });
    state = reducer(state, { type: 'card-tip-editor-confirm' });
    expect(state.cardTipAmountCents).toBe(1234);
    expect(state.cardTipSelection).toBe('custom');

    const plusDollar = reducer(state, { type: 'card-tip-increment-fixed', cents: 100 });
    expect(plusDollar.cardTipAmountCents).toBe(1334);

    const plusPercent = reducer(state, { type: 'card-tip-increment-percent', percent: 1 });
    expect(plusPercent.cardTipAmountCents).toBe(1261);
  });

  it('percentage-derived tip recalculates when base payment amount changes', () => {
    let state = createStateFromInput(input);
    const firstPortionId = state.splitWorkspace.portions[0].id;
    state = reducer(state, { type: 'split-mark-processing', portionId: firstPortionId });
    state = reducer(state, { type: 'card-tip-set-percent', percent: 20 });
    expect(state.cardTipAmountCents).toBe(541);
    state = reducer(state, {
      type: 'split-mark-approved',
      portionId: firstPortionId,
      approvedAmountCents: 1000,
      tipAmountCents: state.cardTipAmountCents,
      paymentId: 'pay_tip_recalc'
    });

    // Remaining balance changed from 2705 -> 1705, so 20% tip should recompute.
    expect(state.remainingBalanceCents).toBe(1705);
    expect(state.cardTipAmountCents).toBe(341);
  });

  it('tip does not reduce remaining order balance', () => {
    const state = createStateFromInput(input);
    const tipped = reducer(state, { type: 'card-tip-set-fixed', cents: 2000 });
    expect(tipped.remainingBalanceCents).toBe(2705);
  });

  it('split card portions retain independent tips and declined tips are not approved', () => {
    let state = createStateFromInput(input);
    const firstPortionId = state.splitWorkspace.portions[0].id;

    state = reducer(state, { type: 'split-mark-processing', portionId: firstPortionId });
    state = reducer(state, { type: 'card-tip-set-fixed', cents: 500 });
    state = reducer(state, {
      type: 'split-mark-approved',
      portionId: firstPortionId,
      approvedAmountCents: 1000,
      tipAmountCents: state.cardTipAmountCents,
      paymentId: 'pay_portion_1'
    });

    const secondPortionId = state.splitWorkspace.portions.find((portion: any) => portion.status === 'PENDING')?.id;
    expect(secondPortionId).toBeTruthy();
    state = reducer(state, { type: 'split-mark-processing', portionId: secondPortionId });
    state = reducer(state, { type: 'card-tip-set-fixed', cents: 1000 });
    state = reducer(state, {
      type: 'split-mark-approved',
      portionId: secondPortionId,
      approvedAmountCents: 1000,
      tipAmountCents: state.cardTipAmountCents,
      paymentId: 'pay_portion_2'
    });

    const approved = state.splitWorkspace.portions.filter((portion: any) => portion.status === 'APPROVED');
    const tipByPaymentId = Object.fromEntries(approved.map((portion: any) => [portion.paymentId, portion.tipAmountCents]));
    expect(tipByPaymentId.pay_portion_1).toBe(500);
    expect(tipByPaymentId.pay_portion_2).toBe(1000);
    expect(state.remainingBalanceCents).toBe(705);

    const thirdPortionId = state.splitWorkspace.portions.find((portion: any) => portion.status === 'PENDING')?.id;
    expect(thirdPortionId).toBeTruthy();
    state = reducer(state, { type: 'split-mark-processing', portionId: thirdPortionId });
    state = reducer(state, { type: 'card-tip-set-fixed', cents: 700 });
    state = reducer(state, {
      type: 'split-mark-declined',
      portionId: thirdPortionId,
      failureCode: 'DECLINED',
      failureMessage: 'Declined'
    });

    const declined = state.splitWorkspace.portions.find((portion: any) => portion.id === thirdPortionId);
    expect(declined.status).toBe('DECLINED');
    expect(declined.tipAmountCents).toBe(0);
    expect(state.splitWorkspace.paidCents).toBe(2000);
  });
});
