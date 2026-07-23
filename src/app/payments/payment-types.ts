type PaymentMethod = 'cash' | 'card' | 'split' | 'gift-or-other' | 'text-payment-link';

type OrderPaymentWorkflow = 'cash' | 'credit' | 'other';

type CardStatus = 'ready' | 'processing' | 'approved' | 'declined' | 'error';

type CardTipSelection = 'no-tip' | 'percent-10' | 'percent-15' | 'percent-20' | 'fixed-5' | 'fixed-10' | 'fixed-20' | 'custom' | 'mixed';

type TextPaymentLinkStatus = 'ready' | 'sending' | 'sent' | 'pending' | 'paid' | 'failed' | 'expired';

type SplitPaymentMode = 'CUSTOM' | 'EVEN';

type SplitPaymentPlanStatus = 'ACTIVE' | 'COMPLETED' | 'CANCELED';

type SplitPaymentPortionStatus = 'PENDING' | 'PROCESSING' | 'APPROVED' | 'DECLINED' | 'CANCELED' | 'VOIDED';

type SplitPortionPaymentMethod = 'cash' | 'card' | 'other';

type SplitPaymentPortionRuntime = {
  id: string;
  sequence: number;
  paymentMethod: SplitPortionPaymentMethod;
  plannedAmountCents: number;
  approvedAmountCents: number;
  tipAmountCents: number;
  status: SplitPaymentPortionStatus;
  paymentId: string;
  provider: string;
  providerTransactionReference: string;
  cardBrand: string;
  cardLast4: string;
  failureCode: string;
  failureMessage: string;
  idempotencyKey: string;
  syncStatus: string;
  createdAt: string;
  updatedAt: string;
};

type SplitPaymentWorkspace = {
  planId: string;
  orderId: string;
  historyId: string;
  mode: SplitPaymentMode;
  status: SplitPaymentPlanStatus;
  originalBalanceCents: number;
  paidCents: number;
  remainingCents: number;
  requestedPaymentCount: number;
  selectedPortionId: string | null;
  amountEditorCents: number;
  portions: SplitPaymentPortionRuntime[];
  createdAt: string;
  updatedAt: string;
  idempotencyKey: string;
  syncStatus: string;
};

type CardBrand = 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown';

type SavedPaymentMethodDisplay = {
  savedPaymentMethodId: string;
  customerId: string;
  cardBrand: CardBrand;
  lastFour: string;
  expirationMonth?: number;
  expirationYear?: number;
  isDefault?: boolean;
  lastUsedAt?: string;
  status: 'active' | 'expired' | 'disabled';
};

type PaymentOrderType = 'pickup' | 'delivery' | 'togo' | 'tostay' | 'dinein' | string;

type PaymentPaneOrderItem = {
  id?: string;
  name: string;
  qty: number;
  priceCents: number;
  subtitle?: string;
};

type PaymentPaneCustomerSummary = {
  name?: string;
  phone?: string;
};

type PaymentPaneInput = {
  displayOrderNumber: string;
  orderTypeLabel: string;
  stationName: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  tipCents?: number;
  paymentsAppliedCents: number;
  remainingBalanceCents: number;
  customer: PaymentPaneCustomerSummary;
  items: PaymentPaneOrderItem[];
  orderType: PaymentOrderType;
  selectedMethod?: PaymentMethod;
  savedPaymentMethods?: SavedPaymentMethodDisplay[];
  canRemoveSavedCards?: boolean;
  paymentContextSource?: 'active-ticket' | 'orders-management';
  paymentContextOrderId?: string;
  paymentContextHistoryId?: string;
  paymentContextRemainingBalanceCents?: number;
  paymentContextWorkflow?: OrderPaymentWorkflow;
};

type OrderPaymentContext = {
  source: 'orders-management';
  orderId: string;
  historyId: string;
  remainingBalanceCents: number;
  workflow: OrderPaymentWorkflow;
  selectedMethod: PaymentMethod;
  idempotencyKey: string;
};

