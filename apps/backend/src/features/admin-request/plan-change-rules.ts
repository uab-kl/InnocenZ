import type { SubscriberType } from '@/features/member-subscription/member-subscription.model.js';
import type { AdminRequestType } from './admin-request.model.js';

/**
 * WHETHER A PLAN SWITCH MAY TOUCH THE BILLING LEDGER AT ALL (28 Sep 2026).
 *
 * `applyPlanChangeToLedger` used to check only that the ids were non-null and
 * that the plan row existed. So approving request 000ec2b4 — which named an
 * outlet id that exists in neither the outlet nor the agency table — opened an
 * ACTIVE Premier row for nobody: `member_subscription.subscriber_id` carries no
 * foreign key (it points at one of two tables), so nothing downstream refused
 * it either. The same door accepted an agency plan for an outlet, the POS
 * add-on as if it were a plan (which closes the org's real plan and leaves it
 * holding only POS), and a plan the catalog has retired.
 *
 * Pure, so every rule is unit-tested rather than probed with a write. The
 * database reads live in `validatePlanChange` (apply-plan-change.ts), which is
 * the only thing that feeds this.
 */

export type PlanChangeRefusalCode =
  | 'no_subscriber'
  | 'no_plan'
  | 'subscriber_not_found'
  | 'plan_not_found'
  | 'plan_wrong_audience'
  | 'plan_is_addon'
  | 'plan_inactive';

export type PlanChangeRefusal = {
  code: PlanChangeRefusalCode;
  /**
   * 422 when the request itself can never be applied as filed; 409 when it
   * could have been, and the catalog moved under it.
   */
  status: 409 | 422;
  /** A whole sentence, shown to the admin (or the subscriber) as-is. */
  message: string;
};

/** The catalog columns the rule reads. */
export type PlanFacts = {
  name: string;
  subscriptionType: string;
  kind: string;
  status: string;
};

export type PlanChangeFacts<P extends PlanFacts = PlanFacts> = {
  subscriberType: SubscriberType | null;
  subscriberId: string | null;
  requestedPlanId: string | null;
  /** Is there an outlet/agency row with this id, in the table `subscriberType` names? */
  subscriberExists: boolean;
  /** The requested catalog row, or null when the id resolves to nothing. */
  plan: P | null;
};

export type PlanChangeVerdict<P extends PlanFacts = PlanFacts> =
  | { ok: false; refusal: PlanChangeRefusal }
  | { ok: true; plan: P; subscriberType: SubscriberType; subscriberId: string };

const NOTHING_CHANGED = 'Nothing was changed.';

/** The refusal for a subscriber id that names no registered organisation. */
export function subscriberNotFoundRefusal(subscriberType: SubscriberType): PlanChangeRefusal {
  return {
    code: 'subscriber_not_found',
    status: 422,
    message: `There is no registered ${subscriberType} with this id, so it cannot be put on a plan. ${NOTHING_CHANGED}`,
  };
}

/**
 * The verdict on one switch. Order matters only for WHICH sentence is shown:
 * what the request names first, then whether that organisation exists (the
 * more fundamental fault — a ghost with a wrong plan is a ghost), then the plan.
 */
