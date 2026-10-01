import type { AgencyPrApproveStatus } from '@/features/pr-personnel/pr.model';

/**
 * WHAT AN APPROVALS-PAGE DECISION MEANS ON A ROW THAT IS NO LONGER WAITING
 * (29 Sep 2026 follow-up: "join approval re-notifies").
 *
 * `PATCH /agency/:id/prs/:userId/approval` decides a join request (`pending`)
 * or a departure (`leave_pending`). Its join branch read no status at all, so a
 * second click on Approve wrote the row again and told the PR "You were accepted
 * by the agency" a second time — and worse, a second click on a DEPARTURE's
 * buttons landed there too, once the first had moved the row out of
 * `leave_pending`:
 *   · Approve departure twice → the second click saw `left`, took join
 *     semantics, put the PR BACK on the roster and told them they were accepted;
 *   · Decline departure twice → the second saw `approved`, took join semantics,
 *     wrote `rejected` and told a current member their application was declined.
 *
 * So only a waiting row is decided. On any other row this answers instead:
 *   · the same decision again → a REPEAT: 200, nothing written, nobody told —
 *     the house answer for a retried act ("Already signed", "Already accepted");
 *   · the opposite decision → a CONFLICT: 409, nothing written. A decided row
 *     is changed by its own flow (the PR applies again, or asks to leave), never
 *     by re-answering a request that is no longer on the page.
 *
 * Pure, so every case is unit-tested rather than probed with a write.
 */

export type JoinDecision = 'approved' | 'rejected';

/**
 * The note a refused departure leaves on the row, which stays `approved`.
 * Written by the departure branch and read here, so the two cannot drift; the
 * web keeps its own copy (`LEAVE_REJECTED_PREFIX`) to draw the history chip.
 */
export const LEAVE_REJECTED_PREFIX = '[Leave rejected] ';

export type SettledAnswer = { status: 200 | 409; message: string };

const NOTHING_CHANGED = 'Nothing changed.';

/** Which request a waiting row carries: `pending` is a join, `leave_pending` a departure. */
export type DecidedRequest = 'join' | 'departure';

/**
 * WHAT A REAL DECISION SAYS IT DID (29 Sep 2026 follow-up: "a real join/leave
 * decision still answers 'OK'").
 *
 * The owner's rule is that every action confirms in the server's own words,
 * and the Approvals page prints this sentence as its confirmation. A join
 * answered a bare "OK" and a departure "Departure approved" / "Departure
 * rejected", so putting somebody on the roster read "OK". One sentence per
 * outcome now, in the shape of `member-change-message.ts` and of the repeats
 * below: what was decided, then what it means for the roster.
 *
 * The web translates these by pattern (`pr-decision-copy.ts`), so a wording
 * change here is a wording change there — its test carries this exact list.
 */
export function decidedMessage(request: DecidedRequest, decision: JoinDecision): string {
  if (request === 'departure') {
    return decision === 'approved'
      ? 'Departure approved — they are no longer on your roster.'
      : 'Departure declined — they stay on your roster, and your reason was sent to them.';
  }
  return decision === 'approved'
    ? 'Request approved — they are on your roster now.'
    : 'Request declined — they were not added to your roster.';
}

/**
 * Null while the row is still waiting for this decision — `pending` for a join,
 * `leave_pending` for a departure (whose branch runs first). Otherwise the
 * answer to give without writing anything.
 */
export function settledDecisionAnswer(
  current: { approveStatus: AgencyPrApproveStatus; rejectReason: string | null },
  decision: JoinDecision,
): SettledAnswer | null {
  switch (current.approveStatus) {
    case 'pending':
    case 'leave_pending':
      return null;
    case 'approved': {
      if (decision === 'approved') {
        return { status: 200, message: `Already approved — they are on your roster. ${NOTHING_CHANGED}` };
      }
      // A refused departure leaves the row approved with this note, so a second
      // "decline" on that departure is the same act again, not a new one.
      if (current.rejectReason?.startsWith(LEAVE_REJECTED_PREFIX)) {
        return {
          status: 200,
          message: `Their departure was already declined — they stay on your roster. ${NOTHING_CHANGED}`,
        };
      }
      return {
        status: 409,
        message: `This request was already approved and they are on your roster, so it can no longer be declined. ${NOTHING_CHANGED}`,
      };
    }
    case 'rejected':
      return decision === 'rejected'
        ? { status: 200, message: `Already declined. ${NOTHING_CHANGED}` }
        : {
            status: 409,
            message: `This request was already declined, so it can no longer be approved — they can apply again, and the new request will appear here. ${NOTHING_CHANGED}`,
          };
    case 'left':
      return decision === 'approved'
        ? {
            status: 200,
            message: `Their departure was already approved — they are no longer on your roster. ${NOTHING_CHANGED}`,
          }
        : {
            status: 409,
            message: `Their departure was already approved, so it can no longer be declined. ${NOTHING_CHANGED}`,
          };
  }
}
