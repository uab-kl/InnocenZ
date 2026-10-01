import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE WRITE GUARD'S SEAM — `shift-write-guard.ts` and the repository writes that
 * run it (30 Sep 2026).
 *
 *  - the lock: one per DISTINCT venue, sorted, a bound parameter in the SQL;
 *  - the guard: every venue locked before the first re-check, the re-checks in
 *    order, and the first refusal thrown with its position;
 *  - the repository: the guard runs INSIDE the write's transaction, on its
 *    client, before the first row — and its refusal rolls the write back and is
 *    re-thrown as the caller's answer, never logged as a fault.
 *
 * The database is a recording fake: nothing here can reach the shared one.
 */

type Op = { client: 'db' | 'tx'; op: string; table?: unknown };

const fake = vi.hoisted(() => {
  const state = { ops: [] as Op[], transactions: 0, commits: 0, nextId: 0 };
  const client = (name: 'db' | 'tx') => ({
    execute: async () => {
      state.ops.push({ client: name, op: 'execute' });
    },
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          state.ops.push({ client: name, op: 'select', table });
          return [];
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.ops.push({ client: name, op: 'insert', table });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [{ id: `s-${(state.nextId += 1)}`, ...values }],
          onConflictDoNothing: async () => undefined,
        });
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        state.ops.push({ client: name, op: 'delete', table });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.ops.push({ client: name, op: 'update', table });
            return [{ id: 's-edited', ...values }];
          },
        }),
      }),
    }),
  });
  const tx = client('tx');
  const db = {
    ...client('db'),
    // A real transaction rolls back when `work` throws; the fake records
    // whether the commit would have been reached at all.
    transaction: async <T>(work: (t: unknown) => Promise<T>): Promise<T> => {
      state.transactions += 1;
      const result = await work(tx);
      state.commits += 1;
      return result;
    },
  };
  return { state, tx, db };
});
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({ logger }));

import type { DbTransaction } from '@/types/db-transaction';
import { ShiftRepositoryClass, type ShiftPostWrite } from './shift.repository';
import { ShiftTable } from './shift.model';
import {
  lockPrBookings,
  lockShiftSeats,
  lockVenueShiftWrites,
  ShiftWriteRefused,
  venueWriteGuard,
  writeUnlessRefused,
  type VenueRecheck,
} from './shift-write-guard';

const VENUE_A = '11111111-1111-4111-8111-111111111111';
const VENUE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ATLAS = '44444444-4444-4444-8444-444444444444';
const LOCK_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

/** A transaction that records the statements it is sent, rendered. */
function recordingTx(log: string[]) {
  const executed: unknown[] = [];
  const tx = {
    execute: async (query: unknown) => {
      executed.push(query);
      log.push('lock');
    },
  } as unknown as DbTransaction;
  return { tx, executed };
}

beforeEach(() => {
  fake.state.ops = [];
  fake.state.transactions = 0;
  fake.state.commits = 0;
  fake.state.nextId = 0;
  logger.error.mockClear();
});

describe('lockVenueShiftWrites', () => {
  it('takes one lock per DISTINCT venue, in sorted order, keyed by a bound parameter', async () => {
    const { tx, executed } = recordingTx([]);

    // B first, A twice, and B again in capitals — Postgres reads that uuid as B.
    await lockVenueShiftWrites(tx, [VENUE_B, VENUE_A, VENUE_B.toUpperCase(), VENUE_A]);

    const rendered = executed.map(render);
    expect(rendered.map((q) => q.sql)).toEqual([LOCK_SQL, LOCK_SQL]);
    expect(rendered.map((q) => q.params)).toEqual([
      [`shift-post:${VENUE_A}`],
      [`shift-post:${VENUE_B}`],
    ]);
  });

  it('two writers naming the same venues in opposite orders lock them in the same order', async () => {
    const first = recordingTx([]);
    const second = recordingTx([]);

    await lockVenueShiftWrites(first.tx, [VENUE_A, VENUE_B]);
    await lockVenueShiftWrites(second.tx, [VENUE_B, VENUE_A]);

    expect(second.executed.map(render)).toEqual(first.executed.map(render));
  });
});

