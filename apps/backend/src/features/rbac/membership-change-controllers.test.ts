import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE MEMBER ENDPOINTS, around `commitMembershipChange` (28 Sep 2026).
 *
 * `PUT /agency|outlet/:id/members/:memberId` used to write the title, ignore
 * the result, prune roles only for one-organisation people and reply 200
 * "Member updated" whatever happened. Pinned here:
 *
 *  - the title/status write goes through the transaction handed to it, and
 *    the recompute + invite withdrawal ride in the same call;
 *  - a write that came back empty — or any failure inside — is a 500 that says
 *    nothing changed, NEVER 200, and nothing is activated afterwards;
 *  - invitations are withdrawn on a new title, a departure and a removal, and
 *    left alone when a member is reinstated with the title they already had;
 *  - the self-lockout and last-owner guards still refuse before anything runs;
 *  - invite acceptance recomputes the roles instead of adding the invite's.
 */

const h = vi.hoisted(() => ({
  TX: { __tx: true },
  commitFails: false,
}));

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
  // ONE spy per export, shared by both specifiers ('…' and '….js'), so a call
  // made through either import is seen by the assertions below.
  const commit = vi.fn();
  const resync = vi.fn(async () => ({ granted: [] as string[], revoked: [] as string[] }));
  const activate = vi.fn(async () => undefined);
  return {
    access: async (importOriginal: () => Promise<unknown>) => {
      const actual = (await importOriginal()) as typeof import('./membership-access');
      // The transaction is proved in membership-access.test.ts; here it is the
      // boundary the controllers must hand their write to.
      commit.mockImplementation(async (input: { write: (tx: unknown) => Promise<unknown> }) => {
        const written = await input.write(h.TX);
        if (!written) throw new actual.MembershipChangeNotSavedError();
        if (h.commitFails) throw new Error('role not seeded / database error');
        return written;
      });
      return { ...actual, commitMembershipChange: commit, resyncPortalRoles: resync };
    },
    activate: () => ({ activateOrgMembership: activate }),
  };
});
vi.mock('@/features/rbac/membership-access', mocks.access);
vi.mock('@/features/rbac/membership-access.js', mocks.access);
vi.mock('@/util/activate-membership', mocks.activate);
vi.mock('@/util/activate-membership.js', mocks.activate);

import { AgencyControllerClass } from '@/features/agency/agency.controller';
import { OutletControllerClass } from '@/features/outlet/outlet.controller';
import { OrgMemberInviteControllerClass } from '@/features/auth/org-member-invite.controller';
import {
  commitMembershipChange,
  MEMBERSHIP_CHANGE_NOT_SAVED,
  resyncPortalRoles,
} from '@/features/rbac/membership-access';
import { activateOrgMembership } from '@/util/activate-membership';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = 'owner-user';
const TARGET_ID = 'target-user';

type Row = {
  id: string;
  agencyId?: string;
  outletId?: string;
  userId: string;
  subRole: string;
  status: string;
  memberCode: string | null;
  firstActivatedAt: Date | null;
};

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

function memberRepo(org: 'agency' | 'outlet', target: Row, others: Row[] = []) {
  const all = [target, ...others];
  return {
    getByIdEnriched: vi.fn(async (id: string) => all.find((m) => m.id === id) ?? null),
    getById: vi.fn(async (id: string) => all.find((m) => m.id === id) ?? null),
    listByAgency: vi.fn(async () => all),
    listByOutletWithUser: vi.fn(async () => all),
    update: vi.fn(async (_id: string, patch: Record<string, unknown>, _tx?: unknown) => ({
      ...target,
      ...patch,
    })),
    remove: vi.fn(async () => true),
    org,
  };
}

const roleRepository = {
  findByNameAndPortalCode: vi.fn(async (name: string) => ({ id: `role-${name}`, roleName: name })),
};
const userRepository = {
  getUserById: vi.fn(async (id: string) => ({ id, email: `${id}@example.com` })),
};

