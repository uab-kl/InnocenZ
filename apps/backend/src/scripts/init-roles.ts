import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { RoleTable } from '@/features/rbac/role/role.model';
import { logger } from '@/util/logger';

const DEFAULT_ROLE_NAMES = ['admin', 'agency', 'pr', 'outlet'] as const;
const ACTOR = 'system';

async function ensureRole(roleName: string): Promise<void> {
  const existing = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, roleName))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(RoleTable).values({
    roleName,
    status: 'active',
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  logger.info(`Default role created: ${roleName}`);
}

export async function initRoles(): Promise<void> {
  for (const roleName of DEFAULT_ROLE_NAMES) {
    await ensureRole(roleName);
  }

  logger.info(`Default roles ready: ${DEFAULT_ROLE_NAMES.join(', ')}`);
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
