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

  const initialState: PaymentPaneState = {
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
    cardTipFixedCents: 0,
    cardTipPercentBasisPoints: 0,
    cardTipAmountCents: 0,
    cardTipSelection: 'no-tip' as CardTipSelection,
    cardTipCustomEditorOpen: false,
    cardTipCustomEditorCents: 0,
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

  return withRecomputedCardTip(initialState);
}

function cardPaymentBaseAmountCents(state: PaymentPaneState): number {
  if (Number(state.splitProcessingAmountCents || 0) > 0) {
    return Math.max(0, Number(state.splitProcessingAmountCents || 0));
  }
  return Math.max(0, Number(state.remainingBalanceCents || 0));
}

function computeCardTipAmountCents(state: PaymentPaneState): number {
  const fixedCents = Math.max(0, Number(state.cardTipFixedCents || 0));
  const basisPoints = Math.max(0, Number(state.cardTipPercentBasisPoints || 0));
  if (basisPoints <= 0) return fixedCents;
  const baseCents = cardPaymentBaseAmountCents(state);
  const percentCents = Math.round((baseCents * basisPoints) / 10000);
  return Math.max(0, fixedCents + percentCents);
}

function syncSplitProcessingPortionTipDraft(state: PaymentPaneState): PaymentPaneState {
  if (!state.splitWorkspace || !state.splitProcessingPortionId) return state;
  const portionId = state.splitProcessingPortionId;
  const tipAmountCents = Math.max(0, Number(state.cardTipAmountCents || 0));
  let changed = false;
  const portions = state.splitWorkspace.portions.map((portion) => {
    if (portion.id !== portionId) return portion;
    if (portion.status === 'APPROVED' || Number(portion.tipAmountCents || 0) === tipAmountCents) return portion;
    changed = true;
    return {
      ...portion,
      tipAmountCents,
      updatedAt: new Date().toISOString()
    };
  });
  if (!changed) return state;
  return {
    ...state,
    splitWorkspace: {
      ...state.splitWorkspace,
      portions,
      updatedAt: new Date().toISOString()
    }
  };
}

function withRecomputedCardTip(state: PaymentPaneState): PaymentPaneState {
  const nextTipAmount = computeCardTipAmountCents(state);
  const nextState = {
    ...state,
    cardTipAmountCents: nextTipAmount
  };
  return syncSplitProcessingPortionTipDraft(nextState);
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
      cardTipCustomEditorOpen: action.method === 'card' ? state.cardTipCustomEditorOpen : false,
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

  if (action.type === 'card-tip-set-percent') {
    const basisPoints = Math.max(0, Number(action.percent || 0)) * 100;
    const selection: CardTipSelection = action.percent === 10
      ? 'percent-10'
      : action.percent === 15
      ? 'percent-15'
      : 'percent-20';
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: 0,
      cardTipPercentBasisPoints: basisPoints,
      cardTipSelection: selection,
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-increment-percent') {
    const incrementBasisPoints = Math.max(0, Number(action.percent || 0)) * 100;
    return withRecomputedCardTip({
      ...state,
      cardTipPercentBasisPoints: Math.max(0, Number(state.cardTipPercentBasisPoints || 0)) + incrementBasisPoints,
      cardTipSelection: 'mixed',
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-set-fixed') {
    const fixedCents = Math.max(0, Number(action.cents || 0));
    const selection: CardTipSelection = fixedCents === 500
      ? 'fixed-5'
      : fixedCents === 1000
      ? 'fixed-10'
      : fixedCents === 2000
      ? 'fixed-20'
      : 'mixed';
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: fixedCents,
      cardTipPercentBasisPoints: 0,
      cardTipSelection: selection,
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-increment-fixed') {
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: Math.max(0, Number(state.cardTipFixedCents || 0)) + Math.max(0, Number(action.cents || 0)),
      cardTipSelection: 'mixed',
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-no-tip') {
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: 0,
      cardTipPercentBasisPoints: 0,
      cardTipSelection: 'no-tip',
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-open-custom') {
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: 0,
      cardTipPercentBasisPoints: 0,
      cardTipSelection: 'custom',
      cardTipCustomEditorOpen: true,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    });
  }

  if (action.type === 'card-tip-editor-digit') {
    return {
      ...state,
      cardTipCustomEditorCents: applyCurrencyDigitInput(state.cardTipCustomEditorCents, action.digit),
      errorMessage: ''
    };
  }

  if (action.type === 'card-tip-editor-backspace') {
    return {
      ...state,
      cardTipCustomEditorCents: applyCurrencyBackspace(state.cardTipCustomEditorCents),
      errorMessage: ''
    };
  }

  if (action.type === 'card-tip-editor-clear') {
    return {
      ...state,
      cardTipCustomEditorCents: 0,
      errorMessage: ''
    };
  }

  if (action.type === 'card-tip-editor-cancel') {
    return {
      ...state,
      cardTipCustomEditorOpen: false,
      errorMessage: ''
    };
  }

  if (action.type === 'card-tip-editor-confirm') {
    return withRecomputedCardTip({
      ...state,
      cardTipFixedCents: Math.max(0, Number(state.cardTipCustomEditorCents || 0)),
      cardTipPercentBasisPoints: 0,
      cardTipSelection: 'custom',
      cardTipCustomEditorOpen: false,
      errorMessage: ''
    });
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
    const restoredTipCents = Math.max(0, Number(portion?.tipAmountCents || 0));
    return withRecomputedCardTip({
      ...state,
      splitWorkspace: window.LilposSplitPaymentState.splitMarkPortionProcessing(state.splitWorkspace, action.portionId),
      splitProcessingPortionId: action.portionId,
      splitProcessingAmountCents: portion ? Number(portion.plannedAmountCents || 0) : 0,
      cardTipFixedCents: restoredTipCents,
      cardTipPercentBasisPoints: 0,
      cardTipSelection: restoredTipCents > 0 ? 'custom' : 'no-tip',
      cardTipCustomEditorOpen: false,
      cardTipCustomEditorCents: restoredTipCents,
      errorMessage: ''
    });
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
    return withRecomputedCardTip(recomputeCashState({
      ...state,
      splitWorkspace: nextWorkspace,
      paymentsAppliedCents: nextApplied,
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      errorMessage: ''
    }));
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
    return withRecomputedCardTip({
      ...state,
      splitProcessingPortionId: null,
      splitProcessingAmountCents: 0,
      isSubmitting: false
    });
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
