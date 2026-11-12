import { z } from 'zod';
import { permissionTypeValues } from '@/types/rbac-constant';

/**
 * The only two values `status` may hold on role, m_module and m_permission.
 *
 * ⚠️ It was free text (`z.string()`), and every server read asks for EXACTLY
 * `'active'` (getUserPermissions, userHasPermission, permissionsForRoleNames,
 * roleHasPermission). So a typo such as `'Active'` or `'enabled'` was stored
 * without complaint and then silently switched the grant OFF — the admin saw a
 * saved row and every member of that lane collected a 403. The admin sheets
 * only ever send these two; anything else is now a 400 that names them.
 */
export const RBAC_STATUSES = ['active', 'inactive'] as const;
const rbacStatus = z.enum(RBAC_STATUSES, {
  error: "Status must be 'active' or 'inactive'.",
});

export const RoleSchema = z.object({
  roleName: z.string().trim().min(1).max(100),
  // Stays nullable: the mobile PR role is portal-less by design.
  portalId: z.uuid().nullable().optional(),
  status: rbacStatus.default('active'),
});

/**
 * Sent back when a module arrives without a portal, or with `portalId: null`.
 *
 * ⚠️ `m_module_portal_key_uidx` is UNIQUE (portal_id, module_key), and NULLs
 * never collide in a Postgres unique index — so a portal-less module could
 * twin a key that already lives on a portal (`settings`, `dashboard`, …).
 * `roleHasPermission` requires a grant's module to sit on the role's own
 * portal, so such a twin would answer no member at all: refusing it here stops
 * an admin creating a module nobody can ever use.
 */
export const MODULE_PORTAL_REQUIRED =
  'Choose the portal this module belongs to (agency, outlet or admin).';

export const ModuleSchema = z.object({
  moduleName: z.string().min(1).max(100),
  moduleKey: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((key) => key.toLowerCase().replace(/\s+/g, '_'))
    .optional(),
  portalId: z.uuid({ error: MODULE_PORTAL_REQUIRED }),
  status: rbacStatus.default('active'),
});

/** Normalize optional moduleKey from moduleName before insert/update. */
export function withModuleKey<T extends { moduleName: string; moduleKey?: string }>(
  data: T,
): T & { moduleKey: string } {
  const moduleKey =
    data.moduleKey ??
    data.moduleName.toLowerCase().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '');
  return { ...data, moduleKey };
}

export const PermissionSchema = z.object({
  moduleId: z.uuid(),
  permissionType: z.enum(permissionTypeValues),
  description: z.string().min(1).max(255),
  status: rbacStatus.default('active'),
});

/**
 * PATCH shapes for the three RBAC catalogues.
 *
 * Each re-declares `status` WITHOUT the create-time `.default('active')`.
 * `.partial()` makes a key optional but leaves a default underneath it intact,
 * so `RoleSchema.partial().parse({ roleName })` answered
 * `{ roleName, status: 'active' }` — and every controller spreads that straight
 * into its repository `update()`. Renaming a role, module or permission that an
 * admin had deliberately deactivated silently switched it back on, undoing the
 * `inactiveRole` / `inactiveModule` / `inactivePermission` endpoints that sit a
 * few lines below each one. See the note on `UpdateOutletSchema`.
 *
 * `UpdateModuleSchema` inherits the REQUIRED portal as optional-but-not-null:
 * a PATCH may leave a module's portal alone, never clear it.
 */
export const UpdateRoleSchema = RoleSchema.partial().extend({
  status: rbacStatus.optional(),
});

export const UpdateModuleSchema = ModuleSchema.partial().extend({
  status: rbacStatus.optional(),
});

export const UpdatePermissionSchema = PermissionSchema.partial().extend({
  status: rbacStatus.optional(),
});

export const RolePermissionSchema = z.object({
  roleId: z.uuid(),
  permissionId: z.uuid(),
});

export const SyncRolePermissionSchema = z.object({
  permissionIds: z.array(z.uuid()),
});

export const UserRoleSchema = z.object({
  userId: z.uuid(),
  roleId: z.uuid(),
});

export const UpdateUserRoleSchema = z.object({
  userId: z.uuid(),
  previousRoleId: z.uuid(),
  roleId: z.uuid(),
});

export type RolePermissionGroupType = {
  id: string;
  roleId: string;
  permissionId: string;
  permissionType: string;
  moduleId: string;
  moduleName: string;
  moduleKey: string;
  /**
   * WHICH CONSOLE this grant belongs to — `agency` | `outlet` | `admin` | `pr`.
   *
   * Optional because `role-permission.repository.getRolePermissions` builds the
   * same shape for the admin RBAC screens and does not join the portal.
   *
   * ⚠️ It exists because `moduleKey` is NOT unique across portals: `settings`,
   * `dashboard` and `history` are each a SEPARATE module row per portal, and
   * `getUserPermissions` returns the union of every role an account holds with
   * no portal filter. The web `canModule()` matches on key + verb alone, so an
   * agency Owner's `settings:update` answers "yes, you may edit" on the OUTLET
   * settings page of a venue where that same person is only a Finance head. The
   * server still refuses the save (`outletOwnerOfParam`), so the UI offers an
   * edit that cannot be saved. The key alone cannot tell the two apart; this is
   * the fact that can.
   */
  portalCode?: string | null;
  /**
   * The role these grants belong to — optional, set by
   * `permissionsForRoleNames` so a caller can tag each grant with the
   * organisation whose lane produced it. `/auth/me` needs that because a flat
   * union is wrong for anyone holding different lanes in two organisations.
   */
  roleName?: string;
};
