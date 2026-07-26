import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';

function loadSummaryHelper() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'outside-only'
  });
  const file = path.resolve(__dirname, '../dist/app/order-ticket-summary.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), dom.getInternalVMContext(), { filename: file });
  return { dom, helper: (dom.window as any).LilposOrderTicketSummary };
}

describe('unpaid order ticket live tip summary', () => {
  it('includes a positive selected card tip and recalculates the total', () => {
    const { dom, helper } = loadSummaryHelper();
    try {
      const order = { id: 'order_10', paid: false, total: 41.88 };
      const context = { source: 'orders-management', orderId: 'order_10' };
      const paymentState = { selectedPaymentMethod: 'card', cardTipAmountCents: 1300 };
      const tipCents = helper.liveCardTipCents(order, context, paymentState);

      expect(tipCents).toBe(1300);
      expect(helper.totalWithLiveTipCents(order.total, tipCents)).toBe(5488);
      expect(helper.totalWithLiveTipCents(order.total, 200 + tipCents)).toBe(5688);
    } finally {
      dom.window.close();
    }
  });

  it('excludes zero tips, non-card tenders, paid orders, and mismatched orders', () => {
    const { dom, helper } = loadSummaryHelper();
    try {
      const order = { id: 'order_10', paid: false, total: 41.88 };
      const context = { source: 'orders-management', orderId: 'order_10' };

      expect(helper.liveCardTipCents(order, context, { selectedPaymentMethod: 'card', cardTipAmountCents: 0 })).toBe(0);
      expect(helper.liveCardTipCents(order, context, { selectedPaymentMethod: 'cash', cardTipAmountCents: 1300 })).toBe(0);
      expect(helper.liveCardTipCents({ ...order, paid: true }, context, { selectedPaymentMethod: 'card', cardTipAmountCents: 1300 })).toBe(0);
      expect(helper.liveCardTipCents(order, { ...context, orderId: 'other' }, { selectedPaymentMethod: 'card', cardTipAmountCents: 1300 })).toBe(0);
    } finally {
      dom.window.close();
    }
  });
});
