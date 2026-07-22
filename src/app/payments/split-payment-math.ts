/// <reference path="./payment-types.ts" />

function splitClampCents(value: any): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function splitEvenlyPortions(totalCents: number, count: number): number[] {
  const safeTotal = splitClampCents(totalCents);
  const safeCount = Math.max(1, Math.round(Number(count || 1)));
  if (safeTotal <= 0) return new Array(safeCount).fill(0);

  const base = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal % safeCount;
  const portions: number[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    portions.push(base + (index < remainder ? 1 : 0));
  }
  return portions;
}

function splitPortionApprovedAmountCents(portion: SplitPaymentPortionRuntime): number {
  if (!portion) return 0;
  return splitClampCents(portion.approvedAmountCents);
}

function splitPaidSoFarCents(portions: SplitPaymentPortionRuntime[]): number {
  const list = Array.isArray(portions) ? portions : [];
  return list.reduce((sum, portion) => {
    if (portion.status !== 'APPROVED') return sum;
    return sum + splitPortionApprovedAmountCents(portion);
  }, 0);
}

function splitTipTotalCents(portions: SplitPaymentPortionRuntime[]): number {
  const list = Array.isArray(portions) ? portions : [];
  return list.reduce((sum, portion) => {
    if (portion.status !== 'APPROVED') return sum;
    return sum + splitClampCents(portion.tipAmountCents);
  }, 0);
}

function splitRemainingCents(originalBalanceCents: number, portions: SplitPaymentPortionRuntime[]): number {
  return Math.max(0, splitClampCents(originalBalanceCents) - splitPaidSoFarCents(portions));
}

function splitDisplayMethodLabel(method: SplitPortionPaymentMethod): string {
  if (method === 'cash') return 'Cash';
  if (method === 'card') return 'Credit';
  return 'Other';
}

window.LilposSplitPaymentMath = {
  splitClampCents,
  splitEvenlyPortions,
  splitPaidSoFarCents,
  splitTipTotalCents,
  splitRemainingCents,
  splitDisplayMethodLabel
};
