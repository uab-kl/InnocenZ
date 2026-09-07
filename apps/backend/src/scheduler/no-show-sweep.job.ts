import { and, eq, gte, inArray, isNull, lte, ne } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { SYSTEM_ACTOR } from '@/util/actor.js';
import { shiftWindowInstants } from '@/util/slot-window.js';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model.js';
import { ShiftTable } from '@/features/shift/shift.model.js';
import type { JobDefinition } from './scheduler.js';

/**
 * A SHIFT NOBODY TURNED UP FOR IS A NO-SHOW, AND SOMETHING HAS TO SAY SO.
 *
 * Until this job, an assignment nobody checked into simply stayed `assigned`
 * for ever. Nothing in the product ever closed one out: the PR never checked
 * in, the agency never cancelled it, and the row sat in a state meaning
 * "expected to be worked" long after the night it was expected. That is not
 * merely untidy. The weekly minimum-shifts rule counts an unresolved past
 * assignment as "offered and not worked" (owner's call, 20 Aug 2026), so a real
 * RM 50 fine was resting on a status nobody had ever confirmed — found 7 Sep
 * 2026, when two of Vicky's three 3 Sep shifts turned out to be exactly that.
 *
 * ⚠️ THIS MOVES NO MONEY, deliberately. `attendanceWindow` counts `no_show` and
 * `assigned` identically — both are chances that were offered, neither is
 * `completed` — so a swept row leaves every penalty, voucher and total exactly
 * where it was. What changes is that the record now states what happened
 * instead of leaving it open. A fine that was right stays right; one that was
 * wrong becomes visible, which is the whole point.
 */

/**
 * How long after a shift ENDS before an absence is a fact.
 *
 * Measured from the end, never the start: a PR who arrives an hour late has
 * still worked the shift, and judging them at the start would call that a
 * no-show. The grace on top absorbs a forgotten check-in and a phone with no
 * signal in a basement venue. The honest failure mode here is being too slow,
 * not too quick — this writes a black mark against a person.
 */
export const NO_SHOW_GRACE_HOURS = 3;

/**
 * How far back a sweep will reach.
 *
 * Bounded on purpose. Unresolved rows go back as far as the product does, and
 * silently restating months of history in one tick is not something a job
 * should decide to do on its own — the first run after deploy would otherwise
 * be the largest write this table has ever seen. Older rows are LEFT and
 * COUNTED, so they show up in the log rather than being either rewritten or
 * quietly forgotten.
 */
export const NO_SHOW_LOOKBACK_DAYS = 30;

/** Often enough that the back-to-back cut lands close to the shift's own end. */
const SCHEDULE = '*/15 * * * *';

/**
 * Statuses that do NOT prove a PR moved on to something else.
 *
 * A next shift that was cancelled or excused never happened, so it cannot be
 * the evidence that the earlier one is beyond saving.
 */
const MOVED_ON_EXCLUDED = new Set(['cancelled', 'leave_approved']);

const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/**
 * WHEN does an un-checked-in assignment become a no-show?
 *
 * Normally the shift's end plus the grace. But when the PR has ANOTHER shift
 * starting before that grace is up, waiting is both pointless and wrong: they
 * have physically moved on, so there is no late check-in left to wait for.
 * Back-to-back — the next shift starting exactly as this one ends — is the case
 * the owner named, and it falls out of this as `cutoff = the shift's own end`
 * (7 Sep 2026). A gap of an hour behaves the same way, for the same reason.
 *
 * Never earlier than this shift's own end, whatever the next one claims: an
 * overlapping roster is a rostering mistake, and it must not shorten a PR's
 * chance to work a shift they might be standing at right now.
 *
 * Null when the slot carries no window ("Late night", or any free text) — an
 * unknown is not an absence, exactly as the lateness rule refuses to judge a
 * shift it cannot place on a clock. Those rows stay `assigned` for a human.
 */
export function noShowCutoff(
  shiftDate: string,
  slot: string | null | undefined,
  nextShiftStartsAt: Date | null,
  graceHours: number = NO_SHOW_GRACE_HOURS,
): Date | null {
  const w = shiftWindowInstants(shiftDate, slot);
  if (!w) return null;
  const graced = new Date(w.end.getTime() + graceHours * 3_600_000);
  if (nextShiftStartsAt && nextShiftStartsAt < graced) {
    return nextShiftStartsAt > w.end ? nextShiftStartsAt : w.end;
  }
  return graced;
}

interface PeerShift {
  shiftDate: string;
  slot: string | null;
  status: string;
}

/**
 * The earliest moment this PR is known to have been somewhere else.
 *
 * Considers every assignment the PR holds, INCLUDING other agencies'. A person
 * cannot be in two places at once whoever booked them, and this can only bring
 * a decision FORWARD to a moment the grace would have reached anyway — so it
 * changes when a row is swept, never whether it is.
 */
export function nextStartAfter(peers: PeerShift[], end: Date): Date | null {
  let earliest: Date | null = null;
  for (const p of peers) {
    if (MOVED_ON_EXCLUDED.has(p.status)) continue;
    const w = shiftWindowInstants(p.shiftDate, p.slot);
    if (!w || w.start < end) continue;
    if (!earliest || w.start < earliest) earliest = w.start;
  }
  return earliest;
}

