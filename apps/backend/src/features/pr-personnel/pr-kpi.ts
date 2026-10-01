import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { logger } from '@/util/logger';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { RatingTable } from '@/features/rating/rating.model';
import {
  kpiScoresByPr,
  kpiWindow,
  parseKpiWeights,
  type KpiAssignmentRow,
  type KpiWeights,
} from './kpi-score.js';

/**
 * The roster's KPI scores — one query for a whole page of PRs, never one per PR.
 *
 * A LEAF module on purpose, like `pr-stats.ts` beside it: it imports MODELS and
 * the pure formula and nothing else, so the PR controller can enrich its list
 * without pulling other repositories into its import graph.
 *
 * AGENCY-SCOPED, like every other figure on the roster card. One person holds an
 * `agency_pr` row per agency, and a score built from a rival's shifts would tell
 * an agency how the PR works elsewhere — which is none of its business. So the
 * query is confined to the asking agency's own assignments, and the rows that
 * come back are checked against it again before they are scored.
 *
 * THE WEIGHTS COME FROM THIS SERVER'S `KPI_WEIGHTS` SETTING and from nowhere
 * else — the repository is public, so they are not in the code (owner, 29 Sep
 * 2026). A server without a usable setting scores nobody: every PR shows "—",
 * no query runs, and the log says so ONCE, naming the setting, never its value.
 *
 * What goes out is the score and nothing else — see `kpi-score.ts`. Nothing
 * here logs a score, a weight or anything that went into one.
 */

/**
 * Whether this process has already warned that `KPI_WEIGHTS` is unusable. Once
 * is enough to be found in the log; once per roster request would bury it.
 */
let warnedUnusableWeights = false;

/**
 * The weights from this server's setting, or null when it is missing or
 * malformed. Read on every call: a short string split is not worth a cache, and
 * a cache would outlive a test that changes the setting.
 */
function weightsFromEnv(): KpiWeights | null {
  const raw = process.env.KPI_WEIGHTS;
  const weights = parseKpiWeights(raw);
  if (weights || warnedUnusableWeights) return weights;
  warnedUnusableWeights = true;
  // The setting's NAME only: its value is the private part, and a log line is
  // one more place it would be displayed.
  logger.warn(
    raw?.trim()
      ? '[loadPrKpiScores] KPI_WEIGHTS is malformed — every KPI score shows "—" until it is fixed (format: .env.example).'
      : '[loadPrKpiScores] KPI_WEIGHTS is not set — every KPI score shows "—" until it is.',
  );
  return null;
}

/** A fetched row: the formula's input, plus the agency that supplied the PR. */
type KpiFetchedRow = KpiAssignmentRow & { agencyId: string };

/**
 * Every assignment of these PRs dated inside the window, with the venue's stars
 * for that assignment when there are any.
 *
 * The rating is read through `rating.shift_assignment_id` (0120) — the night the
 * verdict was written about, and so the agency that staffed it. A verdict with
 * no attribution matches no assignment and reaches no agency, the same rule as
 * the ratings feed. `rating` is unique per (outlet, PR), so one assignment has at
 * most one verdict; the LIMIT only guarantees the join cannot fan a row out.
 *
 * Every status is fetched; `kpi-score.ts` decides which ones count, so that rule
 * lives in one file rather than half in this WHERE clause.
 */
async function fetchKpiRows(params: {
  prIds: string[];
  agencyId: string | null;
  fromDate: string;
  toDate: string;
}): Promise<KpiFetchedRow[]> {
  const { prIds, agencyId, fromDate, toDate } = params;
  const stars = sql<number | null>`(
    select ${RatingTable.stars} from ${RatingTable}
    where ${RatingTable.shiftAssignmentId} = ${ShiftAssignmentTable.id}
    order by ${desc(RatingTable.updatedAt)}
    limit 1
  )`;
  return db
    .select({
      // `pr_id` IS the user id after 0089, and it is what `loadPrStats` groups
      // on too — `user_id` is still null on rows predating the dual-write.
      prId: ShiftAssignmentTable.prId,
      agencyId: ShiftAssignmentTable.agencyId,
      status: ShiftAssignmentTable.status,
      shiftDate: ShiftTable.shiftDate,
      slot: ShiftTable.slot,
      checkInAt: ShiftAssignmentTable.checkInAt,
      cancelFeeRm: ShiftAssignmentTable.cancelFeeRm,
      cancelFeeWaivedAt: ShiftAssignmentTable.cancelFeeWaivedAt,
      stars,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftTable.id, ShiftAssignmentTable.shiftId))
    .where(
      and(
        inArray(ShiftAssignmentTable.prId, prIds),
        gte(ShiftTable.shiftDate, fromDate),
        lt(ShiftTable.shiftDate, toDate),
        ...(agencyId ? [eq(ShiftAssignmentTable.agencyId, agencyId)] : []),
      ),
    );
}

/**
 * KPI scores for a page of PRs, keyed by user id. A PR absent from the result
 * has nothing to score; callers spell that `null`, never 0. Every PR is absent
 * while this server has no usable `KPI_WEIGHTS` setting.
 *
 * `agencyId: null` is ADMIN scope — the PR's shifts at every agency. Every other
 * caller must pass its own agency id.
 *
 * Fails soft, like `loadPrStats`: a broken query leaves the scores blank ("—")
 * rather than taking the whole roster down to render one number.
 */
export async function loadPrKpiScores(params: {
  prIds: string[];
  agencyId: string | null;
  /** The clock the window is measured from — injectable for tests. */
  now?: Date;
}): Promise<Map<string, number | null>> {
  const { prIds, agencyId } = params;
  if (prIds.length === 0) return new Map();

  // No setting, no score — and no query: there is nothing to weigh the
  // components with and, by design, no default to fall back on.
  const weights = weightsFromEnv();
  if (!weights) return new Map();

  const ids = [...new Set(prIds)];
  try {
    const rows = await fetchKpiRows({
      prIds: ids,
      agencyId,
      ...kpiWindow(params.now ?? new Date()),
    });
    // Belt and braces: the WHERE clause already confines the rows, and a row
    // that is not this agency's — or not a PR that was asked about — must not
    // reach the score even if a later edit to the query loosens it.
    const asked = new Set(ids);
    const scoped = rows.filter(
      (row) => asked.has(row.prId) && (agencyId === null || row.agencyId === agencyId),
    );
    return kpiScoresByPr(scoped, weights);
  } catch (error) {
    logger.error('[loadPrKpiScores] query failed:', error);
    return new Map();
  }
}
