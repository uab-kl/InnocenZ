import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT THE SERVER LETS A LANE DO, after "demoting a member doesn't reduce what
 * the server lets them do" (28 Sep 2026).
 *
 * `requirePermission` used to fall back to the union of EVERY `user_role` row
 * whenever the caller had no active membership of the module's portal, so a
 * surviving `Owner` row answered for somebody demoted or removed. The fallback
 * now counts only roles with no lane (the portal-less `pr` role, admin-portal
 * roles). This file proves two things:
 *
 *  1. NOTHING LEGITIMATE MOVED. For all 11 lanes — agency owner, guarantor,
 *     finance, director; outlet owner, guarantor, finance, ops head, director;
 *     admin; PR — every module key × verb answers exactly what `role_permission`
 *     grants today. The org grants are `ROLE_GRANTS` from `seed-rbac.ts`
 *     (`pnpm rbac:seed-check` proves the live table equals it); the PR and
 *     module rows below were read from the live database on 28 Sep 2026.
 *  2. THE HOLE IS SHUT. A stale org role answers nothing without the lane.
 *
 * And the agency half of `POST /shift-sale` / `POST /special-service`: the lane
 * the caller holds at the agency the request acts for, never "has a venue
 * membership somewhere".
 */

type RoleRow = {
  userId: string;
  roleId: string;
  roleName: string;
  portalId: string | null;
  portalCode: string | null;
};
type Membership = { id: string; userId: string; status: string; subRole: string };
type AgencyMembership = Membership & { agencyId: string };
type OutletMembership = Membership & { outletId: string };

const world = vi.hoisted(() => ({
  roles: [] as RoleRow[],
  agency: [] as AgencyMembership[],
  outlet: [] as OutletMembership[],
  /** `${portal}/${roleName}` → Set of `module:verb`. Filled below from ROLE_GRANTS. */
  grants: new Map<string, Set<string>>(),
}));

/**
 * Every module key and the portals it exists on — `m_module` read live on
 * 28 Sep 2026 (19 keys; identical to `MODULES` in seed-rbac.ts).
 */
const MODULE_PORTALS: Record<string, string[]> = {
  access_control: ['admin'],
  approvals: ['agency'],
  audit_log: ['admin'],
  billing: ['admin', 'outlet'],
  booking: ['outlet'],
  collections: ['agency'],
  dashboard: ['admin', 'agency', 'outlet'],
  history: ['agency', 'outlet'],
  payment_voucher: ['agency'],
  plan: ['admin'],
  rating: ['outlet'],
  roster: ['agency'],
  sales: ['outlet'],
  settings: ['agency', 'outlet'],
  special_service: ['admin', 'outlet'],
  subscription: ['admin'],
  user_management: ['admin'],
  workforce: ['agency'],
  workspace: ['outlet'],
};

/**
 * The portal-less `pr` role's grants, read live on 28 Sep 2026 — NOT in
 * seed-rbac (which seeds it none) and not covered by `rbac:seed-check`, which
 * skips portal-less roles. These four reads are the reason the fallback exists.
 */
const PR_GRANTS = new Set([
  'dashboard:read',
  'payment_voucher:read',
  'rating:read',
  'roster:read',
]);

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/composition-root.js', () => {
  const grantsOf = (roleName: string, portalCode: string | null) =>
    portalCode === null && roleName === 'pr'
      ? PR_GRANTS
      : (world.grants.get(`${portalCode}/${roleName}`) ?? new Set<string>());
  return {
    authRepository: {
      getRolesForUserIds: async (ids: string[]) =>
        world.roles.filter((r) => ids.includes(r.userId)),
      modulePortalCodes: async (key: string) => [...(MODULE_PORTALS[key] ?? [])].sort(),
      // As the query: this role, on this portal, holds key:verb.
      roleHasPermission: async (roleName: string, portal: string, key: string, verb: string) =>
        grantsOf(roleName, portal).has(`${key}:${verb}`),
      // As the query: one row per grant of every role the account holds.
      getUserPermissions: async (userId: string) =>
        world.roles
          .filter((r) => r.userId === userId)
          .flatMap((r) =>
            [...grantsOf(r.roleName, r.portalCode)].map((g) => {
              const [moduleKey, permissionType] = g.split(':');
              return { roleId: r.roleId, moduleKey, permissionType };
            }),
          ),
    },
    agencyMemberRepository: {
      listByUser: async (userId: string) => world.agency.filter((m) => m.userId === userId),
    },
    outletMemberRepository: {
      listByUser: async (userId: string) => world.outlet.filter((m) => m.userId === userId),
    },
    agencyOutletRepository: { listApprovedOutletIdsForAgency: async () => [] },
  };
});

