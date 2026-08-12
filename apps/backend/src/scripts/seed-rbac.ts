import 'dotenv/config';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { ModuleTable } from '@/features/rbac/module/module.model';
import { PermissionTable } from '@/features/rbac/permission/permission.model';
import { RolePermissionTable } from '@/features/rbac/role-permission/role-permission.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { permissionTypeValues, type PermissionTypeCode, portalRoleName } from '@/types/rbac-constant';
import { logger } from '@/util/logger';

/**
 * Seeds portal-scoped modules, C/R/U permissions, and role → permission matrices.
 * Idempotent. Mirrors former agencyCan / outletCan / admin full access.
 */
const ACTOR = 'system';

const CRU: PermissionTypeCode[] = [...permissionTypeValues];
const READ: PermissionTypeCode[] = ['read'];
const RU: PermissionTypeCode[] = ['read', 'update'];

type PortalCode = 'admin' | 'agency' | 'outlet';

type ModuleDef = { key: string; name: string; portal: PortalCode };

const MODULES: ModuleDef[] = [
  // Admin
  { key: 'dashboard', name: 'Dashboard', portal: 'admin' },
  { key: 'user_management', name: 'User Management', portal: 'admin' },
  { key: 'access_control', name: 'Access Control', portal: 'admin' },
  { key: 'plan', name: 'Plan', portal: 'admin' },
  { key: 'subscription', name: 'Subscription', portal: 'admin' },
  { key: 'special_service', name: 'Special Service', portal: 'admin' },
  { key: 'audit_log', name: 'Audit Log', portal: 'admin' },
  { key: 'billing', name: 'Billing', portal: 'admin' },
  // Agency
  { key: 'dashboard', name: 'Dashboard', portal: 'agency' },
  { key: 'roster', name: 'Roster', portal: 'agency' },
  { key: 'approvals', name: 'Approvals', portal: 'agency' },
  { key: 'payment_voucher', name: 'Payment Voucher', portal: 'agency' },
  { key: 'history', name: 'History', portal: 'agency' },
  { key: 'settings', name: 'Settings', portal: 'agency' },
  { key: 'workforce', name: 'Workforce', portal: 'agency' },
  { key: 'collections', name: 'Collections', portal: 'agency' },
  // Outlet
  { key: 'dashboard', name: 'Dashboard', portal: 'outlet' },
  { key: 'booking', name: 'Booking', portal: 'outlet' },
  { key: 'rating', name: 'Rating', portal: 'outlet' },
  { key: 'history', name: 'History', portal: 'outlet' },
  { key: 'billing', name: 'Billing', portal: 'outlet' },
  { key: 'sales', name: 'Sales', portal: 'outlet' },
  { key: 'workspace', name: 'Workspace', portal: 'outlet' },
  { key: 'settings', name: 'Settings', portal: 'outlet' },
  { key: 'special_service', name: 'Special Service', portal: 'outlet' },
];

type MatrixEntry = [string, PermissionTypeCode[]]; // module_key, types

type RoleGrant = {
  roleName: string;
  portal: PortalCode | null;
  grant: '*' | MatrixEntry[];
};

const AGENCY_OWNER: MatrixEntry[] = [
  ['dashboard', READ],
  ['roster', CRU],
  ['approvals', CRU],
  ['payment_voucher', CRU],
  ['history', READ],
  ['settings', CRU],
  ['workforce', CRU],
  ['collections', RU],
];

