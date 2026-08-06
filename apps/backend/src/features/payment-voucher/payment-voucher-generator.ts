import { logger } from '@/util/logger';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';
import { checkVoucherBalance } from './payment-voucher-balance';
import { auditVoucher } from './payment-voucher-audit';
import { paymentDueDate } from './payment-voucher-week';
import { describeWorkedTime } from '@/features/shift-assignment/wage';

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
  /**
   * Vouchers that were created but do NOT balance — Σ(lines) − deduction ≠ net.
   * Always empty in a healthy run. Non-empty means money was invented or lost
   * and something upstream is broken; the voucher is left in place, flagged,
   * because a wrong row an agency can see beats one silently deleted.
   */
  imbalanced: Array<{
    agencyId: string;
    prId: string;
    voucherId: string;
    problems: string[];
  }>;
  /**
   * Vouchers that BALANCE but do not agree with the records they were built
   * from — wages for a day nobody worked, a line outside the week, overtime the
   * attendance stamps cannot justify, a duplicated order reference, or a second
   * voucher for the same PR and week.
   *
   * Separate from `imbalanced` on purpose: that one means the arithmetic is
   * broken, this one means the arithmetic is fine and the inputs are wrong. They
   * have different causes and different fixes, and collapsing them would hide
   * which. Like `imbalanced`, the voucher is left in place and flagged.
   */
  unreconciled: Array<{
    agencyId: string;
    prId: string;
    voucherId: string;
    problems: string[];
  }>;
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * What one shift's wages line says it is for.
 *
 * A pro-rated line states so on its face. Without it the agency sees RM520 where
 * the rate card says RM700 and cannot tell an under-worked shift from a mispriced
 * one — which becomes a dispute, and a phone call, over something the record
 * already knows the answer to. Only `pro_rata` is annotated: a full day needs no
 * explanation, and labelling every line would make the note invisible.
 */
function describeShiftLine(row: {
  shiftDate: string;
  slot: string | null;
  eventName: string | null;
  assignment: { payRule?: string | null; workedMinutes?: number | null; scheduledMinutes?: number | null };
}): string {
  const base = row.eventName ?? row.slot ?? `Shift on ${row.shiftDate}`;
  const { payRule, workedMinutes, scheduledMinutes } = row.assignment;
  if (payRule !== 'pro_rata' || workedMinutes == null || scheduledMinutes == null) return base;
  return `${base} — pro-rata ${describeWorkedTime(workedMinutes, scheduledMinutes)}`.slice(0, 500);
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
      imbalanced: [],
      unreconciled: [],
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
        // weekEnd passed so the check is an OVERLAP, not a week_start match: a
        // voucher this PR already has under a different anchor still counts.
        if (await this.paymentVoucherRepository.existsForPrWeek(agencyId, prId, weekStart, weekEnd)) {
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
          description: describeShiftLine(row),
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
            // Dual-write (0087) — ops will key on user_id after pr is dropped.
            userId: pr.userId ?? undefined,
            prName: pr.name,
            prIc: pr.icNo ?? undefined,
            outlet: prRows[0]?.outletName ?? undefined,
            cycle: 'Weekly',
            issuedDate,
            // Anchored to weekEnd, not issuedDate, so a late or repeated run
            // cannot hand the same week two different due dates. Null only for
            // a malformed weekEnd, which leaves the column as it always was.
            dueDate: paymentDueDate(weekEnd) ?? undefined,
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

        // Σ=0. Checked against what was PERSISTED, not against the numbers we
        // just computed — the point is to catch the round trip, including the
        // float reduce above and numeric(12,2) truncation on the way in.
        const balance = checkVoucherBalance(voucher, voucher.lines ?? []);
        if (!balance.balanced) {
          result.imbalanced.push({
            agencyId,
            prId,
            voucherId: voucher.id,
            problems: balance.problems,
          });
          logger.error(
            `[PaymentVoucherGenerator] voucher ${voucher.id} does not balance: ${balance.problems.join('; ')}`,
          );
        }

        // …and does it agree with the RECORDS, not just with itself? The two
        // checks answer different questions: a voucher paying 700.00 for a day
        // nobody worked balances perfectly.
        //
        // Also checked against what was PERSISTED, for the same round-trip
        // reason. `assignments` here are the completed rows this voucher was
        // built from, so the wages arms are near-tautological AT THIS CALL SITE
        // — that is expected and is not the point. What this catches during
        // generation is the date window, overtime against the attendance stamps,
        // duplicate order refs and a sibling voucher. The wages arms earn their
        // keep when the same function is pointed at an EXISTING voucher with the
        // full assignment list, which is how PV-000002's unworked day is caught.
        const audit = auditVoucher({
          voucher: { id: voucher.id, voucherNo: voucher.voucherNo, weekStart, weekEnd },
          lines: voucher.lines ?? [],
          sources: {
            assignments: prRows.map((row) => ({
              id: row.assignment.id,
              shiftDate: row.shiftDate,
              status: row.assignment.status,
              payAmount: row.assignment.payAmount,
              // The overtime BASIS (0097). `payAmount` may now be pro-rated, and
              // budgeting overtime against a reduced figure would flag a
              // correctly-approved OT line as money nothing justifies.
              dayRateAmount: row.assignment.dayRateAmount,
              // The OT divisor, and the FROZEN approved amount. Both are needed
              // or the budget is re-derived at today's rate and every past
              // approval on a shift that was not six hours reads as invented.
              scheduledMinutes: row.assignment.scheduledMinutes,
              overtimeAmount: row.assignment.overtimeAmount,
              checkInAt: row.assignment.checkInAt,
              checkOutAt: row.assignment.checkOutAt,
              // The overtime budget is derived from these, NOT from the stamps,
              // whenever a claim was decided — check-out clamps check_out_at to
              // the scheduled end, so a shift that ran late leaves stamps saying
              // it did not. See maxOvertimeCents.
              overtimeMinutes: row.assignment.overtimeMinutes,
              overtimeStatus: row.assignment.overtimeStatus,
            })),
          },
        });
        if (!audit.ok) {
          result.unreconciled.push({
            agencyId,
            prId,
            voucherId: voucher.id,
            problems: audit.problems,
          });
          logger.error(
            `[PaymentVoucherGenerator] voucher ${voucher.id} does not reconcile against its source records: ${audit.problems.join('; ')}`,
          );
        }
      }
    }

    logger.info(
      `[PaymentVoucherGenerator] week ${weekStart}..${weekEnd}: ${result.created.length} created, ${result.skipped.length} skipped across ${result.agenciesProcessed} agencies`,
    );
    if (result.imbalanced.length > 0) {
      logger.error(
        `[PaymentVoucherGenerator] ${result.imbalanced.length} of ${result.created.length} vouchers DO NOT BALANCE — do not pay these until reviewed`,
      );
    }
    if (result.unreconciled.length > 0) {
      logger.error(
        `[PaymentVoucherGenerator] ${result.unreconciled.length} of ${result.created.length} vouchers DO NOT RECONCILE against their source records — do not pay these until reviewed`,
      );
    }
    return result;
  }
}
