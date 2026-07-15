import { MainSchema } from '@/db/db.schema';
import { integer, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// Single-row global platform configuration (UAB Admin owned).
// Feeds MVP money/ops rules: platform fee (M3/M8), geofence (M4), subscription (M10),
// duplicate-payment window (M7/M8).
export const PlatformConfigTable = MainSchema.table('platform_config', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  platformFeePercent: numeric('platform_fee_percent', { precision: 5, scale: 2 }).notNull().default('5.00'),
  geofenceRadiusMeters: integer('geofence_radius_meters').notNull().default(50),
  subscriptionMonthlyFee: numeric('subscription_monthly_fee', { precision: 10, scale: 2 }).notNull().default('499.00'),
  duplicatePaymentWindowHours: integer('duplicate_payment_window_hours').notNull().default(24),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: varchar('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PlatformConfig = typeof PlatformConfigTable.$inferSelect;
export type NewPlatformConfig = typeof PlatformConfigTable.$inferInsert;