/**
 * Kept in step with the portal's own finance matrix
 * (`ROLE_PERMISSIONS.agency_finance` in apps/web agency-rbac.ts). The two used
 * to disagree, and now that the portal screens consult these grants the
 * disagreement reads as a broken screen — these grants WIN over the portal's
 * matrix, which is only the fallback for when /auth/me returns no agency grants.
 *
 * - `payment_voucher` CREATE — finance raises and signs vouchers (`raisePv`), so
 *   RU let the UI offer a button the server would 403.
 * - `workforce` READ — the portal gives finance the Roster nav (`viewWorkforce`).
 *   With no grant here the nav item vanishes for a role that is meant to have it.
 *   READ only: `managePr` is workforce UPDATE, and that stays owner-only.
 *
 * ⚠️ This grant does NOT put the live-floor tile on the finance home page. It
 * used to, and the owner asked for that tile gone while keeping Roster (11 Aug
 * 2026) — so the tile moved to its own portal-side permission, `viewLiveFloor`,
 * which is deliberately absent from `AGENCY_FEATURE_MODULE` and therefore cannot
 * be re-granted from here. Do not "fix" that by adding a module mapping for it.
 *
 * ⚠️ Removing an entry from this list does NOT revoke it on an already-seeded
 * database: `applyRoleGrants` inserts with `onConflictDoNothing` and never
 * deletes, so a stale row survives every re-run — and these grants BEAT the
 * portal's own matrix. Revoking for real means deleting the row.
 */
const AGENCY_FINANCE: MatrixEntry[] = [
  ['dashboard', READ],
  ['workforce', READ],
  ['payment_voucher', CRU],
  ['history', READ],
  ['settings', READ],
  ['collections', RU],
];

const OUTLET_OWNER: MatrixEntry[] = [
  ['dashboard', READ],
  ['booking', CRU],
  ['rating', CRU],
  ['history', READ],
  ['billing', READ],
  ['sales', CRU],
  ['workspace', CRU],
  ['settings', CRU],
  ['special_service', CRU],
];

const OUTLET_FINANCE: MatrixEntry[] = [
  ['dashboard', READ],
  ['history', READ],
  ['billing', READ],
  ['sales', READ],
  ['workspace', READ],
  ['settings', READ],
  ['special_service', READ],
];

const OUTLET_OPS: MatrixEntry[] = [
  ['dashboard', READ],
  ['booking', CRU],
  ['rating', CRU],
  ['history', READ],
  ['sales', CRU],
  ['workspace', CRU],
  ['settings', READ],
  ['special_service', CRU],
];

/** Permission matrices for every seeded role (init-roles must run first). */
const ROLE_GRANTS: RoleGrant[] = [
  { roleName: portalRoleName.ADMIN, portal: 'admin', grant: '*' },
  { roleName: portalRoleName.OWNER, portal: 'agency', grant: AGENCY_OWNER },
  { roleName: portalRoleName.FINANCE, portal: 'agency', grant: AGENCY_FINANCE },
  { roleName: portalRoleName.OWNER, portal: 'outlet', grant: OUTLET_OWNER },
  { roleName: portalRoleName.FINANCE, portal: 'outlet', grant: OUTLET_FINANCE },
  { roleName: portalRoleName.OPS_HEAD, portal: 'outlet', grant: OUTLET_OPS },
  { roleName: portalRoleName.PR, portal: null, grant: [] },
];

async function portalId(code: string): Promise<string> {
  const [row] = await db
    .select({ id: PortalTable.id })
    .from(PortalTable)
    .where(eq(PortalTable.code, code))
    .limit(1);
  if (!row) throw new Error(`[seed-rbac] Portal "${code}" missing — run init-roles first`);
  return row.id;
}

async function ensureModule(
  portalIdValue: string,
  key: string,
  name: string,
): Promise<string> {
  const [existing] = await db
    .select({ id: ModuleTable.id })
    .from(ModuleTable)
    .where(and(eq(ModuleTable.portalId, portalIdValue), eq(ModuleTable.moduleKey, key)))
    .limit(1);
  if (existing) {
    await db
      .update(ModuleTable)
      .set({ moduleName: name, status: 'active', updatedAt: new Date(), updatedBy: ACTOR })
      .where(eq(ModuleTable.id, existing.id));
    return existing.id;
  }

  // Legacy rows may have the name without portal/key — adopt them.
  const [byName] = await db
    .select({ id: ModuleTable.id, portalId: ModuleTable.portalId, moduleKey: ModuleTable.moduleKey })
    .from(ModuleTable)
    .where(eq(ModuleTable.moduleName, name))
    .limit(1);
  if (byName && (!byName.portalId || byName.portalId === portalIdValue)) {
    await db
      .update(ModuleTable)
      .set({
        portalId: portalIdValue,
        moduleKey: key,
        status: 'active',
        updatedAt: new Date(),
        updatedBy: ACTOR,
      })
      .where(eq(ModuleTable.id, byName.id));
    return byName.id;
  }

  const [row] = await db
    .insert(ModuleTable)
    .values({
      moduleName: name,
      moduleKey: key,
      portalId: portalIdValue,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: ModuleTable.id });
  return row!.id;
}

