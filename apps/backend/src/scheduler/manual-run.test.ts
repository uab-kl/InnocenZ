import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SCHEDULED JOB RUN BY HAND TAKES THE SCHEDULER'S LOCK — `manual-run.ts`
 * (29 Sep 2026 follow-up: "manual job scripts bypass the scheduler lock").
 *
 * Driven through the same in-memory lock table `job-lock.test.ts` uses: one
 * shared set of held keys, one executor per simulated process, so a script and
 * a backend's scheduler can race for the same job without a database.
 */

const h = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }));

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: h.info, warn: h.warn, error: h.error, debug: vi.fn() },
}));

import { type JobLockExecutor, JOB_LOCK_MIN_HOLD_MS, jobLockKey } from './job-lock';
import { MANUAL_RUN_SKIPPED_EXIT_CODE, manualRunSkippedMessage, runJobByHand } from './manual-run';
import { SchedulerClass } from './scheduler';

/** Postgres's transaction-scoped advisory locks, in memory. */
function lockTable() {
  const held = new Set<string>();
  const processExecutor = (): JobLockExecutor & { asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      async inTransaction<T>(body: (tryLock: (key: string) => Promise<boolean>) => Promise<T>): Promise<T> {
        const mine = new Set<string>();
        try {
          return await body(async (key) => {
            asked.push(key);
            if (held.has(key)) return false;
            held.add(key);
            mine.add(key);
            return true;
          });
        } finally {
          for (const key of mine) held.delete(key);
        }
      },
    };
  };
  return { held, processExecutor };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const WEEKLY_PAYOUT = { name: 'weekly-payout' };
const noHold = { minHoldMs: 0 };

beforeEach(() => {
  h.info.mockReset();
  h.warn.mockReset();
  h.error.mockReset();
});

describe('runJobByHand — a manual run asks for the scheduler’s own lock', () => {
  it('runs the work under the job’s scheduler key and hands back what it returned', async () => {
    const executor = lockTable().processExecutor();
    const log = vi.fn();

    const outcome = await runJobByHand(WEEKLY_PAYOUT, async () => ({ created: 3 }), {
      executor,
      log,
      ...noHold,
    });

    expect(outcome).toMatchObject({ ran: true, result: { created: 3 } });
    expect(executor.asked).toEqual([jobLockKey('weekly-payout')]);
    expect(executor.asked).toEqual(['scheduler-job:weekly-payout']);
  });

  it('another process holds the job: the work never runs, and the script says so in words', async () => {
    const table = lockTable();
    table.held.add(jobLockKey('weekly-payout'));
    const work = vi.fn(async () => 'ran');
    const log = vi.fn();

    const outcome = await runJobByHand(WEEKLY_PAYOUT, work, {
      executor: table.processExecutor(),
      log,
      ...noHold,
    });

    expect(outcome).toEqual({ ran: false, message: manualRunSkippedMessage('weekly-payout') });
    expect(work).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(manualRunSkippedMessage('weekly-payout'));
    expect(manualRunSkippedMessage('weekly-payout')).toMatch(
      /NOT RUN — another process is running "weekly-payout" right now .*Nothing was written here/,
    );
    // A skip is neither success (0) nor failure (1).
    expect(MANUAL_RUN_SKIPPED_EXIT_CODE).toBe(2);
  });

  it('a manual run while the SCHEDULER is mid-run skips — the same key, not a lookalike', async () => {
    const table = lockTable();
    const gate = deferred();
    const tick = vi.fn(async () => gate.promise);
    const scheduler = new SchedulerClass({ executor: table.processExecutor(), ...noHold });
    scheduler.register({ name: 'weekly-payout', schedule: '0 2 * * 0', run: tick });

    const scheduled = scheduler.runNow('weekly-payout');
    await vi.waitFor(() => expect(tick).toHaveBeenCalled());

    const manual = vi.fn(async () => {});
    const outcome = await runJobByHand(WEEKLY_PAYOUT, manual, {
      executor: table.processExecutor(),
      log: vi.fn(),
      ...noHold,
    });

    expect(outcome.ran).toBe(false);
    expect(manual).not.toHaveBeenCalled();
    gate.resolve();
    await scheduled;
    expect(tick).toHaveBeenCalledTimes(1);
  });

  it('a scheduled tick while a MANUAL run is mid-run skips — the lock works both ways', async () => {
    const table = lockTable();
    const gate = deferred();
    const manual = vi.fn(async () => gate.promise);
    const tick = vi.fn(async () => {});
    const scheduler = new SchedulerClass({ executor: table.processExecutor(), ...noHold });
    scheduler.register({ name: 'weekly-payout', schedule: '0 2 * * 0', run: tick });

    const byHand = runJobByHand(WEEKLY_PAYOUT, manual, {
      executor: table.processExecutor(),
      log: vi.fn(),
      ...noHold,
    });
    await vi.waitFor(() => expect(manual).toHaveBeenCalled());

    await scheduler.runNow('weekly-payout');

    expect(tick).not.toHaveBeenCalled();
    gate.resolve();
    expect((await byHand).ran).toBe(true);
  });

  it('a different job is not blocked — the lock is per job', async () => {
    const table = lockTable();
    table.held.add(jobLockKey('weekly-payout'));
    const work = vi.fn(async () => {});

    const outcome = await runJobByHand({ name: 'penalty-seal' }, work, {
      executor: table.processExecutor(),
      log: vi.fn(),
      ...noHold,
    });

    expect(outcome.ran).toBe(true);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('a QUICK run keeps the lock to the end of the hold, and says why the script is waiting', async () => {
    const table = lockTable();
    const hold = deferred();
    const sleep = vi.fn(async () => hold.promise);
    const clock = [1_000, 3_000];
    const log = vi.fn();

    const byHand = runJobByHand(WEEKLY_PAYOUT, async () => 'done', {
      executor: table.processExecutor(),
      minHoldMs: JOB_LOCK_MIN_HOLD_MS,
      sleep,
      now: () => clock.shift() ?? 3_000,
      log,
    });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalledWith(JOB_LOCK_MIN_HOLD_MS - 2_000));
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/keeping the job lock 43s longer/));

    // A scheduled tick landing inside the hold is still refused.
    const late = vi.fn(async () => {});
    const scheduler = new SchedulerClass({ executor: table.processExecutor(), ...noHold });
    scheduler.register({ name: 'weekly-payout', schedule: '0 2 * * 0', run: late });
    await scheduler.runNow('weekly-payout');
    expect(late).not.toHaveBeenCalled();

    hold.resolve();
    expect(await byHand).toEqual({ ran: true, result: 'done', ms: 2_000 });
  });

  it('a failing run rejects with the job’s own error, and the lock is released', async () => {
    const table = lockTable();
    const boom = new Error('generator broke');

    await expect(
      runJobByHand(
        WEEKLY_PAYOUT,
        async () => {
          throw boom;
        },
        { executor: table.processExecutor(), log: vi.fn(), ...noHold },
      ),
    ).rejects.toBe(boom);

    expect(table.held.size).toBe(0);
  });
});

