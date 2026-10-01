import { shiftDayKey, shiftWindowInstants } from '@/util/slot-window';

/**
 * A PR's KPI score — one whole number, 0–100, computed on read from the rows the
 * PR's own work left behind. Never stored, never typed in by anybody.
 *
 * ⚠️ THE FORMULA IS PRIVATE (owner, 29 Sep 2026: "make sure the KPI formula
 * won't be displayed to anyone"). It leaves the server as the number alone:
 *
 *   - the API carries `kpiScore` and nothing beside it — no component, no
 *     weight, no count of what went in, not for an admin either;
 *   - nothing here logs, and no screen, tooltip, translation or export may say
 *     how the score is made;
 *   - the WEIGHTS are not in this file, nor anywhere else in the repository,
 *     because the repository is public. They live only in each server's
 *     `KPI_WEIGHTS` setting (owner, 29 Sep 2026: "The weights live only in a
 *     server environment setting, not in the code"), and there is deliberately
 *     no default here: a server without the setting shows every score as "—".
 *     Retuning them means changing that setting on each server — never a
 *     commit, and never a value written into a test, a comment or a doc;
 *   - the rest of the rule — what counts as kept, missed, on time and rated,
 *     the grace, the window, the star scale — lives in this file and nowhere
 *     else, and changing it means changing the constants below. A second copy
 *     anywhere — a client that recomputes the score, a report that explains
 *     it — is exactly what the rule forbids.
 *
 * Pure: no database, no clock of its own, no environment, no logging.
 * `pr-kpi.ts` reads the setting through `parseKpiWeights`, fetches the rows —
 * one query per request, scoped to the asking agency — and hands both here.
 */

/**
 * How far back the score reads, in Kuala Lumpur calendar days. Today itself is
 * excluded: tonight's shift may still be running.
 */
export const KPI_WINDOW_DAYS = 90;

/**
 * How much each component counts. RELATIVE, not shares of 100: they are
 * renormalised over the components that have data, so a PR no venue has rated
 * yet is scored on the other two rather than marked down for a verdict nobody
 * wrote — and scaling all three by one factor changes no score.
 *
 * Built only by `parseKpiWeights`, from the server's private setting.
 */
export type KpiWeights = {
  readonly reliability: number;
  readonly punctuality: number;
  readonly rating: number;
};

const WEIGHT_KEYS: readonly string[] = ['reliability', 'punctuality', 'rating'];