import { ROLE_GRANTS } from '@/scripts/seed-rbac';
import {
  grantedToRoles,
  requirePermission,
  rolesAnsweringWithoutMembership,
} from './require-permission';
import {
  requireAgencyLaneIfNotOutletMember,
  requireAgencyPermissionIfNotOutletMember,
} from './require-sub-role';

for (const entry of ROLE_GRANTS) {
  if (entry.grant === '*' || !entry.portal) continue;
  const set = new Set<string>();
  for (const [key, verbs] of entry.grant) for (const v of verbs) set.add(`${key}:${v}`);
  world.grants.set(`${entry.portal}/${entry.roleName}`, set);
}

const ROLE_NAME: Record<string, string> = {
  owner: 'Owner',
  finance: 'Finance',
  director: 'Director',
  guarantor: 'Guarantor',
  operations_head: 'Ops Head',
};

function roleRow(userId: string, portal: 'agency' | 'outlet' | 'admin' | null, roleName: string): RoleRow {
  return {
    userId,
    roleId: `${portal ?? 'none'}:${roleName}`,
    roleName,
    portalId: portal ? `portal-${portal}` : null,
    portalCode: portal,
  };
}

function reset() {
  world.roles = [];
  world.agency = [];
  world.outlet = [];
}

let seq = 0;
function joinAgency(userId: string, agencyId: string, subRole: string, status = 'active') {
  world.agency.push({ id: `am-${++seq}`, userId, agencyId, subRole, status });
}
function joinOutlet(userId: string, outletId: string, subRole: string, status = 'active') {
  world.outlet.push({ id: `om-${++seq}`, userId, outletId, subRole, status });
}
function holdRole(userId: string, portal: 'agency' | 'outlet' | 'admin' | null, roleName: string) {
  world.roles.push(roleRow(userId, portal, roleName));
}

function request(
  userId: string,
  headers: Record<string, string> = {},
  params: Record<string, string> = {},
): Request {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    user: { id: userId },
    params,
    body: {},
    header: (name: string) => lower[name.toLowerCase()],
  } as unknown as Request;
}

async function run(
  mw: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
): Promise<number> {
  let status = 0;
  let passed = false;
  const res = {
    status(code: number) {
      status = code;
      return res;
    },
    json() {
      return res;
    },
  } as unknown as Response;
  await mw(req, res, () => {
    passed = true;
  });
  return passed ? 200 : status;
}

const VERBS = ['create', 'read', 'update'] as const;
const MODULES = Object.keys(MODULE_PORTALS);

type Lane =
  | { kind: 'org'; portal: 'agency' | 'outlet'; subRole: string }
  | { kind: 'admin' }
  | { kind: 'pr' };