/**
 * Which scripts run a scheduled job's work — found by the job entry points their
 * CODE names (called, or handed over by reference), so a new script that runs
 * one is caught here rather than trusted to remember the lock.
 */
const JOB_ENTRY_POINTS: RegExp[] = [
  /\brunWeeklyPayout\b/,
  /\bgenerateForWeek\b/,
  /\brunNoShowSweep\b/,
  /\brunPenaltySeal\b/,
  /\brunAutoCharge\b/,
  /\bgenerateMissing\b/,
  /\bsealClosedWeek\b/,
  /\bverifyApprovedReceipts\b/,
  /\b[A-Z_]+_JOB\.run\b/,
];

/** Code only: a comment that MENTIONS a job (`cleanup-test-data-29sep-rules.ts` does) runs nothing. */
function codeOf(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('every script that runs a scheduled job goes through runJobByHand', () => {
  const scriptsDir = fileURLToPath(new URL('../scripts/', import.meta.url));
  const scripts = readdirSync(scriptsDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .map((file) => ({ file, source: codeOf(readFileSync(`${scriptsDir}${file}`, 'utf8')) }));
  const runningAJob = scripts.filter(({ source }) =>
    JOB_ENTRY_POINTS.some((entry) => entry.test(source)),
  );

  it('the scan sees the scripts it is meant to police (a zero here would be the scan broken)', () => {
    expect(scripts.length).toBeGreaterThan(50);
    expect(runningAJob.map(({ file }) => file)).toEqual(
      expect.arrayContaining([
        'run-weekly-payout.ts',
        'generate-weekly-pvs.ts',
        '_probe-no-show-sweep.ts',
        '_probe-penalty-seal.ts',
      ]),
    );
  });

  it('each of them takes the job’s lock, by the job’s own definition', () => {
    for (const { file, source } of runningAJob) {
      expect({ file, locked: /\brunJobByHand\(/.test(source) }).toEqual({ file, locked: true });
      expect({ file, namesTheJob: /\b[A-Z_]+_JOB\b/.test(source) }).toEqual({
        file,
        namesTheJob: true,
      });
    }
  });
});
