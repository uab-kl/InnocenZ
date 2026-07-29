/**
 * Does a voucher add up?
 *
 * The invariant, and the whole point of this file:
 *
 *     Σ(line.amount × line.quantity)  −  deduction  −  net  =  0
 *
 * A voucher that fails it is money the system invented or lost. Nothing here
 * writes; it reports, and the caller decides.
 *
 * ALL arithmetic is in integer cents. The generator builds `subtotal` with
 * `Number(...)` in a reduce and then `.toFixed(2)`, which is the classic way to
 * be a cent out — 0.1 + 0.2 is 0.30000000000000004, and a week of shift wages
 * accumulates error the same way. A checker that repeated that mistake would
 * agree with the bug it exists to catch, so this one parses the decimal strings
 * postgres returns for numeric(12,2) by hand and never converts to a float.
 */

/** A voucher line as it comes back from the DB: numeric columns are strings. */
export type BalanceLine = {
  amount: string | number | null;
  quantity?: number | string | null;
};

export type BalanceInput = {
  subtotal: string | number | null;
  deduction: string | number | null;
  net: string | number | null;
};

export type BalanceReport = {
  balanced: boolean;
  lineTotalCents: number;
  subtotalCents: number;
  deductionCents: number;
  netCents: number;
  /** Σ(lines) − stored subtotal. Non-zero means the header disagrees with its own lines. */
  subtotalDeltaCents: number;
  /** subtotal − deduction − net. Non-zero means the header disagrees with itself. */
  netDeltaCents: number;
  /** Human-readable reasons, empty when balanced. */
  problems: string[];
};

/**
 * Decimal string -> integer cents, exactly.
 *
 * Accepts what postgres hands back for numeric(12,2) ("1234.50", "-5", "0"),
 * plus plain numbers for callers that have not been near the DB. Throws on
 * anything it cannot read rather than guessing — a NaN silently becoming 0 is
 * how a voucher loses money without anyone noticing.
 */
export function toCents(value: string | number | null | undefined): number {
  if (value === null || value === undefined) {
    throw new TypeError('money value is null');
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`money value is ${value}`);
    // Round rather than truncate: 12.345 -> 1235, and Math.round on a value
    // already scaled by 100 is safe for the magnitudes a voucher reaches.
    return Math.round(value * 100);
  }

  const trimmed = value.trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) throw new TypeError(`money value is not a decimal: "${value}"`);

  const [, sign, whole, fraction = ''] = match;
  // Pad/truncate to exactly 2 dp. numeric(12,2) never gives more, but a caller
  // passing "1.5" or "1.005" should not silently mean something else.
  const cents = `${fraction}00`.slice(0, 2);
  const magnitude = Number(whole) * 100 + Number(cents);
  return sign === '-' ? -magnitude : magnitude;
}

/** Cents back to the "1234.50" shape, for log lines and messages. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Checks one voucher against its lines.
 *
 * Never throws: a malformed amount is a finding, not a crash. This runs inside
 * a scheduled job, and a job that dies on the first bad row stops checking the
 * good ones.
 */
export function checkVoucherBalance(
  voucher: BalanceInput,
  lines: BalanceLine[],
): BalanceReport {
  const problems: string[] = [];

  const read = (value: string | number | null | undefined, label: string): number => {
    try {
      return toCents(value);
    } catch (error) {
      problems.push(`${label}: ${(error as Error).message}`);
      return 0;
    }
  };

  let lineTotalCents = 0;
  lines.forEach((line, index) => {
    const amountCents = read(line.amount, `line ${index + 1} amount`);
    // Quantity defaults to 1: a null quantity means "one of this", not "none".
    const rawQuantity = line.quantity ?? 1;
    const quantity = Number(rawQuantity);
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity)) {
      problems.push(`line ${index + 1} quantity is not a whole number: "${rawQuantity}"`);
      return;
    }
    lineTotalCents += amountCents * quantity;
  });

  const subtotalCents = read(voucher.subtotal, 'subtotal');
  const deductionCents = read(voucher.deduction, 'deduction');
  const netCents = read(voucher.net, 'net');

  const subtotalDeltaCents = lineTotalCents - subtotalCents;
  const netDeltaCents = subtotalCents - deductionCents - netCents;

  if (subtotalDeltaCents !== 0) {
    problems.push(
      `lines total ${formatCents(lineTotalCents)} but subtotal says ${formatCents(subtotalCents)} (off by ${formatCents(subtotalDeltaCents)})`,
    );
  }
  if (netDeltaCents !== 0) {
    problems.push(
      `subtotal ${formatCents(subtotalCents)} − deduction ${formatCents(deductionCents)} should equal net ${formatCents(netCents)} (off by ${formatCents(netDeltaCents)})`,
    );
  }

  return {
    balanced: problems.length === 0,
    lineTotalCents,
    subtotalCents,
    deductionCents,
    netCents,
    subtotalDeltaCents,
    netDeltaCents,
    problems,
  };
}
