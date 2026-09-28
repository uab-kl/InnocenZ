import { logger } from '@/util/logger';
import type { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import type { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import {
  type PaymentVoucherRepositoryClass,
  VoucherConflictError,
} from './payment-voucher.repository';
import type { PaymentVoucherComponent } from './payment-voucher.model';
import { resolveComponent } from './payment-voucher-component';
import { assignmentIdFromRef } from './payment-voucher-audit';
import { weekOfDate } from './payment-voucher-week';

/**
 * THE WAGE A SEALED SHIFT BECOMES, WRITTEN BY THE SERVER.
 *
 * Until 28 Sep 2026 the wages line reached a voucher only through the PHONE's
 * second call after check-out (`POST /payment-voucher/mine/lines`, kind
 * 'wages'). Every way that call could fail lost the night's pay for good, and
 * the check-out itself could not be retried — the row was already completed:
 *  - a dropped connection, a killed app, a crash between the two calls;
 *  - ANY check-out after midnight: the phone dated the line "today", and the
 *    repository refuses a line whose date contradicts the shift its ref names
 *    (`assertLinesAgreeWithShifts`), so an overnight shift's wage was a 400;
 *  - a cut-loss release, where the PR never checks out at all and nothing else
 *    wrote the line — while the PR was told their wage was sealed.
 * The Sunday generator could not catch any of these: it skips a PR whose week
 * already has a voucher, and the PR's first drink of the week creates one.
 *
 * So the server writes it, at the moment it seals the figure: check-out, a
 * cut-loss release, and the Sunday run as the net under both. Same line the
 * phone writes (kind wages, source checkin, dedupe = the assignment id), so an
 * older app's follow-up call finds it and answers "Already sealed".
 */

const REF_SEP = '|';

/** Matches `encodeRef('wages', 'checkin', amount, assignmentId)` in the controller. */
export function wageLineRef(assignmentId: string, amount: number): string {
  return ['wages', 'checkin', amount.toFixed(2), assignmentId, ''].join(REF_SEP);
}

/**
 * Is this line the wage for `assignmentId`? Either shape counts: the phone's
 * packed ref, and the generator's bare-id ref with `component = 'wages'`. The
 * component term is what keeps the same shift's OVERTIME line (`<id>-ot`) from
 * reading as its wage.
 */
export function isWageLineFor(
  line: { ref: string | null; component: PaymentVoucherComponent | null },
  assignmentId: string,
): boolean {
  return (
    resolveComponent(line) === 'wages' &&
    assignmentIdFromRef(line.ref) === assignmentId.toLowerCase()
  );
}

export type WageSealOutcome =
  | { outcome: 'sealed'; voucherId: string; amount: string; signatureVoided: boolean }
  | { outcome: 'already'; voucherId: string }
  | { outcome: 'skipped'; reason: string }
  | { outcome: 'refused'; reason: string };

export type WageSealDeps = {
  shiftAssignmentRepository: ShiftAssignmentRepositoryClass;
  paymentVoucherRepository: PaymentVoucherRepositoryClass;
  prRepository: PrRepositoryClass;
};

/**
 * Put the sealed wage for one COMPLETED assignment on its week's voucher, once.
 *
 * Never throws: every caller has already committed the thing that matters (the
 * check-out, the release), so a failure here is reported, not raised. The
 * outcome says which of four things happened, and `refused` is the one a human
 * must hear about — the money is owed and is not on any voucher.
 */
export async function sealWageLine(
  deps: WageSealDeps,
  input: { assignmentId: string; actor: string },
): Promise<WageSealOutcome> {
  try {
    const context = await deps.shiftAssignmentRepository.getOvertimeContext(input.assignmentId);
    if (!context) return { outcome: 'skipped', reason: 'assignment not found' };
    const { assignment, shiftDate, outletName } = context;

    if (assignment.status !== 'completed') {
      return { outcome: 'skipped', reason: `assignment is ${assignment.status}` };
    }
    // Same gate as `addMyLine`: only a figure CHECK-OUT sealed is money. Without
    // `payRule`, `pay_amount` is still the assign-time forecast, which can be a
    // hand-typed number far below the card — trusting it would underpay.
    const amount = Number(assignment.payAmount);
    if (assignment.payRule == null || !(amount > 0)) {
      return { outcome: 'skipped', reason: 'no sealed wage on this assignment' };
    }

    // The SHIFT's week and date — never "today". That is the overnight fault
    // above, and the date the repository's shift check demands.
    const week = weekOfDate(shiftDate);
    if (!week) return { outcome: 'refused', reason: `unusable shift date ${shiftDate}` };

    const pr = await deps.prRepository.getById(assignment.prId);
    const draft = await deps.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
      prId: assignment.prId,
      userId: assignment.userId ?? pr?.userId,
      agencyId: assignment.agencyId,
      prName: pr?.name ?? 'PR',
      prIc: pr?.icNo,
      outlet: outletName,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      actor: input.actor,
    });
    if (!draft.ok) return { outcome: 'refused', reason: draft.reason };

    const written = await deps.paymentVoucherRepository.addLineOnce(
      draft.voucher.id,
      {
        lineDate: shiftDate,
        outlet: outletName ?? undefined,
        // Stored and read back by the agency portal — the phone's own wording.
        description: 'Daily wages',
        quantity: 1,
        amount: amount.toFixed(2),
        ref: wageLineRef(assignment.id, amount),
        createdBy: input.actor,
        updatedBy: input.actor,
      },
      (line) => isWageLineFor(line, assignment.id),
      // A wage the agency signed without is a total that just changed.
      { voidFinanceSignature: true },
    );
    if (!written.created) return { outcome: 'already', voucherId: draft.voucher.id };
    return {
      outcome: 'sealed',
      voucherId: draft.voucher.id,
      amount: amount.toFixed(2),
      signatureVoided: written.signatureVoided,
    };
  } catch (error) {
    if (error instanceof VoucherConflictError) {
      return { outcome: 'refused', reason: 'the week’s voucher was sent before the wage could be added' };
    }
    logger.error('[sealWageLine] Error:', error);
    return { outcome: 'refused', reason: 'unexpected error — see the server log' };
  }
}
