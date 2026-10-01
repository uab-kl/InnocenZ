import { AWAITING_ANSWER } from './admin-request.repository.js';
import type { PlanChangeRefusal } from './plan-change-rules.js';

/*
 * Pure helpers shared by the admin-request handler modules (subscriber,
 * actions). The plan-change rules themselves live in plan-change-rules.ts.
 */

/** A refusal answered with the rule's own status and sentence. */
export function refusalBody(refusal: Pick<PlanChangeRefusal, 'message'>) {
  return { success: false, message: refusal.message, data: null };
}

/** Still waiting for the admin's answer — the one test `claimAwaitingAnswer` applies. */
export function isAwaitingAnswer(status: string): boolean {
  return (AWAITING_ANSWER as readonly string[]).includes(status);
}
