import { timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';

export const ModuleTable = MainSchema.table('m_module', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    moduleName: varchar('module_name').notNull(),
    status: varchar('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
});

export type ModuleType = typeof ModuleTable.$inferSelect;
export type ModuleInsertType = typeof ModuleTable.$inferInsert;

export type ModuleFilter = {
    id?: string | string[];
    moduleName?: string;
    status?: string;
};