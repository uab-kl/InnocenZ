import { sql } from 'drizzle-orm';
import type { DbTransaction } from '@/types/db-transaction';

/**
 * THE CHECK-THEN-INSERT RACE ON A VENUE'S SHIFTS — closed here (30 Sep 2026).
 *
 * A shift's clash and plan rules READ the venue's day, and the write came after,
 * in a transaction of its own; nothing held the day in between. Two writes
 * landing together — two tabs, a batch beside a single post, an edit beside
 * either — could each pass against a database that held neither yet, and both
 * committed: two shifts on one clock, or a day past the plan's cap.
 *
 * The checks stay where they were, so every ordinary answer is unchanged. The
 * write now locks each venue it touches FIRST in its own transaction, then
 * re-runs the two rules that read the day through that same transaction. The
 * second writer waits on the lock, reads what the first one committed, and is
 * refused with the very sentence and status the outside check would have given.
 *
 * A LEAF on purpose: the repository imports the seam from here and the rules
 * import the lock, so neither of them has to import the other.
 *
 * THE ONE LOCK ORDER (30 Sep 2026) — every write that decides who works where
 * and when takes its advisory locks FIRST in its transaction, in this order:
 *
 *   1. VENUE  `shift-post:<outlet>`  posting a venue's shifts, or editing one
 *   2. SHIFT  `shift-seat:<shift>`   seating a PR on a shift, or re-timing it
 *   3. PR     `pr-booking:<person>`  anything that reads or changes one
 *                                   person's bookings to decide
 *
 * and only then touches rows. Each class is taken once per transaction, all its
 * keys at once, distinct, lower-cased and sorted. Two transactions therefore
 * meet any locks they share in the same order and can only ever wait on each
 * other one way round: no cycle, no deadlock. `takeLocks` THROWS on a request
 * that would break the order, so a lane that gets it wrong fails in its first
 * test rather than as a rare deadlock in production.
 */

/**
 * Runs FIRST inside a shift write's transaction, before any row is written, on
 * that transaction's own connection. It refuses by throwing `ShiftWriteRefused`,
 * which rolls the whole transaction back.
 */
export type ShiftWriteGuard = (tx: DbTransaction) => Promise<void>;

/** A rule's refusal as the request answers it: its sentence and status. */
export type RuleRefusal = { status: number; message: string };

/**
 * One shift's venue rules — the refusal, or null. Handed the write's
 * transaction, every read goes through it; with none, through the pool.
 */
export type VenueRecheck = (tx?: DbTransaction) => Promise<RuleRefusal | null>;

/**
 * A rule that refused a write from INSIDE its transaction — a venue's or a PR's:
 * a shift or a booking landed between the check and the lock. An ANSWER, not a
 * fault — the repositories re-throw it without an error log, as the assignment
 * side does `ShiftFullError`.
 */
export class ShiftWriteRefused extends Error {
  constructor(
    /** The status the outside check answers the same refusal with. */
    readonly status: number,
    message: string,
    /** Which shift of a batch it stopped on; 0 for a single post or an edit. */
    readonly index: number,
  ) {
    super(message);
    this.name = 'ShiftWriteRefused';
  }
}

const LOCK_CLASSES = {
  venue: { rank: 1, prefix: 'shift-post' },
  shift: { rank: 2, prefix: 'shift-seat' },
  pr: { rank: 3, prefix: 'pr-booking' },
} as const;

/** The latest lock class each open transaction has taken (drizzle makes one tx object per transaction). */
const heldRank = new WeakMap<object, number>();

/**
 * Take one class of locks, held until the caller's transaction ends.
 *
 * One lock per DISTINCT key, sorted, so two writers naming the same keys queue
 * behind each other rather than each holding one and waiting on the other.
 * Lower-cased first: Postgres reads a uuid in either case, so two spellings of
 * one id must not become two locks. The key is a bound parameter, never spliced
 * into the SQL, hashed to 64 bits as the other advisory locks here are
 * (notification.repository.ts, membership-access.ts).
 *
 * ⚠️ BEFORE the reads they protect. Under READ COMMITTED each statement takes a
 * fresh snapshot, so a read after the lock sees whatever the previous holder
 * committed; a read before it would see the state as it stood while this writer
 * was still waiting — the stale view the races lived on.
 */
async function takeLocks(
  tx: DbTransaction,
  lockClass: keyof typeof LOCK_CLASSES,
  ids: readonly string[],
): Promise<void> {
  const { rank, prefix } = LOCK_CLASSES[lockClass];
  if ((heldRank.get(tx) ?? 0) >= rank) {
    throw new Error(
      `Lock order broken: ${lockClass} locks asked for after a later class, or twice — ` +
        'take venue, then shift, then PR locks, once each (shift-write-guard.ts).',
    );
  }
  heldRank.set(tx, rank);
  for (const key of [...new Set(ids.map((id) => id.toLowerCase()))].sort()) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${prefix}:${key}`}, 0))`,
    );
  }
}

/** Class 1: hold each venue's shift writes — posts, edits, a move between venues. */
export function lockVenueShiftWrites(
  tx: DbTransaction,
  outletIds: readonly string[],
): Promise<void> {
  return takeLocks(tx, 'venue', outletIds);
}

/**
 * Class 2: hold the seats of a shift. Taken by every lane that seats a PR on it
 * and by an edit that moves it in time, so a booking onto the very shift being
 * re-timed is seen by whichever of the two goes second.
 */
export function lockShiftSeats(tx: DbTransaction, shiftIds: readonly string[]): Promise<void> {
  return takeLocks(tx, 'shift', shiftIds);
}

/**
 * Class 3: hold a person's bookings. Keyed by the id `listForPr` filters on —
 * `shift_assignment.pr_id`, which IS the user id since 0089 — because a person
 * is in one place at a time whichever venue or agency books them, so no venue
 * or shift lock can serialise two bookings of one PR at two venues.
 */
export function lockPrBookings(tx: DbTransaction, prIds: readonly string[]): Promise<void> {
  return takeLocks(tx, 'pr', prIds);
}

/**
 * The guard for a write touching `outletIds`: every venue locked, then each
 * shift's rules re-run in order, through the transaction. The first refusal is
 * thrown with its position; the shifts after it are not asked.
 */
export function venueWriteGuard(
  outletIds: readonly string[],
  rechecks: readonly VenueRecheck[],
): ShiftWriteGuard {
  return async (tx) => {
    await lockVenueShiftWrites(tx, outletIds);
    for (const [index, recheck] of rechecks.entries()) {
      const refused = await recheck(tx);
      if (refused) throw new ShiftWriteRefused(refused.status, refused.message, index);
    }
  };
}

/**
 * A guarded write's outcome: what it wrote, or the refusal its guard threw.
 * Anything else still throws — a real failure must stay a 500.
 */
export async function writeUnlessRefused<T>(
  write: Promise<T>,
): Promise<{ ok: true; written: T } | { ok: false; refused: ShiftWriteRefused }> {
  try {
    return { ok: true, written: await write };
  } catch (error) {
    if (error instanceof ShiftWriteRefused) return { ok: false, refused: error };
    throw error;
  }
}
