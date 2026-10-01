import type { PaymentVoucherComponent } from './payment-voucher.model';
import { assignmentIdFromRef } from './payment-voucher-audit';
import { componentFromRef, resolveComponent } from './payment-voucher-component';

/**
 * WHAT THE AGENCY'S LINE REWRITE MAY CHANGE — the rules its own receipt editor
 * and the PR's write paths already keep, applied to `PUT /payment-voucher/:id`.
 *
 * That route replaces a voucher's whole line set (the Disputed voucher's "Edit
 * line items"), and it was the one door left open. It took any description, so
 * a drink could be renamed to an item the outlet never sold — while adding a
 * line through the receipt refuses anything off the outlet's price list. And it
 * took any date inside the week, so a receipt's money could be moved onto a day
 * its shift was not worked; `assertLinesAgreeWithShifts` only reads refs that
 * name a shift, and a drink's ref names an order slip, never a shift.
 *
 * Pure, so the rules are unit-tested; the catalogue lookup the renames need
 * stays in the controller, which already resolves an outlet from a receipt.
 */

/** The previous line, as the rewrite will replace it. */
export type RewrittenFrom = {
  ref: string | null;
  lineDate: string | null;
  description: string;
  component: PaymentVoucherComponent | null;
  receiptId: string | null;
};

/** One line of the incoming payload. */
export type RewrittenTo = {
  ref?: string | null;
  lineDate?: string | null;
  description: string;
  receiptId?: string | null;
};

/** A renamed drink/tip line whose new name must be on its outlet's list. */
export type OutletCheck = {
  index: number;
  receiptId: string;
  kind: 'drinks' | 'tips';
  description: string;
};

export type LineRewritePlan =
  | { ok: true; outletChecks: OutletCheck[] }
  | { ok: false; reason: string };

const COMMISSION_KIND: Partial<Record<PaymentVoucherComponent, 'drinks' | 'tips'>> = {
  drink_commission: 'drinks',
  tip_commission: 'tips',
};

/** Absent, empty and null all mean "no day" — a week-level line. */
function day(value: string | null | undefined): string | null {
  return value ? value : null;
}

/**
 * "The same money" across a rewrite: the stored lines whose ref appears ONCE on
 * the voucher, by ref. An ambiguous ref matches nothing — attaching a receipt
 * (or a classification) to the wrong one of two lines is worse than the blank it
 * replaces.
 *
 * ONE function for both sides: `planLineRewrite` judges an incoming line against
 * it, and the repository's wipe-and-reinsert carries each surviving line's
 * facts through it (`withCarriedFacts`). The two must agree on which lines are
 * the same money, so they no longer each keep a copy of the rule.
 */
export function uniqueByRef<T extends { ref: string | null }>(previous: readonly T[]): Map<string, T> {
  const counts = new Map<string, number>();
  for (const line of previous) {
    if (line.ref) counts.set(line.ref, (counts.get(line.ref) ?? 0) + 1);
  }
  const byRef = new Map<string, T>();
  for (const line of previous) {
    if (line.ref && counts.get(line.ref) === 1) byRef.set(line.ref, line);
  }
  return byRef;
}

/** What a stored line hands on to the line that replaces it. */
export type CarriedFacts = {
  receiptId: string | null;
  proofPhotos: string[] | null;
  component: PaymentVoucherComponent | null;
};

/**
 * THE FACTS A REWRITTEN LINE KEEPS FROM THE LINE IT REPLACES.
 *
 * `PUT /payment-voucher/:id` deletes every line and re-inserts the payload, and
 * the payload cannot say three things: the receipt a line came from, the PR's
 * proof photos, and — for a line whose ref packs no kind — what money it IS.
 *
 * That last one was lost (29 Sep 2026 follow-up). The weekly generator writes a
 * wage as `ref = <shift assignment id>` and sets `component = 'wages'`
 * explicitly, because a bare id gives `componentFromRef` nothing to read. A
 * rewrite that round-tripped the line faithfully still re-inserted it with no
 * component: the PR's grid then filed the night under Others with Daily wages
 * RM 0.00, and `isWageLineFor` stopped recognising it — so the next seal for
 * that shift (a cut-loss release, the Sunday net) would have filed the wage a
 * SECOND time.
 *
 * Carried by ref (`uniqueByRef`). A value the incoming line states always wins;
 * this fills only what the payload could not express. With nothing carried the
 * component stays unset, so `withComponent` still derives it from a packed ref.
 * It moves no money and changes no rule about what a rewrite may do — the
 * wage stays the server's to seal.
 */
export function withCarriedFacts<
  T extends {
    ref?: string | null;
    receiptId?: string | null;
    proofPhotos?: string[] | null;
    component?: PaymentVoucherComponent | null;
  },
