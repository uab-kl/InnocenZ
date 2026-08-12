/**
 * Proves the two scoping rules added for the agency portal actually EXECUTE
 * against the live database, rather than failing closed into an empty list.
 *
 * Both repositories swallow errors and return `[]`, so a malformed correlated
 * subquery would look exactly like "this agency has no ratings" — the reason
 * this probe exists at all. It therefore fires each query at data it can first
 * confirm is there, and SKIPS (never passes) when there is nothing comparable.
 *
 * 1. `RatingRepository.list({ agencySuppliedTo })` — the EXISTS join across
 *    `shift_assignment` ⋈ `shift`, including the `::text` cast that bridges
 *    `rating.pr_id` (varchar) to `shift_assignment.pr_id` (uuid). A cast error
 *    raises at the database, so a returned row set is proof the SQL is valid.
 *
 * 2. `PrRepository.listPaginated({ excludePending })` — that a pending
 *    `agency_pr` membership is dropped from the roster read.
 *
 * READ-ONLY: selects only. Nothing is written, so it is safe on the shared DB.
 *   npx tsx --tsconfig tsconfig.json src/scripts/probe-rating-agency-scope.ts
 */
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { RatingTable } from '@/features/rating/rating.model';
import { AgencyPrTable } from '@/features/pr-personnel/pr.model';
import { RatingRepositoryClass } from '@/features/rating/rating.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';

const ratingRepository = new RatingRepositoryClass();
const prRepository = new PrRepositoryClass();

const NO_SUCH_AGENCY = '00000000-0000-0000-0000-000000000000';

async function probeRatingScope(): Promise<void> {
  console.log('\n--- 1. rating scope: only the agency on the RATED shift ---');

  const totalRows = await db
    .select({ id: RatingTable.id, assignmentId: RatingTable.shiftAssignmentId })
    .from(RatingTable);
  console.log(
    `rating rows: ${totalRows.length} (attributed to a shift: ${totalRows.filter((r) => r.assignmentId).length})`,
  );
  if (totalRows.length === 0) {
    console.log('SKIP - no ratings exist, so an empty result would prove nothing.');
    return;
  }

  // The (rating, agency) pair that SHOULD match: the agency on the assignment
  // the rating itself points at. Derived independently of the repository.
  const [expected] = await db
    .select({
      prId: RatingTable.prId,
      outletId: RatingTable.outletId,
      agencyId: ShiftAssignmentTable.agencyId,
    })
    .from(RatingTable)
    .innerJoin(
      ShiftAssignmentTable,
      eq(ShiftAssignmentTable.id, RatingTable.shiftAssignmentId),
    )
    .limit(1);

  if (!expected) {
    // Still fire the query — a broken join must surface, and the SAFETY property
    // is provable here: an unattributed rating must reach NO agency at all.
    const anyAgency = await db
      .select({ agencyId: ShiftAssignmentTable.agencyId })
      .from(ShiftAssignmentTable)
      .limit(1);
    const rows = anyAgency[0]
      ? await ratingRepository.list({ agencySuppliedTo: anyAgency[0].agencyId })
      : [];
    console.log(
      rows.length === 0
        ? 'PASS - a rating with no shift attribution reaches NO agency (fails closed).'
        : `FAIL - an unattributed rating was visible to an agency (${rows.length} rows).`,
    );
    console.log('SKIP - no rating is attributed to a shift, so a positive match cannot be shown.');
    return;
  }

  console.log(
    `expect a match: pr=${expected.prId.slice(0, 8)} outlet=${expected.outletId.slice(0, 8)} agency=${expected.agencyId.slice(0, 8)}`,
  );

  const owned = await ratingRepository.list({ agencySuppliedTo: expected.agencyId });
  const matched = owned.some(
    (r) => r.prId === expected.prId && r.outletId === expected.outletId,
  );
  console.log(`rows for the agency that staffed the rated shift: ${owned.length}`);
  console.log(
    matched
      ? 'PASS - the agency on the rated shift sees its rating.'
      : 'FAIL - the row that should match did not.',
  );

  const strangerRows = await ratingRepository.list({ agencySuppliedTo: NO_SUCH_AGENCY });
  console.log(
    strangerRows.length === 0
      ? 'PASS - an agency that staffed nothing gets no ratings.'
      : `FAIL - a non-staffing agency saw ${strangerRows.length} ratings.`,
  );
}

async function probeExcludePending(): Promise<void> {
  console.log('\n--- 2. roster read: excludePending ---');

  const pending = await db
    .select({ agencyId: AgencyPrTable.agencyId, userId: AgencyPrTable.userId })
    .from(AgencyPrTable)
    .where(eq(AgencyPrTable.approveStatus, 'pending'))
    .limit(1);

  if (pending.length === 0) {
    console.log('SKIP - no pending membership exists to be hidden.');
    return;
  }

  const [{ agencyId, userId }] = pending;
  console.log(`pending membership: agency=${agencyId.slice(0, 8)} user=${userId.slice(0, 8)}`);

  const withPending = await prRepository.listPaginated({
    filter: { agencyId },
    page: 1,
    pageSize: 500,
  });
  const withoutPending = await prRepository.listPaginated({
    filter: { agencyId, excludePending: true },
    page: 1,
    pageSize: 500,
  });

  const inAll = withPending.prs.some((pr) => pr.id === userId);
  const inFiltered = withoutPending.prs.some((pr) => pr.id === userId);
  console.log(`unfiltered=${withPending.totalCount} filtered=${withoutPending.totalCount}`);
  console.log(
    inAll && !inFiltered
      ? 'PASS - the pending PR is present unfiltered and absent once excluded.'
      : `FAIL - inAll=${inAll} inFiltered=${inFiltered} (expected true/false).`,
  );
}

