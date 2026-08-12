import { MainSchema } from "@/db/db.schema";
import { decimal, integer, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { RoleTable } from "@/features/rbac/role/role.model";

export const billingCycleValues = ['weekly', 'monthly', 'annually'] as const;
export type BillingCycle = (typeof billingCycleValues)[number];
export const billingCycleEnum = MainSchema.enum('billing_cycle', billingCycleValues);

/**
 * Who a plan is sold to. Until migration 0036 this was inferred from
 * billingCycle (weekly = agency, monthly = outlet); it is now stored.
 */
export const subscriptionTypeValues = ['agency', 'outlet'] as const;
export type SubscriptionType = (typeof subscriptionTypeValues)[number];
export const subscriptionTypeEnum = MainSchema.enum('subscription_type', subscriptionTypeValues);

// A PLAN is held one at a time (Essential..Premier); an ADD-ON is held ALONGSIDE
// a plan (POS Integration). Reads that ask "what is this subscriber on?" filter
// to plans — otherwise a venue's add-on line, being the newest, would be
// mistaken for its plan. Migration 0081.
export const subscriptionKindValues = ['plan', 'addon'] as const;
export type SubscriptionKind = (typeof subscriptionKindValues)[number];
export const subscriptionKindEnum = MainSchema.enum('subscription_kind', subscriptionKindValues);

export const SubscriptionTable = MainSchema.table('subscription', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    name: varchar('name', { length: 255 }).notNull(),
    price: decimal('price', { precision: 10, scale: 2 }).notNull(),
    billingCycle: billingCycleEnum('billing_cycle').notNull().default('monthly'),
    subscriptionType: subscriptionTypeEnum('subscription_type').notNull(),
    // plan (held one at a time) vs addon (held alongside a plan). Migration 0081.
    kind: subscriptionKindEnum('kind').notNull().default('plan'),
    /** The role this plan grants — main.role 'agency' or 'outlet'. */
    roleId: uuid('role_id').references(() => RoleTable.id, { onDelete: 'set null' }),
    status: varchar('status').notNull().default('active'),
    // Free-text volume tier shown on the plan (e.g. "11–25 PV/week", "5 PRs/day").
    coverage: varchar('coverage', { length: 100 }),
    /**
     * The same band as a NUMBER, so the server can enforce it — agency plans are
     * PVs per payroll week, outlet plans are PRs per calendar day, the unit
     * implied by `subscriptionType`.
     *
     * NULL is UNLIMITED, which is what the open-ended bands actually mean:
     * agency Custom ("151+ PV/week") and outlet Premier ("101+ PRs/day") are
     * floors with no ceiling, and the POS add-on is not a capacity product.
     * `coverage` above stays the display string; keep the two in step.
     * Migration 0119.
     */
    limitAmount: integer('limit_amount'),
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