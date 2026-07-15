import 'dotenv/config';

import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index';
import { UserTable } from '@/features/user/user.model';
import { UserProfileTable } from '@/features/user/user-profile/user-profile.model';
import { RoleTable } from '@/features/rbac/role/role.model';
import { UserRoleTable } from '@/features/rbac/user-role/user-role.model';
import { hashPassword } from '@/util/password';
import { logger } from '@/util/logger';
import { DEFAULT_PROFILE_IMAGE } from '@/util/profile-image';

const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL ?? 'innocenz@gmail.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;
const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME ?? 'InnocenZ Admin';
const ADMIN_ROLE_NAME = 'admin';
const ACTOR = 'system';

async function getAdminRoleId(): Promise<string | null> {
  const [adminRole] = await db
    .select({ id: RoleTable.id })
    .from(RoleTable)
    .where(eq(RoleTable.roleName, ADMIN_ROLE_NAME))
    .limit(1);

  return adminRole?.id ?? null;
}

async function ensureAdminRoleForUser(userId: string, adminRoleId: string): Promise<void> {
  const existing = await db
    .select({ id: UserRoleTable.id })
    .from(UserRoleTable)
    .where(and(eq(UserRoleTable.userId, userId), eq(UserRoleTable.roleId, adminRoleId)))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(UserRoleTable).values({
    userId,
    roleId: adminRoleId,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  logger.info(`Admin role assigned to user: ${userId}`);
}

export async function initAdmin(): Promise<void> {
  const adminRoleId = await getAdminRoleId();
  if (!adminRoleId) {
    logger.warn('Admin role not found — run init-roles before init-admin');
    return;
  }

  const [existingUser] = await db
    .select({ id: UserTable.id, profileImage: UserTable.profileImage })
    .from(UserTable)
    .where(eq(UserTable.email, DEFAULT_ADMIN_EMAIL))
    .limit(1);

  if (existingUser) {
    await ensureAdminRoleForUser(existingUser.id, adminRoleId);

    if (!existingUser.profileImage) {
      await db
        .update(UserTable)
        .set({ profileImage: DEFAULT_PROFILE_IMAGE, updatedAt: new Date(), updatedBy: ACTOR })
        .where(eq(UserTable.id, existingUser.id));
      logger.info(`Default admin profile image set: ${DEFAULT_ADMIN_EMAIL}`);
    }

    const [existingProfile] = await db
      .select({ id: UserProfileTable.id })
      .from(UserProfileTable)
      .where(eq(UserProfileTable.userId, existingUser.id))
      .limit(1);

    if (!existingProfile) {
      await db.insert(UserProfileTable).values({
        userId: existingUser.id,
        createdBy: ACTOR,
        updatedBy: ACTOR,
      });
    }

    logger.info(`Default admin ready: ${DEFAULT_ADMIN_EMAIL}`);
    return;
  }

  if (!DEFAULT_ADMIN_PASSWORD) {
    logger.warn(
      `User ${DEFAULT_ADMIN_EMAIL} not found — set DEFAULT_ADMIN_PASSWORD in .env to create the default admin`,
    );
    return;
  }

  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);

  const [user] = await db
    .insert(UserTable)
    .values({
      email: DEFAULT_ADMIN_EMAIL,
      username: DEFAULT_ADMIN_NAME,
      passwordHash,
      profileImage: DEFAULT_PROFILE_IMAGE,
      status: 'active',
      createdBy: ACTOR,
      updatedBy: ACTOR,
    })
    .returning();

  await ensureAdminRoleForUser(user.id, adminRoleId);
  await db.insert(UserProfileTable).values({
    userId: user.id,
    createdBy: ACTOR,
    updatedBy: ACTOR,
  });

  logger.info(`Default admin user created: ${DEFAULT_ADMIN_EMAIL}`);
}
const isDirectRun = process.argv[1]?.includes('init-admin');
if (isDirectRun) {
  initAdmin()
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[init-admin] Error:', error);
      process.exit(1);
    });
}
