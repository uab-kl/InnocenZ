import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SQL } from 'drizzle-orm';

/**
 * Risk #19 — a voucher's header must always balance against its own lines:
 * subtotal = Σ line amounts, net = subtotal − deduction. The payout bank file
 * pays the stored `net`, so a header that drifts from its lines pays a figure
 * nobody added up.
 *
 * Pins, against a recording fake transaction (`@/db/index` is a fake — nothing
 * here can reach the shared database):
 *  - `create()` recomputes from the lines that landed, whatever totals it was
 *    handed, and answers with the stored figures;
 *  - `update()` never writes a sent subtotal/net; a header-only deduction moves
 *    net in the same statement AND recomputes; a line rewrite recomputes;
 *  - a write that moves the money takes the finance signature off, only when
 *    asked to and only when the figures actually changed.
 */
const h = vi.hoisted(() => {
  const state = {
    /** Queued answers for each `select`, in call order. */
    selects: [] as unknown[][],
    /** Every `update().set(values)` in call order. */
    sets: [] as Array<Record<string, unknown>>,
    inserted: [] as Array<Record<string, unknown>>,
    /** The stored row the header `update().returning()` echoes back. */
    row: {} as Record<string, unknown>,
  };
  const rowsThen = (rows: unknown[]) => ({
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    for: async () => rows,
  });
  const tx: Record<string, unknown> = {
    select: () => ({
      from: () => ({
        where: () => rowsThen(state.selects.shift() ?? []),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        state.sets.push(values);
        return {
          where: () => ({
            returning: async () => [{ ...state.row, ...values }],
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve(undefined).then(resolve),
          }),
        };
      },
    }),
    insert: () => ({
      values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => ({
        returning: async () => {
          if (Array.isArray(values)) {
            state.inserted.push(...values);
            return values;
          }
          return [{ id: 'voucher-1', ...values }];
        },
      }),
    }),
    delete: () => ({ where: async () => undefined }),
  };
  // create() opens a SAVEPOINT per voucher-number attempt.
  tx.transaction = async (cb: (t: unknown) => Promise<unknown>) => cb(tx);
  return { state, tx };
});

vi.mock('@/db/index', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx),
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  moneyMoved,
  PaymentVoucherRepositoryClass,
} from './payment-voucher.repository';

const VOUCHER = 'voucher-1';
const SIGNED_AT = new Date('2026-09-20T02:00:00Z');

function stub(repository: PaymentVoucherRepositoryClass, name: string) {
  return vi.spyOn(repository as never, name as never) as unknown as {
    mockResolvedValue(v: unknown): void;
    mockImplementation(fn: (...args: unknown[]) => unknown): void;
  };
}

function repositoryWith(storedLines: Array<Record<string, unknown>> = []) {
  const repository = new PaymentVoucherRepositoryClass();
  stub(repository, 'getLines').mockResolvedValue(storedLines);
  stub(repository, 'assertLinesAgreeWithShifts').mockResolvedValue(undefined);
  stub(repository, 'resolveLineOutletIds').mockImplementation(
    async (_tx, lines) => lines,
  );
  stub(repository, 'nextVoucherNo').mockResolvedValue('PV-000042');
  return repository;
}

/** The locked pre-write read `update()` takes. */
const lockedRow = (over: Record<string, unknown> = {}) => ({
  updatedAt: new Date('2026-09-20T03:00:00Z'),
  status: 'pending_review',
  subtotal: '24.00',
  deduction: '0.00',
  net: '24.00',
  financeHeadSignedAt: null,
  ...over,
});

beforeEach(() => {
  h.state.selects = [];
  h.state.sets = [];
  h.state.inserted = [];
  h.state.row = {
    id: VOUCHER,
    status: 'pending_review',
    subtotal: '24.00',
    deduction: '0.00',
    net: '24.00',
    financeHeadSignedAt: SIGNED_AT,
  };
});

describe('moneyMoved', () => {
  it('compares in cents, so "24.0" and "24.00" are the same money', () => {
    const a = { subtotal: '24.0', deduction: '0', net: '24' };
    const b = { subtotal: '24.00', deduction: '0.00', net: '24.00' };
    expect(moneyMoved(a, b)).toBe(false);
  });

  it('a changed deduction or net is a move', () => {
    const before = { subtotal: '24.00', deduction: '0.00', net: '24.00' };
    expect(moneyMoved(before, { ...before, deduction: '5.00', net: '19.00' })).toBe(true);
    expect(moneyMoved(before, { ...before, subtotal: '30.00', net: '30.00' })).toBe(true);
  });

  it('an unreadable figure counts as moved', () => {
    const before = { subtotal: 'abc', deduction: '0.00', net: '24.00' };
    expect(moneyMoved(before, { subtotal: '24.00', deduction: '0.00', net: '24.00' })).toBe(true);
  });
});

describe('create() — the header comes from the lines that landed', () => {
  it('ignores the totals it was handed and answers with the stored ones', async () => {
    const repository = repositoryWith();
    // recomputeTotals: Σ lines, then the stored deduction.
    h.state.selects.push([{ subtotal: '54.30' }], [{ deduction: '4.30' }]);

    const created = await repository.create(
      {
        agencyId: 'agency-1',
        prName: 'Payee',
        // What a direct API caller could send: a net no line adds up to.
        subtotal: '999.00',
        deduction: '4.30',
        net: '999.00',
        status: 'pending_review',
        createdBy: 'u',
        updatedBy: 'u',
      },
      [
        { description: 'Shift on 2026-09-15', amount: '50.00', quantity: 1 },
        { description: 'Lemon Drop', amount: '4.30', quantity: 1 },
      ],
    );

    const recompute = h.state.sets.at(-1);
    expect(recompute).toMatchObject({ subtotal: '54.30', net: '50.00' });
    expect(created.subtotal).toBe('54.30');
    expect(created.net).toBe('50.00');
    expect(created.deduction).toBe('4.30');
    expect(created.lines).toHaveLength(2);
  });

  it('a voucher with no lines balances at 0 / 0 / 0', async () => {
    const repository = repositoryWith();
    h.state.selects.push([{ subtotal: '0.00' }], [{ deduction: '0.00' }]);

    const created = await repository.create(
      {
        agencyId: 'agency-1',
        prName: 'Payee',
        subtotal: '120.00',
        net: '120.00',
        status: 'pending_review',
        createdBy: 'u',
        updatedBy: 'u',
      },
      [],
    );

    expect(created.subtotal).toBe('0.00');
    expect(created.net).toBe('0.00');
  });
});

