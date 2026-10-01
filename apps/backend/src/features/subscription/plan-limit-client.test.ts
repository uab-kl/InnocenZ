import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `resolveActivePlanLimit` READS THROUGH THE CLIENT IT IS HANDED (1 Oct 2026).
 *
 * The shift write guard hands in its transaction so the venue's plan is read
 * again under the venue's lock, on the connection that holds it. A lookup that
 * quietly went back to the pool would read outside the lock — and every guard
 * test above it mocks this module, so only this file can see that.
 */

type Rows = { planName: string; limitAmount: number | null }[];

function fakeClient(answer: () => Rows) {
  const chain = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    limit: async () => answer(),
  };
  return { select: vi.fn(() => chain) };
}

const poolClient = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock('@/db/index.js', () => ({ db: poolClient }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { DbTransaction } from '@/types/db-transaction.js';
import { resolveActivePlanLimit } from './plan-limit.js';

const VENUE = { subscriberType: 'outlet', subscriberId: '11111111-1111-4111-8111-111111111111' } as const;

beforeEach(() => {
  poolClient.select.mockReset();
  poolClient.select.mockImplementation(
    fakeClient(() => [{ planName: 'Pool plan', limitAmount: 99 }]).select,
  );
});

describe('resolveActivePlanLimit — which connection it reads on', () => {
  it('reads through the transaction it is handed, and never the pool', async () => {
    const tx = fakeClient(() => [{ planName: 'Growth', limitAmount: 10 }]);

    const plan = await resolveActivePlanLimit(VENUE, tx as unknown as DbTransaction);

    expect(plan).toEqual({ kind: 'plan', planName: 'Growth', limitAmount: 10 });
    expect(tx.select).toHaveBeenCalledTimes(1);
    expect(poolClient.select).not.toHaveBeenCalled();
  });

  it('reads through the pool when handed none — every other caller, unchanged', async () => {
    const plan = await resolveActivePlanLimit(VENUE);

    expect(plan).toEqual({ kind: 'plan', planName: 'Pool plan', limitAmount: 99 });
    expect(poolClient.select).toHaveBeenCalledTimes(1);
  });

  it('no live plan row on the transaction is `none`; a failed read is `unknown`, never `none`', async () => {
    const empty = fakeClient(() => []);
    expect(await resolveActivePlanLimit(VENUE, empty as unknown as DbTransaction)).toEqual({
      kind: 'none',
    });

    const failing = fakeClient(() => {
      throw new Error('connection reset');
    });
    expect(await resolveActivePlanLimit(VENUE, failing as unknown as DbTransaction)).toEqual({
      kind: 'unknown',
    });
    expect(poolClient.select).not.toHaveBeenCalled();
  });

  it('an open-ended plan stays unlimited through the transaction too', async () => {
    const tx = fakeClient(() => [{ planName: 'Premier', limitAmount: null }]);

    expect(await resolveActivePlanLimit(VENUE, tx as unknown as DbTransaction)).toEqual({
      kind: 'plan',
      planName: 'Premier',
      limitAmount: null,
    });
  });
});