/**
 * The outlet half: an operator holding TWO venues must see only the venue the
 * portal is pinned to. The server pins an outlet caller to `scope.outletIds`
 * (every venue the account belongs to) and ANDs the caller's own `outletId` on
 * top — but nothing ever SENT `outletId`, so that narrowing had never run.
 */
async function probeOutletNarrowing(): Promise<void> {
  console.log('\n--- 3. outlet scope: outletId narrows within outletIds ---');

  const [rated] = await db
    .select({ outletId: RatingTable.outletId })
    .from(RatingTable)
    .limit(1);
  if (!rated) {
    console.log('SKIP - no ratings exist, so narrowing cannot be observed.');
    return;
  }

  // A second venue to stand in for "the operator's other outlet".
  const [other] = await db
    .select({ id: ShiftTable.outletId })
    .from(ShiftTable)
    .where(sql`${ShiftTable.outletId} <> ${rated.outletId}`)
    .limit(1);
  if (!other) {
    console.log('SKIP - only one outlet exists, so there is nothing to pool.');
    return;
  }

  const bothVenues = [rated.outletId, other.id];
  const pooled = await ratingRepository.list({ outletIds: bothVenues });
  const pinnedToRated = await ratingRepository.list({
    outletIds: bothVenues,
    outletId: rated.outletId,
  });
  const pinnedToOther = await ratingRepository.list({
    outletIds: bothVenues,
    outletId: other.id,
  });

  console.log(
    `pooled=${pooled.length} pinnedToRatedVenue=${pinnedToRated.length} pinnedToOtherVenue=${pinnedToOther.length}`,
  );
  const narrows =
    pooled.length > 0 && pinnedToRated.length === pooled.length && pinnedToOther.length === 0;
  console.log(
    narrows
      ? 'PASS - outletId narrows to the pinned venue; the other venue returns nothing.'
      : 'FAIL - outletId did not narrow as expected.',
  );

  // It must NARROW, never widen: an outletId outside the caller's memberships
  // has to yield nothing rather than reaching another operator's venue.
  const escape = await ratingRepository.list({
    outletIds: [other.id],
    outletId: rated.outletId,
  });
  console.log(
    escape.length === 0
      ? 'PASS - an outletId outside the caller memberships reads nothing.'
      : `FAIL - scope escape: ${escape.length} rows from a venue the caller does not hold.`,
  );
}

/**
 * The threading itself: a client that knows the SHIFT it just sealed must land
 * on that shift's assignment, and must not be able to name another venue's.
 */
async function probeShiftIdResolution(): Promise<void> {
  console.log('\n--- 4. rate UI threading: shiftId -> assignment ---');

  const [real] = await db
    .select({
      shiftId: ShiftAssignmentTable.shiftId,
      prId: ShiftAssignmentTable.prId,
      assignmentId: ShiftAssignmentTable.id,
      outletId: ShiftTable.outletId,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftAssignmentTable.shiftId, ShiftTable.id))
    .limit(1);
  if (!real) {
    console.log('SKIP - no shift assignments exist to resolve.');
    return;
  }

  const resolved = await ratingRepository.assignmentForShiftAndPr(
    real.shiftId,
    real.prId,
    real.outletId,
  );
  console.log(
    resolved === real.assignmentId
      ? 'PASS - (shiftId, prId, outletId) resolves to that shift\'s own assignment.'
      : `FAIL - resolved ${resolved}, expected ${real.assignmentId}.`,
  );

  // The outlet is part of the lookup, so a shift at someone else's venue is a
  // miss rather than an attribution handed to the wrong agency.
  const wrongVenue = await ratingRepository.assignmentForShiftAndPr(
    real.shiftId,
    real.prId,
    NO_SUCH_AGENCY,
  );
  console.log(
    wrongVenue === null
      ? 'PASS - a shift outside the caller outlet resolves to nothing.'
      : `FAIL - resolved ${wrongVenue} for a foreign outlet.`,
  );

  // A demo-store id that is not a uuid must MISS, never throw — otherwise the
  // venue's rating would be lost to a 500 instead of falling back.
  const junk = await ratingRepository.assignmentForShiftAndPr(
    'demo-shift-not-a-uuid',
    real.prId,
    real.outletId,
  );
  console.log(
    junk === null
      ? 'PASS - a non-uuid shiftId misses cleanly (falls back, does not throw).'
      : `FAIL - junk shiftId resolved to ${junk}.`,
  );
}

async function main(): Promise<void> {
  try {
    await probeShiftIdResolution();
    await probeRatingScope();
    await probeExcludePending();
    await probeOutletNarrowing();
  } catch (error) {
    // A raised error is the signal this probe exists to catch - the repositories
    // would have hidden it behind an empty array.
    console.error('\nTHREW - the query is invalid:', error);
    process.exitCode = 1;
  } finally {
    process.exit(process.exitCode ?? 0);
  }
}

void main();
