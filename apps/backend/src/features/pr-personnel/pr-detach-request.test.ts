import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/member-code', () => ({ ensurePersonCode: vi.fn(async () => undefined) }));

import type { AdminRequest } from '@/features/admin-request/admin-request.model';
import type { AgencyPrApproveStatus } from './pr.model';
import { PrControllerClass } from './pr.controller';
import {
  type DetachMembership,
  type PrDetachDeps,
  PrDetachRequestService,
} from './pr-detach-request';
import {
  ALREADY_REQUESTED,
  NO_REQUEST_NEEDED,
  NOT_ON_ROSTER,
  NOTHING_TO_DETACH,
} from './pr-detach-rules';

/**
 * The PR "request detach" (owner, 20 Nov 2026) — every rule proved against
 * fakes, because this project does not probe a write gate with a write:
 *
 *  - the 365-day rule on BOTH doors: Detach refuses under a year (admin exempt),
 *    and a request is refused for a PR the agency may detach itself;
 *  - one waiting request per PR (the duplicate guard);
 *  - approve → that agency's membership 'left' + the agency told; decline →
 *    nothing moves + the agency told; an answered request is not answered twice;
 *  - cross-agency: a PR on another agency's roster is a 404 before anything is
 *    filed or detached.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-11-20T12:00:00Z');
const AGENCY = '11111111-1111-4111-8111-111111111111';
const OTHER_AGENCY = '22222222-2222-4222-8222-222222222222';
const PR = '33333333-3333-4333-8333-333333333333';
const CALLER = '44444444-4444-4444-8444-444444444444';
const REQUEST_ID = '55555555-5555-4555-8555-555555555555';

type FakeState = {
  memberships: Map<string, DetachMembership>;
  requests: AdminRequest[];
  notified: { userIds: string[]; input: Record<string, unknown> }[];
};

const key = (agencyId: string, userId: string) => `${agencyId}:${userId}`;

function membership(daysTied: number, approveStatus: AgencyPrApproveStatus = 'approved'): DetachMembership {
  const approvedAt = new Date(NOW.getTime() - daysTied * DAY);
  return { approveStatus, approvedAt, createdAt: approvedAt };
}

function storedRequest(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    id: REQUEST_ID,
    type: 'pr_detach',
    subscriberType: 'agency',
    subscriberId: AGENCY,
    subscriberName: 'Atlas Agency',
    subjectUserId: PR,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    currentPlanId: null,
    requestedPlanId: null,
    message: null,
    remarks: null,
    status: 'pending',
    quotedAmount: null,
    contactedAt: null,
    contactedBy: null,
    createdAt: NOW,
    updatedAt: NOW,
    createdBy: CALLER,
    updatedBy: CALLER,
    ...overrides,
  } as AdminRequest;
}

/** A fake database: a transaction is a snapshot that a throw restores. */
function fakeDeps(state: FakeState): PrDetachDeps & { calls: Record<string, number> } {
  const calls: Record<string, number> = { insert: 0, left: 0 };
  const awaiting = (r: AdminRequest) => r.status === 'pending' || r.status === 'contacted';
  return {
    calls,
    async transaction(fn) {
      const before = {
        memberships: new Map([...state.memberships].map(([k, v]) => [k, { ...v }])),
        requests: state.requests.map((r) => ({ ...r })),
      };
      try {
        return await fn({} as never);
      } catch (error) {
        state.memberships = before.memberships;
        state.requests = before.requests;
        throw error;
      }
    },
    async readMembership(agencyId, userId) {
      return state.memberships.get(key(agencyId, userId)) ?? null;
    },
    async lockMembership(_tx, agencyId, userId) {
      return state.memberships.get(key(agencyId, userId)) ?? null;
    },
    async findOpenRequest(_tx, agencyId, userId) {
      return (
        state.requests.find(
          (r) => r.subscriberId === agencyId && r.subjectUserId === userId && awaiting(r),
        ) ?? null
      );
    },
    async insertRequest(_tx, data) {
      calls.insert += 1;
      const row = storedRequest({ ...(data as Partial<AdminRequest>), id: `req-${calls.insert}` });
      state.requests.push(row);
      return row;
    },
    async claimAwaitingAnswer(id, data) {
      const row = state.requests.find((r) => r.id === id);
      if (!row || !awaiting(row)) return null;
      Object.assign(row, data);
      return { ...row };
    },
    async setMembershipLeft(_tx, agencyId, userId) {
      const m = state.memberships.get(key(agencyId, userId));
      if (!m || (m.approveStatus !== 'approved' && m.approveStatus !== 'leave_pending')) return false;
      calls.left += 1;
      m.approveStatus = 'left';
      return true;
    },
    async agencyName(agencyId) {
      return agencyId === AGENCY ? 'Atlas Agency' : agencyId === OTHER_AGENCY ? 'Delta Agency' : null;
    },
    async prName() {
      return 'Vicky Tan';
    },
    async agencyRecipients(agencyId) {
      return agencyId === AGENCY ? ['owner-1', 'ops-1'] : [];
    },
    notify: vi.fn(async (userIds: string[], input: Record<string, unknown>) => {
      state.notified.push({ userIds, input });
      return userIds.length;
    }) as never,
  };
}

