import { describe, expect, it } from 'vitest';

declare const window: any;

describe('split payment math', () => {
  const m = () => window.LilposSplitPaymentMath;

  it('builds even split for 2,3,4,5,6 and custom counts with deterministic pennies', () => {
    expect(m().splitEvenlyPortions(8750, 2)).toEqual([4375, 4375]);
    expect(m().splitEvenlyPortions(8750, 3)).toEqual([2917, 2917, 2916]);
    expect(m().splitEvenlyPortions(8750, 4)).toEqual([2188, 2188, 2187, 2187]);
    expect(m().splitEvenlyPortions(8750, 5)).toEqual([1750, 1750, 1750, 1750, 1750]);
    expect(m().splitEvenlyPortions(8750, 6)).toEqual([1459, 1459, 1458, 1458, 1458, 1458]);
    expect(m().splitEvenlyPortions(8750, 7)).toEqual([1250, 1250, 1250, 1250, 1250, 1250, 1250]);
  });

  it('never creates penny discrepancies', () => {
    const portions = m().splitEvenlyPortions(1001, 4);
    expect(portions.reduce((sum: number, value: number) => sum + value, 0)).toBe(1001);
  });

  it('tracks paid and remaining by approved portions only', () => {
    const portions = [
      { status: 'APPROVED', approvedAmountCents: 2000, tipAmountCents: 0 },
      { status: 'DECLINED', approvedAmountCents: 5000, tipAmountCents: 0 },
      { status: 'APPROVED', approvedAmountCents: 3000, tipAmountCents: 250 }
    ];
    expect(m().splitPaidSoFarCents(portions)).toBe(5000);
    expect(m().splitTipTotalCents(portions)).toBe(250);
    expect(m().splitRemainingCents(8750, portions)).toBe(3750);
  });
});
