import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { PortalTable } from '@/features/rbac/portal/portal.model';
import { portalRoleName } from '@/types/rbac-constant';
import { logger } from '@/util/logger';

const ACTOR = 'system';

const PORTALS = [
  { code: 'admin', name: 'Admin' },
  { code: 'agency', name: 'Agency' },
  { code: 'outlet', name: 'Outlet' },
] as const;

/** Canonical roles only — org lanes use membership.sub_role, not extra role rows. */
const ROLE_PORTAL: Record<string, string | null> = {
  [portalRoleName.ADMIN]: 'admin',
  [portalRoleName.AGENCY]: 'agency',
  [portalRoleName.OUTLET]: 'outlet',
  [portalRoleName.PR]: null,
};

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

async function ensureRole(roleName: string, portalId: string | null): Promise<void> {
  const [existing] = await db
    .select({ id: RoleTable.id, portalId: RoleTable.portalId })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, roleName))
    .limit(1);

  if (existing) {
    if (existing.portalId !== portalId) {
      await db
        .update(RoleTable)
        .set({ portalId, updatedAt: new Date(), updatedBy: ACTOR })
        .where(eq(RoleTable.id, existing.id));
      logger.info(`Role portal linked: ${roleName} → ${portalId ?? 'null'}`);
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
  logger.info(`Default role created: ${roleName}`);
}

export async function initRoles(): Promise<void> {
  const portalIdByCode = new Map<string, string>();
  for (const p of PORTALS) {
    portalIdByCode.set(p.code, await ensurePortal(p.code, p.name));
  }

  for (const [roleName, portalCode] of Object.entries(ROLE_PORTAL)) {
    const portalId = portalCode ? (portalIdByCode.get(portalCode) ?? null) : null;
    await ensureRole(roleName, portalId);
  }

  logger.info(`Default roles ready: ${Object.keys(ROLE_PORTAL).join(', ')}`);
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
