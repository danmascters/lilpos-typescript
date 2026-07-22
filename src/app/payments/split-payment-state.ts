/// <reference path="./payment-types.ts" />
/// <reference path="./split-payment-math.ts" />

function splitNextPortionSequence(portions: SplitPaymentPortionRuntime[]): number {
  const list = Array.isArray(portions) ? portions : [];
  if (!list.length) return 1;
  return Math.max(...list.map((portion) => Number(portion.sequence || 0))) + 1;
}

function splitCreatePortionId(sequence: number): string {
  return `split_portion_${sequence}_${Math.random().toString(36).slice(2, 8)}`;
}

function splitDefaultPortionMethod(): SplitPortionPaymentMethod {
  return 'cash';
}

function splitBuildPortion(input: {
  sequence: number;
  plannedAmountCents: number;
  paymentMethod?: SplitPortionPaymentMethod;
  status?: SplitPaymentPortionStatus;
}): SplitPaymentPortionRuntime {
  const sequence = Math.max(1, Number(input.sequence || 1));
  const plannedAmountCents = window.LilposSplitPaymentMath.splitClampCents(input.plannedAmountCents);
  return {
    id: splitCreatePortionId(sequence),
    sequence,
    paymentMethod: input.paymentMethod || splitDefaultPortionMethod(),
    plannedAmountCents,
    approvedAmountCents: 0,
    tipAmountCents: 0,
    status: input.status || 'PENDING',
    paymentId: '',
    provider: '',
    providerTransactionReference: '',
    cardBrand: '',
    cardLast4: '',
    failureCode: '',
    failureMessage: '',
    idempotencyKey: `split-portion-${Date.now()}-${sequence}`,
    syncStatus: 'local-only',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function splitEnsurePendingPortion(workspace: SplitPaymentWorkspace): SplitPaymentWorkspace {
  const next = { ...workspace, portions: [...workspace.portions] };
  const remaining = window.LilposSplitPaymentMath.splitRemainingCents(next.originalBalanceCents, next.portions);
  const hasPending = next.portions.some((portion) => portion.status === 'PENDING' || portion.status === 'DECLINED');
  if (!hasPending && remaining > 0) {
    next.portions.push(splitBuildPortion({
      sequence: splitNextPortionSequence(next.portions),
      plannedAmountCents: remaining,
      paymentMethod: splitDefaultPortionMethod(),
      status: 'PENDING'
    }));
  }
  return splitRecomputeWorkspace(next);
}

function splitRecomputeWorkspace(workspace: SplitPaymentWorkspace): SplitPaymentWorkspace {
  const portions = Array.isArray(workspace.portions) ? workspace.portions : [];
  const paidCents = window.LilposSplitPaymentMath.splitPaidSoFarCents(portions);
  const remainingCents = window.LilposSplitPaymentMath.splitRemainingCents(workspace.originalBalanceCents, portions);
  const status = remainingCents === 0 ? 'COMPLETED' : workspace.status;
  const selectedPortionId = portions.some((portion) => portion.id === workspace.selectedPortionId)
    ? workspace.selectedPortionId
    : (portions.find((portion) => portion.status === 'PENDING' || portion.status === 'DECLINED')?.id || null);

  return {
    ...workspace,
    portions,
    paidCents,
    remainingCents,
    status,
    selectedPortionId,
    updatedAt: new Date().toISOString()
  };
}

function createSplitWorkspace(input: PaymentPaneInput): SplitPaymentWorkspace {
  const total = window.LilposSplitPaymentMath.splitClampCents(input.remainingBalanceCents);
  const workspace: SplitPaymentWorkspace = {
    planId: `split_plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    mode: 'CUSTOM',
    status: total > 0 ? 'ACTIVE' : 'COMPLETED',
    originalBalanceCents: total,
    paidCents: 0,
    remainingCents: total,
    requestedPaymentCount: 2,
    selectedPortionId: null,
    amountEditorCents: total,
    portions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    orderId: input.paymentContextOrderId || input.displayOrderNumber || '',
    historyId: input.paymentContextHistoryId || '',
    idempotencyKey: `split-plan-${input.paymentContextOrderId || input.displayOrderNumber || Date.now()}`,
    syncStatus: 'local-only'
  };
  return splitEnsurePendingPortion(workspace);
}

function splitSetMode(workspace: SplitPaymentWorkspace, mode: SplitPaymentMode): SplitPaymentWorkspace {
  return splitRecomputeWorkspace({ ...workspace, mode });
}

function splitSetRequestedCount(workspace: SplitPaymentWorkspace, count: number): SplitPaymentWorkspace {
  return splitRecomputeWorkspace({
    ...workspace,
    requestedPaymentCount: Math.max(2, Math.min(12, Math.round(Number(count || 2))))
  });
}

function splitSetAmountEditor(workspace: SplitPaymentWorkspace, cents: number): SplitPaymentWorkspace {
  return splitRecomputeWorkspace({
    ...workspace,
    amountEditorCents: Math.max(0, window.LilposSplitPaymentMath.splitClampCents(cents))
  });
}

function splitGenerateEvenPortions(workspace: SplitPaymentWorkspace, method: SplitPortionPaymentMethod): SplitPaymentWorkspace {
  const clean = splitRecomputeWorkspace({ ...workspace, portions: [...workspace.portions] });
  const remaining = clean.remainingCents;
  if (remaining <= 0) return clean;

  const kept = clean.portions.filter((portion) => portion.status === 'APPROVED');
  const portions = window.LilposSplitPaymentMath.splitEvenlyPortions(remaining, clean.requestedPaymentCount)
    .filter((amount) => amount > 0)
    .map((amount, index) => splitBuildPortion({
      sequence: splitNextPortionSequence(kept) + index,
      plannedAmountCents: amount,
      paymentMethod: method,
      status: 'PENDING'
    }));

  return splitRecomputeWorkspace({
    ...clean,
    mode: 'EVEN',
    portions: [...kept, ...portions],
    amountEditorCents: remaining
  });
}

function splitAddCustomPortion(workspace: SplitPaymentWorkspace, input: { amountCents: number; method: SplitPortionPaymentMethod }): SplitPaymentWorkspace {
  const clean = splitRecomputeWorkspace({ ...workspace, portions: [...workspace.portions] });
  const remaining = clean.remainingCents;
  const requested = window.LilposSplitPaymentMath.splitClampCents(input.amountCents);
  if (requested <= 0 || remaining <= 0) return clean;
  const allowed = Math.min(requested, remaining);

  const withoutPending = clean.portions.filter((portion) => portion.status !== 'PENDING' && portion.status !== 'DECLINED');
  const nextPortions = [...withoutPending, splitBuildPortion({
    sequence: splitNextPortionSequence(withoutPending),
    plannedAmountCents: allowed,
    paymentMethod: input.method,
    status: 'PENDING'
  })];

  return splitEnsurePendingPortion(splitRecomputeWorkspace({
    ...clean,
    mode: 'CUSTOM',
    portions: nextPortions,
    amountEditorCents: Math.max(0, remaining - allowed)
  }));
}

function splitUpdatePendingPortion(workspace: SplitPaymentWorkspace, portionId: string, patch: Partial<SplitPaymentPortionRuntime>): SplitPaymentWorkspace {
  const nextPortions = workspace.portions.map((portion) => {
    if (portion.id !== portionId) return portion;
    if (portion.status !== 'PENDING' && portion.status !== 'DECLINED') return portion;
    const updated = { ...portion, ...patch, updatedAt: new Date().toISOString() };
    if (patch.plannedAmountCents != null) {
      updated.plannedAmountCents = window.LilposSplitPaymentMath.splitClampCents(patch.plannedAmountCents);
    }
    return updated;
  });
  return splitRecomputeWorkspace({ ...workspace, portions: nextPortions });
}

function splitRemovePendingPortion(workspace: SplitPaymentWorkspace, portionId: string): SplitPaymentWorkspace {
  const nextPortions = workspace.portions.filter((portion) => {
    if (portion.id !== portionId) return true;
    return portion.status !== 'PENDING' && portion.status !== 'DECLINED';
  });
  return splitEnsurePendingPortion(splitRecomputeWorkspace({ ...workspace, portions: nextPortions }));
}

function splitMarkPortionProcessing(workspace: SplitPaymentWorkspace, portionId: string): SplitPaymentWorkspace {
  return splitRecomputeWorkspace({
    ...workspace,
    portions: workspace.portions.map((portion) => {
      if (portion.id !== portionId) return portion;
      if (portion.status !== 'PENDING' && portion.status !== 'DECLINED') return portion;
      return {
        ...portion,
        status: 'PROCESSING',
        failureCode: '',
        failureMessage: '',
        updatedAt: new Date().toISOString()
      };
    }),
    selectedPortionId: portionId
  });
}

function splitMarkPortionApproved(workspace: SplitPaymentWorkspace, input: {
  portionId: string;
  approvedAmountCents: number;
  tipAmountCents?: number;
  paymentId?: string;
  provider?: string;
  providerTransactionReference?: string;
  cardBrand?: string;
  cardLast4?: string;
}): SplitPaymentWorkspace {
  const approvedAmountCents = window.LilposSplitPaymentMath.splitClampCents(input.approvedAmountCents);
  const tipAmountCents = window.LilposSplitPaymentMath.splitClampCents(input.tipAmountCents || 0);

  const next = splitRecomputeWorkspace({
    ...workspace,
    portions: workspace.portions.map((portion) => {
      if (portion.id !== input.portionId) return portion;
      return {
        ...portion,
        status: 'APPROVED',
        approvedAmountCents,
        tipAmountCents,
        paymentId: input.paymentId || portion.paymentId,
        provider: input.provider || portion.provider,
        providerTransactionReference: input.providerTransactionReference || portion.providerTransactionReference,
        cardBrand: input.cardBrand || portion.cardBrand,
        cardLast4: input.cardLast4 || portion.cardLast4,
        failureCode: '',
        failureMessage: '',
        updatedAt: new Date().toISOString()
      };
    })
  });

  return splitEnsurePendingPortion(next);
}

function splitMarkPortionDeclined(workspace: SplitPaymentWorkspace, input: {
  portionId: string;
  failureCode?: string;
  failureMessage?: string;
}): SplitPaymentWorkspace {
  return splitRecomputeWorkspace({
    ...workspace,
    portions: workspace.portions.map((portion) => {
      if (portion.id !== input.portionId) return portion;
      return {
        ...portion,
        status: 'DECLINED',
        approvedAmountCents: 0,
        tipAmountCents: 0,
        failureCode: input.failureCode || 'DECLINED',
        failureMessage: input.failureMessage || 'Payment declined',
        updatedAt: new Date().toISOString()
      };
    }),
    selectedPortionId: input.portionId
  });
}

function splitCancelWorkspace(workspace: SplitPaymentWorkspace): SplitPaymentWorkspace {
  const hasApproved = workspace.portions.some((portion) => portion.status === 'APPROVED');
  if (hasApproved) {
    return splitRecomputeWorkspace({
      ...workspace,
      status: 'ACTIVE'
    });
  }
  return splitRecomputeWorkspace({
    ...workspace,
    status: 'CANCELED',
    portions: workspace.portions.map((portion) => {
      if (portion.status === 'PENDING' || portion.status === 'DECLINED' || portion.status === 'PROCESSING') {
        return { ...portion, status: 'CANCELED', updatedAt: new Date().toISOString() };
      }
      return portion;
    })
  });
}

window.LilposSplitPaymentState = {
  createSplitWorkspace,
  splitSetMode,
  splitSetRequestedCount,
  splitSetAmountEditor,
  splitGenerateEvenPortions,
  splitAddCustomPortion,
  splitUpdatePendingPortion,
  splitRemovePendingPortion,
  splitMarkPortionProcessing,
  splitMarkPortionApproved,
  splitMarkPortionDeclined,
  splitCancelWorkspace,
  splitEnsurePendingPortion,
  splitRecomputeWorkspace
};
