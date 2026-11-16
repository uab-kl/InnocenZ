import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHICH MEMBERSHIP ROW AN INVITE OR A JOIN REQUEST TOUCHES (12 Nov 2026).
 *
 * A person may hold several rows at one organisation — the active index is
 * partial (0160) and `requestJoin` inserts a fresh pending row beside a decline
 * on purpose. Pinned here, against fakes (this project never probes a write
 * gate with a write):
 *
 *  - accept activates the row the ordered lookup returns, and NEVER revives a
 *    declined row — it inserts a fresh active one, so the decliner's name
 *    survives, the same rule `requestJoin` follows;
 *  - a former member's inactive row is still reused (it holds a real id);
 *  - a unique violation on "ask to join" is a 409 with a sentence, not a 500.
 */

vi.mock('@/util/r2', () => ({
  r2DeleteStoredRef: vi.fn(),
  r2Configured: vi.fn(() => false),
  r2PutObject: vi.fn(),
  r2GetObject: vi.fn(),
  r2KeyFromSignedUrl: vi.fn(),
  r2KeyFromStoredRef: vi.fn(),
  r2SignedGetUrl: vi.fn(),
  isSensitiveR2Key: vi.fn(() => false),
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mocks = vi.hoisted(() => {
  const resync = vi.fn(async () => ({ granted: [] as string[], revoked: [] as string[] }));
  const activate = vi.fn(async () => undefined);
  return {
    access: async (importOriginal: () => Promise<unknown>) => ({
      ...((await importOriginal()) as object),
      resyncPortalRoles: resync,
    }),
    activate: () => ({ activateOrgMembership: activate }),
  };
});
vi.mock('@/features/rbac/membership-access', mocks.access);
vi.mock('@/features/rbac/membership-access.js', mocks.access);
vi.mock('@/util/activate-membership', mocks.activate);
vi.mock('@/util/activate-membership.js', mocks.activate);

import { OrgMemberInviteControllerClass, reusableMembership } from './org-member-invite.controller';
import { activateOrgMembership } from '@/util/activate-membership';
import { resyncPortalRoles } from '@/features/rbac/membership-access';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const OUTLET = '44444444-4444-4444-8444-444444444444';
const USER = 'target-user';

type Row = { id: string; status: string; memberCode: string | null; firstActivatedAt: Date | null };
const row = (id: string, status: string): Row => ({
  id,
  status,
  memberCode: status === 'inactive' ? 'INNATAGY0003' : 'INNPND0007',
  firstActivatedAt: status === 'inactive' ? new Date('2026-08-01') : null,
});

function fakeResponse() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function controller(opts: {
  kind: 'agency' | 'outlet';
  /** What the ORDERED lookup returns — the repository's job, proved in membership-pick-order.test.ts. */
  picked?: Row | null;
  mine?: Array<Row & { agencyId?: string; outletId?: string }>;
  addFails?: unknown;
}) {
  const invite = {
    id: 'invite-1',
    email: 'invitee@example.com',
    agencyId: opts.kind === 'agency' ? AGENCY : null,
    outletId: opts.kind === 'outlet' ? OUTLET : null,
    roleId: 'role-Finance',
    subRole: 'finance',
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000),
  };
  const add = vi.fn(async () => {
    if (opts.addFails) throw opts.addFails;
    return { id: 'fresh-row' };
  });
  const memberRepo = {
    getByAgencyAndUser: vi.fn(async () => opts.picked ?? null),
    getByOutletAndUser: vi.fn(async () => opts.picked ?? null),
    listByUser: vi.fn(async () => opts.mine ?? []),
    update: vi.fn(async (id: string) => ({ id })),
    add,
  };
  const inviteRepository = { getById: vi.fn(async () => invite), update: vi.fn(async () => invite) };
  const org = { getById: vi.fn(async (id: string) => ({ id, name: 'Atlas', status: 'active' })) };
  const c = new OrgMemberInviteControllerClass(
    inviteRepository as never,
    memberRepo as never,
    memberRepo as never,
    org as never,
    org as never,
    { getUserById: vi.fn(async () => ({ id: USER, email: 'invitee@example.com' })) } as never,
    { getRoleById: vi.fn(async () => ({ id: 'role-Finance', roleName: 'Finance' })) } as never,
    { assignRoleToUser: vi.fn(), getUserRoles: vi.fn(async () => []) } as never,
    {} as never,
  );
  return { c, memberRepo, inviteRepository };
}

const acceptReq = () =>
  ({ body: { inviteId: '33333333-3333-4333-8333-333333333333' }, user: { id: USER } }) as unknown as Request;
const joinReq = (kind: 'agency' | 'outlet') =>
  ({
    body: { kind, orgId: kind === 'agency' ? AGENCY : OUTLET, subRole: 'finance' },
    user: { id: USER },
  }) as unknown as Request;

beforeEach(() => {
  vi.mocked(activateOrgMembership).mockClear();
  vi.mocked(resyncPortalRoles).mockClear();
});

describe('reusableMembership — the rule both accept paths share', () => {
  it('a decline is never reused; every other row is', () => {
    expect(reusableMembership(null)).toBeNull();
    expect(reusableMembership(row('r', 'rejected'))).toBeNull();
    for (const status of ['pending', 'inactive', 'active']) {
      expect(reusableMembership(row('x', status))?.id).toBe('x');
    }
  });
});

describe.each(['agency', 'outlet'] as const)('accept on the %s portal', (kind) => {
  it('a person holding only a DECLINED row gets a fresh active row — the decline is left alone', async () => {
    const t = controller({ kind, picked: row('declined-row', 'rejected') });
    const res = fakeResponse();
    await t.c.accept(acceptReq(), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Invitation accepted');
    expect(activateOrgMembership).not.toHaveBeenCalled();
    expect(t.memberRepo.add).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, status: 'active', subRole: 'finance' }),
    );
  });

  it('the newer PENDING request is the row activated (the lookup ranks it above the decline)', async () => {
    const t = controller({ kind, picked: row('pending-row', 'pending') });
    const res = fakeResponse();
    await t.c.accept(acceptReq(), res);

    expect(res.statusCode).toBe(200);
    expect(activateOrgMembership).toHaveBeenCalledWith(
      expect.objectContaining({ kind, membershipId: 'pending-row', subRole: 'finance' }),
    );
    expect(t.memberRepo.add).not.toHaveBeenCalled();
  });

  it('a former member’s inactive row is still reused — it carries their real id', async () => {
    const t = controller({ kind, picked: row('former-row', 'inactive') });
    const res = fakeResponse();
    await t.c.accept(acceptReq(), res);

    expect(activateOrgMembership).toHaveBeenCalledWith(
      expect.objectContaining({ membershipId: 'former-row', current: expect.objectContaining({ memberCode: 'INNATAGY0003' }) }),
    );
    expect(t.memberRepo.add).not.toHaveBeenCalled();
  });

  it('an active row is "Already a member" — nothing inserted or activated', async () => {
    const t = controller({ kind, picked: row('active-row', 'active') });
    const res = fakeResponse();
    await t.c.accept(acceptReq(), res);

    expect(res.body.message).toBe('Already a member');
    expect(activateOrgMembership).not.toHaveBeenCalled();
    expect(t.memberRepo.add).not.toHaveBeenCalled();
  });
});

