import { MainSchema } from "@/db/db.schema";
import { decimal, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const billingCycleValues = ['weekly', 'monthly', 'annually'] as const;
export type BillingCycle = (typeof billingCycleValues)[number];
export const billingCycleEnum = MainSchema.enum('billing_cycle', billingCycleValues);

export const SubscriptionTable = MainSchema.table('subscription', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
    status: varchar('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
});

export type Subscription = typeof SubscriptionTable.$inferSelect;
export type SubscriptionInsertType = typeof SubscriptionTable.$inferInsert;

export type subscriptionFilter = {
    id?: string;
    name?: string;
    price?: number;
    billingCycle?: BillingCycle;
    roleIds?: string[];
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: string;
    updatedBy?: string;
};