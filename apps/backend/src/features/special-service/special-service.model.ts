import { MainSchema } from '@/db/db.schema';
import { numeric, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { OutletTable } from '@/features/outlet/outlet.model.js';
import { AgencyTable } from '@/features/agency/agency.model.js';
import { PrTable } from '@/features/pr/pr.model.js';

export const specialServiceCategoryValues = [
  'transportation',
  'delivery',
  'wardrobe',
  'makeup',
  'vip_escort',
  'uniform',
  'emergency_cover',
  'training',
  'others',
] as const;
export type SpecialServiceCategory = (typeof specialServiceCategoryValues)[number];
export const specialServiceCategoryEnum = MainSchema.enum(
  'special_service_category',
  specialServiceCategoryValues,
);

export const specialServiceStatusValues = [
  'open',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;
export type SpecialServiceStatus = (typeof specialServiceStatusValues)[number];
export const specialServiceStatusEnum = MainSchema.enum(
  'special_service_status',
  specialServiceStatusValues,
);

export const specialServiceInitiatedByValues = ['outlet', 'agency', 'pr'] as const;
export type SpecialServiceInitiatedBy = (typeof specialServiceInitiatedByValues)[number];
export const specialServiceInitiatedByEnum = MainSchema.enum(
  'special_service_initiated_by',
  specialServiceInitiatedByValues,
);

export const specialServiceAdminAcceptedValues = [
  'n_a',
  'pending',
  'accepted',
  'declined',
] as const;
export type SpecialServiceAdminAccepted = (typeof specialServiceAdminAcceptedValues)[number];
export const specialServiceAdminAcceptedEnum = MainSchema.enum(
  'special_service_admin_accepted',
  specialServiceAdminAcceptedValues,
);

// Special-service orders / job postings. Outlet-initiated posts go live immediately;
// agency-initiated posts require admin accept/decline before they proceed.
export const SpecialServiceTable = MainSchema.table('special_service', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  outletId: uuid('outlet_id').references(() => OutletTable.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull(),
  category: specialServiceCategoryEnum('category').notNull().default('others'),
  description: text('description'),
  budget: numeric('budget', { precision: 12, scale: 2 }),
  currency: varchar('currency', { length: 8 }).notNull().default('MYR'),
  status: specialServiceStatusEnum('status').notNull().default('open'),
  initiatedBy: specialServiceInitiatedByEnum('initiated_by').notNull().default('outlet'),
  adminAccepted: specialServiceAdminAcceptedEnum('admin_accepted').notNull().default('n_a'),
  postingAgencyId: uuid('posting_agency_id').references(() => AgencyTable.id, {
    onDelete: 'set null',
  }),
  postingAgencyName: varchar('posting_agency_name', { length: 255 }),
  /**
   * The PR who raised a PR-initiated posting (initiated_by = 'pr'). FK to
   * main.pr; the PR's display name is joined from pr.name on read, never copied
   * here. Null for outlet/agency postings.
   */
  postingPrId: uuid('posting_pr_id').references(() => PrTable.id, {
    onDelete: 'set null',
  }),
  /**
   * The external vendor fulfilling the order — free text, no `agency` row
   * behind it (MetroRide Transport, Atelier Threads, …). Was
   * assigned_agency_name; the agency FK beside it was dropped in migration 0035
   * having never been populated.
   */
  vendorName: varchar('vendor_name', { length: 255 }),
  scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type SpecialService = typeof SpecialServiceTable.$inferSelect;

/**
 * What the read paths actually return: the row plus the outlet's name, joined
 * from main.outlet now that the denormalized outlet_name column is gone.
 */
export type SpecialServiceWithOutlet = SpecialService & {
  outletName: string | null;
  /** Joined from main.pr.name for PR-initiated postings; null otherwise. */
  postingPrName: string | null;
};
export type SpecialServiceInsertType = typeof SpecialServiceTable.$inferInsert;

export type SpecialServiceFilter = {
  outletId?: string;
  status?: SpecialServiceStatus;
  category?: SpecialServiceCategory;
  vendorName?: string;
  initiatedBy?: SpecialServiceInitiatedBy;
  postingPrId?: string;
  adminAccepted?: SpecialServiceAdminAccepted;
  /** Partial or full match on special_service.id (UUID text). */
  id?: string;
  /** Match rows requested on any of these calendar days (createdAt). */
  dates?: string[];
  /** Match rows scheduled on any of these calendar days (scheduledFor). */
  scheduledDates?: string[];
};
