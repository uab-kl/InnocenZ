import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /rbac/role-permission` and `PUT /rbac/role-permission/update/:roleId`
 * refuse to give an agency or outlet role a permission on ANOTHER portal's
 * module (risk #25).
 *
 * `settings`, `dashboard`, `history`, `billing` and `special_service` are each
 * a separate module row per portal. Only the admin role-sheet's client filter
 * kept an outlet `settings` grant off an agency role; the API took it from any
 * request. Pinned here:
 *  - a NEW cross-portal grant for an agency/outlet role -> 400 naming the module;
 *  - the admin-portal role and a portal-less (PR) role are exempt — their
 *    cross-portal grants are by design;
 *  - a grant the role ALREADY holds may be carried through a sync (the
 *    role-sheet sends grants it never renders, and must stay savable);
 *  - unknown role -> 404, unknown permission -> 400, both before any write;
 *  - a refused sync never reaches the delete-then-insert repository call.
 */

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  crossPortalGrantRefusal,
  type GrantPortalFacts,
  RolePermissionControllerClass,
} from './role-permission.controller';

const AGENCY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTLET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ADMIN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ROLE_ID = '10000000-0000-4000-8000-000000000001';
const AGENCY_SETTINGS = '20000000-0000-4000-8000-000000000001';
const OUTLET_SETTINGS = '20000000-0000-4000-8000-000000000002';
const OUTLET_BOOKING = '20000000-0000-4000-8000-000000000003';
const ORPHAN_MODULE_PERM = '20000000-0000-4000-8000-000000000004';
const MISSING = '20000000-0000-4000-8000-0000000000ff';

const PERMISSIONS: GrantPortalFacts['permissions'] = [
  { permissionId: AGENCY_SETTINGS, moduleKey: 'settings', modulePortalId: AGENCY, modulePortalCode: 'agency' },
  { permissionId: OUTLET_SETTINGS, moduleKey: 'settings', modulePortalId: OUTLET, modulePortalCode: 'outlet' },
  { permissionId: OUTLET_BOOKING, moduleKey: 'booking', modulePortalId: OUTLET, modulePortalCode: 'outlet' },
  { permissionId: ORPHAN_MODULE_PERM, moduleKey: 'settings', modulePortalId: null, modulePortalCode: null },
];

function facts(
  role: GrantPortalFacts['role'],
  requested: string[],
  held: string[] = [],
): GrantPortalFacts {
  return {
    role,
    permissions: PERMISSIONS.filter((p) => requested.includes(p.permissionId)),
    alreadyHeld: new Set(held),
  };
}

const agencyRole = { portalId: AGENCY, portalCode: 'agency' };

describe('crossPortalGrantRefusal', () => {
  it('lets an agency role hold an agency module', () => {
    expect(crossPortalGrantRefusal(facts(agencyRole, [AGENCY_SETTINGS]), [AGENCY_SETTINGS])).toBeNull();
  });

  it("refuses an agency role the OUTLET's settings twin, naming it", () => {
    const refusal = crossPortalGrantRefusal(
      facts(agencyRole, [AGENCY_SETTINGS, OUTLET_SETTINGS]),
      [AGENCY_SETTINGS, OUTLET_SETTINGS],
    );
    expect(refusal).toEqual({
      status: 400,
      message:
        'An agency role can only be given agency modules — settings (outlet) belongs to another portal.',
    });
  });

  it('words an outlet role the same way', () => {
    const refusal = crossPortalGrantRefusal(
      facts({ portalId: OUTLET, portalCode: 'outlet' }, [AGENCY_SETTINGS]),
      [AGENCY_SETTINGS],
    );
    expect(refusal?.message).toBe(
      'An outlet role can only be given outlet modules — settings (agency) belongs to another portal.',
    );
  });

  it('lets an outlet role hold its own settings twin', () => {
    expect(
      crossPortalGrantRefusal(
        facts({ portalId: OUTLET, portalCode: 'outlet' }, [OUTLET_SETTINGS, OUTLET_BOOKING]),
        [OUTLET_SETTINGS, OUTLET_BOOKING],
      ),
    ).toBeNull();
  });

  it('names every foreign module once', () => {
    const refusal = crossPortalGrantRefusal(
      facts(agencyRole, [OUTLET_SETTINGS, OUTLET_BOOKING]),
      [OUTLET_SETTINGS, OUTLET_BOOKING, OUTLET_SETTINGS],
    );
    expect(refusal?.status).toBe(400);
    expect(refusal?.message).toContain('settings (outlet), booking (outlet) belong to another portal');
  });

  it('refuses a module that has no portal at all', () => {
    const refusal = crossPortalGrantRefusal(facts(agencyRole, [ORPHAN_MODULE_PERM]), [ORPHAN_MODULE_PERM]);
    expect(refusal?.status).toBe(400);
    expect(refusal?.message).toContain('settings (no portal)');
  });

  it('lets a sync CARRY a cross-portal grant the role already holds', () => {
    expect(
      crossPortalGrantRefusal(
        facts(agencyRole, [AGENCY_SETTINGS, OUTLET_SETTINGS], [OUTLET_SETTINGS]),
        [AGENCY_SETTINGS, OUTLET_SETTINGS],
      ),
    ).toBeNull();
  });

  it('exempts the admin-portal role (booking/rating/roster/payment_voucher by design)', () => {
    expect(
      crossPortalGrantRefusal(
        facts({ portalId: ADMIN, portalCode: 'admin' }, [OUTLET_BOOKING, AGENCY_SETTINGS]),
        [OUTLET_BOOKING, AGENCY_SETTINGS],
      ),
    ).toBeNull();
  });

  it('exempts a portal-less role (the mobile PR role reads across portals)', () => {
    expect(
      crossPortalGrantRefusal(
        facts({ portalId: null, portalCode: null }, [OUTLET_BOOKING, AGENCY_SETTINGS]),
        [OUTLET_BOOKING, AGENCY_SETTINGS],
      ),
    ).toBeNull();
  });

  it('answers 404 for a role that does not exist', () => {
    expect(crossPortalGrantRefusal(facts(null, [AGENCY_SETTINGS]), [AGENCY_SETTINGS])).toEqual({
      status: 404,
      message: 'Role not found.',
    });
  });

  it('answers 400 for a permission that does not exist, even for an exempt role', () => {
    const refusal = crossPortalGrantRefusal(
      facts({ portalId: ADMIN, portalCode: 'admin' }, [AGENCY_SETTINGS]),
      [AGENCY_SETTINGS, MISSING],
    );
    expect(refusal?.status).toBe(400);
    expect(refusal?.message).toContain(MISSING);
  });

  it('allows emptying a role', () => {
    expect(crossPortalGrantRefusal(facts(agencyRole, []), [])).toBeNull();
  });
});

function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

describe('RolePermissionControllerClass — the guard runs before any write', () => {
  const repo = {
    getRolePermissions: vi.fn(),
    assignPermissionsToRole: vi.fn(async () => ({ id: 'rp-1' })),
    removeAllPermissionsFromRole: vi.fn(),
    updateRolePermission: vi.fn(async () => []),
  };
  let loadFacts: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    loadFacts = vi.fn(async (_roleId: string, ids: readonly string[]) => facts(agencyRole, [...ids]));
  });

  function controller() {
    return new RolePermissionControllerClass(repo as never, loadFacts as never);
  }

  it('PUT sync with a new cross-portal grant -> 400 and the role is left untouched', async () => {
    const res = fakeRes();
    await controller().updateRolePermissions(
      { params: { roleId: ROLE_ID }, body: { permissionIds: [AGENCY_SETTINGS, OUTLET_SETTINGS] } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toContain('settings (outlet)');
    expect(loadFacts).toHaveBeenCalledWith(ROLE_ID, [AGENCY_SETTINGS, OUTLET_SETTINGS]);
    expect(repo.updateRolePermission).not.toHaveBeenCalled();
  });

  it('PUT sync of same-portal grants still syncs', async () => {
    const res = fakeRes();
    await controller().updateRolePermissions(
      { params: { roleId: ROLE_ID }, body: { permissionIds: [AGENCY_SETTINGS] } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(200);
    expect(repo.updateRolePermission).toHaveBeenCalledWith(ROLE_ID, [AGENCY_SETTINGS], expect.any(String), expect.any(String));
  });

  it('POST assign of a cross-portal grant -> 400, nothing inserted', async () => {
    const res = fakeRes();
    await controller().assignPermissionsToRole(
      { body: { roleId: ROLE_ID, permissionId: OUTLET_BOOKING } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { message: string }).message).toContain('booking (outlet)');
    expect(repo.assignPermissionsToRole).not.toHaveBeenCalled();
  });

  it('POST assign of a same-portal grant still inserts', async () => {
    const res = fakeRes();
    await controller().assignPermissionsToRole(
      { body: { roleId: ROLE_ID, permissionId: AGENCY_SETTINGS } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(201);
    expect(repo.assignPermissionsToRole).toHaveBeenCalledTimes(1);
  });

  it('an unreadable grant table is a 500, never a silent pass', async () => {
    loadFacts.mockRejectedValueOnce(new globalThis.Error('db down'));
    const res = fakeRes();
    await controller().updateRolePermissions(
      { params: { roleId: ROLE_ID }, body: { permissionIds: [AGENCY_SETTINGS] } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.statusCode).toBe(500);
    expect(repo.updateRolePermission).not.toHaveBeenCalled();
  });
});
