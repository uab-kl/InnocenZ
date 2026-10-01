import { describe, expect, it } from 'vitest';
import {
  PlanChangeRefusedError,
  checkPlanChange,
  notPendingMessage,
  requestTouchesLedger,
  subscriberNotFoundRefusal,
} from './plan-change-rules.js';

/**
 * The rule every ledger switch now passes through (`applyPlanChangeToLedger`),
 * tested at the decision rather than by firing `/approve`: approving writes a
 * billing row, and this project does not probe a write gate with a write.
 *
 * The case that started it: request 000ec2b4 named an outlet id that exists in
 * neither table, and approving it opened an ACTIVE Premier row for nobody.
 */

const OUTLET_ID = '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10';
const AGENCY_ID = '9e2a7c44-1d0b-4f6e-8a21-3c5d7e9f0b12';

const premier = { name: 'Premier', subscriptionType: 'outlet', kind: 'plan', status: 'active' };
const growth = { name: 'Growth', subscriptionType: 'agency', kind: 'plan', status: 'active' };
const pos = { name: 'POS Integration', subscriptionType: 'outlet', kind: 'addon', status: 'active' };

const outletSwitch = {
  subscriberType: 'outlet' as const,
  subscriberId: OUTLET_ID,
  requestedPlanId: 'plan-premier',
  subscriberExists: true,
  plan: premier,
};

function refusalOf(facts: Parameters<typeof checkPlanChange>[0]) {
  const verdict = checkPlanChange(facts);
  if (verdict.ok) throw new Error('expected a refusal, got ok');
  return verdict.refusal;
}

describe('checkPlanChange — what may reach the ledger', () => {
  it('accepts a real outlet moving onto an active outlet plan', () => {
    const verdict = checkPlanChange(outletSwitch);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.plan).toBe(premier);
      expect(verdict.subscriberType).toBe('outlet');
      expect(verdict.subscriberId).toBe(OUTLET_ID);
    }
  });

  it('accepts an agency moving onto an active agency plan', () => {
    const verdict = checkPlanChange({
      ...outletSwitch,
      subscriberType: 'agency',
      subscriberId: AGENCY_ID,
      plan: growth,
    });
    expect(verdict.ok).toBe(true);
  });

  it('refuses an organisation that does not exist — the 000ec2b4 ghost', () => {
    const refusal = refusalOf({ ...outletSwitch, subscriberExists: false });
    expect(refusal.code).toBe('subscriber_not_found');
    expect(refusal.status).toBe(422);
    expect(refusal.message).toMatch(/no registered outlet/i);
    expect(refusal.message).toMatch(/nothing was changed/i);
  });

  it('names the ghost before any plan problem — it is the more fundamental fault', () => {
    const refusal = refusalOf({ ...outletSwitch, subscriberExists: false, plan: pos });
    expect(refusal.code).toBe('subscriber_not_found');
  });

  it('refuses a request that names no organisation', () => {
    expect(refusalOf({ ...outletSwitch, subscriberId: null }).code).toBe('no_subscriber');
    expect(refusalOf({ ...outletSwitch, subscriberType: null }).code).toBe('no_subscriber');
    expect(refusalOf({ ...outletSwitch, subscriberId: null }).status).toBe(422);
  });

  it('refuses a request that names no plan', () => {
    const refusal = refusalOf({ ...outletSwitch, requestedPlanId: null, plan: null });
    expect(refusal.code).toBe('no_plan');
    expect(refusal.status).toBe(422);
  });

  it('refuses a plan id the catalog does not hold', () => {
    const refusal = refusalOf({ ...outletSwitch, plan: null });
    expect(refusal.code).toBe('plan_not_found');
    expect(refusal.status).toBe(422);
  });

  it("refuses an agency plan for an outlet, and an outlet plan for an agency", () => {
    const outletOnAgencyPlan = refusalOf({ ...outletSwitch, plan: growth });
    expect(outletOnAgencyPlan.code).toBe('plan_wrong_audience');
    expect(outletOnAgencyPlan.status).toBe(422);
    expect(outletOnAgencyPlan.message).toMatch(/Growth is an agency plan/);

    const agencyOnOutletPlan = refusalOf({
      ...outletSwitch,
      subscriberType: 'agency',
      subscriberId: AGENCY_ID,
      plan: premier,
    });
    expect(agencyOnOutletPlan.code).toBe('plan_wrong_audience');
  });

  it('refuses an add-on as a plan — it would close the real plan and leave only POS', () => {
    const refusal = refusalOf({ ...outletSwitch, plan: pos });
    expect(refusal.code).toBe('plan_is_addon');
    expect(refusal.status).toBe(422);
    expect(refusal.message).toMatch(/add-on/);
  });

  it('refuses a plan the catalog no longer offers, as a conflict (409)', () => {
    const refusal = refusalOf({ ...outletSwitch, plan: { ...premier, status: 'inactive' } });
    expect(refusal.code).toBe('plan_inactive');
    expect(refusal.status).toBe(409);
    expect(refusal.message).toMatch(/no longer offered/);
  });
});

describe('subscriberNotFoundRefusal', () => {
  it('names the kind of organisation it looked for', () => {
    expect(subscriberNotFoundRefusal('agency').message).toMatch(/no registered agency/i);
    expect(subscriberNotFoundRefusal('outlet').message).toMatch(/no registered outlet/i);
    expect(subscriberNotFoundRefusal('outlet').status).toBe(422);
  });
});

describe('PlanChangeRefusedError', () => {
  it('carries the refusal so an HTTP caller can answer with its own status and sentence', () => {
    const refusal = refusalOf({ ...outletSwitch, subscriberExists: false });
    const error = new PlanChangeRefusedError(refusal);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(PlanChangeRefusedError);
    expect(error.code).toBe('subscriber_not_found');
    expect(error.status).toBe(422);
    expect(error.message).toBe(refusal.message);
  });
});

describe('notPendingMessage — why an answered request cannot be approved again', () => {
  it('says an approved request would bill twice', () => {
    expect(notPendingMessage('approved')).toMatch(/already approved/i);
    expect(notPendingMessage('approved')).toMatch(/twice/i);
  });

  it('gives each other state its own reason', () => {
    expect(notPendingMessage('declined')).toMatch(/declined/i);
    expect(notPendingMessage('withdrawn')).toMatch(/withdrew/i);
    expect(notPendingMessage('direct')).toMatch(/applied when it was filed/i);
    // Any other state names itself. (`contacted` no longer reaches this: it is
    // still awaiting an answer and approves — see admin-request-answer-guard.)
    expect(notPendingMessage('resolved')).toMatch(/resolved, not awaiting an answer/i);
  });

  it('always says that nothing was changed', () => {
    for (const status of ['approved', 'declined', 'withdrawn', 'direct', 'resolved', 'contacted']) {
      expect(notPendingMessage(status)).toMatch(/nothing was changed/i);
    }
  });
});

describe('requestTouchesLedger', () => {
  it('is true for the three request types whose answer writes a billing row', () => {
    expect(requestTouchesLedger('plan_change')).toBe(true);
    expect(requestTouchesLedger('pos_integration_quote')).toBe(true);
    expect(requestTouchesLedger('custom_renegotiation')).toBe(true);
  });

  it('is false for a contact or other request, which bills nothing', () => {
    expect(requestTouchesLedger('contact')).toBe(false);
    expect(requestTouchesLedger('other')).toBe(false);
  });
});
