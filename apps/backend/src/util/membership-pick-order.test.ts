import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHICH ROW "THIS PERSON AT THIS ORGANISATION" MEANS (12 Nov 2026).
 *
 * `getByAgencyAndUser` / `getByOutletAndUser` read `limit(1)` with no ORDER BY,
 * so with a declined row R beside a fresh request P (which `requestJoin` makes
 * on purpose), invite-accept could read R, reactivate it over the decliner's
 * name, and leave P pending beside an active row. Pinned here: both lookups
 * ORDER BY active → pending → inactive → rejected, then newest, then id.
 * Driven against a fake query builder — the order is Postgres's to run, so what
 * is checked is the ORDER BY handed to it.
 */

const h = vi.hoisted(() => {
  const state = {
    orderBy: [] as unknown[],
    rows: [] as Record<string, unknown>[],
    fakeDb: () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: (...args: unknown[]) => {
                state.orderBy = args;
                return { limit: async () => state.rows };
              },
            }),
          }),
        }),
      },
    }),
  };
  return state;
});

vi.mock('@/db/index', () => h.fakeDb());
vi.mock('@/db/index.js', () => h.fakeDb());
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AgencyUserTable } from '@/features/agency/agency.model';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { OutletUserTable } from '@/features/outlet/outlet.model';
import { OutletMemberRepositoryClass } from '@/features/outlet/outlet-member.repository';
import { MEMBERSHIP_PICK_ORDER, membershipPickOrder } from './membership-pick-order';

const render = (parts: unknown[]) =>
  new PgDialect().sqlToQuery(sql.join(parts as never[], sql`, `)).sql;

beforeEach(() => {
  h.orderBy = [];
  h.rows = [];
});

describe('membershipPickOrder — the ranking itself', () => {
  it('ranks active, then pending, then inactive, then rejected; anything else last', () => {
    expect(MEMBERSHIP_PICK_ORDER).toEqual(['active', 'pending', 'inactive', 'rejected']);
    const text = render(membershipPickOrder(AgencyUserTable));
    expect(text).toContain(
      `case "main"."agency_user"."status" when 'active' then 0 when 'pending' then 1 when 'inactive' then 2 when 'rejected' then 3 else 4 end`,
    );
  });

  it('breaks ties by the most recently touched row, then by id — a TOTAL order', () => {
    const text = render(membershipPickOrder(OutletUserTable));
    expect(text.endsWith('"main"."outlet_user"."updated_at" desc, "main"."outlet_user"."id" asc')).toBe(true);
  });

  it('binds no parameters — the ranks are constants written into the SQL', () => {
    const query = new PgDialect().sqlToQuery(sql.join(membershipPickOrder(AgencyUserTable), sql`, `));
    expect(query.params).toEqual([]);
  });
});

describe('the two lookups use it', () => {
  const AGENCY = '11111111-1111-4111-8111-111111111111';
  const USER = '22222222-2222-4222-8222-222222222222';

  it('getByAgencyAndUser orders before it takes one row', async () => {
    h.rows = [{ id: 'pending-row', status: 'pending' }];
    const row = await new AgencyMemberRepositoryClass().getByAgencyAndUser(AGENCY, USER);
    expect(row).toEqual({ id: 'pending-row', status: 'pending' });
    expect(render(h.orderBy)).toBe(render(membershipPickOrder(AgencyUserTable)));
  });

  it('getByOutletAndUser — the venue twin — orders the same way', async () => {
    await new OutletMemberRepositoryClass().getByOutletAndUser(AGENCY, USER);
    expect(render(h.orderBy)).toBe(render(membershipPickOrder(OutletUserTable)));
  });

  it('no row is still null', async () => {
    await expect(new AgencyMemberRepositoryClass().getByAgencyAndUser(AGENCY, USER)).resolves.toBeNull();
  });
});
