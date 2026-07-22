import { describe, expect, it } from 'vitest';

declare const window: any;

describe('split payment state', () => {
  const state = () => window.LilposSplitPaymentState;

  function baseInput() {
    return {
      displayOrderNumber: '1-00042',
      orderTypeLabel: 'To-Go',
      stationName: 'Main Station',
      subtotalCents: 7000,
      taxCents: 750,
      totalCents: 7750,
      paymentsAppliedCents: 0,
      remainingBalanceCents: 7750,
      customer: { name: 'Guest', phone: '' },
      items: [],
      orderType: 'togo'
    };
  }

  it('creates default workspace and pending portion for full remaining', () => {
    const ws = state().createSplitWorkspace(baseInput());
    expect(ws.remainingCents).toBe(7750);
    expect(ws.portions.length).toBe(1);
    expect(ws.portions[0].plannedAmountCents).toBe(7750);
    expect(ws.portions[0].status).toBe('PENDING');
  });

  it('adds custom portions and keeps remaining in sync', () => {
    let ws = state().createSplitWorkspace(baseInput());
    ws = state().splitAddCustomPortion(ws, { method: 'cash', amountCents: 2000 });
    expect(ws.portions.some((portion: any) => portion.paymentMethod === 'cash')).toBe(true);
  });

  it('supports even split generation with exact cent reconciliation', () => {
    let ws = state().createSplitWorkspace(baseInput());
    ws = state().splitSetRequestedCount(ws, 4);
    ws = state().splitGenerateEvenPortions(ws, 'card');
    const pending = ws.portions.filter((portion: any) => portion.status === 'PENDING');
    expect(pending.length).toBe(4);
    const pendingTotal = pending.reduce((sum: number, portion: any) => sum + portion.plannedAmountCents, 0);
    expect(pendingTotal).toBe(7750);
  });

  it('declined cards do not reduce balance and approved portions remain approved', () => {
    let ws = state().createSplitWorkspace(baseInput());
    const firstId = ws.portions[0].id;
    ws = state().splitMarkPortionProcessing(ws, firstId);
    ws = state().splitMarkPortionApproved(ws, { portionId: firstId, approvedAmountCents: 2500, paymentId: 'pay_1' });

    const nextPending = ws.portions.find((portion: any) => portion.status === 'PENDING');
    expect(nextPending).toBeDefined();

    ws = state().splitMarkPortionProcessing(ws, nextPending.id);
    ws = state().splitMarkPortionDeclined(ws, { portionId: nextPending.id, failureCode: 'DECLINED', failureMessage: 'Declined by issuer' });

    const approved = ws.portions.find((portion: any) => portion.paymentId === 'pay_1');
    expect(approved.status).toBe('APPROVED');
    expect(ws.paidCents).toBe(2500);
    expect(ws.remainingCents).toBe(5250);
  });

  it('cancel before approval sets canceled status', () => {
    let ws = state().createSplitWorkspace(baseInput());
    ws = state().splitCancelWorkspace(ws);
    expect(ws.status).toBe('CANCELED');
  });

  it('cancel after partial approval preserves active partial state', () => {
    let ws = state().createSplitWorkspace(baseInput());
    const firstId = ws.portions[0].id;
    ws = state().splitMarkPortionApproved(ws, { portionId: firstId, approvedAmountCents: 2000, paymentId: 'pay_2' });
    ws = state().splitCancelWorkspace(ws);
    expect(ws.status).toBe('ACTIVE');
    expect(ws.paidCents).toBe(2000);
    expect(ws.remainingCents).toBe(5750);
  });
});
