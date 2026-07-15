import { decimal, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { OutletTable } from '@/features/outlet/outlet.model';
import { AgencyTable } from '@/features/agency/agency.model';

/**
 * Per-outlet per-agency per-item-type commission matrix.
 * item_type examples: 'beer', 'house_pour', 'whisky', 'table_standard', 'table_vip', 'tip'
 * unit_price: sale price per item in RM (used to compute gross revenue)
 * commission_rate: PR's commission rate (0.1500 = 15%)
 */
export const CommissionConfigTable = MainSchema.table('commission_config', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').notNull().references(() => OutletTable.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').notNull().references(() => AgencyTable.id, { onDelete: 'cascade' }),
  itemType: varchar('item_type', { length: 100 }).notNull(),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  commissionRate: decimal('commission_rate', { precision: 5, scale: 4 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type CommissionConfigType = typeof CommissionConfigTable.$inferSelect;
export type CommissionConfigInsertType = typeof CommissionConfigTable.$inferInsert;

export type CommissionConfigFilter = {
  outletId?: string;
  agencyId?: string;
  itemType?: string;
  status?: string;
};