function setup(memberships: [string, DetachMembership][] = [], requests: AdminRequest[] = []) {
  const state: FakeState = { memberships: new Map(memberships), requests, notified: [] };
  const deps = fakeDeps(state);
  return { state, deps, service: new PrDetachRequestService(deps) };
}

describe('PrDetachRequestService.file — the agency asks', () => {
  it('files a pr_detach request for a PR tied under a year, about that PR, from that agency', async () => {
    const { service, state } = setup([[key(AGENCY, PR), membership(120)]]);
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out.ok).toBe(true);
    expect(out.status).toBe(201);
    expect(out.message).toBe('Detach request sent for Vicky Tan — the InnocenZ admin will review it.');
    expect(state.requests).toHaveLength(1);
    expect(state.requests[0]).toMatchObject({
      type: 'pr_detach',
      status: 'pending',
      subscriberType: 'agency',
      subscriberId: AGENCY,
      subscriberName: 'Atlas Agency',
      subjectUserId: PR,
      createdBy: CALLER,
      updatedBy: CALLER,
    });
    // Filing is a request, not a detach.
    expect(state.memberships.get(key(AGENCY, PR))?.approveStatus).toBe('approved');
  });

  it('refuses a second request while one is still waiting — the duplicate guard', async () => {
    const { service, state, deps } = setup([[key(AGENCY, PR), membership(120)]]);
    await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    const again = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(again).toMatchObject({ ok: false, status: 409, message: ALREADY_REQUESTED });
    expect(deps.calls.insert).toBe(1);
    expect(state.requests).toHaveLength(1);
  });

  it('a "contacted" request is still waiting, so it blocks a duplicate too', async () => {
    const { service, deps } = setup(
      [[key(AGENCY, PR), membership(120)]],
      [storedRequest({ status: 'contacted' })],
    );
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out).toMatchObject({ ok: false, status: 409, message: ALREADY_REQUESTED });
    expect(deps.calls.insert).toBe(0);
  });

  it('files again once the earlier request was answered', async () => {
    const { service, deps } = setup(
      [[key(AGENCY, PR), membership(120)]],
      [storedRequest({ status: 'declined' })],
    );
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out.ok).toBe(true);
    expect(deps.calls.insert).toBe(1);
  });

  it('refuses a request for a PR tied a year or more — Detach removes them directly', async () => {
    const { service, deps } = setup([[key(AGENCY, PR), membership(365)]]);
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out).toMatchObject({ ok: false, status: 409, message: NO_REQUEST_NEEDED });
    expect(deps.calls.insert).toBe(0);
  });

  it('refuses a PR who is no longer on the roster', async () => {
    const { service, deps } = setup([[key(AGENCY, PR), membership(30, 'left')]]);
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out).toMatchObject({ ok: false, status: 409, message: NOT_ON_ROSTER });
    expect(deps.calls.insert).toBe(0);
  });

  it("refuses for ANOTHER agency's membership — a PR on Delta is not on Atlas", async () => {
    const { service, deps } = setup([[key(OTHER_AGENCY, PR), membership(30)]]);
    const out = await service.file({ agencyId: AGENCY, userId: PR, actor: CALLER, now: NOW });
    expect(out).toMatchObject({ ok: false, status: 409, message: NOT_ON_ROSTER });
    expect(deps.calls.insert).toBe(0);
  });
});

describe('PrDetachRequestService.directDetachRefusal — Detach itself', () => {
  it('refuses Detach under a year, in words naming the dates', async () => {
    const { service } = setup([[key(AGENCY, PR), membership(100)]]);
    const refusal = await service.directDetachRefusal(AGENCY, PR, NOW);
    expect(refusal).toMatch(/less than a year ago/);
    expect(refusal).toMatch(/admin request/);
  });

  it('lets Detach through at a year', async () => {
    const { service } = setup([[key(AGENCY, PR), membership(400)]]);
    expect(await service.directDetachRefusal(AGENCY, PR, NOW)).toBeNull();
  });

  it('does not block a membership that is not live — nothing left to protect', async () => {
    const { service } = setup([[key(AGENCY, PR), membership(10, 'pending')]]);
    expect(await service.directDetachRefusal(AGENCY, PR, NOW)).toBeNull();
  });
});

