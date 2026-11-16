import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Sunday issue pass, against fakes — no database is touched.
 *
 * Pins the two rules the 28 Sep audit found broken: a voucher the pass HOLDS
 * keeps its approved receipts open (the rollover runs after the pass and only
 * over vouchers that left review), and an issued voucher is stamped and
 * announced by the same helpers the agency's manual send uses.
 */
const mocks = vi.hoisted(() => ({
  repo: {
    listForWeek: vi.fn(),
    listDayReviews: vi.fn(),
    listReceipts: vi.fn(),
    update: vi.fn(),
    verifyApprovedReceipts: vi.fn(),
  },
  generator: { generateForWeek: vi.fn() },
  prRepo: { getById: vi.fn() },
  assignments: { listPendingOvertimeForPrWeek: vi.fn() },
  members: { listByAgency: vi.fn() },
  notify: vi.fn(),
  notifyMany: vi.fn(),
  writeSystemAudit: vi.fn(),
}));

vi.mock('@/composition-root.js', () => ({
  agencyMemberRepository: mocks.members,
  paymentVoucherGenerator: mocks.generator,
  paymentVoucherRepository: mocks.repo,
  prRepository: mocks.prRepo,
  shiftAssignmentRepository: mocks.assignments,
}));
vi.mock('@/features/notification/notify.js', () => ({
  notify: mocks.notify,
  notifyMany: mocks.notifyMany,
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// The run's audit row is stubbed: its own rules live in audit-log.system.test.ts.
vi.mock('@/features/audit-log/audit-log.system.js', () => ({
  writeSystemAudit: mocks.writeSystemAudit,
}));

import { runWeeklyPayout } from './weekly-payout.job.js';
import { klToday } from '@/features/payment-voucher/payment-voucher-week.js';

/** A closed-week voucher that balances; `signed` decides whether it may go. */
function voucher(id: string, signed: boolean) {
  return {
    id,
    voucherNo: `PV-${id}`,
    agencyId: 'agency-1',
    prId: `user-${id}`,
    userId: `user-${id}`,
    weekStart: '2026-09-13',
    weekEnd: '2026-09-19',
    issuedDate: null,
    dueDate: null,
    subtotal: '500.00',
    deduction: '0.00',
    net: '500.00',
    status: 'pending_review' as const,
    financeHeadSignedAt: signed ? new Date('2026-09-20T02:00:00Z') : null,
    lines: [
      {
        id: `${id}-l1`,
        lineDate: '2026-09-15',
        amount: '500.00',
        quantity: 1,
        ref: null,
        component: 'wages',
        receiptId: null,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.generator.generateForWeek.mockResolvedValue({
    agenciesProcessed: 1,
    created: [],
    skipped: [],
    imbalanced: [],
    unreconciled: [],
    wagesFilled: [],
  });
  mocks.repo.listDayReviews.mockResolvedValue([]);
  mocks.repo.listReceipts.mockResolvedValue([]);
  mocks.repo.verifyApprovedReceipts.mockResolvedValue([]);
  mocks.assignments.listPendingOvertimeForPrWeek.mockResolvedValue([]);
  mocks.members.listByAgency.mockResolvedValue([]);
  mocks.notify.mockResolvedValue({ id: 'n1' });
  mocks.notifyMany.mockResolvedValue(0);
  mocks.writeSystemAudit.mockResolvedValue(true);
  mocks.prRepo.getById.mockImplementation(async (prId: string) => ({ userId: prId }));
  mocks.repo.update.mockImplementation(async (id: string, patch: object) => ({
    ...voucher(id, true),
    ...patch,
  }));
});

describe('runWeeklyPayout — issue pass', () => {
  it('sends a signed voucher with both dates and holds an unsigned one', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('A', true), voucher('B', false)]);

    await runWeeklyPayout();

    expect(mocks.repo.update).toHaveBeenCalledTimes(1);
    expect(mocks.repo.update).toHaveBeenCalledWith(
      'A',
      expect.objectContaining({
        status: 'sent',
        issuedDate: klToday(),
        // A week after the week closes — the owner's payment term.
        dueDate: '2026-09-26',
      }),
    );
  });

  it('never re-dates a voucher that already carries its dates', async () => {
    mocks.repo.listForWeek.mockResolvedValue([
      { ...voucher('A', true), issuedDate: '2026-09-14', dueDate: '2026-09-26' },
    ]);

    await runWeeklyPayout();

    const patch = mocks.repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('issuedDate');
    expect(patch).not.toHaveProperty('dueDate');
  });

  it('announces only the voucher it actually sent', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('A', true), voucher('B', false)]);

    await runWeeklyPayout();

    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-A',
        kind: 'payment_voucher_issued',
        payload: expect.objectContaining({ voucherId: 'A', voucherNo: 'PV-A' }),
      }),
    );
  });
});

describe('runWeeklyPayout — receipt rollover', () => {
  it('leaves the receipts of a HELD voucher open', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('B', false)]);

    await runWeeklyPayout();

    expect(mocks.repo.verifyApprovedReceipts).toHaveBeenCalledTimes(1);
    expect(mocks.repo.verifyApprovedReceipts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeVoucherStatuses: ['pending_review'] }),
    );
  });

  it('runs after the issue pass, so this week’s sent vouchers still close tonight', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('A', true)]);

    await runWeeklyPayout();

    const sentAt = mocks.repo.update.mock.invocationCallOrder[0]!;
    const rolledAt = mocks.repo.verifyApprovedReceipts.mock.invocationCallOrder[0]!;
    expect(rolledAt).toBeGreaterThan(sentAt);
  });
});

/**
 * 12 Nov 2026: no job wrote an audit row. The payout now files ONE per run,
 * after every write and notice, naming what it sent, held and closed.
 */
describe('runWeeklyPayout — the run’s audit row', () => {
  it('names the voucher it sent, the receipts it closed, and the ones it held', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('A', true), voucher('B', false)]);
    mocks.repo.verifyApprovedReceipts.mockResolvedValue(['r-1', 'r-2']);

    await runWeeklyPayout();

    expect(mocks.writeSystemAudit).toHaveBeenCalledTimes(1);
    expect(mocks.writeSystemAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        job: 'weekly-payout',
        entity: 'payment-voucher',
        changed: 3,
        ids: ['A'],
        summary: expect.objectContaining({
          issued: 1,
          heldForSignature: 1,
          issuedVoucherIds: ['A'],
          verifiedReceiptIds: ['r-1', 'r-2'],
        }),
      }),
    );
  });

  it('is written LAST, after the PR has been told', async () => {
    mocks.repo.listForWeek.mockResolvedValue([voucher('A', true)]);

    await runWeeklyPayout();

    const toldAt = mocks.notify.mock.invocationCallOrder[0]!;
    const auditedAt = mocks.writeSystemAudit.mock.invocationCallOrder[0]!;
    expect(auditedAt).toBeGreaterThan(toldAt);
  });

  it('reports zero changes on a quiet week, so the helper writes nothing', async () => {
    mocks.repo.listForWeek.mockResolvedValue([]);

    await runWeeklyPayout();

    expect(mocks.writeSystemAudit).toHaveBeenCalledWith(expect.objectContaining({ changed: 0 }));
  });
});
