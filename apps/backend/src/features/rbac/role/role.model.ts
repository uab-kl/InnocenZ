import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { PortalTable } from '../portal/portal.model';

export const RoleTable = MainSchema.table('role', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  roleName: varchar('role_name').notNull(),
  /** Null only for non-portal roles (e.g. `pr` mobile). Web roles require a portal. */
  portalId: uuid('portal_id').references(() => PortalTable.id),
  status: varchar('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type RoleType = typeof RoleTable.$inferSelect;
export type RoleInsertType = typeof RoleTable.$inferInsert;

export type RoleFilter = {
  id?: string | string[];
  roleName?: string;
  portalId?: string | string[];
  status?: string;
};
