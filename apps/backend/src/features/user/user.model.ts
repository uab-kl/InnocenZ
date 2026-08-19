import { integer, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

export const userStatusValues = ['active', 'inactive', 'blocked'] as const;
export type UserStatus = (typeof userStatusValues)[number];

export const UserTable = MainSchema.table('user', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    email: varchar('email').unique(),
    phoneNum: varchar('phone_num').unique(),
    profileImage: varchar('profile_image'),
    username: varchar('username', { length: 100 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }),
    status: varchar('status', { length: 100 }).$type<UserStatus>().notNull(),
    /**
     * UI language this person picked (migration 0122), as a BCP-47 tag: `en` or
     * `zh` (SIMPLIFIED — the same vocabulary apps/mobile/src/i18n normalises
     * `zh-Hans` / `zh-CN` / `zh-MY` onto). NULL = never chosen, so the client
     * follows the browser/device language rather than being forced to English.
     *
     * Here rather than on `user_profile` because that table is blanked for
     * outlet callers by `redactIdentityDocs` — a UI language is not an
     * identity document.
     */
    preferredLocale: varchar('preferred_locale', { length: 16 }),
    // Failed-login lockout (migration 0070). Counters rather than an attempt
    // log: this is checked on every login, and a join for two integers on the
    // hottest auth path is not worth the normalisation.
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    blockedReason: varchar('blocked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
});

export type UserSortField = 'CREATED_AT' | 'UPDATED_AT' | 'USERNAME' | 'EMAIL' | 'STATUS';

export type UserSort = {
    field?: UserSortField;
    direction?: 'ASC' | 'DESC';
};

export type UserFilter = {
    id?: string;
    email?: string;
    phoneNum?: string;
    username?: string;
    status?: UserStatus;
    roleId?: string;
    /** Joined on/after this date (start of day). Use with endDate for a period filter. */
    startDate?: Date | string | null;
    /** Joined on/before this date (end of day). Use with startDate for a period filter. */
    endDate?: Date | string | null;
};

export type UserType = typeof UserTable.$inferSelect;
export type UserInsertType = typeof UserTable.$inferInsert;