describe('update() — subtotal and net are derived, never written as sent', () => {
  it('a header-only deduction moves net in the same statement and recomputes', async () => {
    const repository = repositoryWith([{ amount: '24.00' }]);
    h.state.selects.push(
      [lockedRow()],
      [{ subtotal: '24.00' }],
      [{ deduction: '5.00' }],
    );

    const voucher = await repository.update(
      VOUCHER,
      { deduction: '5.00', updatedBy: 'agency-user' },
      undefined,
      undefined,
      'pending_review',
    );

    const header = h.state.sets[0]!;
    expect(header.deduction).toBe('5.00');
    // `subtotal - deduction` as SQL, so the row never disagrees with itself.
    expect(header.net).toBeInstanceOf(SQL);
    expect(header).not.toHaveProperty('subtotal');
    // …then the recompute from the stored lines.
    expect(h.state.sets[1]).toMatchObject({ subtotal: '24.00', net: '19.00' });
    expect(voucher).toMatchObject({ subtotal: '24.00', deduction: '5.00', net: '19.00' });
  });

  it('a sent subtotal or net alone is not written, and is recomputed over', async () => {
    const repository = repositoryWith([{ amount: '24.00' }]);
    h.state.selects.push([{ subtotal: '24.00' }], [{ deduction: '0.00' }]);

    const voucher = await repository.update(VOUCHER, {
      subtotal: '500.00',
      net: '500.00',
      updatedBy: 'agency-user',
    });

    expect(h.state.sets[0]).not.toHaveProperty('subtotal');
    expect(h.state.sets[0]).not.toHaveProperty('net');
    expect(voucher).toMatchObject({ subtotal: '24.00', net: '24.00' });
  });

  it('a status flip touches no money and runs no recompute', async () => {
    const repository = repositoryWith([{ amount: '24.00' }]);

    await repository.update(VOUCHER, { status: 'disputed', updatedBy: 'pr' });

    expect(h.state.sets).toHaveLength(1);
    expect(h.state.sets[0]).not.toHaveProperty('net');
  });

  it('a line rewrite that omits the deduction leaves it alone and recomputes', async () => {
    const repository = repositoryWith([]);
    h.state.selects.push([{ subtotal: '30.00' }], [{ deduction: '4.00' }]);

    const voucher = await repository.update(VOUCHER, { updatedBy: 'agency-user' }, [
      { description: 'Lemon Drop', amount: '30.00', quantity: 1 },
    ]);

    expect(h.state.sets[0]).not.toHaveProperty('deduction');
    expect(voucher).toMatchObject({ subtotal: '30.00', deduction: '4.00', net: '26.00' });
  });
});

describe('update() — a money move takes the finance signature off', () => {
  it('clears all four signature columns when the totals changed', async () => {
    const repository = repositoryWith([{ amount: '24.00' }]);
    h.state.selects.push(
      [lockedRow({ financeHeadSignedAt: SIGNED_AT })],
      [{ subtotal: '24.00' }],
      [{ deduction: '5.00' }],
    );

    const voucher = await repository.update(
      VOUCHER,
      { deduction: '5.00', updatedBy: 'agency-user' },
      undefined,
      undefined,
      'pending_review',
      { voidFinanceSignatureOnMoneyChange: true },
    );

    expect(h.state.sets.at(-1)).toMatchObject({
      financeHeadSignedAt: null,
      financeHeadSignature: null,
      financeHeadName: null,
      financeHeadRole: null,
    });
    expect(voucher?.financeHeadSignedAt).toBeNull();
  });

  it('keeps the signature when the same figures go back unchanged', async () => {
    const repository = repositoryWith([]);
    h.state.selects.push(
      [lockedRow({ status: 'disputed', financeHeadSignedAt: SIGNED_AT })],
      [{ subtotal: '24.00' }],
      [{ deduction: '0.00' }],
    );

    const voucher = await repository.update(
      VOUCHER,
      { updatedBy: 'agency-user' },
      [{ description: 'Lemon Drop (fixed spelling)', amount: '24.00', quantity: 1 }],
      undefined,
      'disputed',
      { voidFinanceSignatureOnMoneyChange: true },
    );

    expect(h.state.sets.some((s) => s.financeHeadSignedAt === null)).toBe(false);
    expect(voucher?.financeHeadSignedAt).toEqual(SIGNED_AT);
  });

  it('never voids unless asked — the sign, dispute and scheduler paths', async () => {
    const repository = repositoryWith([{ amount: '24.00' }]);
    h.state.selects.push(
      [lockedRow({ financeHeadSignedAt: SIGNED_AT })],
      [{ subtotal: '24.00' }],
      [{ deduction: '5.00' }],
    );

    await repository.update(
      VOUCHER,
      { deduction: '5.00', updatedBy: 'x' },
      undefined,
      undefined,
      'pending_review',
    );

    expect(h.state.sets.some((s) => s.financeHeadSignedAt === null)).toBe(false);
  });
});
