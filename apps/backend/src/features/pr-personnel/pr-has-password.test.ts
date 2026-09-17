import type { Request, Response } from 'express';
import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /pr` tells an agency or admin whether each PR has SET A PASSWORD.
 *
 * The agency PR editor needs it to make Mobile and Email read-only for a PR who
 * has activated her account: `PUT /pr/:id` refuses a change to either with 403
 * (`planSignInContactWrite`), and a form that offers an edit only to refuse it
 * is a form that lies.
 *
 * Pinned here:
 *  - list (agency roster arm AND admin arm) and single carry `hasPassword`
 *    true / false, decided by `listUserIdsWithPassword`;
 *  - an outlet caller is never given it, and its identity redaction still runs;
 *  - no response carries the hash, under either spelling — and the repository
 *    never SELECTS it: it tests `password_hash IS NOT NULL` in SQL and returns
 *    ids only.
 *
 * Nothing here opens a database connection: the controller gets fakes, and the
 * repository test runs against a recording fake `db`.
 */

const h = vi.hoisted(() => ({
  selected: [] as { fields: Record<string, unknown>; table: unknown; condition: unknown }[],
  rows: [] as { id: string }[],
}));

vi.mock('@/db/index', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: async (condition: unknown) => {
          h.selected.push({ fields, table, condition });
          return h.rows;
        },
      }),
    }),
  },
}));
// The remove-lane instrument below stops at a fake with no writer; its catch
// logs, and that line belongs in a mock rather than the test output.
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// A brand-new stub mints its PR code in the database; nothing here may reach it.
vi.mock('@/util/member-code', () => ({ ensurePersonCode: vi.fn(async () => undefined) }));
// Attendance + paid aggregates — not what is under test.
vi.mock('./pr-stats.js', () => ({
  EMPTY_PR_STATS: { shiftsWorked: 0 },
  loadPrStats: vi.fn(async () => new Map()),
}));

import { PrControllerClass } from './pr.controller';
import { PrRepositoryClass } from './pr.repository';
import { UserTable } from '@/features/user/user.model';

const AGENCY_ID = '44444444-4444-4444-8444-444444444444';
const OUTLET_ID = '77777777-7777-4777-8777-777777777777';
const CALLER = '55555555-5555-4555-8555-555555555555';
/** Has set a password — owns her sign-in contact. */
const ACTIVATED = '11111111-1111-4111-8111-111111111111';
/** A roster stub the agency typed in; never signed in. */
const STUB = '22222222-2222-4222-8222-222222222222';
/** What a leaked hash would look like in a response. */
const HASH = '$2b$10$FAKEHASHFAKEHASHFAKEHASHFAKEHASH';

function enrichedRow(userId: string, name: string) {
  return {
    id: `m-${userId}`,
    agencyId: AGENCY_ID,
    userId,
    name,
    nickname: name.toLowerCase(),
    approveStatus: 'approved',
    tier: 'tier_1',
    rejectReason: null,
    username: name.toLowerCase(),
    email: `${name.toLowerCase()}@example.com`,
    phoneNum: '+60123456789',
    idNo: '900101-14-5678',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    createdBy: 'seed',
    updatedBy: 'seed',
    profileImage: null,
    gender: null,
    race: null,
    languages: null,
    dob: null,
    nationality: null,
    portfolioPhotos: null,
    comcardImage: null,
    comcardHeightCm: null,
    comcardWeightKg: null,
    comcardBustCm: null,
    comcardWaistCm: null,
    comcardHipCm: null,
    place: null,
    yearsExp: null,
    kpiTier: null,
    payClass: null,
    prStatus: null,
    // As if a later edit widened the roster SELECT to the whole user row: the
    // projection must still never forward it.
    passwordHash: HASH,
  };
}

function prRow(userId: string, name: string) {
  return {
    id: userId,
    userId,
    agencyId: AGENCY_ID,
    name,
    nickname: name.toLowerCase(),
    tier: 'tier_1',
    status: 'active',
    rejectReason: null,
    phone: '+60123456789',
    email: `${name.toLowerCase()}@example.com`,
    icNo: '900101-14-5678',
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    createdBy: 'seed',
    updatedBy: 'seed',
    profile: null,
    roster: null,
  };
}

type Lane = 'agency' | 'admin' | 'outlet';

function build(lane: Lane) {
  const prRepository = {
    listPaginated: vi.fn(async () => ({
      prs: [prRow(ACTIVATED, 'Vicky'), prRow(STUB, 'Stella')],
      totalCount: 2,
    })),
    getById: vi.fn(async (id: string) => prRow(id, id === ACTIVATED ? 'Vicky' : 'Stella')),
    listUserIdsWithPassword: vi.fn(
      async (ids: string[]) => new Set(ids.filter((id) => id === ACTIVATED)),
    ),
  };
  const agencyMemberRepository = {
    listByUser: vi.fn(async () =>
      lane === 'agency' ? [{ agencyId: AGENCY_ID, status: 'active' }] : [],
    ),
  };
  const authRepository = {
    getRolesForUserIds: vi.fn(async () => [
      { roleName: lane === 'admin' ? 'admin' : lane === 'agency' ? 'agency' : 'outlet_owner' },
    ]),
  };
  const outletMemberRepository = {
    listByUser: vi.fn(async () =>
      lane === 'outlet' ? [{ outletId: OUTLET_ID, status: 'active' }] : [],
    ),
  };
  const agencyPrRepository = {
    listByAgency: vi.fn(async () => [enrichedRow(ACTIVATED, 'Vicky'), enrichedRow(STUB, 'Stella')]),
  };
  const agencyOutletRepository = {
    listApprovedAgencyIdsForOutlet: vi.fn(async () => [AGENCY_ID]),
  };
  const unused = {} as never;
  const controller = new PrControllerClass(
    prRepository as never,
    agencyMemberRepository as never,
    authRepository as never,
    outletMemberRepository as never,
    agencyPrRepository as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    agencyOutletRepository as never,
  );
  return { controller, prRepository, agencyPrRepository };
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string; data: any },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string; data: any }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function request(lane: Lane, params: Record<string, string> = {}) {
  return {
    params,
    body: {},
    query: {},
    user: { id: CALLER },
    header: () => undefined,
    // What `redactIdentityDocsForOutlet` sets: only a venue-only caller.
    redactIdentityDocs: lane === 'outlet',
  } as unknown as Request;
}

/** Every way a hash could be spelled in a JSON body. */
function expectNoHash(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toContain(HASH);
  expect(json).not.toMatch(/passwordHash|password_hash/);
}

describe('the instrument', () => {
  it('the fake roster row DOES carry a hash, so the no-hash assertions can see one', () => {
    expect(JSON.stringify(enrichedRow(ACTIVATED, 'Vicky'))).toContain(HASH);
    expect(() => expectNoHash(enrichedRow(ACTIVATED, 'Vicky'))).toThrow();
  });
});

describe('GET /pr — hasPassword', () => {
  it('agency roster: true for the activated PR, false for the stub; never the hash', async () => {
    const t = build('agency');
    const res = fakeResponse();
    await t.controller.list(request('agency'), res);

    expect(res.statusCode).toBe(200);
    expect(t.agencyPrRepository.listByAgency).toHaveBeenCalled();
    const byId = Object.fromEntries(
      (res.body.data as { id: string; hasPassword: unknown }[]).map((row) => [row.id, row.hasPassword]),
    );
    expect(byId).toEqual({ [ACTIVATED]: true, [STUB]: false });
    expect(t.prRepository.listUserIdsWithPassword).toHaveBeenCalledTimes(1);
    expect(t.prRepository.listUserIdsWithPassword).toHaveBeenCalledWith([ACTIVATED, STUB]);
    expectNoHash(res.body);
  });

  it('admin: true / false on the paginated arm too', async () => {
    const t = build('admin');
    const res = fakeResponse();
    await t.controller.list(request('admin'), res);

    expect(res.statusCode).toBe(200);
    expect(t.prRepository.listPaginated).toHaveBeenCalled();
    expect((res.body.data as { hasPassword: unknown }[]).map((row) => row.hasPassword)).toEqual([
      true,
      false,
    ]);
    expectNoHash(res.body);
  });

  it('outlet: no hasPassword key at all, no lookup, and identity docs still blanked', async () => {
    const t = build('outlet');
    const res = fakeResponse();
    await t.controller.list(request('outlet'), res);

    expect(res.statusCode).toBe(200);
    const rows = res.body.data as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).not.toHaveProperty('hasPassword');
      expect(row.icNo).toBeNull();
    }
    expect(t.prRepository.listUserIdsWithPassword).not.toHaveBeenCalled();
    expectNoHash(res.body);
  });
});

describe('GET /pr/:id — hasPassword', () => {
  it.each([
    ['agency', ACTIVATED, true],
    ['agency', STUB, false],
    ['admin', ACTIVATED, true],
    ['admin', STUB, false],
  ] as const)('%s caller, %s -> %s', async (lane, id, expected) => {
    const t = build(lane);
    const res = fakeResponse();
    await t.controller.getById(request(lane, { id }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.hasPassword).toBe(expected);
    expect(t.prRepository.listUserIdsWithPassword).toHaveBeenCalledWith([id]);
    expectNoHash(res.body);
  });

  it('an outlet caller still reads 404 (no agency scope) and learns nothing', async () => {
    const t = build('outlet');
    const res = fakeResponse();
    await t.controller.getById(request('outlet', { id: ACTIVATED }), res);

    expect(res.statusCode).toBe(404);
    expect(t.prRepository.listUserIdsWithPassword).not.toHaveBeenCalled();
  });

  /*
   * The case the 404 above never reaches: the scope DOES resolve an agency, yet
   * `redactIdentityDocs` is set — `redact-identity-docs.ts` fails CLOSED when
   * its role read throws, so an agency member gets the venue's view. The branch
   * in `PrController.getById` must then withhold `hasPassword` and still blank
   * the identity documents; deleting that branch must fail this test.
   */
  it('redactIdentityDocs with an agency scope: 200, identity docs blanked, no hasPassword, no lookup', async () => {
    const t = build('agency');
    const req = request('agency', { id: ACTIVATED });
    (req as unknown as { redactIdentityDocs: boolean }).redactIdentityDocs = true;
    const res = fakeResponse();
    await t.controller.getById(req, res);

    expect(res.statusCode).toBe(200);
    // The instrument: the row the repository handed over DID carry the IC.
    expect(t.prRepository.getById).toHaveBeenCalledWith(ACTIVATED, AGENCY_ID);
    expect(prRow(ACTIVATED, 'Vicky').icNo).toBe('900101-14-5678');
    expect(res.body.data.id).toBe(ACTIVATED);
    expect(res.body.data).not.toHaveProperty('hasPassword');
    expect(res.body.data.icNo).toBeNull();
    expect(t.prRepository.listUserIdsWithPassword).not.toHaveBeenCalled();
    expectNoHash(res.body);
  });
});

/*
 * A malformed id is a row that does not exist: 404, before ANY query. Handed to
 * Postgres it raised 22P02 quoting the id, the catch masked that message, and a
 * 15,000-character id cost the event loop half a second per request.
 */
describe('PR routes — a non-uuid id never reaches the repository', () => {
  const LONG_ID = 'a'.repeat(15_000);

  it.each(['agency', 'admin'] as const)('GET /pr/:id as %s -> 404', async (lane) => {
    const t = build(lane);
    for (const id of ['not-a-uuid', LONG_ID]) {
      const res = fakeResponse();
      await t.controller.getById(request(lane, { id }), res);
      expect(res.statusCode).toBe(404);
    }
    expect(t.prRepository.getById).not.toHaveBeenCalled();
  });

  it('DELETE /pr/:id -> 404 with no repository call', async () => {
    const t = build('agency');
    const res = fakeResponse();
    await t.controller.remove(request('agency', { id: LONG_ID }), res);
    expect(res.statusCode).toBe(404);
    expect(t.prRepository.getById).not.toHaveBeenCalled();
  });

  it("an admin's named agencyId that is not a uuid -> 404 with no repository call", async () => {
    const t = build('admin');
    const req = request('admin', { id: ACTIVATED });
    (req as unknown as { query: Record<string, string> }).query = { agencyId: LONG_ID };
    const res = fakeResponse();
    await t.controller.getById(req, res);
    expect(res.statusCode).toBe(404);
    expect(t.prRepository.getById).not.toHaveBeenCalled();
  });

  it('the instrument: a valid uuid on the same fakes DOES reach the repository', async () => {
    const t = build('agency');
    const res = fakeResponse();
    // The fakes have no membership writer, so remove stops right after resolving
    // (a 500) — what matters is that the id got that far.
    await t.controller.remove(request('agency', { id: ACTIVATED }), res);
    expect(t.prRepository.getById).toHaveBeenCalledWith(ACTIVATED, AGENCY_ID);
    expect(res.statusCode).not.toBe(404);
  });
});

describe('PrRepository.listUserIdsWithPassword', () => {
  beforeEach(() => {
    h.selected.length = 0;
    h.rows = [];
  });

  it('selects the id ONLY and tests password_hash IS NOT NULL in SQL', async () => {
    h.rows = [{ id: ACTIVATED }];
    const result = await new PrRepositoryClass().listUserIdsWithPassword([ACTIVATED, STUB, ACTIVATED]);

    expect([...result]).toEqual([ACTIVATED]);
    expect(h.selected).toHaveLength(1);
    const [query] = h.selected;
    expect(query.table).toBe(UserTable);
    // The hash column is never in the projection, so it cannot reach a row.
    expect(Object.keys(query.fields)).toEqual(['id']);
    expect(query.fields.id).toBe(UserTable.id);
    const where = new PgDialect().sqlToQuery(query.condition as SQL);
    expect(where.sql).toMatch(/"password_hash" is not null/);
    expect(where.sql).toMatch(/"id" in \(\$1, \$2\)/);
    // De-duplicated before it is asked.
    expect(where.params).toEqual([ACTIVATED, STUB]);
  });

  it('asks nothing for an empty page', async () => {
    const result = await new PrRepositoryClass().listUserIdsWithPassword([]);
    expect(result.size).toBe(0);
    expect(h.selected).toHaveLength(0);
  });
});
