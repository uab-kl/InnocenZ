import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE TWO WRITES THE BELL NOW DEPENDS ON — `notification.repository.ts`.
 *
 *  - `createUnlessRepeat`: a notice identical to the recipient's latest one,
 *    raised inside the window, is NOT written again — and with no caller
 *    transaction the check and the insert share one, behind a lock on the
 *    recipient, so two backends running the same job cannot both write.
 *  - `markAllRead`: every unread row of ONE user, scoped in the WHERE.
 *
 * The database is faked: no row is read or written by this file.
 */

const h = vi.hoisted(() => {
  const state = {
    /** What the "latest notice inside the window" query answers. */
    latest: [] as Record<string, unknown>[],
    inserted: [] as Record<string, unknown>[],
    executed: [] as unknown[],
    selectWhere: [] as unknown[],
    updateWhere: [] as unknown[],
    updateSet: [] as unknown[],
    updatedRows: [] as { id: string }[],
    transactions: 0,
    failInsert: false,
  };
  const tx = {
    execute: async (query: unknown) => {
      state.executed.push(query);
    },
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          state.selectWhere.push(where);
          return { orderBy: () => ({ limit: async () => state.latest }) };
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          if (state.failInsert) throw new Error('insert refused');
          state.inserted.push(values);
          return [{ id: 'new-row', ...values }];
        },
      }),
    }),
  };
  return { state, tx };
});

vi.mock('@/db/index.js', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      h.state.transactions += 1;
      return cb(h.tx);
    },
    update: () => ({
      set: (values: unknown) => {
        h.state.updateSet.push(values);
        return {
          where: (where: unknown) => {
            h.state.updateWhere.push(where);
            return { returning: async () => h.state.updatedRows };
          },
        };
      },
    }),
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { NotificationRepositoryClass } from './notification.repository';
import type { NotificationInsertType } from './notification.model';

const dialect = new PgDialect();
const render = (query: unknown) => dialect.sqlToQuery(query as SQL);

const NOTICE: NotificationInsertType = {
  userId: 'user-1',
  kind: 'pv_day_review_pending',
  title: '1 voucher held for review',
  body: 'Approve each day on Payroll & PV, then send.',
  payload: { weekStart: '2026-09-06', weekEnd: '2026-09-12', voucherIds: ['v1'] },
  createdBy: 'weekly-payout',
  updatedBy: 'weekly-payout',
};

const repository = new NotificationRepositoryClass();

beforeEach(() => {
  h.state.latest = [];
  h.state.inserted = [];
  h.state.executed = [];
  h.state.selectWhere = [];
  h.state.updateWhere = [];
  h.state.updateSet = [];
  h.state.updatedRows = [];
  h.state.transactions = 0;
  h.state.failInsert = false;
});

describe('createUnlessRepeat', () => {
  it('THE 13 SEP DUPLICATE: the same notice again inside the window is not written — the first row comes back', async () => {
    const first = { id: 'first-row', ...NOTICE, createdAt: new Date() };
    h.state.latest = [{ ...first, payload: { voucherIds: ['v1'], weekEnd: '2026-09-12', weekStart: '2026-09-06' } }];

    const row = await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });

    expect(h.state.inserted).toEqual([]);
    expect(row?.id).toBe('first-row');
  });

  it('the same notice after the first was READ is written — it is a new call to act', async () => {
    h.state.latest = [{ id: 'first-row', ...NOTICE, readAt: new Date() }];

    const row = await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });

    expect(h.state.inserted).toHaveLength(1);
    expect(row?.id).toBe('new-row');
  });

  it('a notice the recipient has not just been given IS written', async () => {
    h.state.latest = [{ id: 'other', ...NOTICE, kind: 'leave_requested', title: 'MC / leave request' }];

    const row = await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });

    expect(h.state.inserted).toHaveLength(1);
    expect(row?.id).toBe('new-row');
  });

  it('nothing recent at all: written', async () => {
    await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });
    expect(h.state.inserted).toHaveLength(1);
  });

  it('with NO caller transaction: its own transaction, and the recipient is locked before the read', async () => {
    await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });

    expect(h.state.transactions).toBe(1);
    expect(h.state.executed).toHaveLength(1);
    const lock = render(h.state.executed[0]);
    expect(lock.sql).toContain('pg_advisory_xact_lock');
    expect(lock.params).toEqual(['notification:user-1']);
  });

  it('with a caller transaction: that one is used, and NO lock is taken (a lock per recipient could deadlock a caller notifying several)', async () => {
    const callerTx = h.tx as never;
    await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000, tx: callerTx });

    expect(h.state.transactions).toBe(0);
    expect(h.state.executed).toEqual([]);
    expect(h.state.inserted).toHaveLength(1);
  });

  it('the read is THIS recipient\'s, inside the window, measured on the database clock', async () => {
    await repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 });

    const where = render(h.state.selectWhere[0]);
    expect(where.sql).toContain('"user_id" = $1');
    expect(where.sql).toContain('now() - make_interval(secs => $2)');
    expect(where.params).toEqual(['user-1', 120]);
  });

  it('a failed write answers null rather than throwing — a notice must not fail its event', async () => {
    h.state.failInsert = true;
    await expect(repository.createUnlessRepeat(NOTICE, { windowMs: 120_000 })).resolves.toBeNull();
  });
});

describe('markAllRead', () => {
  it('marks every unread row of the caller and says how many', async () => {
    h.state.updatedRows = Array.from({ length: 64 }, (_, i) => ({ id: `n${i}` }));

    await expect(repository.markAllRead('user-1')).resolves.toBe(64);

    const where = render(h.state.updateWhere[0]);
    expect(where.sql).toContain('"user_id" = $1');
    expect(where.sql).toContain('"read_at" is null');
    expect(where.params).toEqual(['user-1']);
    expect(h.state.updateSet[0]).toMatchObject({ updatedBy: 'user-1' });
  });

  it('nothing unread is 0, not an error', async () => {
    await expect(repository.markAllRead('user-1')).resolves.toBe(0);
  });
});
