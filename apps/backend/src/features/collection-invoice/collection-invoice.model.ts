import { MainSchema } from '@/db/db.schema';
import { date, jsonb, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';

export const collectionInvoiceStatusValues = ['draft', 'issued', 'settled', 'void'] as const;
export type CollectionInvoiceStatus = (typeof collectionInvoiceStatusValues)[number];
export const collectionInvoiceStatusEnum = MainSchema.enum(
  'collection_invoice_status',
  collectionInvoiceStatusValues,
);

/**
 * What an outlet owes its agency for one week of PR work.
 *
 * A STATEMENT OF ACCOUNT, not a payment rail. This app does not move money
 * between an agency and an outlet — they settle that between themselves — so
 * there is no payment method, capture or gateway reference here. The value is
 * that both sides read one figure derived from work that actually happened.
 *
 * `settledAt` is bookkeeping, not evidence: it records that the agency SAYS it
 * was paid. Nothing here can verify that, and it must not be read as if it can.
 */
export const CollectionInvoiceTable = MainSchema.table('collection_invoice', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => OutletTable.id, { onDelete: 'cascade' }),
  /** Snapshot, so a renamed outlet does not rewrite history. */
  outletName: varchar('outlet_name', { length: 255 }).notNull(),
  weekStart: date('week_start', { mode: 'string' }).notNull(),
  weekEnd: date('week_end', { mode: 'string' }).notNull(),
  amount: numeric('amount', { precision: 12, scale: 2 }).notNull().default('0'),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: collectionInvoiceStatusEnum('status').notNull().default('draft'),
  issuedAt: timestamp('issued_at', { withTimezone: true }),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  note: varchar('note', { length: 1000 }),
  /** The assignments this figure was built from — the number stays traceable. */
  sourceAssignmentIds: jsonb('source_assignment_ids')
    .$type<string[]>()
    .notNull()
    .default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type CollectionInvoice = typeof CollectionInvoiceTable.$inferSelect;
export type CollectionInvoiceInsertType = typeof CollectionInvoiceTable.$inferInsert;

export type CollectionInvoiceFilter = {
  agencyId?: string;
  outletId?: string;
  status?: CollectionInvoiceStatus;
  weekStart?: string;
};