describe('the one lock order — venue, then shift, then PR', () => {
  const SHIFT_1 = '33333333-3333-4333-8333-333333333333';
  const SHIFT_2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const PR_A = '66666666-6666-4666-8666-666666666666';
  const PR_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  it('each class locks its own key — distinct, lower-cased, sorted, a bound parameter', async () => {
    const { tx, executed } = recordingTx([]);

    await lockVenueShiftWrites(tx, [VENUE_B, VENUE_A]);
    await lockShiftSeats(tx, [SHIFT_2, SHIFT_1.toUpperCase(), SHIFT_1]);
    await lockPrBookings(tx, [PR_B, PR_A, PR_B]);

    const rendered = executed.map(render);
    expect(new Set(rendered.map((q) => q.sql))).toEqual(new Set([LOCK_SQL]));
    expect(rendered.map((q) => q.params)).toEqual([
      [`shift-post:${VENUE_A}`],
      [`shift-post:${VENUE_B}`],
      [`shift-seat:${SHIFT_1}`],
      [`shift-seat:${SHIFT_2}`],
      [`pr-booking:${PR_A}`],
      [`pr-booking:${PR_B}`],
    ]);
  });

  it.each([
    ['a venue lock after a PR lock', lockPrBookings, lockVenueShiftWrites],
    ['a venue lock after a shift lock', lockShiftSeats, lockVenueShiftWrites],
    ['a shift lock after a PR lock', lockPrBookings, lockShiftSeats],
    ['the same class twice', lockPrBookings, lockPrBookings],
  ])('refuses %s — before it sends anything that could deadlock', async (_label, first, second) => {
    const { tx, executed } = recordingTx([]);
    await first(tx, [PR_A]);

    await expect(second(tx, [VENUE_A])).rejects.toThrow(/Lock order broken/);
    // Only the first class's lock ever reached the database.
    expect(executed).toHaveLength(1);
  });

  it('a class may be skipped, and a new transaction starts the order over', async () => {
    const first = recordingTx([]);
    await lockVenueShiftWrites(first.tx, [VENUE_A]);
    await lockPrBookings(first.tx, [PR_A]);

    const second = recordingTx([]);
    await expect(lockVenueShiftWrites(second.tx, [VENUE_A])).resolves.toBeUndefined();
    expect(second.executed).toHaveLength(1);
  });
});

describe('venueWriteGuard', () => {
  it('locks every venue before the first re-check, and hands each re-check the transaction', async () => {
    const log: string[] = [];
    const { tx } = recordingTx(log);
    const seen: unknown[] = [];
    const recheck = (name: string): VenueRecheck => async (client) => {
      seen.push(client);
      log.push(name);
      return null;
    };

    await venueWriteGuard([VENUE_A, VENUE_B], [recheck('first'), recheck('second')])(tx);

    expect(log).toEqual(['lock', 'lock', 'first', 'second']);
    expect(seen).toEqual([tx, tx]);
  });

  it('the first refusal is thrown with its sentence, status and position; later shifts are not asked', async () => {
    const { tx } = recordingTx([]);
    const third = vi.fn(async () => null);

    const guard = venueWriteGuard(
      [VENUE_A],
      [async () => null, async () => ({ status: 409, message: 'Clash on the second' }), third],
    );
    const refusal = await guard(tx).then(
      () => null,
      (error: unknown) => error,
    );

    expect(refusal).toBeInstanceOf(ShiftWriteRefused);
    expect(refusal).toMatchObject({ status: 409, message: 'Clash on the second', index: 1 });
    expect(third).not.toHaveBeenCalled();
  });
});

describe('writeUnlessRefused', () => {
  it('passes a written value through', async () => {
    await expect(writeUnlessRefused(Promise.resolve('row'))).resolves.toEqual({
      ok: true,
      written: 'row',
    });
  });

  it('turns the guard’s refusal into an answer', async () => {
    const refused = new ShiftWriteRefused(409, 'Over the plan', 2);
    await expect(writeUnlessRefused(Promise.reject(refused))).resolves.toEqual({
      ok: false,
      refused,
    });
  });

  it('still throws anything else — a real failure stays a 500', async () => {
    await expect(writeUnlessRefused(Promise.reject(new Error('connection reset')))).rejects.toThrow(
      'connection reset',
    );
  });
});

function post(shiftDate: string): ShiftPostWrite {
  return {
    data: {
      agencyId: ATLAS,
      outletId: VENUE_A,
      shiftDate,
      status: 'confirmed',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    },
    agencyIds: [ATLAS],
    requestedPrs: [],
  };
}

/** A guard that records when it ran, on which client, and optionally refuses. */
function spyGuard(refuse?: ShiftWriteRefused) {
  return vi.fn(async (tx: DbTransaction) => {
    fake.state.ops.push({ client: tx === (fake.tx as unknown) ? 'tx' : 'db', op: 'guard' });
    if (refuse) throw refuse;
  });
}

