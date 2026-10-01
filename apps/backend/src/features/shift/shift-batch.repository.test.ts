import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `createManyWithPayTiers` — Post Job's batch — writes every shift, and all of
 * each shift's child rows, inside ONE transaction, through the very insert path
 * a single post uses. Against a recording fake of drizzle's builder, so nothing
 * here can reach the shared database: what matters is WHAT is written, on WHICH
 * client, and that a failure part-way never reaches the commit.
 */
type Op = {
  client: 'db' | 'tx';
  op: 'insert' | 'delete';
  table: unknown;
  values?: unknown;
};

const fake = vi.hoisted(() => {
  const state = {
    ops: [] as Op[],
    /** Rows each successive `.returning()` resolves to. */
    returning: [] as unknown[][],
    transactions: 0,
    commits: 0,
  };
  const builder = (client: 'db' | 'tx') => ({
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        state.ops.push({ client, op: 'insert', table, values });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => state.returning.shift() ?? [],
          onConflictDoNothing: async () => undefined,
        });
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        state.ops.push({ client, op: 'delete', table });
      },
    }),
  });
  const db = {
    ...builder('db'),
    // A real transaction rolls back when `work` throws; the fake records whether
    // the commit would have been reached at all.
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      state.transactions += 1;
      const result = await work(builder('tx'));
      state.commits += 1;
      return result;
    },
  };
  return { state, db };
});

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ShiftRepositoryClass, type ShiftPostWrite } from './shift.repository';
import {
  ShiftAgencyTable,
  ShiftDrinkMenuTable,
  ShiftPayTierTable,
  ShiftPrRequestTable,
  ShiftTable,
} from './shift.model';

const ATLAS = '44444444-4444-4444-8444-444444444444';
const WWM = '55555555-5555-4555-8555-555555555555';
const VICKY = '66666666-6666-4666-8666-666666666666';

const tier = {
  kind: 'tier' as const,
  tier: 'Tier I',
  wagePerHour: '60.00',
  drinkPct: '10.00',
  happyHourDrinkPct: null,
  tipPct: '5.00',
  otAfterHours: null,
  targetSalesRm: null,
  prCount: 2,
  sortOrder: 0,
};
const menu = [{ slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink', sortOrder: 0 }];

function post(shiftDate: string, extra: Partial<ShiftPostWrite> = {}): ShiftPostWrite {
  return {
    data: {
      agencyId: ATLAS,
      outletId: 'o-1',
      shiftDate,
      status: 'confirmed',
      createdBy: 'owner-1',
      updatedBy: 'owner-1',
    },
    payTiers: [tier],
    agencyIds: [ATLAS, WWM],
    requestedPrs: [],
    ...extra,
  };
}

const onTable = (table: unknown) => fake.state.ops.filter((o) => o.table === table);

beforeEach(() => {
  fake.state.ops = [];
  fake.state.returning = [];
  fake.state.transactions = 0;
  fake.state.commits = 0;
});

describe('createManyWithPayTiers', () => {
  it('writes every shift and its child rows inside ONE transaction, and returns them in order', async () => {
    fake.state.returning.push([{ id: 's-1', agencyId: ATLAS }], [{ id: 's-2', agencyId: ATLAS }], [
      { id: 's-3', agencyId: ATLAS },
    ]);

    const shifts = await new ShiftRepositoryClass().createManyWithPayTiers(
      [
        post('2026-10-10'),
        post('2026-10-11', { requestedPrs: [{ userId: VICKY, agencyId: WWM }] }),
        post('2026-10-12', { eventDrinkMenu: menu }),
      ],
      'owner-1',
    );

    expect(shifts.map((s) => s.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(fake.state.transactions).toBe(1);
    expect(fake.state.commits).toBe(1);
    // Nothing on the bare client — every write rode the one transaction.
    expect(fake.state.ops.every((o) => o.client === 'tx')).toBe(true);
    expect(onTable(ShiftTable).map((o) => (o.values as { shiftDate: string }).shiftDate)).toEqual([
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
    ]);
    // Each shift fanned out to both invited agencies, stamped with its own id.
    expect(onTable(ShiftAgencyTable).map((o) => o.values)).toEqual(
      ['s-1', 's-2', 's-3'].map((shiftId) => [
        { shiftId, agencyId: ATLAS, createdBy: 'owner-1', updatedBy: 'owner-1' },
        { shiftId, agencyId: WWM, createdBy: 'owner-1', updatedBy: 'owner-1' },
      ]),
    );
    expect(onTable(ShiftPayTierTable).filter((o) => o.op === 'insert')).toHaveLength(3);
    // The named pick and the event prices land on THEIR shift only.
    expect(onTable(ShiftPrRequestTable).map((o) => o.values)).toEqual([
      [{ shiftId: 's-2', userId: VICKY, agencyId: WWM, createdBy: 'owner-1', updatedBy: 'owner-1' }],
    ]);
    expect(onTable(ShiftDrinkMenuTable).filter((o) => o.op === 'insert').map((o) => o.values)).toEqual([
      menu.map((row) => ({ ...row, shiftId: 's-3', createdBy: 'owner-1', updatedBy: 'owner-1' })),
    ]);
  });

  it('a failure on a later shift never reaches the commit — the earlier ones roll back with it', async () => {
    // The second shift's INSERT … RETURNING comes back empty, so its write throws.
    fake.state.returning.push([{ id: 's-1', agencyId: ATLAS }]);

    await expect(
      new ShiftRepositoryClass().createManyWithPayTiers(
        [post('2026-10-10'), post('2026-10-11'), post('2026-10-12')],
        'owner-1',
      ),
    ).rejects.toThrow();

    expect(fake.state.transactions).toBe(1);
    expect(fake.state.commits).toBe(0);
    // It stopped at the failure: the third shift was never even attempted.
    expect(onTable(ShiftTable)).toHaveLength(2);
    expect(fake.state.ops.every((o) => o.client === 'tx')).toBe(true);
  });
});

describe('one insert path', () => {
  it('a single post writes exactly what the same shift writes as a batch of one', async () => {
    const one = post('2026-10-10', {
      requestedPrs: [{ userId: VICKY, agencyId: ATLAS }],
      eventDrinkMenu: menu,
    });

    fake.state.returning.push([{ id: 's-1', agencyId: ATLAS }]);
    await new ShiftRepositoryClass().createWithPayTiers(
      one.data,
      one.payTiers,
      'owner-1',
      one.agencyIds,
      one.requestedPrs,
      one.eventDrinkMenu,
    );
    const single = fake.state.ops;

    fake.state.ops = [];
    fake.state.returning.push([{ id: 's-1', agencyId: ATLAS }]);
    await new ShiftRepositoryClass().createManyWithPayTiers([one], 'owner-1');

    expect(fake.state.ops).toEqual(single);
    expect(fake.state.transactions).toBe(2);
  });
});
