import { sql } from 'drizzle-orm';
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
    /**
     * Human-readable id for a person who belongs to no organisation — a PR
     * (INNPR0001) or an admin (INNADM0001). Organisation operators are keyed
     * per membership instead, on agency_user / outlet_user (0154).
     */
    /**
     * NOT NULL since 0158, with a sequence-backed DEFAULT so no insert — app or
     * seed script — can create an account without one. The default is the FLOOR
     * id (INNUSR…); `ensureAccountCode()` upgrades it to the organisation, admin
     * or PR id as soon as the account becomes something more specific.
     */
    memberCode: varchar('member_code', { length: 32 })
      .notNull()
      /*
       * The DEFAULT is declared here as well as in 0158, and it has to be: a
       * bare .notNull() makes drizzle demand the field on EVERY insert, even
       * though Postgres would have supplied one. Naming the default keeps the
       * eleven insert sites working untouched and keeps the model honest about
       * what the column does.
       */
      .default(
        sql`('INNUSR' || lpad(nextval('main.user_member_code_seq')::text, 4, '0'))`,
      ),
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
    /**
     * SESSIONS ISSUED BEFORE THIS MOMENT ARE DEAD (migration 0165).
     *
     * The access token is a stateless JWT — no session table, no token id, no
     * revocation list — so before this column a password change left every
     * token already issued working for its full lifetime. Somebody resetting a
     * password because a device was stolen was told it had worked while the
     * thief stayed signed in.
     *
     * `authenticate-jwt` refuses a token whose `iat` is STRICTLY earlier than
     * this. NULL means no constraint, which is what every existing account
     * carries, so the column is inert until a password actually changes.
     *
     * ⚠️ Stamped in `updateUserPassword`, which all three password paths
     * already funnel through — not at each call site, so a fourth path cannot
     * forget it.
     */
    sessionsValidFrom: timestamp('sessions_valid_from', { withTimezone: true }),
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
