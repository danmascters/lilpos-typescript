/// <reference path="./payment-types.ts" />

function orderContextToCents(amount: any): number {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric * 100));
}

function orderTotalCents(order: any): number {
  return Number.isFinite(Number(order?.totalCents))
    ? Math.max(0, Number(order.totalCents))
    : orderContextToCents(order?.total || 0);
}

function orderPaidAmountCents(order: any): number {
  if (Number.isFinite(Number(order?.amountPaidCents))) {
    return Math.max(0, Number(order.amountPaidCents));
  }
  const lines = Array.isArray(order?.paymentLines) ? order.paymentLines : [];
  if (!lines.length) return 0;
  return lines.reduce((sum: number, line: any) => {
    if (Number.isFinite(Number(line?.amountCents))) {
      return sum + Math.max(0, Number(line.amountCents));
    }
    const amount = Number(line?.amount || 0) + Number(line?.tipAmount || 0);
    return sum + orderContextToCents(amount);
  }, 0);
}

function orderRemainingBalanceCents(order: any): number {
  if (Number.isFinite(Number(order?.remainingBalanceCents))) {
    return Math.max(0, Number(order.remainingBalanceCents));
  }
  const totalCents = orderTotalCents(order);
  const paidCents = orderPaidAmountCents(order);
  return Math.max(0, totalCents - paidCents);
}

function isOrderPaymentEligible(order: any): boolean {
  if (!order) return false;
  const status = String(order.status || '').trim().toLowerCase();
  const paymentStatus = String(order.paymentStatus || '').trim().toLowerCase();
  const remainingCents = orderRemainingBalanceCents(order);

  if (status === 'canceled' || status === 'cancelled' || status === 'void' || status === 'voided') return false;
  if (status === 'completed' || status === 'closed') return false;
  if (paymentStatus === 'paid') return false;
  if (remainingCents <= 0) return false;
  return true;
}

function workflowToMethod(workflow: OrderPaymentWorkflow): PaymentMethod {
  if (workflow === 'cash') return 'cash';
  if (workflow === 'credit') return 'card';
  return 'gift-or-other';
}

function buildOrderPaymentContext(order: any, workflow: OrderPaymentWorkflow, options: any = {}): OrderPaymentContext | null {
  if (!isOrderPaymentEligible(order)) return null;

  const orderId = String(order?.id || '').trim();
  if (!orderId) return null;

  const historyId = String(order?.historyId || `hist_${orderId}`).trim();
  const remainingBalanceCents = orderRemainingBalanceCents(order);
  const selectedMethod = workflowToMethod(workflow);
  const idempotencyKey = String(options.idempotencyKey || `orders-payment|${orderId}|${historyId}|${remainingBalanceCents}|${selectedMethod}`).trim();

  return {
    source: 'orders-management',
    orderId,
    historyId,
    remainingBalanceCents,
    workflow,
    selectedMethod,
    idempotencyKey
  };
}

window.LilposOrderPaymentContext = {
  toCents: orderContextToCents,
  orderTotalCents,
  orderPaidAmountCents,
  orderRemainingBalanceCents,
  isOrderPaymentEligible,
  buildOrderPaymentContext
};
