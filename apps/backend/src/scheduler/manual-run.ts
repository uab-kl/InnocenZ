import { type RunExclusiveOptions, runExclusive } from './job-lock.js';
import type { JobDefinition } from './scheduler.js';

/**
 * A SCHEDULED JOB RUN BY HAND TAKES THE SCHEDULER'S OWN LOCK (29 Sep 2026
 * follow-up: "manual job scripts bypass the scheduler lock").
 *
 * Every scheduled tick goes through `runExclusive` (job-lock.ts): a per-job
 * `pg_try_advisory_xact_lock`, held at least `JOB_LOCK_MIN_HOLD_MS`, abandoned
 * at `JOB_LOCK_MAX_RUN_MS`. The scripts that run the same work by hand —
 * `run-weekly-payout.ts`, `generate-weekly-pvs.ts`, and the `--apply` path of
 * `_probe-no-show-sweep.ts` / `_probe-penalty-seal.ts` — called the job's
 * function directly, so a manual catch-up started at 01:59 on a Sunday ran
 * side by side with the 02:00 tick in every backend process. The jobs' own
 * idempotency caught most of the money, not all of what they SAY: the double
 * notices a double run leaves behind are what the lock exists to stop.
 *
 * So a manual run asks for the SAME key the scheduler asks for — the job's
 * `name`, taken from its `JobDefinition` rather than retyped, so the two cannot
 * drift apart — and holds it the same way:
 *  - another process is running the job → nothing runs here, the script says
 *    so in words (`manualRunSkippedMessage`) and exits with
 *    `MANUAL_RUN_SKIPPED_EXIT_CODE`, never 0: a skip is not a success;
 *  - the run finished early → the lock is kept to the end of the minimum hold,
 *    exactly as a tick keeps it, so a scheduled tick landing in the same minute
 *    does not repeat what the script just did. The script says why it waits.
 *
 * A DRY RUN IS NOT LOCKED, on purpose. It writes nothing, so it cannot collide
 * with anything — and taking the lock would hold it for the minimum hold and
 * could make the real scheduled tick skip its turn. The probes keep their
 * dry-run default; only `--apply` comes through here.
 */

/** A skipped manual run exits with this — distinct from 0 (done) and 1 (failed). */
export const MANUAL_RUN_SKIPPED_EXIT_CODE = 2;

export type ManualRunOutcome<T> =
  | { ran: true; result: T; ms: number }
  | { ran: false; message: string };

export type ManualRunOptions = RunExclusiveOptions & {
  /** Where the script's own lines go. The console by default — a script's reader is at a terminal. */
  log?: (line: string) => void;
};

/** What a skipped manual run prints: who has the job, and that nothing was written. */
export function manualRunSkippedMessage(jobName: string): string {
  return (
    `[${jobName}] NOT RUN — another process is running "${jobName}" right now ` +
    '(the scheduler in a running backend, or another manual run). Nothing was written here. ' +
    'Run this again once it has finished.'
  );
}

/** Not unref'd: a script's hold must finish before its transaction commits. */
function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Runs `work` under `job`'s scheduler lock, or not at all.
 *
 * `{ ran: true, result }` — ran here; `result` is what `work` returned.
 * `{ ran: false, message }` — another process holds the job; `work` was never
 * called, and `message` has already been logged.
 * A `work` that throws rejects with its error (the script's own FAILED line and
 * exit 1); the lock is released with the transaction either way.
 */
export async function runJobByHand<T>(
  job: Pick<JobDefinition, 'name'>,
  work: () => Promise<T>,
  options: ManualRunOptions = {},
): Promise<ManualRunOutcome<T>> {
  const { log = console.log, ...lock } = options;
  const produced: { value?: T } = {};
  const sleep = lock.sleep ?? waitFor;

  const outcome = await runExclusive(
    job.name,
    async () => {
      produced.value = await work();
    },
    {
      ...lock,
      sleep: async (ms) => {
        log(
          `[${job.name}] done — keeping the job lock ${Math.ceil(ms / 1000)}s longer, ` +
            'so a scheduled tick in this same minute does not run it a second time',
        );
        await sleep(ms);
      },
    },
  );

  if (!outcome.ran) {
    const message = manualRunSkippedMessage(job.name);
    log(message);
    return { ran: false, message };
  }
  return { ran: true, result: produced.value as T, ms: outcome.ms };
}