describe('the repository runs the guard first, inside the write', () => {
  it('a single post: the guard, on the transaction, before the shift row', async () => {
    const guard = spyGuard();
    const repository = new ShiftRepositoryClass();

    await repository.createWithPayTiers(
      post('2026-10-10').data,
      undefined,
      'owner-1',
      [ATLAS],
      [],
      undefined,
      guard,
    );

    expect(guard).toHaveBeenCalledWith(fake.tx);
    expect(fake.state.ops.map((o) => `${o.client}:${o.op}`)).toEqual([
      'tx:guard',
      'tx:insert',
      'tx:insert',
    ]);
    expect(fake.state.commits).toBe(1);
  });

  it('a batch: the guard once, before the FIRST shift of the batch', async () => {
    const guard = spyGuard();

    await new ShiftRepositoryClass().createManyWithPayTiers(
      [post('2026-10-10'), post('2026-10-11')],
      'owner-1',
      guard,
    );

    expect(guard).toHaveBeenCalledTimes(1);
    expect(fake.state.ops[0]).toEqual({ client: 'tx', op: 'guard' });
    expect(fake.state.ops.filter((o) => o.table === ShiftTable)).toHaveLength(2);
  });

  it('an edit: the guard before the UPDATE', async () => {
    const guard = spyGuard();

    await new ShiftRepositoryClass().updateWithPayTiers(
      's-1',
      { quantity: 5 },
      undefined,
      'owner-1',
      undefined,
      undefined,
      guard,
    );

    expect(fake.state.ops.map((o) => `${o.client}:${o.op}`)).toEqual(['tx:guard', 'tx:update']);
  });

  it.each([
    [
      'single post',
      (r: ShiftRepositoryClass, g: ReturnType<typeof spyGuard>) =>
        r.createWithPayTiers(post('2026-10-10').data, undefined, 'owner-1', [ATLAS], [], undefined, g),
    ],
    [
      'batch',
      (r: ShiftRepositoryClass, g: ReturnType<typeof spyGuard>) =>
        r.createManyWithPayTiers([post('2026-10-10'), post('2026-10-11')], 'owner-1', g),
    ],
    [
      'edit',
      (r: ShiftRepositoryClass, g: ReturnType<typeof spyGuard>) =>
        r.updateWithPayTiers('s-1', { quantity: 5 }, undefined, 'owner-1', undefined, undefined, g),
    ],
  ])('%s: a refusal writes nothing, never commits, and comes back as itself, unlogged', async (_label, write) => {
    const refused = new ShiftWriteRefused(409, 'Landed first', 0);

    const error = await write(new ShiftRepositoryClass(), spyGuard(refused)).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(error).toBe(refused);
    expect(fake.state.ops.map((o) => o.op)).toEqual(['guard']);
    expect(fake.state.commits).toBe(0);
    // An answer, not a fault — the assignment side treats `ShiftFullError` the same way.
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('a real failure inside the write is still logged as one', async () => {
    const guard = vi.fn(async () => {
      throw new Error('connection reset');
    });

    await expect(
      new ShiftRepositoryClass().createManyWithPayTiers([post('2026-10-10')], 'owner-1', guard),
    ).rejects.toThrow('connection reset');
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('without a guard, nothing changes: no lock, no extra read, the same rows', async () => {
    await new ShiftRepositoryClass().createWithPayTiers(
      post('2026-10-10').data,
      undefined,
      'owner-1',
      [ATLAS],
    );

    expect(fake.state.ops.map((o) => `${o.client}:${o.op}`)).toEqual(['tx:insert', 'tx:insert']);
  });
});

describe('listByOutletAroundDate reads through the client it is handed', () => {
  const day = { outletId: VENUE_A, shiftDate: '2026-10-10' };

  it('the pool by default — every existing caller unchanged', async () => {
    await new ShiftRepositoryClass().listByOutletAroundDate(day);
    expect(fake.state.ops).toEqual([{ client: 'db', op: 'select', table: ShiftTable }]);
  });

  it('the write guard’s transaction when given one', async () => {
    await new ShiftRepositoryClass().listByOutletAroundDate(day, fake.tx as unknown as DbTransaction);
    expect(fake.state.ops).toEqual([{ client: 'tx', op: 'select', table: ShiftTable }]);
  });
});
