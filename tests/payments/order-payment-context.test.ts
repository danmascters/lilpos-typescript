import { describe, it, expect } from 'vitest';

declare const window: any;

describe('order payment context helpers', () => {
  const helpers = () => window.LilposOrderPaymentContext;

  it('calculates remaining balance for unpaid orders', () => {
    const order = {
      id: 'ord_1',
      status: 'open',
      paymentStatus: 'unpaid',
      total: 40,
      paymentLines: []
    };
    expect(helpers().orderRemainingBalanceCents(order)).toBe(4000);
    expect(helpers().isOrderPaymentEligible(order)).toBe(true);
  });

  it('calculates remaining balance for partially paid orders', () => {
    const order = {
      id: 'ord_2',
      status: 'open',
      paymentStatus: 'partially_paid',
      total: 40,
      paymentLines: [{ paymentType: 'Cash', amount: 15 }]
    };
    expect(helpers().orderPaidAmountCents(order)).toBe(1500);
    expect(helpers().orderRemainingBalanceCents(order)).toBe(2500);
    expect(helpers().isOrderPaymentEligible(order)).toBe(true);
  });

  it('fully paid orders are not eligible', () => {
    const order = {
      id: 'ord_3',
      status: 'completed',
      paymentStatus: 'paid',
      total: 12,
      paymentLines: [{ paymentType: 'Cash', amount: 12 }]
    };
    expect(helpers().orderRemainingBalanceCents(order)).toBe(0);
    expect(helpers().isOrderPaymentEligible(order)).toBe(false);
  });

  it('canceled orders are not eligible', () => {
    const order = {
      id: 'ord_4',
      status: 'canceled',
      paymentStatus: 'unpaid',
      total: 18.95,
      paymentLines: []
    };
    expect(helpers().isOrderPaymentEligible(order)).toBe(false);
  });

  it('routes cash workflow to cash payment method', () => {
    const order = { id: 'ord_5', historyId: 'hist_5', status: 'open', paymentStatus: 'unpaid', total: 18.95, paymentLines: [] };
    const context = helpers().buildOrderPaymentContext(order, 'cash');
    expect(context.workflow).toBe('cash');
    expect(context.selectedMethod).toBe('cash');
    expect(context.remainingBalanceCents).toBe(1895);
  });

  it('routes credit workflow to card payment method', () => {
    const order = { id: 'ord_6', historyId: 'hist_6', status: 'open', paymentStatus: 'unpaid', total: 18.95, paymentLines: [] };
    const context = helpers().buildOrderPaymentContext(order, 'credit');
    expect(context.workflow).toBe('credit');
    expect(context.selectedMethod).toBe('card');
  });

  it('routes other workflow to gift-or-other method', () => {
    const order = { id: 'ord_7', historyId: 'hist_7', status: 'open', paymentStatus: 'unpaid', total: 18.95, paymentLines: [] };
    const context = helpers().buildOrderPaymentContext(order, 'other');
    expect(context.workflow).toBe('other');
    expect(context.selectedMethod).toBe('gift-or-other');
  });

  it('returns null context when order is ineligible', () => {
    const order = { id: 'ord_8', historyId: 'hist_8', status: 'voided', paymentStatus: 'unpaid', total: 18.95, paymentLines: [] };
    const context = helpers().buildOrderPaymentContext(order, 'cash');
    expect(context).toBeNull();
  });

  it('returns stable idempotency key for repeated click payload', () => {
    const order = { id: 'ord_9', historyId: 'hist_9', status: 'open', paymentStatus: 'unpaid', total: 25, paymentLines: [] };
    const contextA = helpers().buildOrderPaymentContext(order, 'cash');
    const contextB = helpers().buildOrderPaymentContext(order, 'cash');
    expect(contextA.idempotencyKey).toBe(contextB.idempotencyKey);
  });

  it('supports explicit idempotency key override', () => {
    const order = { id: 'ord_10', historyId: 'hist_10', status: 'open', paymentStatus: 'unpaid', total: 25, paymentLines: [] };
    const context = helpers().buildOrderPaymentContext(order, 'cash', { idempotencyKey: 'manual-key' });
    expect(context.idempotencyKey).toBe('manual-key');
  });

  it('does not mutate active cart-like external payload when building context', () => {
    const order = { id: 'ord_11', historyId: 'hist_11', status: 'open', paymentStatus: 'unpaid', total: 30, paymentLines: [] };
    const activeCart = [{ lineId: 'line_1', name: 'Pizza', qty: 1 }];
    const snapshot = JSON.stringify(activeCart);
    helpers().buildOrderPaymentContext(order, 'credit');
    expect(JSON.stringify(activeCart)).toBe(snapshot);
  });

  it('uses amountPaidCents when present for remaining-balance calculation', () => {
    const order = {
      id: 'ord_12',
      historyId: 'hist_12',
      status: 'open',
      paymentStatus: 'partially_paid',
      totalCents: 4000,
      amountPaidCents: 1500,
      paymentLines: []
    };
    expect(helpers().orderRemainingBalanceCents(order)).toBe(2500);
  });
});
