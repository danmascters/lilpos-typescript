type PaymentMethod = 'cash' | 'card' | 'split' | 'gift-or-other' | 'text-payment-link';

type CardStatus = 'ready' | 'processing' | 'approved' | 'declined' | 'error';

type TextPaymentLinkStatus = 'ready' | 'sending' | 'sent' | 'pending' | 'paid' | 'failed' | 'expired';

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
  textPaymentLinkStatus: TextPaymentLinkStatus;
  textPaymentLinkPhoneDigits: string;
  selectedSavedCardId: string | null;
  removingCardId: string | null;
  removingCardError: string;
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
  | { type: 'set-submitting'; submitting: boolean }
  | { type: 'set-error'; message: string }
  | { type: 'reset-error' };
