import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE RUN PER TICK ACROSS BACKEND PROCESSES — `job-lock.ts` (29 Sep 2026).
 *
 * The lock is driven through a FAKE executor: one shared "lock table" and one
 * executor per simulated process, so two processes can race for the same tick
 * without a database. The real executor's SQL is checked against a fake
 * transaction. Nothing here connects to Postgres.
 */

const h = vi.hoisted(() => ({
  executed: [] as unknown[],
  lockAnswer: true,
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/db/index.js', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        execute: async (query: unknown) => {
          h.executed.push(query);
          return { rows: [{ locked: h.lockAnswer }] };
        },
      }),
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: h.info, warn: h.warn, error: h.error, debug: vi.fn() },
}));

import {
  type JobLockExecutor,
  dbJobLockExecutor,
  JOB_LOCK_MAX_RUN_MS,
  JOB_LOCK_MIN_HOLD_MS,
  jobLockKey,
  runExclusive,
} from './job-lock';
import { SchedulerClass } from './scheduler';

/** What Postgres does with transaction-scoped advisory locks, in memory. */
function lockTable() {
  const held = new Set<string>();
  /** One executor = one backend process's connection pool. */
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
          // COMMIT or ROLLBACK: every xact lock the transaction took goes with it.
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

/** A hold that finishes at once, so tests are not 45 seconds long. */
const noHold = { minHoldMs: 0 };

beforeEach(() => {
  h.executed = [];
  h.lockAnswer = true;
  h.info.mockReset();
  h.warn.mockReset();
  h.error.mockReset();
});

describe('runExclusive — one process per tick', () => {
  it('the process that wins the lock runs the job, keyed by the job’s name', async () => {
    const table = lockTable();
    const executor = table.processExecutor();
    const work = vi.fn(async () => {});

    const outcome = await runExclusive('weekly-payout', work, { executor, ...noHold });

    expect(outcome).toMatchObject({ ran: true });
    expect(work).toHaveBeenCalledTimes(1);
    expect(executor.asked).toEqual(['scheduler-job:weekly-payout']);
    expect(jobLockKey('weekly-payout')).toBe('scheduler-job:weekly-payout');
  });

  it('a SECOND process at the same tick skips — the job does not run there, one line is logged', async () => {
    const table = lockTable();
    const gate = deferred();
    const first = vi.fn(async () => gate.promise);
    const second = vi.fn(async () => {});

    const a = runExclusive('weekly-payout', first, { executor: table.processExecutor(), ...noHold });
    // Let A take the lock and start its run.
    await vi.waitFor(() => expect(first).toHaveBeenCalled());

    const b = await runExclusive('weekly-payout', second, { executor: table.processExecutor(), ...noHold });

    expect(b).toEqual({ ran: false });
    expect(second).not.toHaveBeenCalled();
    expect(h.info).toHaveBeenCalledTimes(1);
    expect(String(h.info.mock.calls[0]?.[0])).toMatch(/weekly-payout: another backend process holds this run — skipped here/);

    gate.resolve();
    expect(await a).toMatchObject({ ran: true });
  });

  it('locks are per job — two different jobs run side by side', async () => {
    const table = lockTable();
    const gate = deferred();
    const payout = vi.fn(async () => gate.promise);
    const tier = vi.fn(async () => {});

    const a = runExclusive('weekly-payout', payout, { executor: table.processExecutor(), ...noHold });
    await vi.waitFor(() => expect(payout).toHaveBeenCalled());
    const b = await runExclusive('agency-tier', tier, { executor: table.processExecutor(), ...noHold });

    expect(b).toMatchObject({ ran: true });
    gate.resolve();
    await a;
  });

  it('the lock ends with the run, so the NEXT tick runs again', async () => {
    const table = lockTable();
    const work = vi.fn(async () => {});

    await runExclusive('no-show-sweep', work, { executor: table.processExecutor(), ...noHold });
    await runExclusive('no-show-sweep', work, { executor: table.processExecutor(), ...noHold });

    expect(work).toHaveBeenCalledTimes(2);
    expect(table.held.size).toBe(0);
  });

  it('a QUICK run keeps the lock to the end of the hold — the other process cannot slip in behind it', async () => {
    const table = lockTable();
    const hold = deferred();
    const sleep = vi.fn(async () => hold.promise);
    const clock = [1_000, 1_200];
    const now = () => clock.shift() ?? 1_200;

    const a = runExclusive('penalty-seal', async () => {}, {
      executor: table.processExecutor(),
      minHoldMs: JOB_LOCK_MIN_HOLD_MS,
      sleep,
      now,
    });
    await vi.waitFor(() => expect(sleep).toHaveBeenCalled());
    // Held for the rest of the minimum, measured from the start of the job.
    expect(sleep).toHaveBeenCalledWith(JOB_LOCK_MIN_HOLD_MS - 200);

    // The other process's tick lands during the hold: still skipped.
    const late = vi.fn(async () => {});
    const b = await runExclusive('penalty-seal', late, { executor: table.processExecutor(), ...noHold });
    expect(b).toEqual({ ran: false });
    expect(late).not.toHaveBeenCalled();

    hold.resolve();
    // The reported time is the job's own, not the hold.
    expect(await a).toEqual({ ran: true, ms: 200 });
  });

  it('a SLOW run is not held any longer', async () => {
    const table = lockTable();
    const sleep = vi.fn(async () => {});
    const clock = [0, JOB_LOCK_MIN_HOLD_MS + 5_000];

    await runExclusive('weekly-payout', async () => {}, {
      executor: table.processExecutor(),
      sleep,
      now: () => clock.shift() ?? 0,
    });

    expect(sleep).not.toHaveBeenCalled();
  });

  it('a failing job still spends the tick, then its error reaches the scheduler', async () => {
    const table = lockTable();
    const sleep = vi.fn(async () => {});
    const boom = new Error('job broke');

    await expect(
      runExclusive(
        'subscription-invoice',
        async () => {
          throw boom;
        },
        { executor: table.processExecutor(), sleep, now: () => 0 },
      ),
    ).rejects.toBe(boom);

    expect(sleep).toHaveBeenCalledWith(JOB_LOCK_MIN_HOLD_MS);
    expect(table.held.size).toBe(0);
  });

  it('a job that finished is reported as run even if its lock connection then closed badly', async () => {
    const executor: JobLockExecutor = {
      async inTransaction<T>(body: (tryLock: (key: string) => Promise<boolean>) => Promise<T>): Promise<T> {
        await body(async () => true);
        throw new Error('Connection terminated'); // the COMMIT never answered
      },
    };
    const work = vi.fn(async () => {});

    const outcome = await runExclusive('auto-charge', work, { executor, ...noHold });

    expect(outcome).toMatchObject({ ran: true });
    expect(work).toHaveBeenCalledTimes(1);
    expect(h.warn).toHaveBeenCalledTimes(1);
  });

  it('a HUNG job is abandoned at the deadline, so its lock is released (security review, 29 Sep)', async () => {
    const table = lockTable();
    // Never settles — an await on a call that never answers.
    const hung = vi.fn(() => new Promise<void>(() => {}));

    await expect(
      runExclusive('weekly-payout', hung, {
        executor: table.processExecutor(),
        ...noHold,
        maxRunMs: 20,
      }),
    ).rejects.toThrow(/weekly-payout: still running after .* abandoned so its lock is released/);

    // The transaction ended with the throw, taking the lock: the next tick runs.
    expect(table.held.size).toBe(0);
    const next = vi.fn(async () => {});
    await runExclusive('weekly-payout', next, { executor: table.processExecutor(), ...noHold });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('a job that settles in time is not touched by the deadline', async () => {
    const table = lockTable();
    const work = vi.fn(async () => {});

    const outcome = await runExclusive('no-show-sweep', work, {
      executor: table.processExecutor(),
      ...noHold,
      maxRunMs: JOB_LOCK_MAX_RUN_MS,
    });

    expect(outcome).toMatchObject({ ran: true });
    expect(JOB_LOCK_MAX_RUN_MS).toBe(30 * 60_000);
  });

  it('when the lock cannot even be asked for, nothing runs and the error is thrown', async () => {
    const executor: JobLockExecutor = {
      async inTransaction<T>(body: (tryLock: (key: string) => Promise<boolean>) => Promise<T>): Promise<T> {
        return body(async () => {
          throw new Error('database unreachable');
        });
      },
    };
    const work = vi.fn(async () => {});

    await expect(runExclusive('agency-tier', work, { executor, ...noHold })).rejects.toThrow(/unreachable/);
    expect(work).not.toHaveBeenCalled();
  });
});

describe('dbJobLockExecutor — the SQL it sends', () => {
  const dialect = new PgDialect();

  it('asks pg_try_advisory_xact_lock for the job’s own key, inside the transaction', async () => {
    const got = await dbJobLockExecutor.inTransaction((tryLock) => tryLock(jobLockKey('weekly-payout')));

    expect(got).toBe(true);
    const q = dialect.sqlToQuery(h.executed[0] as SQL);
    expect(q.sql).toContain('pg_try_advisory_xact_lock(hashtextextended($1, 0))');
    expect(q.params).toEqual(['scheduler-job:weekly-payout']);
  });

  it('reads a refused lock as false', async () => {
    h.lockAnswer = false;
    expect(await dbJobLockExecutor.inTransaction((tryLock) => tryLock('scheduler-job:x'))).toBe(false);
  });
});

describe('SchedulerClass.runNow — every tick goes through the lock', () => {
  const job = (run: () => Promise<void>) => ({ name: 'weekly-payout', schedule: '0 2 * * 0', run });

  it('runs the job when this process wins the lock', async () => {
    const run = vi.fn(async () => {});
    const scheduler = new SchedulerClass({ executor: lockTable().processExecutor(), ...noHold });
    scheduler.register(job(run));

    await scheduler.runNow('weekly-payout');

    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does NOT run it while another process holds the tick', async () => {
    const table = lockTable();
    table.held.add(jobLockKey('weekly-payout')); // the other backend is mid-run
    const run = vi.fn(async () => {});
    const scheduler = new SchedulerClass({ executor: table.processExecutor(), ...noHold });
    scheduler.register(job(run));

    await scheduler.runNow('weekly-payout');

    expect(run).not.toHaveBeenCalled();
    expect(h.error).not.toHaveBeenCalled();
  });

  it('a failing job is still logged, never thrown into the cron tick', async () => {
    const scheduler = new SchedulerClass({ executor: lockTable().processExecutor(), ...noHold });
    scheduler.register(
      job(async () => {
        throw new Error('job broke');
      }),
    );

    await expect(scheduler.runNow('weekly-payout')).resolves.toBeUndefined();
    expect(h.error).toHaveBeenCalledTimes(1);
  });
});
