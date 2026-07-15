import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { UserTable } from '@/features/user/user.model';

export const ResetPasswordTokenTable = MainSchema.table('reset_password_token', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    userId: uuid('user_id').notNull().references(() => UserTable.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type ResetPasswordTokenType = typeof ResetPasswordTokenTable.$inferSelect;