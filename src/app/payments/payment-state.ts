/// <reference path="./payment-types.ts" />

function createStateFromInput(input: PaymentPaneInput): PaymentPaneState {
  const selected = input.selectedMethod || 'cash';
  const safeTotal = Math.max(0, Number(input.totalCents || 0));
  const safeApplied = Math.max(0, Number(input.paymentsAppliedCents || 0));
  const remaining = Math.max(0, Number(input.remainingBalanceCents || (safeTotal - safeApplied)));

  return {
    selectedPaymentMethod: selected,
    subtotalCents: Math.max(0, Number(input.subtotalCents || 0)),
    taxCents: Math.max(0, Number(input.taxCents || 0)),
    totalCents: safeTotal,
    tipCents: Math.max(0, Number(input.tipCents || 0)),
    paymentsAppliedCents: safeApplied,
    remainingBalanceCents: remaining,
    cashReceivedCents: 0,
    changeDueCents: 0,
    cardStatus: 'ready',
    textPaymentLinkStatus: 'ready',
    textPaymentLinkPhoneDigits: normalizePhoneDigits(input.customer?.phone || ''),
    selectedSavedCardId: null,
    removingCardId: null,
    removingCardError: '',
    isSubmitting: false,
    errorMessage: ''
  };
}

function recomputeCashState(state: PaymentPaneState): PaymentPaneState {
  const remaining = computeRemainingBalanceCents(state.totalCents, state.paymentsAppliedCents);
  const change = computeChangeDueCents(state.cashReceivedCents, remaining);
  return {
    ...state,
    remainingBalanceCents: remaining,
    changeDueCents: change
  };
}

function reducer(state: PaymentPaneState, action: PaymentPaneAction): PaymentPaneState {
  if (action.type === 'select-method') {
    return {
      ...state,
      selectedPaymentMethod: action.method,
      selectedSavedCardId: action.method === 'card' ? state.selectedSavedCardId : null,
      removingCardId: null,
      removingCardError: '',
      errorMessage: ''
    };
  }

  if (action.type === 'cash-digit') {
    const nextCents = applyCurrencyDigitInput(state.cashReceivedCents, action.digit);
    return recomputeCashState({ ...state, cashReceivedCents: nextCents, errorMessage: '' });
  }

  if (action.type === 'cash-backspace') {
    const nextCents = applyCurrencyBackspace(state.cashReceivedCents);
    return recomputeCashState({ ...state, cashReceivedCents: nextCents, errorMessage: '' });
  }

  if (action.type === 'cash-set-amount') {
    return recomputeCashState({ ...state, cashReceivedCents: Math.max(0, action.cents || 0), errorMessage: '' });
  }

  if (action.type === 'cash-exact') {
    return recomputeCashState({ ...state, cashReceivedCents: Math.max(0, state.remainingBalanceCents), errorMessage: '' });
  }

  if (action.type === 'text-link-set-phone') {
    const phoneDigits = normalizePhoneDigits(action.value);
    const status = phoneDigits !== state.textPaymentLinkPhoneDigits && state.textPaymentLinkStatus !== 'paid'
      ? 'ready'
      : state.textPaymentLinkStatus;
    return {
      ...state,
      textPaymentLinkPhoneDigits: phoneDigits,
      textPaymentLinkStatus: status,
      errorMessage: ''
    };
  }

  if (action.type === 'text-link-set-status') {
    return {
      ...state,
      textPaymentLinkStatus: action.status,
      errorMessage: action.errorMessage || ''
    };
  }

  if (action.type === 'cof-select-card') {
    return {
      ...state,
      selectedSavedCardId: action.id,
      cardStatus: 'ready',
      errorMessage: ''
    };
  }

  if (action.type === 'cof-initiate-remove') {
    return {
      ...state,
      removingCardId: action.id,
      removingCardError: ''
    };
  }

  if (action.type === 'cof-cancel-remove') {
    return {
      ...state,
      removingCardId: null,
      removingCardError: ''
    };
  }

  if (action.type === 'cof-remove-success') {
    return {
      ...state,
      removingCardId: null,
      removingCardError: '',
      selectedSavedCardId: state.selectedSavedCardId === action.id ? null : state.selectedSavedCardId
    };
  }

  if (action.type === 'cof-remove-failed') {
    return {
      ...state,
      removingCardError: action.message || 'Failed to remove card.'
    };
  }

  if (action.type === 'set-card-status') {
    return {
      ...state,
      cardStatus: action.status,
      errorMessage: action.errorMessage || ''
    };
  }

  if (action.type === 'set-submitting') {
    return {
      ...state,
      isSubmitting: !!action.submitting
    };
  }

  if (action.type === 'set-error') {
    return {
      ...state,
      errorMessage: String(action.message || '')
    };
  }

  if (action.type === 'reset-error') {
    return {
      ...state,
      errorMessage: ''
    };
  }

  return state;
}
