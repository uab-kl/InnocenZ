import { timestamp, uuid, varchar, unique } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema.js';
import { SubscriptionTable } from './subscription.model.js';
import { RoleTable } from '@/features/rbac/role/role.model.js';

export const SubscriptionRoleTable = MainSchema.table('subscription_role', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  subscriptionId: uuid('subscription_id').notNull().references(() => SubscriptionTable.id, { onDelete: 'cascade' }),
  roleId: uuid('role_id').notNull().references(() => RoleTable.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
}, (table) => [
  unique('subscription_role_subscription_id_role_id_unique').on(table.subscriptionId, table.roleId),
]);

export type SubscriptionRoleType = typeof SubscriptionRoleTable.$inferSelect;
export type SubscriptionRoleInsertType = typeof SubscriptionRoleTable.$inferInsert;

export type SubscriptionRoleSummary = {
  id: string;
  roleName: string;
};
