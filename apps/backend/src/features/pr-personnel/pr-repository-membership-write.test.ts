import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

/**
 * `PUT /pr/:id` WROTE THE PR'S OLDEST MEMBERSHIP (28 Sep 2026 audit, backend).
 *
 * The controller wrote the caller's own `agency_pr` row correctly, then handed
 * the same tier / status to `prRepository.update`, which re-resolved the agency
 * with `getByUserId(id)` — no agency, so the OLDEST row — and wrote it there
 * too. For a PR on two rosters, agency B's edit changed her tier at agency A.
 *
 * The database is a recording fake — nothing here opens a connection.
 */

const h = vi.hoisted(() => ({
  updates: [] as { table: unknown; patch: Record<string, unknown>; condition: unknown }[],
}));

vi.mock('@/db/index', () => {
  const db = {
    update: vi.fn((table: unknown) => ({
      set: (patch: Record<string, unknown>) => ({
        where: (condition: unknown) => {
          h.updates.push({ table, patch, condition });
          return {
            then: (resolve: (value: undefined) => void) => resolve(undefined),
            returning: async () => [{ id: 'row' }],
          };
        },
      }),
    })),
    select: vi.fn(() => ({
      from: () => ({ where: () => ({ limit: async () => [] }) }),
    })),
  };
  return { db };
});

import { PrRepositoryClass } from './pr.repository';
import { AgencyPrTable } from './pr.model';

const USER_ID = '88888888-8888-4888-8888-888888888888';
const ATLAS = '11111111-1111-4111-8111-111111111111'; // her OLDEST roster
const DELTA = '22222222-2222-4222-8222-222222222222'; // the agency editing her

function repository() {
  const repo = new PrRepositoryClass();
  const getByUserId = vi
    .spyOn(repo, 'getByUserId')
    .mockImplementation(async (_id: string, agencyId?: string) =>
      ({ id: USER_ID, agencyId: agencyId ?? ATLAS, updatedBy: 'x' }) as never,
    );
  return { repo, getByUserId };
}

function membershipWrites() {
  return h.updates.filter((u) => u.table === AgencyPrTable);
}

function whereParams(condition: unknown): unknown[] {
  return new PgDialect().sqlToQuery(condition as SQL).params;
}

describe('PrRepository.update — the membership it writes is the one it was told', () => {
  beforeEach(() => {
    h.updates.length = 0;
  });

  it('writes the NAMED agency’s row, never the oldest', async () => {
    const { repo, getByUserId } = repository();

    await repo.update(USER_ID, { tier: 'tier_3', status: 'active', agencyId: DELTA, updatedBy: 'owner' });

    const writes = membershipWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].patch).toMatchObject({ tier: 'tier_3', approveStatus: 'approved' });
    const params = whereParams(writes[0].condition);
    expect(params).toContain(DELTA);
    expect(params).not.toContain(ATLAS);
    // Read before AND after through the same membership.
    expect(getByUserId).toHaveBeenCalledWith(USER_ID, DELTA);
    expect(getByUserId).not.toHaveBeenCalledWith(USER_ID);
  });

  it('REFUSES a membership write that does not say which agency', async () => {
    const { repo } = repository();

    await expect(repo.update(USER_ID, { tier: 'tier_2', updatedBy: 'owner' })).rejects.toThrow(
      /must name its agency/,
    );
    await expect(
      repo.update(USER_ID, { rejectReason: 'no-show', updatedBy: 'owner' }),
    ).rejects.toThrow(/must name its agency/);
    expect(membershipWrites()).toEqual([]);
  });

  it('an identity-only write still needs no agency', async () => {
    const { repo } = repository();

    await expect(repo.update(USER_ID, { name: 'Vicky', updatedBy: 'owner' })).resolves.toBeTruthy();
    expect(membershipWrites()).toEqual([]);
  });
});
