import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /pr` — who is given a PR's KPI score, scoped how, and that the number is
 * ALL they are given (owner, 29 Sep 2026: "make sure the KPI formula won't be
 * displayed to anyone").
 *
 *  - agency roster lane: the score, for this agency's own work only;
 *  - admin lane: the score across every agency, or for the agency it filtered
 *    by — the same scope `stats` already uses;
 *  - outlet lane: nothing, and the loader is never even asked;
 *  - every lane: `kpiScore` and no other KPI field — no component, no weight.
 *
 * Nothing here opens a database connection: the controller gets fakes and the
 * loader is replaced by a recording fake.
 */

const h = vi.hoisted(() => ({
  scores: new Map<string, number | null>(),
}));

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/member-code', () => ({ ensurePersonCode: vi.fn(async () => undefined) }));
vi.mock('./pr-stats.js', () => ({
  EMPTY_PR_STATS: { attendancePct: null },
  loadPrStats: vi.fn(async () => new Map()),
}));
vi.mock('./pr-kpi.js', () => ({
  loadPrKpiScores: vi.fn(async () => h.scores),
}));

import { PrControllerClass } from './pr.controller';
import { loadPrKpiScores } from './pr-kpi.js';
import { redactPrRowForOutlet } from '@/util/outlet-redaction';

const AGENCY_ID = '44444444-4444-4444-8444-444444444444';
const OUTLET_ID = '77777777-7777-4777-8777-777777777777';
const CALLER = '55555555-5555-4555-8555-555555555555';
const SCORED = '11111111-1111-4111-8111-111111111111';
const UNSCORED = '22222222-2222-4222-8222-222222222222';

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
    email: null,
    phoneNum: null,
    idNo: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    createdBy: 'seed',
    updatedBy: 'seed',
    place: null,
    yearsExp: null,
    kpiTier: 'B',
    payClass: null,
    prStatus: null,
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
    phone: null,
    email: null,
    icNo: null,
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    createdBy: 'seed',
    updatedBy: 'seed',
    profile: null,
    roster: { place: null, yearsExp: null, kpiTier: 'B', payClass: null },
  };
}

type Lane = 'agency' | 'admin' | 'outlet';

function build(lane: Lane, approvedAgencies: () => Promise<string[]> = async () => [AGENCY_ID]) {
  const prRepository = {
    listPaginated: vi.fn(async () => ({
      prs: [prRow(SCORED, 'Vicky'), prRow(UNSCORED, 'Stella')],
      totalCount: 2,
    })),
    listUserIdsWithPassword: vi.fn(async () => new Set<string>()),
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
    listByAgency: vi.fn(async () => [enrichedRow(SCORED, 'Vicky'), enrichedRow(UNSCORED, 'Stella')]),
  };
  const agencyOutletRepository = {
    listApprovedAgencyIdsForOutlet: vi.fn(approvedAgencies),
  };
  const unused = {} as never;
  return new PrControllerClass(
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
}

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { data: Record<string, unknown>[] },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { data: Record<string, unknown>[] }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function request(lane: Lane, query: Record<string, string> = {}) {
  return {
    params: {},
    body: {},
    query,
    user: { id: CALLER },
    header: () => undefined,
    redactIdentityDocs: lane === 'outlet',
  } as unknown as Request;
}

/** Every key on a row that is about the KPI, the stored grade aside. */
function kpiKeys(row: Record<string, unknown>) {
  return Object.keys(row).filter((key) => /kpi/i.test(key));
}

/**
 * Nothing in a response may spell out what the score is made of. `weights?\b`
 * so a body measurement (`comcardWeightKg`) is not mistaken for a formula weight.
 */
function expectNoFormula(body: unknown) {
  expect(JSON.stringify(body)).not.toMatch(
    /reliab|punctual|on.?time|weights?\b|renormal|component|breakdown/i,
  );
}

beforeEach(() => {
  vi.mocked(loadPrKpiScores).mockClear();
  h.scores = new Map([[SCORED, 82]]);
});

describe('GET /pr — kpiScore', () => {
  it("agency roster: this agency's scores, the number alone, null when there is none", async () => {
    const res = fakeResponse();
    await build('agency').list(request('agency'), res);

    expect(res.statusCode).toBe(200);
    expect(loadPrKpiScores).toHaveBeenCalledTimes(1);
    expect(loadPrKpiScores).toHaveBeenCalledWith({
      prIds: [SCORED, UNSCORED],
      agencyId: AGENCY_ID,
    });
    const rows = res.body.data;
    expect(rows.map((row) => row.kpiScore)).toEqual([82, null]);
    for (const row of rows) expect(kpiKeys(row)).toEqual(['kpiScore']);
    expectNoFormula(res.body);
  });

  it('admin: every agency when unfiltered', async () => {
    const res = fakeResponse();
    await build('admin').list(request('admin'), res);

    expect(res.statusCode).toBe(200);
    expect(loadPrKpiScores).toHaveBeenCalledTimes(1);
    expect(loadPrKpiScores).toHaveBeenCalledWith({
      prIds: [SCORED, UNSCORED],
      agencyId: null,
    });
    expect(res.body.data.map((row) => row.kpiScore)).toEqual([82, null]);
    for (const row of res.body.data) expect(kpiKeys(row)).toEqual(['kpiScore']);
    expectNoFormula(res.body);
  });

  it('admin: the agency it filtered by — the same scope as `stats`', async () => {
    const res = fakeResponse();
    await build('admin').list(request('admin', { agencyId: AGENCY_ID }), res);

    expect(loadPrKpiScores).toHaveBeenCalledWith({
      prIds: [SCORED, UNSCORED],
      agencyId: AGENCY_ID,
    });
  });

  it('outlet: no kpiScore key at all, and the loader is never asked', async () => {
    const res = fakeResponse();
    await build('outlet').list(request('outlet'), res);

    expect(res.statusCode).toBe(200);
    expect(loadPrKpiScores).not.toHaveBeenCalled();
    expect(res.body.data).toHaveLength(2);
    for (const row of res.body.data) expect(row).not.toHaveProperty('kpiScore');
  });

  it('the instrument: the formula check does catch a leaked component', () => {
    // Arbitrary placeholder numbers — nothing here is, or hints at, a real weight.
    expect(() => expectNoFormula({ kpiScore: 82, punctuality: 0.123 })).toThrow();
    expect(() => expectNoFormula({ weights: { a: 7 } })).toThrow();
    expect(() => expectNoFormula({ reliabilityPct: 42 })).toThrow();
    // The private setting's name is caught too (`weights?\b`, case-blind).
    expect(() => expectNoFormula({ note: 'KPI_WEIGHTS' })).toThrow();
    // …and does not trip on a body measurement.
    expect(() => expectNoFormula({ comcardWeightKg: 50 })).not.toThrow();
  });
});

describe('outlet redaction', () => {
  it('blanks a kpiScore that ever reaches a venue row', () => {
    const redacted = redactPrRowForOutlet({ id: SCORED, name: 'Vicky', kpiScore: 82 });
    expect(redacted.kpiScore).toBeNull();
    expect(redacted.name).toBe('Vicky');
  });

  it('adds no key to a row that never had one', () => {
    expect(redactPrRowForOutlet({ id: SCORED })).not.toHaveProperty('kpiScore');
  });
});

describe('GET /pr — a FAILED read of the venue’s approved agencies (1 Oct 2026)', () => {
  it('outlet: 500 — not an empty roster that reads as "no PRs to name"', async () => {
    const res = fakeResponse();
    const failing = async (): Promise<string[]> => {
      throw new Error('connection reset');
    };
    await build('outlet', failing).list(request('outlet'), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal Server Error', data: null });
  });

  it('outlet: the roster as before when the read works', async () => {
    const res = fakeResponse();
    await build('outlet').list(request('outlet'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});
