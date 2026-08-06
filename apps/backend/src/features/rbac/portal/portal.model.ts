import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

/** Three master web portals. PR/mobile is not a portal row. */
export const portalCodeValues = ['admin', 'agency', 'outlet'] as const;
export type PortalCode = (typeof portalCodeValues)[number];

export const PortalTable = MainSchema.table('portal', {
  id: uuid('id').defaultRandom().notNull().primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  status: varchar('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdBy: varchar('created_by').notNull(),
  updatedBy: varchar('updated_by').notNull(),
});

export type PortalType = typeof PortalTable.$inferSelect;
export type PortalInsertType = typeof PortalTable.$inferInsert;

export type PortalFilter = {
  id?: string | string[];
  code?: string;
  status?: string;
};
