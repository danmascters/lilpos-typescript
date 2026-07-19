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
});
