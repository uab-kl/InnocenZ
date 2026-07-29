import { MainSchema } from '@/db/db.schema';
import { boolean, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { UserTable } from '@/features/user/user.model.js';

/**
 * A user's TOTP enrolment.
 *
 * Mapped EXACTLY as the table already stands in the shared database, including
 * the fact that it carries no created_by/updated_by. Migration 0029 skipped it
 * as "not ours to alter"; ownership has since been confirmed, but the table is
 * still left alone on different grounds — it holds a live enrolment whose
 * secret is bound to a real authenticator app, and reshaping it risks locking
 * someone out of an admin account for the sake of two audit columns.
 *
 * `secret` is base32 and is a CREDENTIAL. Never log it, never return it from a
 * list endpoint, and let it leave the server exactly once — inside the otpauth
 * URI at enrolment, to the account enrolling.
 *
 * `confirmed` is what makes an enrolment real. A row with confirmed=false is a
 * half-finished setup: the secret exists but the user has not yet proved they
 * can generate a code from it, so login must NOT challenge against it — doing
 * so would lock someone out on the strength of an abandoned setup.
 */
export const AdminMfaTable = MainSchema.table('admin_mfa', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => UserTable.id, { onDelete: 'cascade' }),
  secret: varchar('secret').notNull(),
  confirmed: boolean('confirmed').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AdminMfa = typeof AdminMfaTable.$inferSelect;
export type AdminMfaInsertType = typeof AdminMfaTable.$inferInsert;