const LANES: Array<[string, Lane]> = [
  ['agency:owner', { kind: 'org', portal: 'agency', subRole: 'owner' }],
  ['agency:guarantor', { kind: 'org', portal: 'agency', subRole: 'guarantor' }],
  ['agency:finance', { kind: 'org', portal: 'agency', subRole: 'finance' }],
  ['agency:director', { kind: 'org', portal: 'agency', subRole: 'director' }],
  ['outlet:owner', { kind: 'org', portal: 'outlet', subRole: 'owner' }],
  ['outlet:guarantor', { kind: 'org', portal: 'outlet', subRole: 'guarantor' }],
  ['outlet:finance', { kind: 'org', portal: 'outlet', subRole: 'finance' }],
  ['outlet:operations_head', { kind: 'org', portal: 'outlet', subRole: 'operations_head' }],
  ['outlet:director', { kind: 'org', portal: 'outlet', subRole: 'director' }],
  ['admin', { kind: 'admin' }],
  ['pr', { kind: 'pr' }],
];

/** What `role_permission` grants this lane today — the oracle. */
function granted(lane: Lane, key: string, verb: string): boolean {
  if (lane.kind === 'admin') return true;
  if (lane.kind === 'pr') return PR_GRANTS.has(`${key}:${verb}`);
  if (!MODULE_PORTALS[key].includes(lane.portal)) return false;
  return world.grants.get(`${lane.portal}/${ROLE_NAME[lane.subRole]}`)!.has(`${key}:${verb}`);
}

/** Seat a user in the lane exactly as a correctly-synced account looks. */
function seat(userId: string, lane: Lane): Record<string, string> {
  if (lane.kind === 'admin') {
    holdRole(userId, 'admin', 'admin');
    return {};
  }
  if (lane.kind === 'pr') {
    holdRole(userId, null, 'pr');
    return {};
  }
  const orgId = `${lane.portal}-org-1`;
  if (lane.portal === 'agency') joinAgency(userId, orgId, lane.subRole);
  else joinOutlet(userId, orgId, lane.subRole);
  holdRole(userId, lane.portal, ROLE_NAME[lane.subRole]);
  return { 'x-org-id': orgId, 'x-org-kind': lane.portal };
}

describe('the grant table is loaded', () => {
  it('has all nine org lanes from seed-rbac', () => {
    expect([...world.grants.keys()].sort()).toEqual([
      'agency/Director',
      'agency/Finance',
      'agency/Guarantor',
      'agency/Owner',
      'outlet/Director',
      'outlet/Finance',
      'outlet/Guarantor',
      'outlet/Ops Head',
      'outlet/Owner',
    ]);
  });
});