describe.each(['agency', 'outlet'] as const)('ask to join on the %s side', (kind) => {
  const orgKey = kind === 'agency' ? 'agencyId' : 'outletId';
  const orgId = kind === 'agency' ? AGENCY : OUTLET;

  it('a unique violation from the write is a 409 that says the request is on file — never a 500', async () => {
    const t = controller({ kind, addFails: { cause: { code: '23505', constraint: 'agency_user_pending_request_unique' } } });
    const res = fakeResponse();
    await t.c.requestJoin(joinReq(kind), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already asked to join Atlas/);
  });

  it('any OTHER failure is still a 500', async () => {
    const t = controller({ kind, addFails: new Error('connection reset') });
    const res = fakeResponse();
    await t.c.requestJoin(joinReq(kind), res);
    expect(res.statusCode).toBe(500);
  });

  it('a fresh request beside a decline still inserts (unchanged)', async () => {
    const t = controller({ kind, mine: [{ ...row('declined-row', 'rejected'), [orgKey]: orgId }] });
    const res = fakeResponse();
    await t.c.requestJoin(joinReq(kind), res);

    expect(res.statusCode).toBe(201);
    expect(t.memberRepo.add).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }));
    expect(t.memberRepo.update).not.toHaveBeenCalled();
  });
});
