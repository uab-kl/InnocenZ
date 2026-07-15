import { timestamp, uuid, varchar, unique } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

export const UserRoleTable = MainSchema.table('user_role', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    userId: uuid('user_id').notNull(),
    roleId: uuid('role_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
}, (table) => ({
    uniqueUserRole: unique().on(table.userId, table.roleId),
}));

export type UserRoleType = typeof UserRoleTable.$inferSelect;
export type UserRoleInsertType = typeof UserRoleTable.$inferInsert;

export type UserRoleFilter = {
    id?: string | string[];
    userId?: string | string[];
    roleId?: string | string[];
};