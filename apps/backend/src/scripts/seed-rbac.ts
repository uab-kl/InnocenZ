import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { ModuleTable } from '@/features/rbac/module/module.model';
import { PermissionTable } from '@/features/rbac/permission/permission.model';
import { RolePermissionTable } from '@/features/rbac/role-permission/role-permission.model';
import { permissionTypeValues, type PermissionTypeCode } from '@/types/rbac-constant';
import { logger } from '@/util/logger';

// Seeds the RBAC engine: modules, CRUD permissions per module, and role -> permission
// assignments for every role. Idempotent (existence-checked + onConflictDoNothing);
// safe to re-run and never wipes admin-made changes.
const ACTOR = 'system';

const CRUD: PermissionTypeCode[] = [...permissionTypeValues];
const READ: PermissionTypeCode[] = ['read'];
const CRU: PermissionTypeCode[] = ['create', 'read', 'update'];

// Functional areas across the admin panel and the role portals.
const MODULES = [
  'Dashboard',
  'User Management',
  'Access Control',
  'Plan',
  'Subscription',
  'Special Service',
  'Audit Log',
  'Roster',
  'Payment Voucher',
  'Booking',
  'Billing',
  'Rating',
] as const;

type RoleName = 'admin' | 'agency' | 'outlet' | 'pr';
// '*' = every permission on every module. Otherwise a list of [module, allowed types].
const MATRIX: Record<RoleName, '*' | Array<[string, PermissionTypeCode[]]>> = {
  admin: '*',
  agency: [
    ['Dashboard', READ],
    ['User Management', READ],
    ['Roster', CRUD],
    ['Payment Voucher', CRU],
    ['Booking', READ],
    ['Special Service', CRU],
    ['Subscription', READ],
  ],
  outlet: [
    ['Dashboard', READ],
    ['Booking', CRUD],
    ['Billing', READ],
    ['Rating', CRU],
    ['Special Service', CRU],
    ['Subscription', READ],
  ],
  pr: [
    ['Dashboard', READ],
    ['Roster', READ],
    ['Payment Voucher', READ],
    ['Rating', READ],
  ],
};

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function ensureModule(name: string): Promise<string> {
  const [existing] = await db
    .select({ id: ModuleTable.id })
    .from(ModuleTable)
    .where(eq(ModuleTable.moduleName, name))
    .limit(1);
  if (existing) return existing.id;
  const [row] = await db
    .insert(ModuleTable)
    .values({ moduleName: name, status: 'active', createdBy: ACTOR, updatedBy: ACTOR })
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
      description: `${titleCase(type)} ${moduleName}`,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: PermissionTable.id });
  return row!.id;
}

export async function seedRbac(): Promise<void> {
  // 1. Modules + all CRUD permissions per module.
  const moduleIdByName = new Map<string, string>();
  const permIdByKey = new Map<string, string>(); // `${module}:${type}` -> permissionId
  for (const name of MODULES) {
    const moduleId = await ensureModule(name);
    moduleIdByName.set(name, moduleId);
    for (const type of CRUD) {
      permIdByKey.set(`${name}:${type}`, await ensurePermission(moduleId, name, type));
    }
  }

  // 2. Role -> permission assignments.
  const roleIdByName = new Map<string, string>();
  for (const roleName of Object.keys(MATRIX) as RoleName[]) {
    const [role] = await db
      .select({ id: RoleTable.id })
      .from(RoleTable)
      .where(eq(RoleTable.roleName, roleName))
      .limit(1);
    if (!role) {
      logger.warn(`[seed-rbac] Role "${roleName}" not found — run init-roles first.`);
      continue;
    }
    roleIdByName.set(roleName, role.id);

    const grant = MATRIX[roleName];
    const permIds: string[] = [];
    if (grant === '*') {
      permIds.push(...permIdByKey.values());
    } else {
      for (const [moduleName, types] of grant) {
        for (const type of types) {
          const id = permIdByKey.get(`${moduleName}:${type}`);
          if (id) permIds.push(id);
        }
      }
    }

    if (permIds.length === 0) continue;
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
    `[seed-rbac] Done. ${MODULES.length} modules, ${MODULES.length * CRUD.length} permissions.`,
  );
}

// Only auto-run when invoked as a CLI script (not when imported from boot/migrate).
const isDirectRun = process.argv[1]?.includes('seed-rbac');
if (isDirectRun) {
  seedRbac()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[seed-rbac] Error:', error);
      process.exit(1);
    });
}
