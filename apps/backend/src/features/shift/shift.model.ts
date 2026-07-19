import { date, integer, numeric, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { AgencyTable } from '@/features/agency/agency.model';
import { OutletTable } from '@/features/outlet/outlet.model';

// Mirrors the frontend ShiftRequest.status lifecycle (agency-portal store).
export const shiftStatusValues = ['draft', 'open', 'confirmed', 'sealed'] as const;
export type ShiftStatus = (typeof shiftStatusValues)[number];
export const shiftStatusEnum = MainSchema.enum('shift_status', shiftStatusValues);

// Mirrors the frontend ShiftEventKind.
export const shiftEventKindValues = ['normal', 'special'] as const;
export type ShiftEventKind = (typeof shiftEventKindValues)[number];
export const shiftEventKindEnum = MainSchema.enum('shift_event_kind', shiftEventKindValues);

/**
 * A shift (job) an outlet needs staffed on a given date, managed by an agency.
 * This is the core persisted shape of the frontend `ShiftRequest`; PR assignments
 * (the demo's `prs[]`) and outlet-side live-sales reconciliation are follow-ups.
 */
export const ShiftTable = MainSchema.table('shift', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  agencyId: uuid('agency_id')
    .notNull()
    .references(() => AgencyTable.id, { onDelete: 'cascade' }),
  outletId: uuid('outlet_id')
    .notNull()
    .references(() => OutletTable.id, { onDelete: 'cascade' }),
  shiftDate: date('shift_date', { mode: 'string' }).notNull(),
  slot: varchar('slot', { length: 100 }),
  eventName: varchar('event_name', { length: 255 }),
  eventKind: shiftEventKindEnum('event_kind').notNull().default('normal'),
  languages: varchar('languages', { length: 255 }),
  quantity: integer('quantity').notNull().default(0),
  filled: integer('filled').notNull().default(0),
  preferredRating: integer('preferred_rating'),
  payPerHour: numeric('pay_per_hour', { precision: 12, scale: 2 }).notNull().default('0'),
  estimatedCost: numeric('estimated_cost', { precision: 12, scale: 2 }).notNull().default('0'),
  liveSales: numeric('live_sales', { precision: 12, scale: 2 }).notNull().default('0'),
  status: shiftStatusEnum('status').notNull().default('draft'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type ShiftType = typeof ShiftTable.$inferSelect;
export type ShiftInsertType = typeof ShiftTable.$inferInsert;

export type ShiftFilter = {
  id?: string;
  agencyId?: string;
  outletId?: string;
  status?: ShiftStatus;
  eventKind?: ShiftEventKind;
  fromDate?: string;
  toDate?: string;
};
