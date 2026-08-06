import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
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

const MATRIX: Record<string, '*' | MatrixEntry[]> = {
  [portalRoleName.ADMIN]: '*',
  [portalRoleName.AGENCY]: [
    ['dashboard', READ],
    ['roster', CRU],
    ['approvals', CRU],
    ['payment_voucher', CRU],
    ['history', READ],
    ['settings', CRU],
    ['workforce', CRU],
    ['collections', RU],
  ],
  [portalRoleName.OUTLET]: [
    ['dashboard', READ],
    ['booking', CRU],
    ['rating', CRU],
    ['history', READ],
    ['billing', READ],
    ['sales', CRU],
    ['workspace', CRU],
    ['settings', CRU],
    ['special_service', CRU],
  ],
  [portalRoleName.PR]: [
    // PR has no portal modules; keep empty (mobile uses role name gates).
  ],
};

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

  for (const [roleName, grant] of Object.entries(MATRIX)) {
    const [role] = await db
      .select({ id: RoleTable.id, portalId: RoleTable.portalId })
      .from(RoleTable)
      .where(eq(RoleTable.roleName, roleName))
      .limit(1);
    if (!role) {
      logger.warn(`[seed-rbac] Role "${roleName}" not found — run init-roles first.`);
      continue;
    }

    let permIds: string[] = [];
    if (grant === '*') {
      for (const [key, id] of permIdByKey.entries()) {
        if (key.startsWith('admin:')) permIds.push(id);
      }
    } else {
      const portalCode =
        roleName.startsWith('agency')
          ? 'agency'
          : roleName.startsWith('outlet')
            ? 'outlet'
            : roleName === 'admin'
              ? 'admin'
              : null;
      for (const [moduleKey, types] of grant) {
        for (const type of types) {
          const id = permIdByKey.get(`${portalCode}:${moduleKey}:${type}`);
          if (id) permIds.push(id);
          else logger.warn(`[seed-rbac] Missing perm ${portalCode}:${moduleKey}:${type}`);
        }
      }
    }

    if (permIds.length === 0 && grant !== '*' && (grant as MatrixEntry[]).length === 0) {
      logger.info(`[seed-rbac] ${roleName}: 0 permissions (expected for pr).`);
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

    logger.info(`[seed-rbac] ${roleName}: ${permIds.length} permissions ensured.`);
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
