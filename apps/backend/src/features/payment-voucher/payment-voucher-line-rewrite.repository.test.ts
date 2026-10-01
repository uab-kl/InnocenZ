import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `PaymentVoucherRepositoryClass.update()` with `lines` — the wipe-and-reinsert
 * behind `PUT /payment-voucher/:id` — against a recording fake transaction.
 *
 * Pins the 29 Sep 2026 follow-up: the rows it INSERTS keep a generator wage's
 * `component = 'wages'`. The pure rule is tested in
 * payment-voucher-line-edit.test.ts; this proves the repository actually uses it.
 * `@/db/index` is a fake: nothing here can reach the shared database.
 */
const h = vi.hoisted(() => {
  const state = {
    inserted: [] as Array<Record<string, unknown>>,
    deleted: 0,
  };
  const tx = {
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => [{ id: 'voucher-1', status: 'disputed', ...values }],
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        state.deleted += 1;
      },
    }),
    insert: () => ({
      values: (rows: Array<Record<string, unknown>>) => ({
        returning: async () => {
          state.inserted.push(...rows);
          return rows;
        },
      }),
    }),
  };
  return { state, tx };
});

vi.mock('@/db/index', () => ({
  db: { transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(h.tx) },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';

const VOUCHER = 'voucher-1';
const ASSIGNMENT = '4ff48fdd-1111-4222-8333-944455556666';
const RECEIPT = '9b48cae3-1111-4222-8333-944455556666';
const DRINK_REF = 'drinks|scan|120.00|ORD0389:0|drink';

const storedLine = (over: Record<string, unknown>) => ({
  id: `line-${String(over.ref)}`,
  voucherId: VOUCHER,
  lineDate: '2026-09-15',
  outlet: 'Velvet 23',
  description: 'x',
  quantity: 1,
  amount: '0.00',
  receiptId: null,
  proofPhotos: null,
  component: null,
  sortOrder: 0,
  ...over,
});

function repositoryWith(previous: Array<Record<string, unknown>>) {
  const repository = new PaymentVoucherRepositoryClass();
  const spyOn = (name: string) => vi.spyOn(repository as never, name as never);
  (spyOn('getLines') as unknown as { mockResolvedValue(v: unknown): void }).mockResolvedValue(previous);
  (spyOn('assertLinesAgreeWithShifts') as unknown as { mockResolvedValue(v: unknown): void }).mockResolvedValue(
    undefined,
  );
  (spyOn('recomputeTotals') as unknown as { mockResolvedValue(v: unknown): void }).mockResolvedValue(undefined);
  return repository;
}

beforeEach(() => {
  h.state.inserted = [];
  h.state.deleted = 0;
});

describe('update() with lines — the wipe-and-reinsert keeps what the payload cannot say', () => {
  it('a generator wage keeps component = wages; a drink keeps its receipt and photos', async () => {
    const repository = repositoryWith([
      storedLine({ ref: ASSIGNMENT, description: 'Shift on 2026-09-15', amount: '700.00', component: 'wages' }),
      storedLine({
        ref: DRINK_REF,
        description: 'Lemon Drop',
        amount: '24.00',
        component: 'drink_commission',
        receiptId: RECEIPT,
        proofPhotos: ['user/pr/x/receipts/a.jpg'],
      }),
    ]);

    // Exactly what `toLineRows` builds from the agency editor's payload.
    await repository.update(VOUCHER, { updatedBy: 'agency-user' }, [
      { lineDate: '2026-09-15', description: 'Shift on 2026-09-15', quantity: 1, amount: '650.00', ref: ASSIGNMENT },
      { lineDate: '2026-09-15', description: 'Lemon Drop', quantity: 2, amount: '30.00', ref: DRINK_REF },
    ]);

    expect(h.state.deleted).toBe(1);
    expect(h.state.inserted).toHaveLength(2);
    expect(h.state.inserted[0]).toMatchObject({ ref: ASSIGNMENT, amount: '650.00', component: 'wages' });
    expect(h.state.inserted[1]).toMatchObject({
      ref: DRINK_REF,
      component: 'drink_commission',
      receiptId: RECEIPT,
      proofPhotos: ['user/pr/x/receipts/a.jpg'],
    });
  });

  it('a NEW bare-id line (nothing stored under that ref) is not invented a classification', async () => {
    const repository = repositoryWith([]);

    await repository.update(VOUCHER, { updatedBy: 'agency-user' }, [
      { lineDate: '2026-09-15', description: 'Shift on 2026-09-15', quantity: 1, amount: '650.00', ref: ASSIGNMENT },
    ]);

    expect(h.state.inserted[0]?.component ?? null).toBeNull();
  });
});