>(
  line: T,
  byRef: ReadonlyMap<string, CarriedFacts>,
): Omit<T, 'receiptId' | 'proofPhotos' | 'component'> & {
  receiptId: string | null;
  proofPhotos: string[] | null;
  component?: PaymentVoucherComponent | null;
} {
  const carried = line.ref ? byRef.get(line.ref) : undefined;
  return {
    ...line,
    receiptId: line.receiptId ?? carried?.receiptId ?? null,
    proofPhotos: line.proofPhotos ?? carried?.proofPhotos ?? null,
    ...(line.component == null && carried?.component ? { component: carried.component } : {}),
  };
}

/**
 * Refuses what the rewrite may not do, and names the renames to check.
 *
 * - A line that is still the same money (same ref) stays on its DAY. Moving a
 *   receipt belongs to the receipt's own date field, which moves the whole paper
 *   together and re-opens it for approval. A line whose ref names its SHIFT (a
 *   wage, overtime) is left to `assertLinesAgreeWithShifts`, which admits
 *   exactly one day — the shift's — so a wrongly dated wage can still be fixed.
 * - A drink or tip whose NAME changed is checked against its outlet's list, as
 *   an added line is. An unchanged name is the PR's own logged item and passes.
 * - A drink or tip with no line to carry a receipt from cannot be typed in here
 *   at all: commission must be backed by a receipt, and the receipt editor is
 *   where one is added and checked. (Without this it failed as a 500 further in.)
 * - A receipt named explicitly must be one of THIS voucher's own — a line may
 *   not borrow another voucher's paper.
 */
export function planLineRewrite(input: {
  previous: readonly RewrittenFrom[];
  incoming: readonly RewrittenTo[];
  voucherReceiptIds: ReadonlySet<string>;
}): LineRewritePlan {
  const byRef = uniqueByRef(input.previous);
  const outletChecks: OutletCheck[] = [];

  for (const [index, line] of input.incoming.entries()) {
    if (line.receiptId && !input.voucherReceiptIds.has(line.receiptId)) {
      return {
        ok: false,
        reason: `"${line.description}" names a receipt that is not on this voucher.`,
      };
    }

    const prev = line.ref ? byRef.get(line.ref) : undefined;
    if (prev) {
      const shiftBound = assignmentIdFromRef(line.ref) !== null;
      if (!shiftBound && day(line.lineDate) !== day(prev.lineDate)) {
        return {
          ok: false,
          reason:
            `"${prev.description}" is on ${day(prev.lineDate) ?? 'no day'} — a line edit cannot move it to ` +
            `${day(line.lineDate) ?? 'no day'}. Correct the receipt's date on Payroll › Receipts instead, ` +
            'which moves the whole paper and asks for it to be approved again.',
        };
      }
      const kind = COMMISSION_KIND[resolveComponent(prev) ?? 'other'];
      const renamed = line.description.trim() !== prev.description.trim();
      if (kind && renamed) {
        const receiptId = line.receiptId ?? prev.receiptId;
        if (!receiptId) {
          return {
            ok: false,
            reason: `"${prev.description}" is not linked to a receipt, so a new name cannot be checked against the outlet's list.`,
          };
        }
        outletChecks.push({ index, receiptId, kind, description: line.description.trim() });
      }
      continue;
    }

    const kind = COMMISSION_KIND[componentFromRef(line.ref) ?? 'other'];
    if (kind) {
      return {
        ok: false,
        reason:
          `"${line.description}" is a ${kind === 'drinks' ? 'drink' : 'tip'} line with no receipt behind it. ` +
          "Add or correct it from its receipt on Payroll › Receipts, where it is checked against the outlet's price list.",
      };
    }
  }

  return { ok: true, outletChecks };
}

/**
 * The day a line ADDED TO A RECEIPT goes on.
 *
 * The receipt's own day wins: its lines already sit there, and a receipt whose
 * lines disagree about the day is one no single day's approval describes. A day
 * the caller names is accepted only when it is one of those — the agency does
 * not get to pick a different one. A receipt with no dated line yet takes the
 * caller's day, then its fallback, exactly as before.
 */
export function addedLineDate(
  siblingDates: readonly (string | null)[],
  requested: string | undefined,
  fallback: string,
): { ok: true; date: string } | { ok: false; reason: string } {
  const dated = siblingDates.filter((d): d is string => Boolean(d));
  if (dated.length === 0) return { ok: true, date: requested ?? fallback };
  if (requested && !dated.includes(requested)) {
    return {
      ok: false,
      reason:
        `This receipt's lines are on ${dated[0]} — a line added to it goes on the same day. ` +
        "Change the receipt's date to move the whole paper.",
    };
  }
  return { ok: true, date: requested ?? dated[0]! };
}
