import { describe, it, expect } from 'vitest';

declare const displayOrderNumber: (orderNumber: string) => string;
declare const applyCurrencyDigitInput: (currentCents: number, digit: string) => number;
declare const applyCurrencyBackspace: (currentCents: number) => number;
declare const buildCashQuickAmounts: (remainingBalanceCents: number) => number[];
declare const computeChangeDueCents: (cashReceivedCents: number, remainingBalanceCents: number) => number;
declare const computeRemainingBalanceCents: (totalCents: number, paymentsAppliedCents: number) => number;
declare const formatCents: (cents: number) => string;

describe('payment math', () => {
  it('formats order number without leading zeros at display boundary', () => {
    expect(displayOrderNumber('1-00042')).toBe('1-42');
  });

  it('applies keypad digits as cents', () => {
    let value = 0;
    value = applyCurrencyDigitInput(value, '1');
    value = applyCurrencyDigitInput(value, '2');
    value = applyCurrencyDigitInput(value, '3');
    expect(formatCents(value)).toBe('$1.23');
  });

  it('backspace removes latest digit', () => {
    const after = applyCurrencyBackspace(1234);
    expect(after).toBe(123);
  });

  it('change due is never negative', () => {
    expect(computeChangeDueCents(1000, 2000)).toBe(0);
    expect(computeChangeDueCents(3000, 2000)).toBe(1000);
  });

  it('remaining balance uses integer cents', () => {
    expect(computeRemainingBalanceCents(2847, 0)).toBe(2847);
    expect(computeRemainingBalanceCents(2847, 847)).toBe(2000);
  });

  it('builds practical cash quick amounts above the remaining balance', () => {
    expect(buildCashQuickAmounts(2257)).toEqual([2300, 2500, 3000, 4000, 5000, 10000]);
    expect(buildCashQuickAmounts(1820)).toEqual([1900, 2000, 2500, 3000, 4000, 5000, 10000]);
    expect(buildCashQuickAmounts(4000)).toEqual([4000, 5000, 10000]);
  });

  it('omits duplicates and values below the balance for cash quick amounts', () => {
    expect(buildCashQuickAmounts(425)).toEqual([500, 1000, 2000, 2500, 3000, 4000, 5000, 10000]);
    expect(buildCashQuickAmounts(9910)).toEqual([10000]);
    expect(buildCashQuickAmounts(10000)).toEqual([10000]);
  });
});
