import { MainSchema } from '@/db/db.schema';
import { numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { OutletTable } from '@/features/outlet/outlet.model.js';

export const outletTransactionStatusValues = ['completed', 'pending', 'refunded', 'cancelled'] as const;
export type OutletTransactionStatus = (typeof outletTransactionStatusValues)[number];
export const outletTransactionStatusEnum = MainSchema.enum(
  'outlet_transaction_status',
  outletTransactionStatusValues,
);

// Gross transaction (payment-voucher) volume flowing through an outlet.
// Powers the admin "outlet transaction volume by month" metric. Snapshots the outlet
// name so historical reporting stays readable if the outlet is renamed/removed.
export const OutletTransactionTable = MainSchema.table('outlet_transaction', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').notNull().references(() => OutletTable.id, { onDelete: 'cascade' }),
  outletName: varchar('outlet_name', { length: 255 }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  type: varchar('type', { length: 50 }).notNull().default('payment_voucher'),
  status: outletTransactionStatusEnum('status').notNull().default('completed'),
  reference: varchar('reference', { length: 100 }),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type OutletTransaction = typeof OutletTransactionTable.$inferSelect;
export type OutletTransactionInsertType = typeof OutletTransactionTable.$inferInsert;

export type OutletTransactionFilter = {
  outletId?: string;
  status?: OutletTransactionStatus;
  from?: Date;
  to?: Date;
};
