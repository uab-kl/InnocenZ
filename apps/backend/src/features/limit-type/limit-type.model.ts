import { MainSchema } from "@/db/db.schema";
import { timestamp, uuid, varchar, jsonb} from "drizzle-orm/pg-core";

export const LimitTypeTable = MainSchema.table('limit_type', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    code: varchar('code', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    description: varchar('description', { length: 255 }),
    configSchema: jsonb('config_schema'),
    status: varchar('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
});

export type LimitType = typeof LimitTypeTable.$inferSelect;
export type NewLimitType = typeof LimitTypeTable.$inferInsert;

export type limitTypeFilter = {
    id?: string;
    code?: string;
    name?: string;
    description?: string;
    configSchema?: any;
    status?: string;
    createdAt?: Date;
    updatedAt?: Date;
    createdBy?: string;
    updatedBy?: string;
};