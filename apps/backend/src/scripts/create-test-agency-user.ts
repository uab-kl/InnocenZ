import 'dotenv/config';

import { eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';

const TEST_AGENCY_EMAIL = 'test-agency@innocenz.dev';
const TEST_AGENCY_PASSWORD = 'Test1234!';
const TEST_AGENCY_USERNAME = 'Test Agency User';
const ACTOR = 'system';

async function createTestAgencyUser(): Promise<void> {
  const [agencyRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, 'agency'))
    .limit(1);

  if (!agencyRole) {
    logger.warn('Agency role not found — run init-roles/seed-rbac first');
    return;
  }

  const [existingUser] = await db
    .select({ id: UserTable.id })
    .from(UserTable)
    .where(eq(UserTable.email, TEST_AGENCY_EMAIL))
    .limit(1);

  if (existingUser) {
    logger.info(`Test agency user already exists: ${TEST_AGENCY_EMAIL}`);
    return;
  }

  const passwordHash = await hashPassword(TEST_AGENCY_PASSWORD);

  const [user] = await db
    .insert(UserTable)
    .values({
      email: TEST_AGENCY_EMAIL,
      username: TEST_AGENCY_USERNAME,
      passwordHash,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning();

  await db.insert(UserRoleTable).values({
    userId: user.id,
    roleId: agencyRole.id,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  await db.insert(UserProfileTable).values({
    userId: user.id,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  logger.info(`Test agency user created: ${TEST_AGENCY_EMAIL}`);
}

createTestAgencyUser()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error('[create-test-agency-user] Error:', error);
    process.exit(1);
  });