type PaymentPaneState = {
  selectedPaymentMethod: PaymentMethod;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  tipCents: number;
  paymentsAppliedCents: number;
  remainingBalanceCents: number;
  cashReceivedCents: number;
  changeDueCents: number;
  cardStatus: CardStatus;
  cardTipFixedCents: number;
  cardTipPercentBasisPoints: number;
  cardTipAmountCents: number;
  cardTipSelection: CardTipSelection;
  cardTipCustomEditorOpen: boolean;
  cardTipCustomEditorCents: number;
  textPaymentLinkStatus: TextPaymentLinkStatus;
  textPaymentLinkPhoneDigits: string;
  selectedSavedCardId: string | null;
  removingCardId: string | null;
  removingCardError: string;
  splitWorkspace: SplitPaymentWorkspace | null;
  splitProcessingPortionId: string | null;
  splitProcessingAmountCents: number;
  isSubmitting: boolean;
  errorMessage: string;
};

type PaymentPaneCallbacks = {
  onBack: () => void;
  onSendUnpaid: () => void;
  onPayAndSend: () => void;
  onCompleteCashSale: (result: { amountTenderedCents: number; amountAppliedCents: number; changeDueCents: number }) => void;
  onChargeCardAndComplete: (result: { amountAppliedCents: number }) => Promise<{ ok: boolean; status: CardStatus; message?: string }>;
  onManualEntryRequested: () => void;
  onSplitPaymentRequested: () => void;
};

interface Window {
  LilposPaymentPane: {
    createStateFromInput: (input: PaymentPaneInput) => PaymentPaneState;
    renderPane: (input: PaymentPaneInput, state: PaymentPaneState) => string;
    reducer: (state: PaymentPaneState, action: PaymentPaneAction) => PaymentPaneState;
    parseMoneyInputToCents: (displayValue: string) => number;
    formatCents: (cents: number) => string;
  };
  LilposOrderPaymentContext: {
    toCents: (amount: any) => number;
    orderTotalCents: (order: any) => number;
    orderPaidAmountCents: (order: any) => number;
    orderRemainingBalanceCents: (order: any) => number;
    isOrderPaymentEligible: (order: any) => boolean;
    buildOrderPaymentContext: (order: any, workflow: OrderPaymentWorkflow, options?: any) => OrderPaymentContext | null;
  };
  LilposSplitPaymentMath: {
    splitClampCents: (value: any) => number;
    splitEvenlyPortions: (totalCents: number, count: number) => number[];
    splitPaidSoFarCents: (portions: SplitPaymentPortionRuntime[]) => number;
    splitTipTotalCents: (portions: SplitPaymentPortionRuntime[]) => number;
    splitRemainingCents: (originalBalanceCents: number, portions: SplitPaymentPortionRuntime[]) => number;
    splitDisplayMethodLabel: (method: SplitPortionPaymentMethod) => string;
  };
  LilposSplitPaymentState: {
    createSplitWorkspace: (input: PaymentPaneInput) => SplitPaymentWorkspace;
    splitSetMode: (workspace: SplitPaymentWorkspace, mode: SplitPaymentMode) => SplitPaymentWorkspace;
    splitSetRequestedCount: (workspace: SplitPaymentWorkspace, count: number) => SplitPaymentWorkspace;
    splitSetAmountEditor: (workspace: SplitPaymentWorkspace, cents: number) => SplitPaymentWorkspace;
    splitGenerateEvenPortions: (workspace: SplitPaymentWorkspace, method: SplitPortionPaymentMethod) => SplitPaymentWorkspace;
    splitAddCustomPortion: (workspace: SplitPaymentWorkspace, input: { amountCents: number; method: SplitPortionPaymentMethod }) => SplitPaymentWorkspace;
    splitUpdatePendingPortion: (workspace: SplitPaymentWorkspace, portionId: string, patch: Partial<SplitPaymentPortionRuntime>) => SplitPaymentWorkspace;
    splitRemovePendingPortion: (workspace: SplitPaymentWorkspace, portionId: string) => SplitPaymentWorkspace;
    splitMarkPortionProcessing: (workspace: SplitPaymentWorkspace, portionId: string) => SplitPaymentWorkspace;
    splitMarkPortionApproved: (workspace: SplitPaymentWorkspace, input: {
      portionId: string;
      approvedAmountCents: number;
      tipAmountCents?: number;
      paymentId?: string;
      provider?: string;
      providerTransactionReference?: string;
      cardBrand?: string;
      cardLast4?: string;
    }) => SplitPaymentWorkspace;
    splitMarkPortionDeclined: (workspace: SplitPaymentWorkspace, input: {
      portionId: string;
      failureCode?: string;
      failureMessage?: string;
    }) => SplitPaymentWorkspace;
    splitCancelWorkspace: (workspace: SplitPaymentWorkspace) => SplitPaymentWorkspace;
    splitEnsurePendingPortion: (workspace: SplitPaymentWorkspace) => SplitPaymentWorkspace;
    splitRecomputeWorkspace: (workspace: SplitPaymentWorkspace) => SplitPaymentWorkspace;
  };
}

