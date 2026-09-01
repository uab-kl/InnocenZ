import type { PayoutBatchItemType } from './payout-batch.model';

/**
 * READING WHAT THE BANK SENT BACK.
 *
 * The mirror of `payout-csv.ts`, and it inherits the same hard truth: every
 * bank's response format differs exactly as much as its upload template does.
 * So this parses a GENERIC shape — the columns any response has to carry — and
 * refuses to guess at anything else.
 *
 * ⚠️ MANUAL PER-LINE SETTLE STAYS THE ALWAYS-WORKS PATH. This is a convenience
 * for the common case, not the mechanism. A bank whose file does not fit is
 * settled by hand, and that must never stop working.
 *
 * ⚠️ NO FORMAT AUTO-DETECTION, deliberately. Sniffing a layout means guessing
 * which column is the amount, and a wrong guess here marks the wrong people
 * paid.
 */

/** Columns we look for, case- and space-insensitive. */
const ACCOUNT_HEADERS = ['account number', 'account no', 'account', 'accountnumber'];
const STATUS_HEADERS = ['status', 'result', 'payment status'];
const REF_HEADERS = ['reference', 'bank reference', 'transaction reference', 'ref'];
const REASON_HEADERS = [
  'reason',
  'error',
  'remarks',
  'failure reason',
  'rejection reason',
];
const AMOUNT_HEADERS = ['amount', 'amount (myr)', 'amount myr'];

/** Words banks actually use. Anything unrecognised is an ERROR, never a guess. */
const PAID_WORDS = ['paid', 'success', 'successful', 'completed', 'credited', 'ok'];
const FAILED_WORDS = [
  'failed',
  'fail',
  'rejected',
  'reject',
  'returned',
  'unsuccessful',
  'error',
];

export type ParsedResponseRow = {
  /** Row number in the file, 1-based excluding the header — for error messages. */
  line: number;
  accountNo: string;
  status: 'paid' | 'failed';
  bankRef: string | null;
  failureReason: string | null;
  amount: string | null;
};

export type ParsedResponse = {
  rows: ParsedResponseRow[];
  /** Rows we could not read. Reported, never dropped — see below. */
  errors: { line: number; reason: string }[];
};

/** Minimal RFC 4180 reader: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function findColumn(headers: string[], names: string[]): number {
  return headers.findIndex((h) => names.includes(normalise(h)));
}

/** Digits only — a bank echoes an account with spaces, dashes or a leading '. */
export function normaliseAccount(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

/**
 * Parse a bank response file.
 *
 * ⚠️ UNREADABLE ROWS GO INTO `errors`, they are NOT skipped. A response file
 * where three lines could not be parsed must not settle the other 56 and report
 * success — that is the "list silently shrinks" failure this lane is built
 * against, arriving from the other direction.
 */
export function parsePayoutResponseCsv(text: string): ParsedResponse {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return { rows: [], errors: [{ line: 0, reason: 'File is empty' }] };
  }

  const headers = grid[0];
  const accountAt = findColumn(headers, ACCOUNT_HEADERS);
  const statusAt = findColumn(headers, STATUS_HEADERS);
  if (accountAt < 0 || statusAt < 0) {
    return {
      rows: [],
      errors: [
        {
          line: 0,
          reason:
            'Could not find an account-number column and a status column. Expected headers ' +
            'like "Account Number" and "Status".',
        },
      ],
    };
  }
  const refAt = findColumn(headers, REF_HEADERS);
  const reasonAt = findColumn(headers, REASON_HEADERS);
  const amountAt = findColumn(headers, AMOUNT_HEADERS);

  const rows: ParsedResponseRow[] = [];
  const errors: { line: number; reason: string }[] = [];

  for (let r = 1; r < grid.length; r++) {
    const line = r;
    const cells = grid[r];
    const accountNo = normaliseAccount(cells[accountAt] ?? '');
    if (!accountNo) {
      errors.push({ line, reason: 'No account number' });
      continue;
    }
    const word = normalise(cells[statusAt] ?? '');
    const status = PAID_WORDS.includes(word)
      ? ('paid' as const)
      : FAILED_WORDS.includes(word)
        ? ('failed' as const)
        : null;
    if (!status) {
      // An unknown word is refused rather than assumed failed: guessing
      // 'failed' would un-pay someone the bank actually paid.
      errors.push({ line, reason: `Unrecognised status "${cells[statusAt] ?? ''}"` });
      continue;
    }
    rows.push({
      line,
      accountNo,
      status,
      bankRef: refAt >= 0 ? cells[refAt]?.trim() || null : null,
      failureReason: reasonAt >= 0 ? cells[reasonAt]?.trim() || null : null,
      amount: amountAt >= 0 ? cells[amountAt]?.trim() || null : null,
    });
  }
  return { rows, errors };
}

export type ResponseMatch = {
  itemId: string;
  status: 'paid' | 'failed';
  bankRef: string | null;
  failureReason: string | null;
};

/**
 * Match parsed rows to the batch's own lines, by account number.
 *
 * ⚠️ AN ACCOUNT APPEARING TWICE IN ONE BATCH IS AMBIGUOUS AND IS REFUSED.
 * Two PRs sharing an account (a family account, or a typo) means "the row for
 * 512345678901 was paid" does not identify a line. Guessing would mark the
 * wrong person paid and ring the wrong phone.
 */
export function matchResponseToItems(
  items: readonly PayoutBatchItemType[],
  parsed: ParsedResponse,
): { matches: ResponseMatch[]; unmatched: { line: number; reason: string }[] } {
  const byAccount = new Map<string, PayoutBatchItemType[]>();
  for (const i of items) {
    const key = normaliseAccount(i.bankAccountNo ?? '');
    if (!key) continue;
    byAccount.set(key, [...(byAccount.get(key) ?? []), i]);
  }

  const matches: ResponseMatch[] = [];
  const unmatched = [...parsed.errors];
  for (const row of parsed.rows) {
    const candidates = byAccount.get(row.accountNo) ?? [];
    if (candidates.length === 0) {
      unmatched.push({
        line: row.line,
        reason: `No line in this run pays ${row.accountNo}`,
      });
      continue;
    }
    if (candidates.length > 1) {
      unmatched.push({
        line: row.line,
        reason: `${candidates.length} lines in this run pay ${row.accountNo} — settle them by hand`,
      });
      continue;
    }
    matches.push({
      itemId: candidates[0].id,
      status: row.status,
      bankRef: row.bankRef,
      failureReason: row.failureReason,
    });
  }
  return { matches, unmatched };
}