export function checkPlanChange<P extends PlanFacts>(
  facts: PlanChangeFacts<P>,
): PlanChangeVerdict<P> {
  const refuse = (refusal: PlanChangeRefusal): PlanChangeVerdict<P> => ({ ok: false, refusal });
  const { subscriberType, subscriberId, plan } = facts;

  if (!subscriberType || !subscriberId) {
    return refuse({
      code: 'no_subscriber',
      status: 422,
      message: `This plan change names no organisation, so there is nothing to move onto a plan. ${NOTHING_CHANGED}`,
    });
  }
  if (!facts.requestedPlanId) {
    return refuse({
      code: 'no_plan',
      status: 422,
      message: `This plan change names no plan to switch to. ${NOTHING_CHANGED}`,
    });
  }
  if (!facts.subscriberExists) return refuse(subscriberNotFoundRefusal(subscriberType));
  if (!plan) {
    return refuse({
      code: 'plan_not_found',
      status: 422,
      message: `The plan this change asks for is not in the catalog. ${NOTHING_CHANGED}`,
    });
  }
  if (plan.subscriptionType !== subscriberType) {
    return refuse({
      code: 'plan_wrong_audience',
      status: 422,
      message: `${plan.name} is an ${plan.subscriptionType} plan and cannot be given to an ${subscriberType}. ${NOTHING_CHANGED}`,
    });
  }
  // An add-on is held BESIDE a plan. Switching "onto" one would close the org's
  // real plan and leave it holding only POS — planless, which for an outlet is
  // an outage the moment it next tries to post a shift.
  if (plan.kind !== 'plan') {
    return refuse({
      code: 'plan_is_addon',
      status: 422,
      message: `${plan.name} is an add-on, not a plan — it is held beside a plan and cannot replace one. ${NOTHING_CHANGED}`,
    });
  }
  if (plan.status !== 'active') {
    return refuse({
      code: 'plan_inactive',
      status: 409,
      message: `${plan.name} is no longer offered (status "${plan.status}"), so nobody can be moved onto it. ${NOTHING_CHANGED}`,
    });
  }
  return { ok: true, plan, subscriberType, subscriberId };
}

/**
 * A refused switch, thrown by `applyPlanChangeToLedger` so each caller can
 * answer in its own terms: the HTTP handlers reply with `status` and the
 * sentence, the Sunday tier job logs it and moves on to the next agency.
 *
 * `globalThis.Error` on purpose: the controllers import an `Error` ENUM from
 * `@/error`, which shadows the global inside those files.
 */
export class PlanChangeRefusedError extends globalThis.Error {
  readonly code: PlanChangeRefusalCode;
  readonly status: 409 | 422;

  constructor(refusal: PlanChangeRefusal) {
    super(refusal.message);
    this.name = 'PlanChangeRefusedError';
    this.code = refusal.code;
    this.status = refusal.status;
  }
}

/**
 * The request types whose ANSWER writes `member_subscription`: approving a plan
 * change, resolving a POS quote (the add-on line) or a Custom renegotiation
 * (the plan line). Only these need their subscriber to be a real organisation;
 * a contact request about a venue that has since gone bills nothing.
 */
const LEDGER_REQUEST_TYPES: ReadonlySet<AdminRequestType> = new Set([
  'plan_change',
  'pos_integration_quote',
  'custom_renegotiation',
]);

export function requestTouchesLedger(type: AdminRequestType): boolean {
  return LEDGER_REQUEST_TYPES.has(type);
}

/**
 * Thrown from inside approve's transaction when the atomic claim finds the
 * request is no longer `pending` — someone answered it between the page loading
 * and the click. Throwing rolls the switch back before it touches the ledger.
 */
export class RequestNotPendingError extends globalThis.Error {
  constructor() {
    super('The request is no longer pending.');
    this.name = 'RequestNotPendingError';
  }
}

/**
 * Why a request that is no longer `pending` cannot be approved — one sentence
 * per state, because "409 Conflict" tells an admin nothing about what to do.
 */
export function notPendingMessage(status: string): string {
  switch (status) {
    case 'approved':
      return `This plan change was already approved — approving it again would apply it to billing twice. ${NOTHING_CHANGED}`;
    case 'declined':
      return `This plan change was declined, so it can no longer be approved. ${NOTHING_CHANGED}`;
    case 'withdrawn':
      return `The subscriber withdrew this plan change, so there is nothing left to approve. ${NOTHING_CHANGED}`;
    case 'direct':
      return `This switch was applied when it was filed — there is nothing to approve. ${NOTHING_CHANGED}`;
    default:
      return `This plan change is ${status}, not pending, so it cannot be approved. ${NOTHING_CHANGED}`;
  }
}
