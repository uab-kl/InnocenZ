import { MainSchema } from "@/db/db.schema";
import { RoleTable } from "../role/role.model";
import { PermissionTable } from "../permission/permission.model";
import { uuid, timestamp, varchar, unique } from "drizzle-orm/pg-core";

export const RolePermissionTable = MainSchema.table('role_permission', {
    id: uuid('id').defaultRandom().notNull().primaryKey(),
    roleId: uuid('role_id').references(() => RoleTable.id).notNull(),
    permissionId: uuid('permission_id').references(() => PermissionTable.id).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull(),
    updatedBy: varchar('updated_by').notNull(),
}, (table) => ({
    uniqueRolePermission: unique().on(table.roleId, table.permissionId),
}));

export type RolePermissionType = typeof RolePermissionTable.$inferSelect;
export type RolePermissionInsertType = typeof RolePermissionTable.$inferInsert;

export type RolePermissionFilter = {
    id?: string;
    roleId?: string;
    permissionId?: string;
};