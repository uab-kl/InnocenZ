import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A special event's own price list (`shift_drink_menu`, 0167) is written in the
 * SAME transaction as its shift, replaced wholesale on an edit, and read back
 * grouped per shift — against a recording fake of drizzle's builder, so nothing
 * here can reach the shared database. What matters is WHAT is written together
 * and on WHICH client; the SQL itself is drizzle's job.
 */
type Op = {
  client: 'db' | 'tx';
  op: 'insert' | 'delete' | 'update' | 'select';
  table: unknown;
  values?: unknown;
};

const fake = vi.hoisted(() => {
  const state = {
    ops: [] as Op[],
    /** Rows each successive `.returning()` resolves to. */
    returning: [] as unknown[][],
    selectRows: [] as unknown[],
    committed: false,
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
    update: (table: unknown) => ({
      set: (values: unknown) => ({
        where: () => {
          state.ops.push({ client, op: 'update', table, values });
          return { returning: async () => state.returning.shift() ?? [] };
        },
      }),
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: () => ({
          orderBy: async () => {
            state.ops.push({ client, op: 'select', table });
            return state.selectRows;
          },
        }),
      }),
    }),
  });
  const db = {
    ...builder('db'),
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const result = await work(builder('tx'));
      state.committed = true;
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

import { ShiftRepositoryClass } from './shift.repository';
import { ShiftAgencyTable, ShiftDrinkMenuTable, ShiftTable } from './shift.model';

const SHIFT = '22222222-2222-4222-8222-222222222222';
const ATLAS = '44444444-4444-4444-8444-444444444444';
const menu = [
  { slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink', sortOrder: 0 },
  { slug: 'tips', name: 'Tips', priceRm: '50.00', category: 'tip', sortOrder: 1 },
];
const onTable = (table: unknown) => fake.state.ops.filter((o) => o.table === table);

beforeEach(() => {
  fake.state.ops = [];
  fake.state.returning = [];
  fake.state.selectRows = [];
  fake.state.committed = false;
});

describe('createWithPayTiers writes the event prices with the shift', () => {
  it('inside the one transaction, each row stamped with the shift and the actor', async () => {
    fake.state.returning.push([{ id: SHIFT, agencyId: ATLAS }]);

    await new ShiftRepositoryClass().createWithPayTiers(
      { agencyId: ATLAS, outletId: 'o-1', shiftDate: '2026-10-10', createdBy: 'u', updatedBy: 'u' },
      undefined,
      'owner-1',
      [ATLAS],
      [],
      menu,
    );

    expect(fake.state.committed).toBe(true);
    // Every write went through the transaction — none on the bare client.
    expect(fake.state.ops.every((o) => o.client === 'tx')).toBe(true);
    expect(onTable(ShiftTable).map((o) => o.op)).toEqual(['insert']);
    expect(onTable(ShiftAgencyTable).map((o) => o.op)).toEqual(['insert']);
    expect(onTable(ShiftDrinkMenuTable).map((o) => o.op)).toEqual(['delete', 'insert']);
    expect(onTable(ShiftDrinkMenuTable)[1]?.values).toEqual(
      menu.map((row) => ({ ...row, shiftId: SHIFT, createdBy: 'owner-1', updatedBy: 'owner-1' })),
    );
  });

  it('writes nothing to the event table when the post carries no list', async () => {
    fake.state.returning.push([{ id: SHIFT, agencyId: ATLAS }]);

    await new ShiftRepositoryClass().createWithPayTiers(
      { agencyId: ATLAS, outletId: 'o-1', shiftDate: '2026-10-10', createdBy: 'u', updatedBy: 'u' },
      undefined,
      'owner-1',
      [ATLAS],
    );

    expect(onTable(ShiftDrinkMenuTable)).toEqual([]);
  });
});

describe('updateWithPayTiers replaces the event prices with the edit', () => {
  it('an empty list clears them — a delete and no insert, in the transaction', async () => {
    fake.state.returning.push([{ id: SHIFT }]);

    await new ShiftRepositoryClass().updateWithPayTiers(
      SHIFT,
      { eventKind: 'normal', specialEventType: null, customSpecialEventName: null },
      undefined,
      'owner-1',
      undefined,
      [],
    );

    expect(fake.state.committed).toBe(true);
    expect(onTable(ShiftDrinkMenuTable)).toEqual([
      { client: 'tx', op: 'delete', table: ShiftDrinkMenuTable },
    ]);
    // The type columns ride the shift's own UPDATE, not a second statement.
    expect(onTable(ShiftTable)[0]?.values).toMatchObject({
      specialEventType: null,
      customSpecialEventName: null,
    });
  });

  it('an absent list leaves the stored rows alone', async () => {
    fake.state.returning.push([{ id: SHIFT }]);

    await new ShiftRepositoryClass().updateWithPayTiers(SHIFT, { quantity: 5 }, undefined, 'owner-1');

    expect(onTable(ShiftDrinkMenuTable)).toEqual([]);
  });

  it('writes no prices for a shift that no longer exists', async () => {
    fake.state.returning.push([]);

    const shift = await new ShiftRepositoryClass().updateWithPayTiers(
      SHIFT,
      { quantity: 5 },
      undefined,
      'owner-1',
      undefined,
      menu,
    );

    expect(shift).toBeNull();
    expect(onTable(ShiftDrinkMenuTable)).toEqual([]);
  });
});

describe('listEventDrinkMenuForShifts', () => {
  it('asks nothing for an empty page', async () => {
    expect(await new ShiftRepositoryClass().listEventDrinkMenuForShifts([])).toEqual(new Map());
    expect(fake.state.ops).toEqual([]);
  });

  it('groups the rows by shift, keeping their order', async () => {
    const OTHER = '55555555-5555-4555-8555-555555555555';
    fake.state.selectRows = [
      { id: 'r1', shiftId: SHIFT, slug: 'cosmo', sortOrder: 0 },
      { id: 'r2', shiftId: OTHER, slug: 'havoc', sortOrder: 0 },
      { id: 'r3', shiftId: SHIFT, slug: 'tips', sortOrder: 1 },
    ];

    const byShift = await new ShiftRepositoryClass().listEventDrinkMenuForShifts([SHIFT, OTHER]);

    expect(byShift.get(SHIFT)?.map((r) => r.slug)).toEqual(['cosmo', 'tips']);
    expect(byShift.get(OTHER)?.map((r) => r.slug)).toEqual(['havoc']);
  });
});
