type OrderTicketSummaryOrder = {
  id?: string;
  paid?: boolean;
  total?: number;
} | null;

type OrderTicketSummaryContext = {
  source?: string;
  orderId?: string;
} | null;

type OrderTicketSummaryPaymentState = {
  selectedPaymentMethod?: string;
  cardTipAmountCents?: number;
} | null;

function liveCardTipCents(
  order: OrderTicketSummaryOrder,
  context: OrderTicketSummaryContext,
  paymentState: OrderTicketSummaryPaymentState
): number {
  const isMatchingUnpaidOrder = !!order
    && !order.paid
    && context?.source === 'orders-management'
    && String(context.orderId || '') === String(order.id || '');
  if (!isMatchingUnpaidOrder || paymentState?.selectedPaymentMethod !== 'card') return 0;
  return Math.max(0, Math.round(Number(paymentState.cardTipAmountCents || 0)));
}

function totalWithLiveTipCents(orderTotal: number, tipCents: number): number {
  return Math.max(0, Math.round(Number(orderTotal || 0) * 100))
    + Math.max(0, Math.round(Number(tipCents || 0)));
}

interface Window {
  LilposOrderTicketSummary: {
    liveCardTipCents: typeof liveCardTipCents;
    totalWithLiveTipCents: typeof totalWithLiveTipCents;
  };
}

window.LilposOrderTicketSummary = {
  liveCardTipCents,
  totalWithLiveTipCents
};