describe('PrDetachRequestService.approve / decline — the admin answers', () => {
  it("approve: that agency's membership becomes 'left' and the agency is told", async () => {
    const { service, state, deps } = setup(
      [
        [key(AGENCY, PR), membership(100)],
        [key(OTHER_AGENCY, PR), membership(100)],
      ],
      [storedRequest()],
    );
    const out = await service.approve(storedRequest(), 'admin-1');
    expect(out).toMatchObject({ ok: true, status: 200, message: 'Vicky Tan is detached from Atlas Agency.' });
    expect(state.requests[0].status).toBe('approved');
    expect(state.memberships.get(key(AGENCY, PR))?.approveStatus).toBe('left');
    // The PR's OTHER agency is untouched.
    expect(state.memberships.get(key(OTHER_AGENCY, PR))?.approveStatus).toBe('approved');
    expect(deps.calls.left).toBe(1);
    expect(state.notified).toHaveLength(1);
    expect(state.notified[0].userIds).toEqual(['owner-1', 'ops-1']);
    expect(state.notified[0].input).toMatchObject({
      kind: 'pr_detach_decided',
      payload: { requestId: REQUEST_ID, prId: PR, decision: 'approved' },
    });
  });

  it('approve twice: the second is refused and nothing moves again', async () => {
    const { service, state, deps } = setup([[key(AGENCY, PR), membership(100)]], [storedRequest()]);
    await service.approve(storedRequest(), 'admin-1');
    const again = await service.approve(storedRequest(), 'admin-1');
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(deps.calls.left).toBe(1);
    expect(state.notified).toHaveLength(1);
  });

  it('approve on a declined request is refused before anything is written', async () => {
    const declined = storedRequest({ status: 'declined' });
    const { service, state, deps } = setup([[key(AGENCY, PR), membership(100)]], [declined]);
    const out = await service.approve(declined, 'admin-1');
    expect(out).toMatchObject({ ok: false, status: 409 });
    expect(deps.calls.left).toBe(0);
    expect(state.memberships.get(key(AGENCY, PR))?.approveStatus).toBe('approved');
  });

  it('approve when the PR already left: rolled back, the request stays open to decline', async () => {
    const { service, state } = setup([[key(AGENCY, PR), membership(100, 'left')]], [storedRequest()]);
    const out = await service.approve(storedRequest(), 'admin-1');
    expect(out).toMatchObject({ ok: false, status: 409, message: NOTHING_TO_DETACH });
    expect(state.requests[0].status).toBe('pending');
    expect(state.notified).toHaveLength(0);
  });

  it('decline: the membership stays, the request is declined, the agency is told', async () => {
    const { service, state, deps } = setup([[key(AGENCY, PR), membership(100)]], [storedRequest()]);
    const out = await service.decline(storedRequest(), 'admin-1');
    expect(out).toMatchObject({
      ok: true,
      status: 200,
      message: 'Detach request declined — Vicky Tan stays on Atlas Agency.',
    });
    expect(state.requests[0].status).toBe('declined');
    expect(state.memberships.get(key(AGENCY, PR))?.approveStatus).toBe('approved');
    expect(deps.calls.left).toBe(0);
    expect(state.notified[0].input).toMatchObject({
      kind: 'pr_detach_decided',
      payload: { decision: 'declined' },
    });
  });

  it('decline on an answered request is refused', async () => {
    const approved = storedRequest({ status: 'approved' });
    const { service, state } = setup([[key(AGENCY, PR), membership(100)]], [approved]);
    const out = await service.decline(approved, 'admin-1');
    expect(out).toMatchObject({ ok: false, status: 409 });
    expect(state.notified).toHaveLength(0);
  });
});

// ── The HTTP doors on PrController ──────────────────────────────────────────

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string; data: unknown },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string; data: unknown }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function prRow(agencyId: string) {
  return {
    id: PR,
    userId: PR,
    agencyId,
    name: 'Vicky Tan',
    nickname: 'vicky',
    tier: 'tier_1',
    status: 'active',
    rejectReason: null,
    phone: null,
    email: null,
    icNo: null,
    approvedAt: new Date(NOW.getTime() - 100 * DAY),
    createdAt: new Date(NOW.getTime() - 100 * DAY),
    updatedAt: NOW,
    createdBy: 'seed',
    updatedBy: 'seed',
    profile: null,
    roster: null,
  };
}

