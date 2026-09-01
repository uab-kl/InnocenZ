import type { PayoutBatchItemType, PayoutBatchType } from './payout-batch.model';

/**
 * THE FILE THE AGENCY UPLOADS TO THEIR OWN BANK.
 *
 * This is the whole point of a batch: 59 people paid by one upload instead of
 * 59 hand-keyed transfers, each one a chance to mistype an account number.
 *
 * ⚠️ EVERY BANK'S UPLOAD TEMPLATE IS DIFFERENT, and no generic writer can be
 * correct for all of them. Maybank2u Biz, CIMB BizChannel, PBe and RHB each
 * take their own column order, and some want fixed-width rather than CSV.
 * What is emitted here is the COMMON PAYLOAD — the facts every IBG credit
 * transfer needs, under plain headers — which a bank's own template mapper
 * accepts, and which a human can re-order in seconds if it does not.
 *
 * Adding a bank-specific layout means adding a `PayoutCsvLayout` below, not
 * rewriting callers. Do NOT silently reshape the default layout to suit one
 * bank: an agency on a different bank would get a file that uploads cleanly and
 * pays the wrong amounts to the right people, which no validation catches.
 */

/** RFC 4180 escaping. A payee name with a comma must not become two columns. */
function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value);
  // Quote when the value contains a delimiter, a quote, or any newline; double
  // any embedded quote. Skipping this is how "Tan, Mei Lin" shifts every column
  // after it by one and pays her bank account number as an amount.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type PayoutCsvLayout = 'generic';

export type PayoutCsvRow = {
  no: number;
  payeeName: string;
  payeeIc: string;
  bankName: string;
  bankAccountNo: string;
  /** Decimal string exactly as stored — see the note in `buildPayoutCsv`. */
  amount: string;
  reference: string;
};

const GENERIC_HEADERS = [
  'No',
  'Payee Name',
  'ID / IC No',
  'Bank',
  'Account Number',
  'Amount (MYR)',
  'Reference',
] as const;

/** `PR wages 2026-08-16 to 2026-08-22` — what shows on the payee's statement. */
export function payoutStatementReference(
  batch: Pick<PayoutBatchType, 'runNo' | 'weekStart' | 'weekEnd'>,
): string {
  if (batch.weekStart && batch.weekEnd) {
    return `PR wages ${batch.weekStart} to ${batch.weekEnd}`;
  }
  return `PR wages ${batch.runNo ?? ''}`.trim();
}

/**
 * Build the upload file for a batch.
 *
 * ⚠️ AMOUNTS ARE PASSED THROUGH AS STORED — a decimal string from
 * `numeric(12,2)`. They are never parsed to a Number on the way here and never
 * formatted with thousands separators: `1,203.30` in a CSV is two columns, and
 * a float round-trip is how RM 1203.30 becomes 1203.2999999999999.
 *
 * Items with no bank details are NOT silently dropped — the caller filters and
 * refuses to export a batch containing any. A file that quietly omits two of 59
 * people is the exact failure this feature exists to prevent.
 */
export function buildPayoutCsv(
  batch: Pick<PayoutBatchType, 'runNo' | 'weekStart' | 'weekEnd'>,
  items: PayoutBatchItemType[],
  layout: PayoutCsvLayout = 'generic',
): string {
  void layout;
  const reference = payoutStatementReference(batch);
  const rows: PayoutCsvRow[] = items.map((item, i) => ({
    no: i + 1,
    payeeName: item.payeeName ?? '',
    payeeIc: item.payeeIc ?? '',
    bankName: item.bankName ?? '',
    bankAccountNo: item.bankAccountNo ?? '',
    amount: item.amount,
    // What the PR sees on their bank statement. The voucher week is the single
    // most useful thing to put there — "which week is this?" is the question a
    // payee actually asks, and a bare batch number cannot answer it.
    reference,
  }));

  const lines = [
    GENERIC_HEADERS.join(','),
    ...rows.map((r) =>
      [
        r.no,
        csvCell(r.payeeName),
        csvCell(r.payeeIc),
        csvCell(r.bankName),
        // Quoted ALWAYS, even though it is digits: a bare 0123456789 is read by
        // every spreadsheet as the number 123456789, and the leading zero that
        // identifies the branch is gone before anyone looks at it.
        `"${(r.bankAccountNo ?? '').replace(/"/g, '""')}"`,
        csvCell(r.amount),
        csvCell(r.reference),
      ].join(','),
    ),
  ];
  // CRLF: what every Malaysian corporate banking portal expects, and what Excel
  // writes. A bare-LF file is accepted by some and rejected by others with an
  // unhelpful "invalid format".
  return `${lines.join('\r\n')}\r\n`;
}

/** `payout-PO-000001-2026-08-16.csv`. Stable, sortable, and says what it is. */
export function payoutCsvFilename(
  batch: Pick<PayoutBatchType, 'runNo' | 'weekStart'>,
): string {
  const ref = (batch.runNo ?? 'batch').replace(/[^A-Za-z0-9_-]/g, '');
  return batch.weekStart ? `payout-${ref}-${batch.weekStart}.csv` : `payout-${ref}.csv`;
}
