/// <reference path="./payment-types.ts" />
/// <reference path="./split-payment-state.ts" />

function createStateFromInput(input: PaymentPaneInput): PaymentPaneState {
  const selected = input.selectedMethod || 'cash';
  const safeTotal = Math.max(0, Number(input.totalCents || 0));
  const safeApplied = Math.max(0, Number(input.paymentsAppliedCents || 0));
  const remaining = Math.max(0, Number(input.remainingBalanceCents || (safeTotal - safeApplied)));

  const splitWorkspace = window.LilposSplitPaymentState
    ? window.LilposSplitPaymentState.createSplitWorkspace(input)
    : null;

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
    splitWorkspace,
    splitProcessingPortionId: null,
    splitProcessingAmountCents: 0,
    isSubmitting: false,
    errorMessage: ''
  };
}

function recomputeCashState(state: PaymentPaneState): PaymentPaneState {
  const remaining = computeRemainingBalanceCents(state.totalCents, state.paymentsAppliedCents);
  const splitDue = state.splitProcessingAmountCents > 0 ? state.splitProcessingAmountCents : 0;
  const cashDue = splitDue > 0 ? splitDue : remaining;
  const change = computeChangeDueCents(state.cashReceivedCents, cashDue);
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
      splitProcessingPortionId: action.method === 'split' ? state.splitProcessingPortionId : state.splitProcessingPortionId,
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

  if (action.type === 'split-set-mode') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitSetMode(state.splitWorkspace, action.mode),
      errorMessage: ''
    };
  }

  if (action.type === 'split-set-even-count') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitSetRequestedCount(state.splitWorkspace, action.count),
      errorMessage: ''
    };
  }

  if (action.type === 'split-generate-even') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitGenerateEvenPortions(state.splitWorkspace, action.method),
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-set-amount-editor') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitSetAmountEditor(state.splitWorkspace, action.cents),
      errorMessage: ''
    };
  }

  if (action.type === 'split-add-portion') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitAddCustomPortion(state.splitWorkspace, {
        method: action.method,
        amountCents: action.amountCents
      }),
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-select-portion') {
    if (!state.splitWorkspace) return state;
    return {
      ...state,
      splitWorkspace: {
        ...state.splitWorkspace,
        selectedPortionId: action.portionId
      },
      errorMessage: ''
    };
  }

  if (action.type === 'split-set-portion-method') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitUpdatePendingPortion(state.splitWorkspace, action.portionId, {
        paymentMethod: action.method
      }),
      errorMessage: ''
    };
  }

  if (action.type === 'split-set-portion-amount') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitUpdatePendingPortion(state.splitWorkspace, action.portionId, {
        plannedAmountCents: action.amountCents
      }),
      errorMessage: ''
    };
  }

  if (action.type === 'split-remove-portion') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitRemovePendingPortion(state.splitWorkspace, action.portionId),
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-mark-processing') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    const portion = state.splitWorkspace.portions.find((entry) => entry.id === action.portionId);
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitMarkPortionProcessing(state.splitWorkspace, action.portionId),
      splitProcessingPortionId: action.portionId,
      splitProcessingAmountCents: portion ? Number(portion.plannedAmountCents || 0) : 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-mark-approved') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    const nextWorkspace = window.LilposSplitPaymentState.splitMarkPortionApproved(state.splitWorkspace, {
      portionId: action.portionId,
      approvedAmountCents: action.approvedAmountCents,
      tipAmountCents: action.tipAmountCents,
      paymentId: action.paymentId,
      provider: action.provider,
      providerTransactionReference: action.providerTransactionReference,
      cardBrand: action.cardBrand,
      cardLast4: action.cardLast4
    });
    const nextApplied = window.LilposSplitPaymentMath
      ? window.LilposSplitPaymentMath.splitPaidSoFarCents(nextWorkspace.portions)
      : state.paymentsAppliedCents;
    return recomputeCashState({
      ...state,
      splitWorkspace: nextWorkspace,
      paymentsAppliedCents: nextApplied,
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'split-mark-declined') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitMarkPortionDeclined(state.splitWorkspace, {
        portionId: action.portionId,
        failureCode: action.failureCode,
        failureMessage: action.failureMessage
      }),
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-cancel-workspace') {
    if (!state.splitWorkspace || !window.LilposSplitPaymentState) return state;
    return {
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitCancelWorkspace(state.splitWorkspace),
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'split-clear-processing') {
    return {
      ...state,
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      isSubmitting: false
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