/**
 * A controller whose caller is an agency member of AGENCY (or an admin). The
 * PR is on the roster of `rosteredAt` only — `getById(id, agencyId)` answers
 * null for any other agency, exactly as the real repository does.
 */
function controllerFor(opts: {
  lane: 'agency' | 'admin';
  rosteredAt: string;
  tiedDays: number;
}) {
  const { service, state, deps } = setup([[key(opts.rosteredAt, PR), membership(opts.tiedDays)]]);
  const prRepository = {
    getById: vi.fn(async (_id: string, agencyId?: string) =>
      !agencyId || agencyId === opts.rosteredAt ? prRow(opts.rosteredAt) : null,
    ),
    listMembershipAgencyIds: vi.fn(async () => [opts.rosteredAt]),
  };
  const agencyMemberRepository = {
    listByUser: vi.fn(async () =>
      opts.lane === 'agency' ? [{ agencyId: AGENCY, status: 'active' }] : [],
    ),
  };
  const authRepository = {
    getRolesForUserIds: vi.fn(async () => [{ roleName: opts.lane }]),
  };
  const outletMemberRepository = { listByUser: vi.fn(async () => []) };
  const agencyPrRepository = { setApproveStatus: vi.fn(async () => null) };
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
    unused,
    service,
  );
  return { controller, agencyPrRepository, state, deps };
}

function req(): Request {
  return {
    params: { id: PR },
    body: {},
    query: {},
    user: { id: CALLER, email: 'owner@example.test' },
    header: () => undefined,
  } as unknown as Request;
}

describe('DELETE /pr/:id — Detach obeys the year', () => {
  it('refuses an agency under a year with 409 and the sentence, and detaches nothing', async () => {
    const { controller, agencyPrRepository } = controllerFor({ lane: 'agency', rosteredAt: AGENCY, tiedDays: 100 });
    const res = fakeResponse();
    await controller.remove(req(), res);
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/less than a year ago/);
    expect(agencyPrRepository.setApproveStatus).not.toHaveBeenCalled();
  });

  it('lets an agency detach at a year — the old path, unchanged', async () => {
    const { controller, agencyPrRepository } = controllerFor({ lane: 'agency', rosteredAt: AGENCY, tiedDays: 400 });
    const res = fakeResponse();
    await controller.remove(req(), res);
    expect(res.statusCode).toBe(200);
    expect(agencyPrRepository.setApproveStatus).toHaveBeenCalledWith(AGENCY, PR, 'left', expect.any(String));
  });

  it('lets an admin detach under a year — the admin is who the rule hands it to', async () => {
    const { controller, agencyPrRepository } = controllerFor({ lane: 'admin', rosteredAt: AGENCY, tiedDays: 100 });
    const res = fakeResponse();
    await controller.remove(req(), res);
    expect(res.statusCode).toBe(200);
    expect(agencyPrRepository.setApproveStatus).toHaveBeenCalledTimes(1);
  });
});

describe('POST /pr/:id/detach-request — the agency files', () => {
  it("files for the caller's own agency and answers 201 with the sentence", async () => {
    const { controller, state } = controllerFor({ lane: 'agency', rosteredAt: AGENCY, tiedDays: 100 });
    const res = fakeResponse();
    await controller.requestDetach(req(), res);
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toMatch(/^Detach request sent for Vicky Tan/);
    expect(state.requests[0]).toMatchObject({ subscriberId: AGENCY, subjectUserId: PR });
  });

  it("a PR on ANOTHER agency's roster is a 404 — nothing is filed", async () => {
    const { controller, deps, state } = controllerFor({ lane: 'agency', rosteredAt: OTHER_AGENCY, tiedDays: 100 });
    const res = fakeResponse();
    await controller.requestDetach(req(), res);
    expect(res.statusCode).toBe(404);
    expect(deps.calls.insert).toBe(0);
    expect(state.requests).toHaveLength(0);
  });

  it('an admin is told to detach directly instead of filing to itself', async () => {
    const { controller, deps } = controllerFor({ lane: 'admin', rosteredAt: AGENCY, tiedDays: 100 });
    const res = fakeResponse();
    await controller.requestDetach(req(), res);
    expect(res.statusCode).toBe(400);
    expect(deps.calls.insert).toBe(0);
  });
});
