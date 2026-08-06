import 'dotenv/config';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { SEEDED_PORTAL_ROLES } from '@/types/rbac-constant';
import { logger } from '@/util/logger';

const ACTOR = 'system';

const PORTALS = [
  { code: 'admin', name: 'Admin' },
  { code: 'agency', name: 'Agency' },
  { code: 'outlet', name: 'Outlet' },
] as const;

async function ensurePortal(code: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: PortalTable.id })
    .from(PortalTable)
    .where(eq(PortalTable.code, code))
    .limit(1);
  if (existing) return existing.id;

  const [row] = await db
    .insert(PortalTable)
    .values({
      code,
      name,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning({ id: PortalTable.id });
  return row!.id;
}

/** Roles are unique per (lower(role_name), portal_id) — e.g. Owner under agency + outlet. */
async function ensureRole(roleName: string, portalId: string | null): Promise<void> {
  const portalMatch =
    portalId == null
      ? isNull(RoleTable.portalId)
      : eq(RoleTable.portalId, portalId);

  const [existing] = await db
    .select({ id: RoleTable.id, portalId: RoleTable.portalId, status: RoleTable.status, roleName: RoleTable.roleName })
    .from(RoleTable)
    .where(and(sql`lower(${RoleTable.roleName}) = ${roleName.trim().toLowerCase()}`, portalMatch))
    .limit(1);

  if (existing) {
    const patch: { status?: string; roleName?: string; updatedAt: Date; updatedBy: string } = {
      updatedAt: new Date(),
      updatedBy: ACTOR,
    };
    if (existing.status !== 'active') patch.status = 'active';
    // Prefer canonical seeded casing (Owner vs owner).
    if (existing.roleName !== roleName) patch.roleName = roleName;
    if (patch.status || patch.roleName) {
      await db.update(RoleTable).set(patch).where(eq(RoleTable.id, existing.id));
      logger.info(`Role normalized: ${roleName} (${portalId ?? 'no portal'})`);
    }
    return;
  }

  await db.insert(RoleTable).values({
    roleName,
    portalId,
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });
  logger.info(`Default role created: ${roleName} (${portalId ?? 'no portal'})`);
}

export async function initRoles(): Promise<void> {
  const portalIdByCode = new Map<string, string>();
  for (const p of PORTALS) {
    portalIdByCode.set(p.code, await ensurePortal(p.code, p.name));
  }

  for (const row of SEEDED_PORTAL_ROLES) {
    const portalId = row.portal ? (portalIdByCode.get(row.portal) ?? null) : null;
    await ensureRole(row.roleName, portalId);
  }

  logger.info(
    `Default roles ready: ${SEEDED_PORTAL_ROLES.map((r) => `${r.roleName}@${r.portal ?? 'none'}`).join(', ')}`,
  );
}

const isDirectRun = process.argv[1]?.includes('init-roles');
if (isDirectRun) {
  initRoles()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[init-roles] Error:', error);
      process.exit(1);
    });
}
