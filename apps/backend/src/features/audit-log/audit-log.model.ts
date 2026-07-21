import { MainSchema } from '@/db/db.schema';
import { bigint, index, jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { UserTable } from '../user/user.model';

export const AuditLogTable = MainSchema.table(
  'audit_logs',
  {
    auditLogId: bigint('audit_log_id', { mode: 'number' }).notNull().primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id').references(() => UserTable.id),
    role: text('role'),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    batchId: uuid('batch_id'),
    oldData: jsonb('old_data'),
    newData: jsonb('new_data'),
    ipAddress: varchar('ip_address').notNull(),
    userAgent: text('user_agent').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    createdBy: varchar('created_by').notNull().default('system'),
    updatedBy: varchar('updated_by').notNull().default('system'),
  },
  (table) => [
    index('audit_user_idx').on(table.userId),
    index('audit_entity_idx').on(table.entity, table.entityId),
    index('audit_created_idx').on(table.createdAt),
    index('audit_role_idx').on(table.role),
  ],
);

export type AuditLogType = typeof AuditLogTable.$inferSelect;
export type AuditLogInsertType = typeof AuditLogTable.$inferInsert;
