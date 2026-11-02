export class InvalidAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAmountError';
  }
}

export interface AmountLimitsCents {
  minCents: number;
  maxCents: number;
}

// Bounds the digit count so reais * 100 stays far below Number.MAX_SAFE_INTEGER.
const MAX_INTEGER_DIGITS = 9;

const INTEGER_ONLY = /^\d+$/;
const SINGLE_SEPARATOR = /^(\d+)[.,](\d{1,2})$/;
// Thousands grouping is only accepted together with an explicit decimal part,
// so "1.234" (1234 reais in pt-BR, 1.234 in en-US) is never guessed at.
const PT_BR_GROUPED = /^(\d{1,3}(?:\.\d{3})+),(\d{1,2})$/;
const EN_US_GROUPED = /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/;

function toCents(integerPart: string, fraction: string): number {
  const digits = integerPart.replace(/[.,]/g, '');
  if (digits.length > MAX_INTEGER_DIGITS) {
    throw new InvalidAmountError('Amount is too large.');
  }
  return Number(digits) * 100 + Number(fraction.padEnd(2, '0'));
}

/**
 * Converts a user-typed amount in reais to integer BRL cents with string
 * arithmetic only (no float multiplication, so 19.9 never becomes 1989).
 *
 * Accepted: `50`, `50.5`, `50,5`, `50.00`, `50,00`, `1.234,56` and `1,234.56`,
 * with an optional `R$` prefix. A lone separator followed by three digits
 * (`1.234`) and grouping without decimals (`1.234.567`) are rejected as
 * ambiguous; more than two decimal places is an error too.
 * Does not check the range: use assertAmountWithinLimits for that.
 */
export function parseReaisToCents(input: string): number {
  const raw = input.trim().replace(/^R\$\s*/i, '');
  if (raw === '') throw new InvalidAmountError('Amount is required.');
  if (raw.startsWith('-')) throw new InvalidAmountError('Amount must be greater than zero.');

  if (INTEGER_ONLY.test(raw)) return toCents(raw, '0');

  const decimal = SINGLE_SEPARATOR.exec(raw) ?? PT_BR_GROUPED.exec(raw) ?? EN_US_GROUPED.exec(raw);
  if (decimal) return toCents(decimal[1], decimal[2]);

  if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) {
    throw new InvalidAmountError(
      `Ambiguous amount "${input.trim()}": write 1234 or 1234,00 (no thousands separators without cents).`
    );
  }
  if (/[.,]\d{3,}$/.test(raw)) {
    throw new InvalidAmountError('Use at most two decimal places (cents).');
  }
  throw new InvalidAmountError(
    `Invalid amount "${input.trim()}". Use reais like 50, 50.00 or 50,00.`
  );
}

export function assertAmountWithinLimits(amountCents: number, limits: AmountLimitsCents): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new InvalidAmountError('Amount must be greater than zero.');
  }
  if (amountCents < limits.minCents || amountCents > limits.maxCents) {
    throw new InvalidAmountError(
      `Amount must be between ${formatBrl(limits.minCents)} and ${formatBrl(limits.maxCents)}.`
    );
  }
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `123456` -> `R$ 1.234,56`. Deterministic: does not depend on the host locale. */
export function formatBrl(cents: number): string {
  const abs = Math.abs(cents);
  const reais = groupThousands(String(Math.trunc(abs / 100)));
  const fraction = String(abs % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}R$ ${reais},${fraction}`;
}

/** Like formatBrl but always shows the sign, for ledger columns. */
export function formatSignedBrl(cents: number): string {
  return cents > 0 ? `+${formatBrl(cents)}` : formatBrl(cents);
}

/** Converts a BRL float from the API (derived values) to cents, rounding half up. */
export function brlToCents(brl: number): number {
  return Math.round(brl * 100);
}
