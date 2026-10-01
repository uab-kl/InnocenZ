import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE SEAMS THE SEATING GUARDS RUN THROUGH (30 Sep 2026), against a recording
 * fake of drizzle's builder — nothing here can reach the shared database:
 *
 *  - the reads a guard makes go through the client they are handed, and
 *    through the pool when handed none (every existing caller unchanged);
 *  - `create`, `updateIfSeatFree` and swap `approve` run the guard FIRST, before
 *    any row lock — the one lock order — and its refusal rolls the write back,
 *    comes out as itself, and is never logged as a fault.
 */
type Op = { client: 'db' | 'tx'; op: string };

const fake = vi.hoisted(() => {
  const state = { ops: [] as Op[] };
  const chain = (name: 'db' | 'tx') => {
    let forUpdate = false;
    const c = {
      from: () => c,
      where: () => c,
      limit: () => c,
      orderBy: () => c,
      innerJoin: () => c,
      leftJoin: () => c,
      for: () => {
        forUpdate = true;
        return c;
      },
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => {
            state.ops.push({ client: name, op: forUpdate ? 'select-for-update' : 'select' });
            return [];
          })
          .then(resolve, reject),
    };
    return c;
  };
  const client = (name: 'db' | 'tx') => ({
    name,
    select: () => chain(name),
    execute: async () => {
      state.ops.push({ client: name, op: 'execute' });
    },
  });
  const db = {
    ...client('db'),
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(client('tx')),
  };
  return { state, db, client };
});
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({ logger }));

import type { DbTransaction } from '@/types/db-transaction';
import { OutletSwapRepositoryClass } from '@/features/outlet-swap/outlet-swap.repository';
import { ShiftWriteRefused } from '@/features/shift/shift-write-guard';
import { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';

const tx = () => fake.client('tx') as unknown as DbTransaction;
const ops = () => fake.state.ops.map((o) => `${o.client}:${o.op}`);

beforeEach(() => {
  fake.state.ops = [];
  logger.error.mockClear();
});

describe('the reads a guard makes go through the client it is handed', () => {
  const assignments = new ShiftAssignmentRepositoryClass();
  it.each([
    ['listForPr', (c?: DbTransaction) => assignments.listForPr('pr-1', c)],
    ['listByShift', (c?: DbTransaction) => assignments.listByShift('shift-1', c)],
    ['getOutletPin', (c?: DbTransaction) => assignments.getOutletPin('outlet-1', c)],
    ['shift getById', (c?: DbTransaction) => new ShiftRepositoryClass().getById('shift-1', c)],
  ])('%s: the pool by default, the transaction when given one', async (_label, read) => {
    await read();
    await read(tx());
    expect(ops()).toEqual(['db:select', 'tx:select']);
  });
});

/** A guard that records when it ran, and on which client; optionally refuses. */
function guard(refusal?: ShiftWriteRefused) {
  return vi.fn(async (client: DbTransaction) => {
    fake.state.ops.push({ client: (client as unknown as { name: 'db' | 'tx' }).name, op: 'guard' });
    if (refusal) throw refusal;
  });
}

describe('each seating write runs its guard first, before any row lock', () => {
  const refused = new ShiftWriteRefused(400, 'Landed first', 0);

  it.each([
    [
      'assign',
      (g: ReturnType<typeof guard>) =>
        new ShiftAssignmentRepositoryClass().create(
          { shiftId: 's-1', prId: 'pr-1', agencyId: 'a-1', status: 'assigned' } as never,
          undefined,
          g,
        ),
    ],
    [
      're-staff',
      (g: ReturnType<typeof guard>) =>
        new ShiftAssignmentRepositoryClass().updateIfSeatFree(
          'as-1',
          { status: 'assigned' },
          { shiftId: 's-1', prId: 'pr-1', agencyId: 'a-1' },
          g,
        ),
    ],
    [
      'swap approve',
      (g: ReturnType<typeof guard>) =>
        new OutletSwapRepositoryClass().approve({ id: 'sw-1', respondedBy: 'pr-1', guard: g }),
    ],
  ])('%s: guard first, and its refusal comes out as itself, unlogged, with nothing locked', async (_label, write) => {
    const error = await write(guard(refused)).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(error).toBe(refused);
    expect(ops()).toEqual(['tx:guard']);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([
    [
      'assign',
      (g: ReturnType<typeof guard>) =>
        new ShiftAssignmentRepositoryClass()
          .create(
            { shiftId: 's-1', prId: 'pr-1', agencyId: 'a-1', status: 'assigned' } as never,
            undefined,
            g,
          )
          .catch(() => undefined),
    ],
    [
      'swap approve',
      (g: ReturnType<typeof guard>) =>
        new OutletSwapRepositoryClass().approve({ id: 'sw-1', respondedBy: 'pr-1', guard: g }),
    ],
  ])('%s: a guard that passes runs before the first row lock', async (_label, write) => {
    await write(guard());

    const all = ops();
    expect(all[0]).toBe('tx:guard');
    expect(all.indexOf('tx:select-for-update')).toBeGreaterThan(0);
  });
});
