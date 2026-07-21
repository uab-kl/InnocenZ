import { date, index, integer, numeric, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';
import { ShiftTable } from '@/features/shift/shift.model';
import { PrTable } from '@/features/pr/pr.model';

/**
 * Floor sales a PR generated on a shift — the live-ops capture that was missing
 * (the outlet Reports screen aggregates this, and the demo store held it
 * client-side only). One row per (shift, PR): drink/tip/table revenue in RM,
 * with the raw units kept for display. `agencyId` / `outletId` / `soldOn` are
 * denormalized from the shift so the report can scope + group by day without a
 * join. This is the revenue side; the cost side (PR wages/commission) lives on
 * shift_assignment.payAmount.
 */
export const ShiftSaleTable = MainSchema.table(
  'shift_sale',
  {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    shiftId: uuid('shift_id')
      .notNull()
      .references(() => ShiftTable.id, { onDelete: 'cascade' }),
    prId: uuid('pr_id')
      .notNull()
      .references(() => PrTable.id, { onDelete: 'cascade' }),
    // Denormalized from the shift for scoping (outlet/agency) and day grouping.
    outletId: uuid('outlet_id')
      .notNull()
      .references(() => OutletTable.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => AgencyTable.id, { onDelete: 'cascade' }),
    soldOn: date('sold_on', { mode: 'string' }).notNull(),
    drinkUnits: integer('drink_units').notNull().default(0),
    drinkSalesRm: numeric('drink_sales_rm', { precision: 12, scale: 2 }).notNull().default('0'),
    tipUnits: integer('tip_units').notNull().default(0),
    tipSalesRm: numeric('tip_sales_rm', { precision: 12, scale: 2 }).notNull().default('0'),
    totalSalesRm: numeric('total_sales_rm', { precision: 12, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
  },
  (table) => ({
    // One sales row per PR per shift — the write path upserts on this.
    uniqShiftPr: unique('shift_sale_shift_pr_unique').on(table.shiftId, table.prId),
    // The report scopes an outlet to its venues and groups/filters by day — this
    // covers the (outlet_id, sold_on) predicate the byDay aggregate runs on.
    outletSoldOnIdx: index('shift_sale_outlet_sold_on_idx').on(table.outletId, table.soldOn),
  }),
);

export type ShiftSaleType = typeof ShiftSaleTable.$inferSelect;
export type ShiftSaleInsertType = typeof ShiftSaleTable.$inferInsert;

export type ShiftSaleFilter = {
  outletId?: string;
  agencyId?: string;
  shiftId?: string;
  prId?: string;
  /** Restrict to a set of outlets — scopes an outlet caller to its own venues. */
  outletIds?: string[];
  fromDate?: string;
  toDate?: string;
};

/** One day's floor-sales totals for an outlet (report byDay row). */
export type ShiftSaleDayTotals = {
  soldOn: string;
  drinkSalesRm: number;
  tipSalesRm: number;
  totalSalesRm: number;
};

/** One PR's floor-sales total across the report window (report byPr row). */
export type ShiftSalePrTotals = {
  prId: string;
  prName: string | null;
  totalSalesRm: number;
};
