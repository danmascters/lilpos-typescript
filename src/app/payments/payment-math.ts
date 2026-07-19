function clampToCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function formatCents(cents: number): string {
  const normalized = clampToCents(cents);
  return `$${(normalized / 100).toFixed(2)}`;
}

function formatWholeDollarCents(cents: number): string {
  return `$${Math.floor(clampToCents(cents) / 100)}`;
}

function toCents(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

function parseMoneyInputToCents(displayValue: string): number {
  const digits = String(displayValue || '').replace(/\D/g, '');
  if (!digits) return 0;
  return clampToCents(Number(digits));
}

function normalizePhoneDigits(value: string): string {
  return String(value || '').replace(/\D/g, '').slice(0, 10);
}

function formatPhoneDigits(value: string): string {
  const digits = normalizePhoneDigits(value);
  if (!digits) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function applyCurrencyDigitInput(currentCents: number, digit: string): number {
  if (!/^[0-9]$/.test(digit)) return clampToCents(currentCents);
  const currentDigits = String(clampToCents(currentCents));
  const nextDigits = (currentDigits + digit).slice(0, 9);
  return clampToCents(Number(nextDigits));
}

function applyCurrencyBackspace(currentCents: number): number {
  const digits = String(clampToCents(currentCents));
  const next = digits.length <= 1 ? '0' : digits.slice(0, -1);
  return clampToCents(Number(next));
}

function displayOrderNumber(orderNumber: string): string {
  const raw = String(orderNumber || '');
  const [station, sequence] = raw.split('-');
  if (!station || sequence == null) return raw;
  const normalizedSeq = String(Number(sequence));
  return Number.isFinite(Number(normalizedSeq)) ? `${station}-${normalizedSeq}` : raw;
}

function computeRemainingBalanceCents(totalCents: number, paymentsAppliedCents: number): number {
  return Math.max(clampToCents(totalCents) - clampToCents(paymentsAppliedCents), 0);
}

function computeChangeDueCents(cashReceivedCents: number, remainingBalanceCents: number): number {
  return Math.max(clampToCents(cashReceivedCents) - clampToCents(remainingBalanceCents), 0);
}

function buildCashQuickAmounts(remainingBalanceCents: number): number[] {
  const remaining = clampToCents(remainingBalanceCents);
  if (remaining <= 0) return [];

  const roundedAmountCents = Math.ceil(remaining / 100) * 100;
  const ladder = [100, 500, 1000, 2000, 2500, 3000, 4000, 5000, 10000];
  const seen = new Set<number>();
  const options: number[] = [];

  const pushUnique = (cents: number) => {
    const normalized = clampToCents(cents);
    if (normalized < remaining || seen.has(normalized)) return;
    seen.add(normalized);
    options.push(normalized);
  };

  pushUnique(roundedAmountCents);
  ladder.forEach((cents) => {
    if (cents > roundedAmountCents) pushUnique(cents);
  });

  return options;
}
