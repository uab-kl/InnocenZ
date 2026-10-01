import type { PeriodShare } from './subscription-period.js';

/**
 * A FIRST PARTIAL PERIOD IS NOT BILLED IN FULL — owner, 29 Sep 2026, answering
 * "whether to bill a first partial week in full": no.
 *
 * The money half of the rule; `periodShareFor` in `subscription-period.ts` is
 * the calendar half. A LEAF like that module, so the repository, the model and
 * the notice can all read it without closing an import cycle.
 *
 * WHY THE FACT RIDES ON `note`, NOT A NEW COLUMN. `note` is the sentence behind
 * a figure that differs from the plan price — an upgrade, a deduction — and it
 * is already printed on the row and the receipt; a pro-rated first week is
 * exactly that kind of figure. It is also generated-only: the invoice PUT
 * accepts `status` alone, so no caller can clobber it. The sentence is written
 * in ONE format, by `proRataNote`, and read back by `parseProRataNote` beside
 * it, so the invoice API can hand screens the numbers instead of English.
 *
 * ONLY NEW INVOICES CHANGE. A period already billed in full has no such note,
 * reads back as a whole period, and is never re-priced — the ledger's first
 * answer for a period stands.
 */
export type ProRata = {
  /** Days billed — from `billedFrom` through the period's last day, inclusive. */
  billedDays: number;
  /** Days in the whole period — 7 for a Sun–Sat week. */
  periodDays: number;
  /** The KL calendar day billing started, YYYY-MM-DD. */
  billedFrom: string;
  /** What the WHOLE period costs on this plan; numeric(12,2), so a string. */
  fullAmount: string;
};

/** The `subscription_invoice.note` column's length. */
const NOTE_MAX_LENGTH = 255;

/**
 * Integer sen, the unit every invoice figure in this feature is summed in —
 * `Math.round(Number(x) * 100)`, as `prorateLaneSwitch` and the checkout do.
 */
function toSen(amount: string): number | null {
  const sen = Math.round(Number(amount) * 100);
  return Number.isFinite(sen) ? sen : null;
}

const fromSen = (sen: number): string => (sen / 100).toFixed(2);

/** A share that bills FEWER days than its period. A whole, empty or nonsensical share is not a pro-rata. */
function isPartial(
  share: { billedDays: number; periodDays: number } | null | undefined,
): share is { billedDays: number; periodDays: number } {
  return (
    share !== null &&
    share !== undefined &&
    Number.isInteger(share.billedDays) &&
    Number.isInteger(share.periodDays) &&
    share.billedDays >= 1 &&
    share.billedDays < share.periodDays
  );
}

/**
 * `amount` × billedDays ÷ periodDays, in integer sen, rounded ONCE at the end.
 *
 * A whole share (or none) returns the amount unscaled. `null` only when the
 * amount itself cannot be read — a caller must not turn that into zero.
 */
export function proRatedSen(
  amount: string,
  share: { billedDays: number; periodDays: number } | null,
): number | null {
  const sen = toSen(amount);
  if (sen === null) return null;
  if (!isPartial(share)) return sen;
  return Math.round((sen * share.billedDays) / share.periodDays);
}

/**
 * What ONE period is charged: the plan price for a whole period, the day share
 * of it for a lane's partial first period.
 *
 * A whole period returns the price string EXACTLY as stored — not re-formatted —
 * so every invoice this rule does not touch is minted byte-for-byte as before.
 * A free plan is left alone too: two sevenths of nothing needs no sentence.
 */
export function chargeForPeriod(
  price: string,
  share: PeriodShare,
): { amount: string; proRata: ProRata | null } {
  const sen = toSen(price);
  const scaled = proRatedSen(price, share);
  if (!isPartial(share) || sen === null || sen <= 0 || scaled === null) {
    return { amount: price, proRata: null };
  }
  return {
    amount: fromSen(scaled),
    proRata: {
      billedDays: share.billedDays,
      periodDays: share.periodDays,
      billedFrom: share.billedFrom,
      fullAmount: fromSen(sen),
    },
  };
}

/**
 * The sentence stored on a pro-rated invoice — the one format, written here and
 * read by `parseProRataNote` below:
 *
 *   Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)
 */
export function proRataNote(proRata: ProRata): string {
  return (
    `Pro-rated: ${proRata.billedDays} of ${proRata.periodDays} days ` +
    `from ${proRata.billedFrom} (full period ${proRata.fullAmount})`
  );
}

const NOTE_PATTERN =
  /^Pro-rated: (\d{1,3}) of (\d{1,3}) days from (\d{4}-\d{2}-\d{2}) \(full period (\d{1,10}\.\d{2})\)/;

/**
 * The numbers back out of a stored note; `null` for every other note.
 *
 * Anchored at the START: an upgrade or credit sentence never begins this way,
 * and `joinNotes` keeps the pro-rata sentence first when a credit is later
 * taken off the same invoice.
 */
export function parseProRataNote(note: string | null | undefined): ProRata | null {
  if (!note) return null;
  const match = NOTE_PATTERN.exec(note);
  if (!match) return null;
  const billedDays = Number(match[1]);
  const periodDays = Number(match[2]);
  if (!isPartial({ billedDays, periodDays })) return null;
  return { billedDays, periodDays, billedFrom: match[3], fullAmount: match[4] };
}

/**
 * Two sentences on one note, the FIRST kept whole: a downgrade credit taken off
 * a pro-rated first week must not erase why that week cost what it did — which
 * is what overwriting `note` with the credit's reason did. Clipped to the
 * column so the UPDATE can never fail on length.
 */
export function joinNotes(
  first: string | null | undefined,
  second: string | null | undefined,
): string | null {
  const parts = [first, second].filter((part): part is string => Boolean(part?.trim()));
  if (parts.length === 0) return null;
  return parts.join(' · ').slice(0, NOTE_MAX_LENGTH);
}

/**
 * A plan switch's price difference, in sen — THE FULL PERIOD'S, whatever share
 * of that period was billed. Owner, 29 Sep 2026, on a switch inside a pro-rated
 * first week: "Charge the full weekly price difference as in any other week."
 *
 * Owner, 28 Aug 2026: the period follows the highest plan held, and the switch
 * DAY does not matter — so a period moves by the whole difference. For a few
 * hours on 29 Sep a switch inside a pro-rated first week moved instead by the
 * two plans' SHARES of the days billed (Starter 125 → Growth 250 on a 2-of-7
 * week was +35.72). The owner chose the whole-week rule back: +125.00, exactly
 * as in any other week, and a downgrade's credit the same way. Only a lane's
 * first-period CHARGE is pro-rated (`chargeForPeriod`); a switch never is.
 *
 * ⚠️ The consequence, stated rather than hidden: a DOWNGRADE inside a pro-rated
 * first week credits the whole-week difference, which can be more than that
 * week actually billed (Growth for 2 of 7 days bills 71.43; a switch to Starter
 * then credits 125.00). A credit is only ever taken off the lane's later
 * periods (`applyOpenCredits`), never paid out.
 *
 * Both prices are returned with the difference so a sentence can quote the two
 * figures subtracted. `null` when either price cannot be read — never zero.
 */
export function switchDifference(
  fromAmount: string,
  toAmount: string,
): { fromSen: number; toSen: number; diffSen: number } | null {
  const from = toSen(fromAmount);
  const to = toSen(toAmount);
  if (from === null || to === null) return null;
  return { fromSen: from, toSen: to, diffSen: to - from };
}
