import { sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';

/**
 * ONE RUN PER TICK, ACROSS EVERY BACKEND PROCESS (29 Sep 2026 follow-up).
 *
 * The scheduler starts in every backend process (`main.ts` → `scheduler.start()`),
 * and every process points at the same database — two production replicas, or
 * a developer's backend on the shared `innocenz-test` beside the deployed one.
 * So each Sunday job ran once PER PROCESS: the weekly payout, the tier job, the
 * penalty seal, each fired twice at the same minute. The jobs' own idempotency
 * caught most of the money (a voucher per PR+week, a claimed invoice row) but
 * not all of what they SAY — duplicate notices like 13 Sep's (7 tier, 4
 * day-review) are what a double run leaves behind; the notice repeat guard in
 * `createUnlessRepeat` was the first line against them, this is the second.
 *
 * Now every run first asks Postgres for a per-job advisory lock:
 * `pg_try_advisory_xact_lock(hashtextextended('scheduler-job:<name>', 0))`.
 * The process that gets it runs the job; any other process at the same tick
 * does not wait, it logs ONE line and skips — the next tick is its turn to try.
 *
 * TRANSACTION-SCOPED, on purpose. The lock is taken inside a transaction held
 * open on one connection for the whole run, and it ends with that transaction:
 * at COMMIT, at ROLLBACK, or when the connection drops. A crashed process can
 * never leave a job locked, there is no unlock step to fail, and it works
 * whatever pooler may sit in front of the database (the shared one listens on
 * 5432 behind port 6543). The job's own queries use their usual connections;
 * this transaction runs nothing but the lock. Checked read-only 29 Sep 2026:
 * `idle_in_transaction_session_timeout` and `idle_session_timeout` are both 0
 * on the shared server, so nothing ends the lock under a long run.
 *
 * THE LOCK IS HELD FOR AT LEAST `JOB_LOCK_MIN_HOLD_MS`. Exclusive-while-running
 * alone is not one-run-per-tick: two processes fire the same cron minute a few
 * milliseconds apart, and a job with little to do can finish before the other
 * process has even asked — which would then get the lock and run it again.
 * Holding past the tick closes that. Every job here is at least 15 minutes
 * apart, and the hold stays under a minute so it could never swallow the next
 * tick even of a per-minute job.
 *
 * Each job keeps its own idempotency. This makes a double run rare; it does not
 * make one harmless, and nothing here relies on it being impossible.
 */

/** Asks for the per-job lock on the transaction it was handed. */
export type TryJobLock = (key: string) => Promise<boolean>;

export interface JobLockExecutor {
  /**
   * Runs `body` inside ONE transaction on ONE connection, handing it the
   * try-lock for THAT transaction. Throwing from `body` rolls it back.
   */
  inTransaction<T>(body: (tryLock: TryJobLock) => Promise<T>): Promise<T>;
}

/** The real one: the shared pool, one transaction per run. */
export const dbJobLockExecutor: JobLockExecutor = {
  async inTransaction<T>(body: (tryLock: TryJobLock) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) =>
      body(async (key) => {
        const result = await tx.execute(
          sql`select pg_try_advisory_xact_lock(hashtextextended(${key}, 0)) as locked`,
        );
        return result.rows[0]?.locked === true;
      }),
    );
  },
};

/**
 * 45 s: far longer than any gap between two processes' ticks for the same
 * minute, and short of a minute so no job, however frequent, could be skipped
 * by its own previous run's hold.
 */
export const JOB_LOCK_MIN_HOLD_MS = 45_000;

/**
 * 30 min: the longest a run may keep its lock (security review, 29 Sep 2026).
 *
 * The lock lives as long as its transaction, and the shared server's
 * `idle_in_transaction_session_timeout` is 0 — so a job that HANGS (an await on
 * a call that never settles), rather than crashing, held its lock for the life
 * of the process, and every other process skipped that job on every tick,
 * silently, until someone restarted the stuck one. Past this deadline the run is
 * abandoned: its error is thrown, the transaction rolls back and the lock is
 * free for the next tick. JS cannot cancel the abandoned body, so it may still
 * finish later — each job keeps its own idempotency for exactly that. Every job
 * here is a nightly/weekly sweep over small tables, done in seconds.
 */
export const JOB_LOCK_MAX_RUN_MS = 30 * 60_000;

/** One key per job, in its own namespace of the shared advisory-lock space. */
export function jobLockKey(jobName: string): string {
  return `scheduler-job:${jobName}`;
}

export type ExclusiveOutcome = { ran: true; ms: number } | { ran: false };

export type RunExclusiveOptions = {
  executor?: JobLockExecutor;
  minHoldMs?: number;
  maxRunMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

function sleepFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // Never the reason a shutting-down process stays alive.
    setTimeout(resolve, ms).unref();
  });
}

/** `work`, or a rejection once `ms` have passed — whichever comes first. */
function withinDeadline(work: Promise<void>, ms: number, jobName: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `[scheduler] ${jobName}: still running after ${Math.round(ms / 60_000)} min — abandoned so its lock is released`,
        ),
      );
    }, ms);
    timer.unref();
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Runs `work` only if this process wins the job's lock for this tick.
 *
 * `{ ran: false }` — another process holds it; nothing ran here, one line logged.
 * `{ ran: true, ms }` — ran here; `ms` is the job's own time, not the hold.
 * A job that throws still holds the lock for the rest of the tick (the tick is
 * spent, and the other process must not re-run half of it), then rethrows so
 * the scheduler logs the failure as before.
 */
export async function runExclusive(
  jobName: string,
  work: () => Promise<void>,
  options: RunExclusiveOptions = {},
): Promise<ExclusiveOutcome> {
  const executor = options.executor ?? dbJobLockExecutor;
  const minHoldMs = options.minHoldMs ?? JOB_LOCK_MIN_HOLD_MS;
  const maxRunMs = options.maxRunMs ?? JOB_LOCK_MAX_RUN_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? sleepFor;

  // Set only once the job itself has completed — read by the catch below,
  // which the transaction's closing statement can reach after it has.
  const run: { finished: ExclusiveOutcome | null } = { finished: null };
  try {
    return await executor.inTransaction(async (tryLock): Promise<ExclusiveOutcome> => {
      if (!(await tryLock(jobLockKey(jobName)))) {
        logger.info(`[scheduler] ${jobName}: another backend process holds this run — skipped here`);
        return { ran: false };
      }
      const startedAt = now();
      let failure: { error: unknown } | null = null;
      try {
        await withinDeadline(work(), maxRunMs, jobName);
      } catch (error) {
        failure = { error };
      }
      const ms = now() - startedAt;
      if (ms < minHoldMs) await sleep(minHoldMs - ms);
      if (failure) throw failure.error;
      run.finished = { ran: true, ms };
      return run.finished;
    });
  } catch (error) {
    // The job finished and only the lock's own transaction failed to close
    // (its connection dropped): the lock is gone with it, and the run DID
    // happen. Reporting it as failed would invite a manual second run.
    if (run.finished) {
      logger.warn(`[scheduler] ${jobName}: finished, but its lock connection closed uncleanly`, error);
      return run.finished;
    }
    throw error;
  }
}
