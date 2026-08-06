import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { PortalTable } from '../portal/portal.model';

export const ModuleTable = MainSchema.table('m_module', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  moduleName: varchar('module_name').notNull(),
  /** Stable key for API/UI checks (e.g. `roster`, `payment_voucher`). */
  moduleKey: varchar('module_key', { length: 100 }).notNull(),
  /** Null only during legacy backfill; new modules must set a portal. */
  portalId: uuid('portal_id').references(() => PortalTable.id),
  status: varchar('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type ModuleType = typeof ModuleTable.$inferSelect;
export type ModuleInsertType = typeof ModuleTable.$inferInsert;

export type ModuleFilter = {
  id?: string | string[];
  moduleName?: string;
  moduleKey?: string;
  portalId?: string | string[];
  status?: string;
};