type PaymentPaneAction =
  | { type: 'select-method'; method: PaymentMethod }
  | { type: 'cash-digit'; digit: string }
  | { type: 'cash-backspace' }
  | { type: 'cash-set-amount'; cents: number }
  | { type: 'cash-exact' }
  | { type: 'text-link-set-phone'; value: string }
  | { type: 'text-link-set-status'; status: TextPaymentLinkStatus; errorMessage?: string }
  | { type: 'cof-select-card'; id: string | null }
  | { type: 'cof-initiate-remove'; id: string }
  | { type: 'cof-cancel-remove' }
  | { type: 'cof-remove-success'; id: string }
  | { type: 'cof-remove-failed'; id: string; message: string }
  | { type: 'set-card-status'; status: CardStatus; errorMessage?: string }
  | { type: 'card-tip-set-percent'; percent: 10 | 15 | 20 }
  | { type: 'card-tip-increment-percent'; percent: 1 }
  | { type: 'card-tip-set-fixed'; cents: number }
  | { type: 'card-tip-increment-fixed'; cents: number }
  | { type: 'card-tip-no-tip' }
  | { type: 'card-tip-open-custom' }
  | { type: 'card-tip-editor-digit'; digit: string }
  | { type: 'card-tip-editor-backspace' }
  | { type: 'card-tip-editor-clear' }
  | { type: 'card-tip-editor-cancel' }
  | { type: 'card-tip-editor-confirm' }
  | { type: 'set-submitting'; submitting: boolean }
  | { type: 'split-set-mode'; mode: SplitPaymentMode }
  | { type: 'split-set-even-count'; count: number }
  | { type: 'split-generate-even'; method: SplitPortionPaymentMethod }
  | { type: 'split-set-amount-editor'; cents: number }
  | { type: 'split-add-portion'; method: SplitPortionPaymentMethod; amountCents: number }
  | { type: 'split-select-portion'; portionId: string | null }
  | { type: 'split-set-portion-method'; portionId: string; method: SplitPortionPaymentMethod }
  | { type: 'split-set-portion-amount'; portionId: string; amountCents: number }
  | { type: 'split-remove-portion'; portionId: string }
  | { type: 'split-mark-processing'; portionId: string }
  | { type: 'split-mark-approved'; portionId: string; approvedAmountCents: number; tipAmountCents?: number; paymentId?: string; provider?: string; providerTransactionReference?: string; cardBrand?: string; cardLast4?: string }
  | { type: 'split-mark-declined'; portionId: string; failureCode?: string; failureMessage?: string }
  | { type: 'split-cancel-workspace' }
  | { type: 'split-clear-processing' }
  | { type: 'set-error'; message: string }
  | { type: 'reset-error' };