export interface NoShowSweepResult {
  swept: number;
  skippedNoWindow: number;
  tooOld: number;
  /** Exactly which rows were (or would be) marked — the blast radius, named. */
  rows: { id: string; prId: string; shiftDate: string; slot: string | null }[];
}

/**
 * `dryRun` reports without writing.
 *
 * Not a nicety: the first real run reaches back 30 days across every agency,
 * and a bulk status change is not reversible from here — nothing records what
 * each row used to be. A sweep of that size gets looked at before it happens.
 */
export async function runNoShowSweep(
  now: Date = new Date(),
  options: { dryRun?: boolean } = {},
): Promise<NoShowSweepResult> {
  // Every assignment still waiting on a check-in that never came. `draft`
  // shifts are excluded: they were never published, so a PR seated on one is a
  // bug upstream rather than an absence by that PR.
  const candidates = await db
    .select({
      id: ShiftAssignmentTable.id,
      prId: ShiftAssignmentTable.prId,
      shiftDate: ShiftTable.shiftDate,
      slot: ShiftTable.slot,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftTable.id, ShiftAssignmentTable.shiftId))
    .where(
      and(
        eq(ShiftAssignmentTable.status, 'assigned'),
        isNull(ShiftAssignmentTable.checkInAt),
        ne(ShiftTable.status, 'draft'),
        lte(ShiftTable.shiftDate, isoDay(now)),
      ),
    )
    .orderBy(ShiftTable.shiftDate);

  if (candidates.length === 0) return { swept: 0, skippedNoWindow: 0, tooOld: 0, rows: [] };

  const oldestAllowed = isoDay(new Date(now.getTime() - NO_SHOW_LOOKBACK_DAYS * 86_400_000));
  const tooOld = candidates.filter((c) => c.shiftDate.slice(0, 10) < oldestAllowed);
  const inRange = candidates.filter((c) => c.shiftDate.slice(0, 10) >= oldestAllowed);
  if (tooOld.length > 0) {
    logger.warn(
      `[no-show-sweep] ${tooOld.length} unresolved assignment(s) older than ` +
        `${NO_SHOW_LOOKBACK_DAYS} days left untouched (oldest ${tooOld[0]?.shiftDate})`,
    );
  }
  if (inRange.length === 0)
    return { swept: 0, skippedNoWindow: 0, tooOld: tooOld.length, rows: [] };

  // One read covering every shift those PRs hold around the same days, so the
  // back-to-back check costs one query rather than one per candidate.
  const prIds = [...new Set(inRange.map((c) => c.prId))];
  const from = inRange.reduce(
    (min, c) => (c.shiftDate < min ? c.shiftDate : min),
    inRange[0]!.shiftDate,
  );
  const until = isoDay(new Date(now.getTime() + 2 * 86_400_000));
  const peers = await db
    .select({
      prId: ShiftAssignmentTable.prId,
      shiftDate: ShiftTable.shiftDate,
      slot: ShiftTable.slot,
      status: ShiftAssignmentTable.status,
    })
    .from(ShiftAssignmentTable)
    .innerJoin(ShiftTable, eq(ShiftTable.id, ShiftAssignmentTable.shiftId))
    .where(
      and(
        inArray(ShiftAssignmentTable.prId, prIds),
        gte(ShiftTable.shiftDate, from),
        lte(ShiftTable.shiftDate, until),
      ),
    );

  const peersByPr = new Map<string, PeerShift[]>();
  for (const p of peers) {
    const entry = { shiftDate: p.shiftDate, slot: p.slot, status: p.status };
    const list = peersByPr.get(p.prId);
    if (list) list.push(entry);
    else peersByPr.set(p.prId, [entry]);
  }

  const due: typeof inRange = [];
  let skippedNoWindow = 0;
  for (const c of inRange) {
    const w = shiftWindowInstants(c.shiftDate, c.slot);
    if (!w) {
      skippedNoWindow += 1;
      continue;
    }
    const cutoff = noShowCutoff(
      c.shiftDate,
      c.slot,
      nextStartAfter(peersByPr.get(c.prId) ?? [], w.end),
    );
    if (cutoff && cutoff <= now) due.push(c);
  }

  if (due.length === 0) return { swept: 0, skippedNoWindow, tooOld: tooOld.length, rows: [] };
  if (options.dryRun) return { swept: 0, skippedNoWindow, tooOld: tooOld.length, rows: due };

  // The status and check-in terms are REPEATED here rather than assumed from
  // the read above: a PR who checks in between the two queries must win.
  // Losing that race would stamp a no-show on somebody standing at the venue.
  await db
    .update(ShiftAssignmentTable)
    .set({ status: 'no_show', updatedAt: new Date(), updatedBy: SYSTEM_ACTOR })
    .where(
      and(
        inArray(
          ShiftAssignmentTable.id,
          due.map((d) => d.id),
        ),
        eq(ShiftAssignmentTable.status, 'assigned'),
        isNull(ShiftAssignmentTable.checkInAt),
      ),
    );

  logger.info(
    `[no-show-sweep] marked ${due.length} assignment(s) no_show` +
      (skippedNoWindow > 0 ? ` · ${skippedNoWindow} skipped (no clock in the slot)` : ''),
  );
  return { swept: due.length, skippedNoWindow, tooOld: tooOld.length, rows: due };
}

export const NO_SHOW_SWEEP_JOB: JobDefinition = {
  name: 'no-show-sweep',
  schedule: SCHEDULE,
  run: async () => {
    await runNoShowSweep();
  },
};
