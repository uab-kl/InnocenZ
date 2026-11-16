import { auditLogRepository } from '@/composition-root';
import { logger } from '@/util/logger';

/**
 * The address a scheduled job's row carries — it has no request, so no IP.
 * `ip_address` and `user_agent` are NOT NULL; these sentinels satisfy them
 * without a migration, the same pattern `cleanup-test-data-29sep.ts` uses.
 */
export const SYSTEM_AUDIT_IP = 'system';

/** `job:<name>` — the job's own `JobDefinition.name`, so the row names its lock. */
export function systemAuditUserAgent(job: string): string {
  return `job:${job}`;
}

export type SystemAuditInput = {
  /** The job's `JobDefinition.name` — `weekly-payout`, `no-show-sweep`, … */
  job: string;
  /** Spelt like the REST rows for the same table, so one entity filter finds both. */
  entity: string;
  action: 'BULK_CREATE' | 'BULK_UPDATE';
  /** How many rows this run wrote. Zero writes no audit row at all. */
  changed: number;
  /**
   * Ids of `entity` rows this run changed. When there is exactly one it also
   * becomes `entity_id`, so the Audit Log's id filter finds it. Ids of OTHER
   * tables belong in `summary`, never here.
   */
  ids?: string[];
  /** Counts and context for the run, stored beside the ids in `new_data`. */
  summary?: Record<string, unknown>;
};

/**
 * ONE AUDIT ROW PER SCHEDULED RUN THAT CHANGED SOMETHING (12 Nov 2026).
 *
 * No job wrote an audit row at all: 92 job-made subscription invoices and 17
 * automatic no-shows existed with no entry, and tracing them meant reading
 * `created_by = 'system'` and the scheduler's log lines. Each job now calls
 * this once, at the END of its run, after its own writes have committed.
 *
 * ⚠️ NEVER THROWS, and that is the contract. The money work is the job; this
 * is the record of it. An insert that fails is logged and reported as `false`,
 * so an audit outage can never stop a payout, a bill or a sweep — and it runs
 * outside every job transaction, so it cannot roll one back either.
 *
 * Only when `changed > 0`: the no-show sweep ticks every 15 minutes, and 96
 * rows a day saying "nothing happened" would bury the ones that matter. The
 * jobs' own log lines still speak at zero.
 *
 * `userId`, `role` and `portal` are null, so these rows sit in the Audit Log's
 * "Others" tab beside every other actor-less write.
 */
export async function writeSystemAudit(input: SystemAuditInput): Promise<boolean> {
  if (!(input.changed > 0)) return false;
  const ids = [...new Set(input.ids ?? [])];
  try {
    await auditLogRepository.createAuditLog({
      userId: null,
      role: null,
      portal: null,
      action: input.action,
      entity: input.entity,
      entityId: ids.length === 1 ? ids[0] : null,
      newData: { job: input.job, changed: input.changed, ...input.summary, ids },
      ipAddress: SYSTEM_AUDIT_IP,
      userAgent: systemAuditUserAgent(input.job),
    });
    return true;
  } catch (error) {
    logger.error(`[audit] ${input.job}: run summary NOT written to audit_logs:`, error);
    return false;
  }
}