/** A plain non-negative decimal — `7`, `2.25`, `.75`. No sign, no exponent, no hex. */
const PLAIN_DECIMAL = /^(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * The server's `KPI_WEIGHTS` setting, read — or null when it cannot be used.
 *
 *   KPI_WEIGHTS=reliability=<n>,punctuality=<n>,rating=<n>
 *
 * The keys in any order, spaces allowed around every key, value and comma. Each
 * value is a plain non-negative decimal. Punctuality or rating may be 0, which
 * switches that component off; reliability may not, because every score has
 * that component — a PR with only a reliability record would weigh nothing at
 * all (0 ÷ 0).
 *
 * Anything else is null: unset, blank, a key missing, repeated or unknown, an
 * empty or non-numeric value, a stray separator. Null is NOT a cue to fall back
 * on a default — there is none in the code, by design — and the caller shows
 * every score as "—" until the setting is fixed.
 *
 * Never echo `raw` in an error, a log line or a response: it IS the private part.
 */
export function parseKpiWeights(raw: string | null | undefined): KpiWeights | null {
  if (raw == null || raw.trim() === '') return null;

  const values = new Map<string, number>();
  for (const pair of raw.split(',')) {
    const sides = pair.split('=');
    if (sides.length !== 2) return null;
    const key = sides[0].trim();
    const text = sides[1].trim();
    if (!WEIGHT_KEYS.includes(key) || values.has(key) || !PLAIN_DECIMAL.test(text)) {
      return null;
    }
    const value = Number(text);
    // A run of digits too long for a double reads as Infinity.
    if (!Number.isFinite(value)) return null;
    values.set(key, value);
  }

  const reliability = values.get('reliability');
  const punctuality = values.get('punctuality');
  const rating = values.get('rating');
  if (reliability === undefined || punctuality === undefined || rating === undefined) {
    return null;
  }
  if (reliability <= 0) return null;
  return Object.freeze({ reliability, punctuality, rating });
}

/** A check-in up to this long after the scheduled start still counts as on time. */
const ON_TIME_GRACE_MS = 10 * 60_000;

/**
 * The scale a venue rates on. `rating.stars` defaults to 0, which is a verdict
 * written without stars — the portals print nothing for it, and neither does
 * this.
 */
const MIN_STARS = 1;
const MAX_STARS = 5;

const DAY_MS = 86_400_000;

/**
 * One assignment, as the loader reads it. Rows of every status are welcome: the
 * classification below decides what counts, so the rule is not split between a
 * WHERE clause and this file.
 */
export type KpiAssignmentRow = {
  /** `shift_assignment.pr_id` — the user id since 0089. */
  prId: string;
  status: string;
  /** `shift.shift_date`, yyyy-MM-dd. */
  shiftDate: string;
  /** `shift.slot`, free text. */
  slot: string | null;
  checkInAt: Date | string | null;
  /** Sealed by the PR's own cancel (`cancelMine`) and by no other lane. */
  cancelFeeRm: string | number | null;
  cancelFeeWaivedAt: Date | string | null;
  /** The venue's stars for THIS assignment (`rating.shift_assignment_id`), or null. */
  stars: number | null;
};

/**
 * The dates the score reads, `[fromDate, toDate)`, on the Kuala Lumpur calendar
 * — a shift belongs to the day it starts there, whatever the server's own
 * timezone says.
 */
export function kpiWindow(now: Date): { fromDate: string; toDate: string } {
  const toDate = shiftDayKey(now);
  const [y, m, d] = toDate.split('-').map(Number);
  const fromDate = new Date(Date.UTC(y, m - 1, d) - KPI_WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  return { fromDate, toDate };
}

/**
 * A cancellation the PR caused and was charged for.
 *
 * `cancel_fee_rm` is sealed by the PR's own cancel and by nothing else: an
 * agency's cancel (PUT /shift-assignment/:id) and a venue's cut-loss release
 * leave it NULL, so a cancellation somebody else made is never held against the
 * PR. A free cancel (0.00 — enough notice) cost nothing, and a WAIVED fee was
 * forgiven; neither counts. The same test as `attendanceWindow`'s "paid
 * cancellation".
 */
function isChargedCancellation(row: KpiAssignmentRow): boolean {
  if (row.status !== 'cancelled' || row.cancelFeeWaivedAt != null) return false;
  const fee = Number(row.cancelFeeRm ?? 0);
  return Number.isFinite(fee) && fee > 0;
}

/**
 * On time, late — or null when it cannot be judged: no check-in stamp, or a
 * slot with no clock time ("Late night"). Unjudgeable is not late.
 *
 * The scheduled start comes from `shiftWindowInstants`, the parser the check-out
 * seal and the cancel fee already share. A second parser is how two rules start
 * disagreeing about when a shift began.
 */
function checkedInOnTime(row: KpiAssignmentRow): boolean | null {
  if (!row.checkInAt) return null;
  const scheduled = shiftWindowInstants(row.shiftDate, row.slot);
  if (!scheduled) return null;
  const checkIn = new Date(row.checkInAt).getTime();
  if (Number.isNaN(checkIn)) return null;
  return checkIn <= scheduled.start.getTime() + ON_TIME_GRACE_MS;
}

/** A venue's stars as a 0–1 fraction, or null when the row carries none. */
function ratingFraction(stars: number | null): number | null {
  if (stars == null || !Number.isFinite(stars)) return null;
  if (stars < MIN_STARS || stars > MAX_STARS) return null;
  return (stars - MIN_STARS) / (MAX_STARS - MIN_STARS);
}

/**
 * 0–1 to a whole number 0–100, halves rounding up. The inner rounding absorbs
 * binary floating-point drift, which otherwise leaves an exact half a hair below
 * it (0.575 × 100 is 57.49999999999999) and rounds it down.
 */
function toScore(mean: number): number {
  const scaled = Math.round(mean * 100 * 1e6) / 1e6;
  return Math.min(100, Math.max(0, Math.round(scaled)));
}

/**
 * The score for ONE PR's rows — or null when they hold no completed and no
 * missed assignment. A PR with no record has not scored 0.
 *
 * `weights` as `parseKpiWeights` returns them; there is no default.
 */
export function kpiScore(
  rows: readonly KpiAssignmentRow[],
  weights: KpiWeights,
): number | null {
  let completed = 0;
  let missed = 0;
  let judged = 0;
  let onTime = 0;
  let rated = 0;
  let ratingSum = 0;

  for (const row of rows) {
    if (row.status === 'completed') {
      completed += 1;
      const punctual = checkedInOnTime(row);
      if (punctual !== null) {
        judged += 1;
        if (punctual) onTime += 1;
      }
    } else if (row.status === 'no_show' || isChargedCancellation(row)) {
      missed += 1;
    }
    // Approved leave, an agency's or venue's cancel, a free or waived cancel and
    // an unresolved booking are none of the above: not kept, not missed.

    const fraction = ratingFraction(row.stars);
    if (fraction !== null) {
      rated += 1;
      ratingSum += fraction;
    }
  }

  if (completed + missed === 0) return null;

  const parts: ReadonlyArray<{ weight: number; value: number }> = [
    { weight: weights.reliability, value: completed / (completed + missed) },
    ...(judged > 0 ? [{ weight: weights.punctuality, value: onTime / judged }] : []),
    ...(rated > 0 ? [{ weight: weights.rating, value: ratingSum / rated }] : []),
  ];
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  const mean = parts.reduce((sum, part) => sum + part.weight * part.value, 0) / totalWeight;
  return toScore(mean);
}

/** `kpiScore` for every PR in `rows`, keyed by `prId` — one pass, no queries. */
export function kpiScoresByPr(
  rows: readonly KpiAssignmentRow[],
  weights: KpiWeights,
): Map<string, number | null> {
  const byPr = new Map<string, KpiAssignmentRow[]>();
  for (const row of rows) {
    const bucket = byPr.get(row.prId);
    if (bucket) bucket.push(row);
    else byPr.set(row.prId, [row]);
  }
  return new Map([...byPr].map(([prId, prRows]) => [prId, kpiScore(prRows, weights)]));
}
