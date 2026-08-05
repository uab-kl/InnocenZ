/**
 * The evidence behind ONE cell of the Payment grid — "how come Drinks says 7.20".
 *
 * Takes the same week the grid was built from and re-derives one cell as the
 * receipts and shifts that produced it: shift (check-in / check-out) → receipt
 * (order number) → item lines (name, quantity, commission).
 *
 * ⚠️ THE FILTER HERE MUST STAY IDENTICAL TO `week-pay-grid.ts`.
 * The whole point is a proof claim, so the sheet's total has to be the same
 * arithmetic as the cell — lines with `(lineDate ?? weekStart) === iso` and
 * `kind === kind`, summed on `commission` — not a second, drifting derivation.
 * `evidenceMatchesCell` exists so a drift shows up as a visible warning instead
 * of a quietly incomplete receipt list.
 *
 * Pure: no fetching, no hooks, no React. Everything it needs is already in the
 * payload the Payment screen holds.
 */
import type { PrCurrentWeek, PrReceiptKind, PrReceiptLine, PrWeekShift } from './api';

/** One paper receipt's worth of lines inside a cell. */
export type EvidenceReceipt = {
  /** `RCP-000010`, or null for a line with no receipt behind it (a wage seal). */
  receiptNo: string | null;
  /**
   * The receipt's uuid — what a dispute stores as a FOREIGN KEY.
   *
   * `receiptNo` is what the PR reads off the paper; this is what the claim
   * points at. Both are kept so a claim matches whether it was filed before
   * 0088 (which recorded the number as text) or after it.
   */
  receiptId: string | null;
  /** `ORD0389` off the paper, or null when it carried none. */
  orderNo: string | null;
  receiptDate: string | null;
  receiptTime: string | null;
  source: PrReceiptLine['source'];
  pending: boolean;
  lines: PrReceiptLine[];
  subtotal: number;
  /** Deduped across the group — one paper, one picture, however many items. */
  photos: string[];
};

/** All the money in a cell that came from ONE shift (or from no shift at all). */
export type EvidenceGroup = {
  /** Null when the lines carry no shift link, or the week shipped no `shifts`. */
  shift: PrWeekShift | null;
  receipts: EvidenceReceipt[];
  subtotal: number;
};

export type CellEvidence = {
  kind: PrReceiptKind;
  dateIso: string;
  /** Sum of every line in the cell — must equal the grid cell. */
  total: number;
  groups: EvidenceGroup[];
  /**
   * False when the week carried no `shifts` array at all (backend not restarted
   * yet). The sheet says so, rather than implying the shift is unknowable.
   */
  shiftsKnown: boolean;
};

/** The grid's own bucketing rule, in one place so it cannot be mistyped twice. */
function dayOf(line: PrReceiptLine, week: PrCurrentWeek): string {
  return line.lineDate ?? week.weekStart;
}

export function buildCellEvidence(
  week: PrCurrentWeek | null,
  dateIso: string,
  kind: PrReceiptKind,
): CellEvidence {
  const empty: CellEvidence = { kind, dateIso, total: 0, groups: [], shiftsKnown: false };
  if (!week) return empty;

  const cellLines = week.lines.filter((l) => dayOf(l, week) === dateIso && l.kind === kind);
  if (cellLines.length === 0) return { ...empty, shiftsKnown: Array.isArray(week.shifts) };

  const shiftById = new Map((week.shifts ?? []).map((s) => [s.id, s]));

  // Group by shift, then by receipt. Insertion order is preserved, so the sheet
  // reads in the order the money was earned.
  const byShift = new Map<string, PrReceiptLine[]>();
  for (const line of cellLines) {
    // '' is the honest key for "no shift link" — never invent one.
    const key = line.shiftAssignmentId ?? '';
    byShift.set(key, [...(byShift.get(key) ?? []), line]);
  }

  const groups: EvidenceGroup[] = [];
  for (const [shiftKey, shiftLines] of byShift) {
    const byReceipt = new Map<string, PrReceiptLine[]>();
    for (const line of shiftLines) {
      /*
       * Key on the RECEIPT NUMBER, not the order number.
       *
       * `receiptNo` is DB-generated and unique; `orderNo` is what OCR read and
       * is NOT unique — the same paper logged twice produces two receipts
       * carrying the same ORD number, which is exactly the duplicate a PR needs
       * to SEE as two rows here. Collapsing on orderNo would hide it. A line
       * with no receipt at all (a wage seal) keys on its own id.
       */
      const key = line.receiptNo ?? `line:${line.id}`;
      byReceipt.set(key, [...(byReceipt.get(key) ?? []), line]);
    }

    const receipts: EvidenceReceipt[] = [...byReceipt.values()].map((lines) => {
      const head = lines[0];
      return {
        receiptNo: head.receiptNo ?? null,
        receiptId: head.receiptId ?? null,
        orderNo: head.orderNo ?? null,
        receiptDate: head.receiptDate ?? null,
        receiptTime: head.receiptTime ?? null,
        source: head.source,
        pending: lines.some((l) => l.pending),
        lines,
        subtotal: lines.reduce((s, l) => s + l.commission, 0),
        photos: [...new Set(lines.flatMap((l) => l.proofPhotos ?? []))],
      };
    });

    groups.push({
      shift: shiftById.get(shiftKey) ?? null,
      receipts,
      subtotal: receipts.reduce((s, r) => s + r.subtotal, 0),
    });
  }

  return {
    kind,
    dateIso,
    total: cellLines.reduce((s, l) => s + l.commission, 0),
    groups,
    shiftsKnown: Array.isArray(week.shifts),
  };
}

/**
 * Does the evidence add up to the cell it claims to explain?
 *
 * Compared in CENTS, because summing floats in two different orders can differ
 * in the last bit and a proof view must not cry wolf over 1e-13. A real
 * mismatch means lines were dropped from the sheet, so the figure on screen is
 * describing money the PR cannot see — worth showing, never worth hiding.
 */
export function evidenceMatchesCell(evidence: CellEvidence, cellAmount: number): boolean {
  return Math.round(evidence.total * 100) === Math.round(cellAmount * 100);
}

/**
 * May THIS SHIFT's receipt be contested?
 *
 * Per receipt, not per cell. `cellDisputable` requires every line in the whole
 * day+bucket to have been reviewed — right when a claim covered the whole cell,
 * and wrong now that a claim names one shift: a PR could not dispute an approved
 * 10:00 shift because a different 16:00 receipt was still awaiting review. One
 * shift's pending paper is not a reason to silence an argument about another.
 *
 * A settled or already-verified receipt stays disputable. Resolving a claim ends
 * that claim, not the PR's right to disagree again — and the partial unique
 * index (0086) is what actually allows the second one.
 *
 * Prefers the server's own `disputable` flag, which is computed from the rule
 * the endpoint enforces; the `pending` fallback is for a response that predates
 * the field.
 */
export function receiptDisputable(receipt: EvidenceReceipt): boolean {
  if (receipt.lines.length === 0) return false;
  return receipt.lines.every((l) => (l.disputable !== undefined ? l.disputable : !l.pending));
}
