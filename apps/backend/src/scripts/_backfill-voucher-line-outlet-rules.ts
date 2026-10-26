/**
 * The pure half of `_backfill-voucher-line-outlet.ts` — the per-line plan and
 * the write check — kept apart so they are tested by calling them, never by
 * running the backfill against the shared database.
 */

/**
 * One line with the venue each path names. Both paths are TENANT-SCOPED in the
 * query: `via_receipt` only through a receipt on the line's OWN voucher whose
 * assignment belongs to the voucher's agency, `via_ref` only through an
 * assignment of the voucher's agency. A foreign id names nothing (NULL).
 */
export type DerivedLine = {
  id: string;
  voucher_no: string | null;
  line_date: string | null;
  component: string | null;
  stored_text: string | null;
  current_id: string | null;
  via_receipt: string | null;
  via_ref: string | null;
};

export type Plan = {
  method: 'receipt' | 'assignment' | 'conflict' | 'unresolved';
  outletId: string | null;
};

/**
 * The venue a line should carry and which path named it: the receipt's shift
 * first, then the assignment its ref packs. When both name a venue and they
 * DIFFER, it is a conflict and stays NULL — guessing would attach money to the
 * wrong venue.
 *
 * There is no name fallback. The old third path matched the stored text to a
 * venue name across EVERY outlet, any agency's; the read-only dry run showed
 * the two id paths already cover every line it links (77 of 77, 0 by name),
 * so the fallback could only ever add a cross-tenant guess.
 */
export function planLine(line: DerivedLine): Plan {
  if (line.via_receipt && line.via_ref && line.via_receipt !== line.via_ref) {
    return { method: 'conflict', outletId: null };
  }
  if (line.via_receipt)
    return { method: 'receipt', outletId: line.via_receipt };
  if (line.via_ref) return { method: 'assignment', outletId: line.via_ref };
  return { method: 'unresolved', outletId: null };
}

/**
 * The --apply write must land EXACTLY the lines the plan printed. Throws (so
 * the transaction rolls back) when it does not: more means the write reached
 * lines nobody reviewed, fewer means the data moved under the read — either
 * way the printed plan is no longer what would happen, so nothing is kept.
 */
export function assertWrittenMatchesPlan(
  written: number,
  planned: number,
): void {
  if (written !== planned) {
    throw new Error(
      `wrote ${written} line(s) but the plan said ${planned} — rolled back, nothing changed. ` +
        'Re-run the dry run and review it again.',
    );
  }
}
