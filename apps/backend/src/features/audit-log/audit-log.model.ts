import { MainSchema } from '@/db/db.schema';
import { bigint, index, jsonb, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { UserTable } from '../user/user.model';

export const AuditLogTable = MainSchema.table(
  'audit_logs',
  {
    auditLogId: bigint('audit_log_id', { mode: 'number' }).notNull().primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid('user_id').references(() => UserTable.id),
    role: text('role'),
    /**
     * WHICH SURFACE the action came from — `admin` | `agency` | `outlet` | `pr`.
     *
     * ⚠️ Not derivable from `role`. That column holds the actor's CAPACITY, and
     * `Owner`, `Finance`, `Director` and `Guarantor` are each seeded on BOTH
     * portals — so a name-only join is 1:N and would either duplicate a row onto
     * two tabs or pick one by coin-flip. The portal is known at write time; 0164
     * gave it somewhere to go. Null on every row written before that.
     */
    portal: text('portal'),
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
    index('audit_portal_idx').on(table.portal),
  ],
);

export type AuditLogType = typeof AuditLogTable.$inferSelect;
export type AuditLogInsertType = typeof AuditLogTable.$inferInsert;
