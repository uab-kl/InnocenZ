import { logger } from '@/util/logger';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { PrRepositoryClass } from '@/features/pr/pr.repository';
import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';

export type GenerateWeeklyParams = {
  /** Inclusive week window, yyyy-MM-dd. Typically the just-finished Mon–Sun. */
  weekStart: string;
  weekEnd: string;
  /** Restrict to one agency; otherwise every agency with completed work that week. */
  agencyId?: string;
  /** issued_date stamped on generated vouchers; defaults to today. */
  issuedDate?: string;
  actor?: string;
};

export type GenerateWeeklyResult = {
  weekStart: string;
  weekEnd: string;
  agenciesProcessed: number;
  created: Array<{ agencyId: string; prId: string; voucherId: string; net: string }>;
  skipped: Array<{ agencyId: string; prId: string; reason: 'already_exists' | 'pr_missing' }>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Rolls a week of completed shift assignments into one payment voucher per PR,
 * per agency. Idempotent: a PR+week that already has a voucher is skipped, so
 * the job can be re-run safely. This is the server-side port of the demo's
 * buildPaymentVoucherFromShift, intended to run on a weekly schedule.
 */
export class PaymentVoucherGeneratorClass {
  constructor(
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
    private paymentVoucherRepository: PaymentVoucherRepositoryClass,
    private prRepository: PrRepositoryClass,
  ) {}

  async generateForWeek(params: GenerateWeeklyParams): Promise<GenerateWeeklyResult> {
    const { weekStart, weekEnd } = params;
    const issuedDate = params.issuedDate ?? todayIso();
    const actor = params.actor ?? 'weekly-pv-job';

    const agencyIds = params.agencyId
      ? [params.agencyId]
      : await this.shiftAssignmentRepository.listAgencyIdsWithCompletedInRange(weekStart, weekEnd);

    const result: GenerateWeeklyResult = {
      weekStart,
      weekEnd,
      agenciesProcessed: agencyIds.length,
      created: [],
      skipped: [],
    };

    for (const agencyId of agencyIds) {
      const rows = await this.shiftAssignmentRepository.listCompletedForAgencyWeek({
        agencyId,
        fromDate: weekStart,
        toDate: weekEnd,
      });

      // Group the week's completed assignments by PR — one voucher per PR.
      const byPr = new Map<string, typeof rows>();
      for (const row of rows) {
        const list = byPr.get(row.assignment.prId) ?? [];
        list.push(row);
        byPr.set(row.assignment.prId, list);
      }

      for (const [prId, prRows] of byPr) {
        if (await this.paymentVoucherRepository.existsForPrWeek(agencyId, prId, weekStart)) {
          result.skipped.push({ agencyId, prId, reason: 'already_exists' });
          continue;
        }

        const pr = await this.prRepository.getById(prId);
        if (!pr) {
          result.skipped.push({ agencyId, prId, reason: 'pr_missing' });
          continue;
        }

        const lines = prRows.map((row) => ({
          lineDate: row.shiftDate,
          outlet: row.outletName ?? undefined,
          description: row.eventName ?? row.slot ?? `Shift on ${row.shiftDate}`,
          quantity: 1,
          amount: row.assignment.payAmount,
          ref: row.assignment.id,
          // Every generated line is the shift's wage. Set explicitly because the
          // ref here is a bare assignment id, so there is no packed kind for
          // withComponent() to read.
          component: 'wages' as const,
        }));

        const subtotal = prRows.reduce((sum, row) => sum + Number(row.assignment.payAmount), 0);

        const voucher = await this.paymentVoucherRepository.create(
          {
            agencyId,
            prId,
            prName: pr.name,
            prIc: pr.icNo ?? undefined,
            outlet: prRows[0]?.outletName ?? undefined,
            cycle: 'Weekly',
            issuedDate,
            weekStart,
            weekEnd,
            subtotal: subtotal.toFixed(2),
            deduction: '0.00',
            net: subtotal.toFixed(2),
            status: 'pending_review',
            createdBy: actor,
            updatedBy: actor,
          },
          lines,
        );

        result.created.push({ agencyId, prId, voucherId: voucher.id, net: voucher.net });
      }
    }

    logger.info(
      `[PaymentVoucherGenerator] week ${weekStart}..${weekEnd}: ${result.created.length} created, ${result.skipped.length} skipped across ${result.agenciesProcessed} agencies`,
    );
    return result;
  }
}