describe('requirePermission — all 11 lanes keep exactly what role_permission grants', () => {
  beforeEach(reset);

  it.each(LANES)('%s — every module × verb, with the portal headers', async (_name, lane) => {
    const headers = seat('user-1', lane);
    const mismatches: string[] = [];
    for (const key of MODULES) {
      for (const verb of VERBS) {
        const got = (await run(requirePermission(key, verb), request('user-1', headers))) === 200;
        if (got !== granted(lane, key, verb)) mismatches.push(`${key}:${verb} got ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it.each(LANES)('%s — the same answers when no header is sent (one organisation)', async (_name, lane) => {
    seat('user-1', lane);
    const mismatches: string[] = [];
    for (const key of MODULES) {
      for (const verb of VERBS) {
        const got = (await run(requirePermission(key, verb), request('user-1'))) === 200;
        if (got !== granted(lane, key, verb)) mismatches.push(`${key}:${verb} got ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('somebody on BOTH portals is judged by the lane of the organisation they name', async () => {
    joinAgency('both', 'agency-A', 'owner');
    joinOutlet('both', 'venue-V', 'director');
    holdRole('both', 'agency', 'Owner');
    holdRole('both', 'outlet', 'Director');
    const asAgency = request('both', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' });
    const asVenue = request('both', { 'x-org-id': 'venue-V', 'x-org-kind': 'outlet' });
    expect(await run(requirePermission('settings', 'update'), asAgency)).toBe(200);
    expect(await run(requirePermission('settings', 'update'), asVenue)).toBe(403);
    expect(await run(requirePermission('payment_voucher', 'update'), asVenue)).toBe(200);
    expect(await run(requirePermission('booking', 'create'), asAgency)).toBe(403);
  });
});

describe('requirePermission — a stale org role answers nothing without the lane', () => {
  beforeEach(reset);

  it('REMOVED at their only agency, Owner row left behind: refused', async () => {
    joinAgency('gone', 'agency-A', 'owner', 'inactive');
    holdRole('gone', 'agency', 'Owner');
    for (const [key, verb] of [
      ['payment_voucher', 'update'],
      ['roster', 'update'],
      ['workforce', 'update'],
      ['settings', 'update'],
    ] as const) {
      expect(await run(requirePermission(key, verb), request('gone'))).toBe(403);
    }
  });

  it('a venue owner who WAS an agency owner cannot use the old agency title', async () => {
    joinOutlet('ex', 'venue-V', 'owner');
    holdRole('ex', 'outlet', 'Owner');
    joinAgency('ex', 'agency-A', 'owner', 'inactive');
    holdRole('ex', 'agency', 'Owner');
    const req = request('ex', { 'x-org-id': 'venue-V', 'x-org-kind': 'outlet' });
    expect(await run(requirePermission('workforce', 'update'), req)).toBe(403);
    expect(await run(requirePermission('payment_voucher', 'update'), req)).toBe(403);
    // Their venue title still answers for the venue.
    expect(await run(requirePermission('booking', 'create'), req)).toBe(200);
  });

  it('DEMOTED to director, Owner row left behind: the lane decides', async () => {
    joinAgency('demoted', 'agency-A', 'director');
    holdRole('demoted', 'agency', 'Owner');
    holdRole('demoted', 'agency', 'Director');
    const req = request('demoted', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' });
    expect(await run(requirePermission('payment_voucher', 'update'), req)).toBe(403);
    expect(await run(requirePermission('payment_voucher', 'read'), req)).toBe(200);
  });

  it('a PR keeps the phone’s reads even beside a stale org role — and gains nothing from it', async () => {
    holdRole('pr-1', null, 'pr');
    holdRole('pr-1', 'agency', 'Owner');
    expect(await run(requirePermission('payment_voucher', 'read'), request('pr-1'))).toBe(200);
    expect(await run(requirePermission('roster', 'read'), request('pr-1'))).toBe(200);
    expect(await run(requirePermission('payment_voucher', 'update'), request('pr-1'))).toBe(403);
    expect(await run(requirePermission('workforce', 'update'), request('pr-1'))).toBe(403);
  });
});

describe('the fallback decision, as pure functions', () => {
  const r = (portalCode: string | null, roleId: string) => ({ roleId, portalCode });

  it('keeps pr and admin-portal roles, drops every agency and outlet role', () => {
    const kept = rolesAnsweringWithoutMembership([
      r(null, 'pr'),
      r('admin', 'support'),
      r('agency', 'a-owner'),
      r('outlet', 'o-owner'),
    ]);
    expect(kept.map((x) => x.roleId)).toEqual(['pr', 'support']);
  });

  it('matches key AND verb AND one of the named roles', () => {
    const grants = [
      { roleId: 'pr', moduleKey: 'roster', permissionType: 'read' },
      { roleId: 'a-owner', moduleKey: 'roster', permissionType: 'update' },
    ];
    const ids = new Set(['pr']);
    expect(grantedToRoles(grants, ids, 'roster', 'read')).toBe(true);
    expect(grantedToRoles(grants, ids, 'roster', 'update')).toBe(false);
    expect(grantedToRoles(grants, ids, 'workforce', 'read')).toBe(false);
  });
});

describe('the agency half of POST /shift-sale and POST /special-service', () => {
  beforeEach(reset);
  const guard = () => requireAgencyPermissionIfNotOutletMember('payment_voucher', 'create');

  it.each([
    ['owner', 200],
    ['guarantor', 200],
    ['finance', 200],
    ['director', 403],
  ])('agency %s → %i', async (subRole, expected) => {
    joinAgency('a', 'agency-A', subRole);
    holdRole('a', 'agency', ROLE_NAME[subRole]);
    expect(await run(guard(), request('a', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' }))).toBe(expected);
    // No header, one agency: the same answer.
    expect(await run(guard(), request('a'))).toBe(expected);
  });

  it('a Director with an Owner row left behind is still a Director', async () => {
    joinAgency('d', 'agency-A', 'director');
    holdRole('d', 'agency', 'Owner');
    expect(await run(guard(), request('d'))).toBe(403);
  });

  it('THE HOLE: a venue owner who is a Director at an agency, acting for the agency — refused', async () => {
    joinOutlet('v', 'venue-V', 'owner');
    holdRole('v', 'outlet', 'Owner');
    joinAgency('v', 'agency-A', 'director');
    holdRole('v', 'agency', 'Director');
    expect(await run(guard(), request('v', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' }))).toBe(403);
    // Acting for their own venue, they are the venue guard's business.
    expect(await run(guard(), request('v', { 'x-org-id': 'venue-V', 'x-org-kind': 'outlet' }))).toBe(200);
  });

  it('judges the agency the request NAMES, not the first one', async () => {
    joinAgency('m', 'agency-A', 'owner');
    joinAgency('m', 'agency-B', 'director');
    holdRole('m', 'agency', 'Owner');
    holdRole('m', 'agency', 'Director');
    expect(await run(guard(), request('m', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' }))).toBe(200);
    expect(await run(guard(), request('m', { 'x-org-id': 'agency-B', 'x-org-kind': 'agency' }))).toBe(403);
    // Two agencies and none named: asked, never guessed.
    expect(await run(guard(), request('m'))).toBe(400);
  });

  it('a PR, a venue-only operator and an admin are not agency callers', async () => {
    holdRole('pr-1', null, 'pr');
    expect(await run(guard(), request('pr-1'))).toBe(200);
    joinOutlet('op', 'venue-V', 'director');
    holdRole('op', 'outlet', 'Director');
    expect(await run(guard(), request('op'))).toBe(200);
    holdRole('adm', 'admin', 'admin');
    expect(await run(guard(), request('adm'))).toBe(200);
  });
});

describe('requireAgencyLaneIfNotOutletMember — the workspace PUT keeps its callers', () => {
  beforeEach(reset);
  const guard = () => requireAgencyLaneIfNotOutletMember('owner');
  const onVenue = (userId: string, headers: Record<string, string> = {}) =>
    request(userId, headers, { outletId: 'venue-V' });

  it('agency owner and guarantor pass; finance and director do not', async () => {
    for (const [subRole, expected] of [
      ['owner', 200],
      ['guarantor', 200],
      ['finance', 403],
      ['director', 403],
    ] as const) {
      reset();
      joinAgency('a', 'agency-A', subRole);
      holdRole('a', 'agency', ROLE_NAME[subRole]);
      expect(await run(guard(), onVenue('a'))).toBe(expected);
    }
  });

  it('a member of THE venue in the path passes even from the agency console', async () => {
    joinOutlet('v', 'venue-V', 'owner');
    holdRole('v', 'outlet', 'Owner');
    joinAgency('v', 'agency-A', 'director');
    holdRole('v', 'agency', 'Director');
    expect(await run(guard(), onVenue('v', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' }))).toBe(200);
  });

  it('a member of ANOTHER venue no longer skips the agency check', async () => {
    joinOutlet('w', 'venue-W', 'owner');
    holdRole('w', 'outlet', 'Owner');
    joinAgency('w', 'agency-A', 'director');
    holdRole('w', 'agency', 'Director');
    expect(await run(guard(), onVenue('w', { 'x-org-id': 'agency-A', 'x-org-kind': 'agency' }))).toBe(403);
  });
});
