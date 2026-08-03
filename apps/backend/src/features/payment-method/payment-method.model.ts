import { MainSchema } from '@/db/db.schema';
import { boolean, smallint, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { OutletTable } from '@/features/outlet/outlet.model.js';

/**
 * The card an outlet or agency pays its InnocenZ subscription with. Migration 0082.
 *
 * ⚠️ THE CARD NUMBER AND CVV ARE NOT HERE, AND MUST NEVER BE ADDED. A stored PAN
 * puts this database in PCI-DSS scope and a stored CVV is forbidden outright,
 * encrypted or not. This table holds only what a person needs to recognise their
 * own card, plus `gatewayToken` — where a real charge token goes once a payment
 * gateway is wired. Until then the app RECORDS a card; it cannot charge one.
 *
 * Ownership is two nullable FKs with a CHECK that exactly one is set, not the
 * `subscriberType` + `subscriberId` pair `member_subscription` uses: that pair
 * cannot be a foreign key, which is how six ledger rows came to point at
 * organisations that never existed.
 */
export const PaymentMethodTable = MainSchema.table('payment_method', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').references(() => OutletTable.id, { onDelete: 'cascade' }),
  agencyId: uuid('agency_id').references(() => AgencyTable.id, { onDelete: 'cascade' }),
  /** Derived in the browser from the number the user typed — never sent to us. */
  brand: varchar('brand', { length: 30 }).notNull().default('Card'),
  last4: varchar('last4', { length: 4 }).notNull(),
  expMonth: smallint('exp_month').notNull(),
  expYear: smallint('exp_year').notNull(),
  holderName: varchar('holder_name', { length: 255 }),
  billingEmail: varchar('billing_email', { length: 255 }),
  /** Null until a payment gateway is connected; this pair is what could charge. */
  gateway: varchar('gateway', { length: 50 }),
  gatewayToken: varchar('gateway_token', { length: 255 }),
  autoPay: boolean('auto_pay').notNull().default(true),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PaymentMethod = typeof PaymentMethodTable.$inferSelect;
export type NewPaymentMethod = typeof PaymentMethodTable.$inferInsert;

/** Card brands the UI derives from the leading digits. 'Card' is the fallback. */
export const cardBrandValues = [
  'Visa',
  'Mastercard',
  'Amex',
  'Discover',
  'UnionPay',
  'JCB',
  'Card',
] as const;
export type CardBrand = (typeof cardBrandValues)[number];
