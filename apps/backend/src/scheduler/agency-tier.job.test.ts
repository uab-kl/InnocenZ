import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/composition-root.js', () => ({
  adminRequestRepository: {},
  agencyMemberRepository: {},
  memberSubscriptionRepository: {},
  subscriptionInvoiceRepository: {},
  subscriptionRepository: {},
}));
vi.mock('@/features/notification/notify.js', () => ({ notifyMany: vi.fn() }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { bandFor, rowsToJudge, type TierJobRow } from './agency-tier.job';

/**
 * 28 Sep 2026 follow-up: "the tier job judges every open agency row". It read
 * every agency row with `ended_at IS NULL` — whatever its status, whatever its
 * lane, however many one agency held, whatever state the agency was in.
 */

const ATLAS = '11111111-1111-4111-8111-111111111111';
const DELTA = '22222222-2222-4222-8222-222222222222';

function row(overrides: Partial<TierJobRow> = {}): TierJobRow {
  return {
    id: 'ms-1',
    subscriberId: ATLAS,
    subscriberName: 'Atlas Agency',
    planName: 'Starter',
    subscriptionId: 'plan-starter',
    status: 'active',
    startedAt: new Date('2026-08-01T00:00:00Z'),
    kind: 'plan',
    agencyStatus: 'active',
    ...overrides,
  };
}

describe('rowsToJudge — which open rows the Sunday job may re-band', () => {
  it('keeps a live plan of an active agency', () => {
    expect(rowsToJudge([row()]).map((r) => r.id)).toEqual(['ms-1']);
  });

  it('never judges a row an admin CANCELLED without a date (the job used to revive it)', () => {
    expect(rowsToJudge([row({ status: 'cancelled' }), row({ id: 'ms-2', status: 'expired' })])).toEqual(
      [],
    );
  });

  it('still judges past_due — an agency behind on payment has not left', () => {
    expect(rowsToJudge([row({ status: 'past_due' })])).toHaveLength(1);
  });

  it('never judges an add-on as if it were the plan', () => {
    expect(rowsToJudge([row({ kind: 'addon' })])).toEqual([]);
  });

  it('a row naming no catalog plan counts as the plan (the shared plan-lane rule)', () => {
    expect(rowsToJudge([row({ kind: null, subscriptionId: null })])).toHaveLength(1);
  });

  it('ONE row per agency — the newest — however many are open', () => {
    const judged = rowsToJudge([
      row({ id: 'older', startedAt: new Date('2026-07-01T00:00:00Z') }),
      row({ id: 'newer', startedAt: new Date('2026-09-01T00:00:00Z') }),
      row({ id: 'delta', subscriberId: DELTA }),
    ]);
    expect(judged.map((r) => r.id).sort()).toEqual(['delta', 'newer']);
  });

  it('skips an agency that is not active, and a ledger row for no agency at all', () => {
    expect(
      rowsToJudge([
        row({ agencyStatus: 'suspended' }),
        row({ subscriberId: DELTA, agencyStatus: 'pending_review' }),
        row({ subscriberId: 'ghost', agencyStatus: null }),
      ]),
    ).toEqual([]);
  });
});

describe('bandFor — unchanged', () => {
  const plans = [
    { id: 'starter', name: 'Starter', limitAmount: 5 },
    { id: 'growth', name: 'Growth', limitAmount: 50 },
    { id: 'custom', name: 'Custom', limitAmount: null },
  ];

  it('picks the cheapest band that covers the count, and Custom past the card', () => {
    expect(bandFor(plans, 0)?.id).toBe('starter');
    expect(bandFor(plans, 6)?.id).toBe('growth');
    expect(bandFor(plans, 200)?.id).toBe('custom');
  });
});
