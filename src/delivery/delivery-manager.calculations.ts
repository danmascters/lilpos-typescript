/// <reference path="./delivery-manager.types.ts" />

(function(global: any) {
  'use strict';

  function cents(value: any): number {
    return Math.max(0, Math.round(Number(value || 0)));
  }

  function calculate(input: { orders?: any[]; shift?: DriverShift | null }): DriverSettlementCalculation {
    const warnings: string[] = [];
    let cashOrderTotalCents = 0;
    let creditCardTipsOwedCents = 0;
    const orderIds: string[] = [];

    (input.orders || []).forEach((order) => {
      if (order?.deliveryStatus !== 'DELIVERED') return;
      if (String(order?.paymentStatus || '').toLowerCase() !== 'paid') {
        warnings.push(`Order ${order.orderNumber || order.id || ''} is not fully paid.`);
        return;
      }
      const payments = Array.isArray(order.paymentLines) ? order.paymentLines : [];
      if (!payments.length) {
        warnings.push(`Order ${order.orderNumber || order.id || ''} is missing payment details.`);
        return;
      }
      let safelyCalculated = true;
      let orderCashCents = 0;
      let orderCardTipCents = 0;
      payments.forEach((payment) => {
        const type = String(payment?.paymentType || '').toLowerCase();
        const baseCents = Number.isFinite(Number(payment?.baseAmountCents))
          ? cents(payment.baseAmountCents)
          : Math.round(Number(payment?.baseAmount || payment?.amount || 0) * 100);
        const tipCents = Number.isFinite(Number(payment?.tipAmountCents))
          ? cents(payment.tipAmountCents)
          : Math.round(Number(payment?.tipAmount || 0) * 100);
        if (type.includes('cash')) orderCashCents += baseCents;
        else if (type.includes('card') || type.includes('credit') || type.includes('debit')) orderCardTipCents += tipCents;
        else safelyCalculated = false;
      });
      if (!safelyCalculated) {
        warnings.push(`Order ${order.orderNumber || order.id || ''} has an unknown payment type.`);
        return;
      }
      orderIds.push(String(order.id || order.orderId));
      cashOrderTotalCents += orderCashCents;
      creditCardTipsOwedCents += orderCardTipCents;
    });

    const startingBankAmountCents = input.shift?.bankEnabledAtShiftStart ? cents(input.shift.startingBankAmountCents) : 0;
    const signedNet = cashOrderTotalCents + startingBankAmountCents - creditCardTipsOwedCents;
    return {
      orderIds,
      cashOrderTotalCents,
      startingBankAmountCents,
      creditCardTipsOwedCents,
      netAmountCents: Math.abs(signedNet),
      netDirection: signedNet > 0 ? 'DRIVER_OWES_STORE' : signedNet < 0 ? 'STORE_OWES_DRIVER' : 'EVEN',
      warnings
    };
  }

  global.LilposDeliveryCalculations = { calculate };
})(window);
