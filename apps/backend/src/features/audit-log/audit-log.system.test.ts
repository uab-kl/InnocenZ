import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The scheduled jobs' audit row (12 Nov 2026), against a fake repository — no
 * database is touched. No job wrote one before: 92 job-made subscription
 * invoices and 17 automatic no-shows had no audit entry at all.
 */
const mocks = vi.hoisted(() => ({
  createAuditLog: vi.fn(),
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/composition-root', () => ({
  auditLogRepository: { createAuditLog: mocks.createAuditLog },
}));
vi.mock('@/util/logger', () => ({ logger: mocks.logger }));

import { SYSTEM_AUDIT_IP, systemAuditUserAgent, writeSystemAudit } from './audit-log.system';

const A = '11111111-2222-4333-8444-555555555555';
const B = '66666666-7777-4888-9999-aaaaaaaaaaaa';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAuditLog.mockResolvedValue({ auditLogId: 1 });
});

describe('writeSystemAudit', () => {
  it('signs the row as the job — no user, no portal, the sentinel address', async () => {
    const wrote = await writeSystemAudit({
      job: 'no-show-sweep',
      entity: 'shift-assignment',
      action: 'BULK_UPDATE',
      changed: 2,
      ids: [A, B],
      summary: { from: 'assigned', to: 'no_show' },
    });

    expect(wrote).toBe(true);
    expect(mocks.createAuditLog).toHaveBeenCalledTimes(1);
    expect(mocks.createAuditLog).toHaveBeenCalledWith({
      userId: null,
      role: null,
      portal: null,
      action: 'BULK_UPDATE',
      entity: 'shift-assignment',
      entityId: null,
      newData: { job: 'no-show-sweep', changed: 2, from: 'assigned', to: 'no_show', ids: [A, B] },
      ipAddress: 'system',
      userAgent: 'job:no-show-sweep',
    });
    expect(SYSTEM_AUDIT_IP).toBe('system');
    expect(systemAuditUserAgent('weekly-payout')).toBe('job:weekly-payout');
  });

  it('files a single changed row under its id, so the id filter finds it', async () => {
    await writeSystemAudit({
      job: 'no-show-sweep',
      entity: 'shift-assignment',
      action: 'BULK_UPDATE',
      changed: 1,
      ids: [A, A],
    });
    expect(mocks.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: A, newData: expect.objectContaining({ ids: [A] }) }),
    );
  });

  it('writes NOTHING for a run that changed nothing — the 15-minute sweep', async () => {
    expect(
      await writeSystemAudit({
        job: 'no-show-sweep',
        entity: 'shift-assignment',
        action: 'BULK_UPDATE',
        changed: 0,
        ids: [],
      }),
    ).toBe(false);
    expect(mocks.createAuditLog).not.toHaveBeenCalled();
  });

  it('NEVER throws — an audit outage cannot stop a payout or a bill', async () => {
    mocks.createAuditLog.mockRejectedValue(new Error('connection terminated'));

    await expect(
      writeSystemAudit({
        job: 'weekly-payout',
        entity: 'payment-voucher',
        action: 'BULK_UPDATE',
        changed: 3,
      }),
    ).resolves.toBe(false);
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
  });
});
