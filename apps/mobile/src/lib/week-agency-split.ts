/**
 * WHOSE money is in the live week — split the PR's current-week lines by the
 * agency that owes them.
 *
 * Lives apart from `ShiftHistoryPanel` because it is arithmetic over money and
 * has to be testable without mounting React Native. Everything here is pure:
 * the same lines in give the same buckets out.
 */
import type { PrCurrentWeek, PrReceiptLine } from './api';
import { gridBucket } from './week-pay-grid';
import type { WeekPayRecord } from './demo-shifts';

/** The agency a line belongs to, as the card needs to name it. */
export type WeekAgency = { id: string; name: string | null };

/**
 * WHICH AGENCY OWES A LINE — answered through the line's own voucher.
 *
 * The week MERGES every voucher in it, because a person works one week and
 * wants to see one week. The only thing that can still say whose a row is is
 * `voucherId`, which comes straight off the line's foreign key; `vouchers[]`
 * carries one entry per agency (0129), so the join is exact.
 *
 * Returns null rather than guessing when the voucher cannot be resolved — an
 * older backend sends no `vouchers[]` at all. Falling back to "the first
 * agency" would put one company's money under another's name, which is the
 * oldest-membership bug in a new place.
 */
export function agencyResolver(
  vouchers: PrCurrentWeek['vouchers'],
): (voucherId: string | null | undefined) => WeekAgency | null {
  const byVoucher = new Map<string, WeekAgency>();
  for (const v of vouchers ?? []) {
    byVoucher.set(v.id, { id: v.agencyId, name: v.agencyName });
  }
  return (voucherId) => (voucherId ? (byVoucher.get(voucherId) ?? null) : null);
}

/**
 * Build one current-week History card per AGENCY per calendar day.
 *
 * The day grain matches Payment's This-week columns, so 2 verified days give 2
 * cards rather than one per outlet. The AGENCY is the second key: a PR on two
 * rosters can work both companies on the same night, and merging those into one
 * row states a total that no single agency owes and no voucher will ever match.
 *
 * This does not loosen the outlet rule below — a day worked at two venues for
 * ONE agency still merges into one record, still labelled with both venues.
 */
export function weekRecordsFromLines(
  lines: PrReceiptLine[],
  agencyOf: (voucherId: string | null | undefined) => WeekAgency | null,
): WeekPayRecord[] {
  const byBucket = new Map<
    string,
    WeekPayRecord & { outlets: Set<string>; wagesOutlet: string | null }
  >();
  /*
   * ⚠️ TWO PASSES, AND ONLY THE FIRST MAY OPEN A DAY.
   *
   * A late-cancel fee is a LINE like any other — `component: 'deduction'`, a
   * negative amount, dated to the shift that was not worked. One pass over
   * every line therefore did two wrong things at once:
   *
   *   · a day holding NOTHING BUT a fee still created a record, and
   *     `mergeHistoryShiftsWithWeekPay` turns every record into a History
   *     card — so a PR who cancelled and was charged saw a card for a shift
   *     they never worked, reading RM 0.00 at a venue they never attended;
   *   · on a day they DID work, the fee fell through the kind chain into
   *     `rec.others += l.commission` with a negative amount, so "Others"
   *     quietly shrank. A number smaller than it should be, with nothing on
   *     screen saying why, is worse than one that is plainly wrong.
   *
   * The same shape `historyVoucherToShifts` already uses next door, for the
   * same reason: a fine is a fact ABOUT a day, never evidence that one
   * happened.
   *
   * `gridBucket` is the authority on what a deduction is — `component`, never
   * a negative amount, which would promote a coincidence of today's data into
   * a rule.
   */
  for (const l of lines) {
    if (gridBucket(l) === 'deductions') continue;
    const dateIso = l.lineDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!dateIso) continue;
    const agency = agencyOf(l.voucherId);
    // AGENCY FIRST in the key — the same calendar day can belong to two of
    // them, and one bucket per day would silently add their money together.
    const key = (agency?.id ?? 'na') + '|' + dateIso;
    // A VALUE, not copy: this stands in for the venue's name, is joined into
    // `outlet`, becomes an id in the outlet picker and is compared against the
    // outlet filter. Translating it would split one venue into three.
    const outlet = l.outlet?.trim() || 'Outlet';
    const rec =
      byBucket.get(key) ??
      {
        dateIso,
        outlet,
        wages: 0,
        drinks: 0,
        tips: 0,
        others: 0,
        agencyId: agency?.id ?? null,
        agencyName: agency?.name ?? null,
        deductions: 0,
        outlets: new Set<string>(),
        wagesOutlet: null,
      };
    rec.outlets.add(outlet);
    if (l.kind === 'wages') {
      rec.wages += l.commission;
      if (!rec.wagesOutlet) rec.wagesOutlet = outlet;
    } else if (l.kind === 'drinks') rec.drinks += l.commission;
    else if (l.kind === 'tips') rec.tips += l.commission;
    else if (l.kind === 'others') rec.others += l.commission;
    byBucket.set(key, rec);
  }
  /*
   * SECOND PASS — reduce a day that already exists, never create one.
   *
   * A fine on a day the PR DID work belongs on that day's card: the money they
   * are owed for it really is lower. What it may not do is conjure the card.
   * So this only touches buckets the first pass opened; a fee on a day with no
   * earnings has no card to land on, which is correct — the penalties panel is
   * where a charge with no shift behind it is stated.
   */
  for (const l of lines) {
    if (gridBucket(l) !== 'deductions') continue;
    const dateIso = l.lineDate?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
    if (!dateIso) continue;
    const agency = agencyOf(l.voucherId);
    const rec = byBucket.get((agency?.id ?? 'na') + '|' + dateIso);
    if (!rec) continue;
    // Held NEGATIVE, matching `WeeklyDayPay.deductions` on the pay grid: the
    // card renders the sign, and summing the magnitude here would make a fine
    // ADD to the week.
    rec.deductions = (rec.deductions ?? 0) + l.commission;
  }
  return [...byBucket.values()].map((rec) => {
    const names = [...rec.outlets];
    // Label by every outlet that contributed that day — never fold a second
    // venue's drinks/tips silently under the wages outlet (keeps the per-day
    // total matching Payment while attributing money to the right venues).
    const outlet =
      names.length > 1
        ? names.join(' · ')
        : names[0] ?? rec.wagesOutlet ?? rec.outlet;
    return {
      dateIso: rec.dateIso,
      outlet,
      wages: rec.wages,
      drinks: rec.drinks,
      tips: rec.tips,
      others: rec.others,
      // Negative, or absent when the day carries no fine — see the second pass.
      deductions: rec.deductions || undefined,
      // Carried onto the record so the card it becomes knows whose week it is.
      agencyId: rec.agencyId,
      agencyName: rec.agencyName,
    };
  });
}
