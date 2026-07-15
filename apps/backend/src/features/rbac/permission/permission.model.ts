import { timestamp, uuid, varchar, unique } from 'drizzle-orm/pg-core';
import { MainSchema } from '@/db/db.schema';
import { ModuleTable } from '../module/module.model';
import { permissionTypeValues, type PermissionTypeCode } from '@/types/rbac-constant';

export const permissionTypeEnum = MainSchema.enum('permission_type', permissionTypeValues);

export const PermissionTable = MainSchema.table('m_permission', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    moduleId: uuid('module_id').references(() => ModuleTable.id).notNull(),
    permissionType: permissionTypeEnum('permission_type').notNull(),
    description: varchar('description').notNull(),
    status: varchar('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
}, (table) => ({
    uniquePermission: unique().on(table.moduleId, table.permissionType),
}));

export type PermissionType = typeof PermissionTable.$inferSelect;
export type PermissionInsertType = typeof PermissionTable.$inferInsert;

export type PermissionFilter = {
    id?: string | string[];
    moduleId?: string | string[];
    permissionType?: PermissionTypeCode;
    description?: string;
    status?: string;
};