function agencyController(repo: ReturnType<typeof memberRepo>) {
  const unused = {} as never;
  return new AgencyControllerClass(
    unused,
    repo as never,
    unused,
    unused,
    userRepository as never,
    unused,
    roleRepository as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
}

function outletController(repo: ReturnType<typeof memberRepo>) {
  const unused = {} as never;
  return new OutletControllerClass(
    unused,
    repo as never,
    userRepository as never,
    roleRepository as never,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
}

const row = (over: Partial<Row>): Row => ({
  id: MEMBER,
  agencyId: AGENCY,
  userId: TARGET_ID,
  subRole: 'owner',
  status: 'active',
  memberCode: 'INNATAGY0002',
  firstActivatedAt: new Date('2026-08-01'),
  ...over,
});
const coOwner = row({ id: 'co-owner', userId: OWNER_ID, subRole: 'owner' });

const put = (body: Record<string, unknown>, orgKey = 'id', orgId = AGENCY) =>
  ({ params: { [orgKey]: orgId, memberId: MEMBER }, body, user: { id: OWNER_ID } }) as unknown as Request;

beforeEach(() => {
  h.commitFails = false;
  vi.mocked(commitMembershipChange).mockClear();
  vi.mocked(resyncPortalRoles).mockClear();
  vi.mocked(activateOrgMembership).mockClear();
  userRepository.getUserById.mockClear();
});

describe('PUT /agency/:id/members/:memberId', () => {
  it('a demotion writes through the transaction and withdraws the member’s invitations', async () => {
    const repo = memberRepo('agency', row({ subRole: 'owner' }), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({ subRole: 'director' }), res);

    expect(res.statusCode).toBe(200);
    expect(commitMembershipChange).toHaveBeenCalledTimes(1);
    expect(vi.mocked(commitMembershipChange).mock.calls[0][0]).toMatchObject({
      org: 'agency',
      orgId: AGENCY,
      userId: TARGET_ID,
      actor: OWNER_ID,
      withdrawInvitesFor: `${TARGET_ID}@example.com`,
    });
    // The title write carried the transaction.
    expect(repo.update).toHaveBeenCalledWith(
      MEMBER,
      { subRole: 'director', updatedBy: OWNER_ID },
      h.TX,
    );
    expect(activateOrgMembership).not.toHaveBeenCalled();
  });

  it('THE BUG: a write that came back empty is a 500 that says nothing changed — never 200', async () => {
    const repo = memberRepo('agency', row({ subRole: 'owner' }), [coOwner]);
    repo.update.mockResolvedValueOnce(null as never);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({ subRole: 'director' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(MEMBERSHIP_CHANGE_NOT_SAVED);
    expect(res.body.success).toBe(false);
  });

  it('any failure inside the transaction is the same honest 500, and nothing is activated', async () => {
    h.commitFails = true;
    const repo = memberRepo('agency', row({ status: 'inactive', subRole: 'finance' }), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({ status: 'active', subRole: 'finance' }), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(MEMBERSHIP_CHANGE_NOT_SAVED);
    expect(activateOrgMembership).not.toHaveBeenCalled();
  });

  it('deactivating is removing: one write, invitations withdrawn, no activation', async () => {
    const repo = memberRepo('agency', row({ subRole: 'finance' }), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({ status: 'inactive' }), res);

    expect(res.statusCode).toBe(200);
    expect(repo.update).toHaveBeenCalledWith(MEMBER, { status: 'inactive', updatedBy: OWNER_ID }, h.TX);
    expect(vi.mocked(commitMembershipChange).mock.calls[0][0]).toMatchObject({
      withdrawInvitesFor: `${TARGET_ID}@example.com`,
    });
    expect(activateOrgMembership).not.toHaveBeenCalled();
  });

  it('reinstating with the SAME title: one write of both fields, invitations kept, activated after the commit', async () => {
    const order: string[] = [];
    vi.mocked(commitMembershipChange).mockImplementationOnce(async (input) => {
      order.push('commit');
      return (await input.write(h.TX as never)) as never;
    });
    vi.mocked(activateOrgMembership).mockImplementationOnce(async () => {
      order.push('activate');
    });
    const repo = memberRepo('agency', row({ status: 'inactive', subRole: 'finance' }), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({ status: 'active', subRole: 'finance' }), res);

    expect(res.statusCode).toBe(200);
    expect(repo.update).toHaveBeenCalledWith(
      MEMBER,
      { subRole: 'finance', status: 'active', updatedBy: OWNER_ID },
      h.TX,
    );
    expect(vi.mocked(commitMembershipChange).mock.calls[0][0]).toMatchObject({ withdrawInvitesFor: null });
    expect(userRepository.getUserById).not.toHaveBeenCalled();
    expect(order).toEqual(['commit', 'activate']);
  });

  it('an empty body changes nothing and opens no transaction', async () => {
    const repo = memberRepo('agency', row({}), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).updateMember(put({}), res);
    expect(res.statusCode).toBe(200);
    expect(commitMembershipChange).not.toHaveBeenCalled();
  });

  it('the self-lockout and last-owner guards still refuse first', async () => {
    const self = memberRepo('agency', row({ userId: OWNER_ID }));
    const res1 = fakeResponse();
    await agencyController(self).updateMember(put({ subRole: 'director' }), res1);
    expect(res1.statusCode).toBe(409);

    const lastOwner = memberRepo('agency', row({ subRole: 'owner' }));
    const res2 = fakeResponse();
    await agencyController(lastOwner).updateMember(put({ subRole: 'director' }), res2);
    expect(res2.statusCode).toBe(409);
    expect(commitMembershipChange).not.toHaveBeenCalled();
  });
});

describe('DELETE /agency/:id/members/:memberId', () => {
  const del = () =>
    ({ params: { id: AGENCY, memberId: MEMBER }, body: {}, user: { id: OWNER_ID } }) as unknown as Request;

  it('removes through the transaction and withdraws invitations', async () => {
    const repo = memberRepo('agency', row({ subRole: 'finance' }), [coOwner]);
    const res = fakeResponse();
    await agencyController(repo).removeMember(del(), res);

    expect(res.statusCode).toBe(200);
    expect(repo.remove).toHaveBeenCalledWith(MEMBER, OWNER_ID, 'inactive', h.TX);
    expect(vi.mocked(commitMembershipChange).mock.calls[0][0]).toMatchObject({
      org: 'agency',
      withdrawInvitesFor: `${TARGET_ID}@example.com`,
    });
  });

  it('a failed removal is a 500 that says nothing changed (it used to read as 404)', async () => {
    const repo = memberRepo('agency', row({ subRole: 'finance' }), [coOwner]);
    repo.remove.mockResolvedValueOnce(false);
    const res = fakeResponse();
    await agencyController(repo).removeMember(del(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(MEMBERSHIP_CHANGE_NOT_SAVED);
  });
});

describe('the outlet twin', () => {
  const venueRow = (over: Partial<Row>) => row({ agencyId: undefined, outletId: AGENCY, ...over });
  const venueCoOwner = venueRow({ id: 'co-owner', userId: OWNER_ID, subRole: 'owner' });

  it('a demotion writes through the transaction on the outlet portal', async () => {
    const repo = memberRepo('outlet', venueRow({ subRole: 'owner' }), [venueCoOwner]);
    const res = fakeResponse();
    await outletController(repo).updateMember(put({ subRole: 'director' }), res);

    expect(res.statusCode).toBe(200);
    expect(vi.mocked(commitMembershipChange).mock.calls[0][0]).toMatchObject({
      org: 'outlet',
      orgId: AGENCY,
      withdrawInvitesFor: `${TARGET_ID}@example.com`,
    });
    expect(repo.update).toHaveBeenCalledWith(MEMBER, { subRole: 'director', updatedBy: OWNER_ID }, h.TX);
  });

  it('a write that came back empty is never 200', async () => {
    const repo = memberRepo('outlet', venueRow({ subRole: 'operations_head' }), [venueCoOwner]);
    repo.update.mockResolvedValueOnce(null as never);
    const res = fakeResponse();
    await outletController(repo).updateMember(put({ subRole: 'director' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe(MEMBERSHIP_CHANGE_NOT_SAVED);
  });

  it('removal goes through the transaction too', async () => {
    const repo = memberRepo('outlet', venueRow({ subRole: 'finance' }), [venueCoOwner]);
    const res = fakeResponse();
    await outletController(repo).removeMember(
      { params: { id: AGENCY, memberId: MEMBER }, body: {}, user: { id: OWNER_ID } } as unknown as Request,
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(repo.remove).toHaveBeenCalledWith(MEMBER, OWNER_ID, 'inactive', h.TX);
  });
});

describe('POST /auth/org-member-invite/accept — roles follow the lanes', () => {
  function inviteController(invite: Record<string, unknown>, existing: Row | null) {
    const inviteRepository = {
      getById: vi.fn(async () => invite),
      update: vi.fn(async () => invite),
    };
    const agencyMemberRepository = {
      getByAgencyAndUser: vi.fn(async () => existing),
      add: vi.fn(async () => ({ id: 'new-membership' })),
    };
    const userRoleRepository = { assignRoleToUser: vi.fn(), getUserRoles: vi.fn(async () => []) };
    const unused = {} as never;
    const controller = new OrgMemberInviteControllerClass(
      inviteRepository as never,
      unused,
      agencyMemberRepository as never,
      unused,
      { getById: vi.fn(async () => ({ id: AGENCY, name: 'Atlas' })) } as never,
      { getUserById: vi.fn(async () => ({ id: TARGET_ID, email: 'invitee@example.com' })) } as never,
      { getRoleById: vi.fn(async () => ({ id: 'role-Finance', roleName: 'Finance' })) } as never,
      userRoleRepository as never,
      unused,
    );
    return { controller, inviteRepository, agencyMemberRepository, userRoleRepository };
  }
  const invite = (status: string) => ({
    id: 'invite-1',
    email: 'invitee@example.com',
    agencyId: AGENCY,
    outletId: null,
    roleId: 'role-Finance',
    subRole: 'finance',
    status,
    expiresAt: new Date(Date.now() + 86_400_000),
  });
  const accept = () =>
    ({ body: { inviteId: '33333333-3333-4333-8333-333333333333' }, user: { id: TARGET_ID } }) as unknown as Request;

  it('recomputes the roles instead of adding the invite’s role', async () => {
    const t = inviteController(invite('pending'), null);
    const res = fakeResponse();
    await t.controller.accept(accept(), res);

    expect(res.statusCode).toBe(200);
    expect(resyncPortalRoles).toHaveBeenCalledWith({ userId: TARGET_ID, org: 'agency', actor: TARGET_ID });
    expect(t.userRoleRepository.assignRoleToUser).not.toHaveBeenCalled();
    expect(t.inviteRepository.update).toHaveBeenCalledWith('invite-1', expect.objectContaining({ status: 'accepted' }));
  });

  it('a WITHDRAWN invitation cannot bring a removed member back', async () => {
    const t = inviteController(invite('cancelled'), row({ status: 'inactive', subRole: 'director' }));
    const res = fakeResponse();
    await t.controller.accept(accept(), res);

    expect(res.statusCode).toBe(409);
    expect(t.agencyMemberRepository.add).not.toHaveBeenCalled();
    expect(activateOrgMembership).not.toHaveBeenCalled();
    expect(resyncPortalRoles).not.toHaveBeenCalled();
  });
});