async function ensurePermission(
  moduleId: string,
  moduleName: string,
  type: PermissionTypeCode,
): Promise<string> {
  const [existing] = await db
    .select({ id: PermissionTable.id })
    .from(PermissionTable)
    .where(and(eq(PermissionTable.moduleId, moduleId), eq(PermissionTable.permissionType, type)))
    .limit(1);
  if (existing) return existing.id;

  const [row] = await db
    .insert(PermissionTable)
    .values({
      moduleId,
      permissionType: type,
      description: `${type} ${moduleName}`,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: PermissionTable.id });
  return row!.id;
}

export async function seedRbac(): Promise<void> {
  const portalIds: Record<PortalCode, string> = {
    admin: await portalId('admin'),
    agency: await portalId('agency'),
    outlet: await portalId('outlet'),
  };

  const permIdByKey = new Map<string, string>(); // `${portal}:${moduleKey}:${type}`

  for (const mod of MODULES) {
    const mid = await ensureModule(portalIds[mod.portal], mod.key, mod.name);
    for (const type of CRU) {
      const pid = await ensurePermission(mid, mod.name, type);
      permIdByKey.set(`${mod.portal}:${mod.key}:${type}`, pid);
    }
  }

  for (const { roleName, portal, grant } of ROLE_GRANTS) {
    const portalMatch =
      portal == null
        ? isNull(RoleTable.portalId)
        : eq(RoleTable.portalId, portalIds[portal]);

    const [role] = await db
      .select({ id: RoleTable.id })
      .from(RoleTable)
      .where(and(sql`lower(${RoleTable.roleName}) = ${roleName.trim().toLowerCase()}`, portalMatch))
      .limit(1);
    if (!role) {
      logger.warn(
        `[seed-rbac] Role "${roleName}" @ ${portal ?? 'none'} not found — run init-roles first.`,
      );
      continue;
    }

    let permIds: string[] = [];
    if (grant === '*') {
      for (const [key, id] of permIdByKey.entries()) {
        if (key.startsWith('admin:')) permIds.push(id);
      }
    } else if (portal) {
      for (const [moduleKey, types] of grant) {
        for (const type of types) {
          const id = permIdByKey.get(`${portal}:${moduleKey}:${type}`);
          if (id) permIds.push(id);
          else logger.warn(`[seed-rbac] Missing perm ${portal}:${moduleKey}:${type}`);
        }
      }
    }

    if (permIds.length === 0) {
      logger.info(`[seed-rbac] ${roleName}@${portal ?? 'none'}: 0 permissions.`);
      continue;
    }

    await db
      .insert(RolePermissionTable)
      .values(
        permIds.map((permissionId) => ({
          roleId: role.id,
          permissionId,
          createdBy: ACTOR,
          updatedBy: ACTOR,
        })),
      )
      .onConflictDoNothing();

    logger.info(
      `[seed-rbac] ${roleName}@${portal ?? 'none'}: ${permIds.length} permissions ensured.`,
    );
  }

  logger.info(
    `[seed-rbac] Done. ${MODULES.length} modules, ${MODULES.length * CRU.length} permissions.`,
  );
}

const isDirectRun = process.argv[1]?.includes('seed-rbac');
if (isDirectRun) {
  seedRbac()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-rbac] Error:', error);
      process.exit(1);
    });
}
