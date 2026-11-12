import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE POS ADD-ON RE-QUOTE IS ONE TRANSACTION (12 Nov 2026).
 *
 * It listed `status = 'active'` add-on lines, expired them one round trip at a
 * time, then created the new line — so a `past_due` line (still LIVE) survived
 * beside the new one, and an expire that failed (the repository swallows into
 * null) still let the create run. Pinned here, against fakes: the live lines are
 * read under the lane lock (`lockLiveAddonRows`, whose SQL is pinned in
 * live-lane-guard.test.ts), every write carries the transaction, a failed
 * expire rolls the whole re-quote back, and proration runs only after a commit.
 */

const h = vi.hoisted(() => ({
  TX: { __tx: true },
  live: [] as Array<Record<string, unknown>>,
  committed: false,
}));

vi.mock('@/db/index.js', () => ({
  db: {
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const out = await cb(h.TX);
      h.committed = true;
      return out;
    },
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/subscription/plan-limit.js', () => ({
  subscriberOrgExists: vi.fn(async () => true),
  lockLivePlanRows: vi.fn(async () => []),
}));
vi.mock('@/features/member-subscription/live-lane-guard.js', () => ({
  lockLiveAddonRows: vi.fn(async () => h.live),
}));

import type { AdminRequest } from './admin-request.model';
import { AdminRequestLedger } from './admin-request-ledger';
import { lockLiveAddonRows } from '@/features/member-subscription/live-lane-guard.js';
import { logger } from '@/util/logger.js';

const OUTLET = '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10';
const POS = { id: 'addon-pos', name: 'POS Integration', billingCycle: 'monthly', kind: 'addon' };

const request = (over: Partial<AdminRequest> = {}) =>
  ({
    id: 'req-1',
    type: 'pos_integration_quote',
    subscriberType: 'outlet',
    subscriberId: OUTLET,
    subscriberName: 'Velvet 23',
    requestedPlanId: null,
    quotedAmount: '450.00',
    ...over,
  }) as AdminRequest;

function setup() {
  const memberSubscriptionRepository = {
    listPaginated: vi.fn(async () => ({ records: [], totalCount: 0 })),
    update: vi.fn(async (id: string) => ({ id })),
    create: vi.fn(async () => ({ id: 'new-pos-line' })),
  };
  const subscriptionRepository = {
    getSubscriptionById: vi.fn(async () => null as unknown),
    findAddonByName: vi.fn(async () => POS),
  };
  const subscriptionInvoiceRepository = { prorateLaneSwitch: vi.fn(async () => 'none') };
  const ledger = new AdminRequestLedger(
    {} as never,
    memberSubscriptionRepository as never,
    subscriptionRepository as never,
    subscriptionInvoiceRepository as never,
  );
  return { ledger, memberSubscriptionRepository, subscriptionRepository, subscriptionInvoiceRepository };
}

beforeEach(() => {
  h.live = [];
  h.committed = false;
  vi.mocked(lockLiveAddonRows).mockClear();
  vi.mocked(logger.error).mockClear();
});

describe('POS re-quote — expire and create in one transaction', () => {
  it('expires EVERY live line — past_due included — and opens the new one, all on the transaction', async () => {
    h.live = [
      { id: 'pos-active', subscriptionId: POS.id, planName: POS.name, amount: '300.00', status: 'active' },
      { id: 'pos-past-due', subscriptionId: POS.id, planName: POS.name, amount: '300.00', status: 'past_due' },
    ];
    const t = setup();
    await t.ledger.applyResolvedPriceToLedger(request(), 'admin-1');

    expect(lockLiveAddonRows).toHaveBeenCalledWith(h.TX, { subscriberType: 'outlet', subscriberId: OUTLET });
    expect(t.memberSubscriptionRepository.update).toHaveBeenCalledTimes(2);
    for (const id of ['pos-active', 'pos-past-due']) {
      expect(t.memberSubscriptionRepository.update).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ status: 'expired', endedAt: expect.any(Date) }),
        h.TX,
      );
    }
    expect(t.memberSubscriptionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: POS.id, amount: '450.00', status: 'active' }),
      h.TX,
    );
    // The old paginated 'active'-only read is not what decides any more.
    expect(t.memberSubscriptionRepository.listPaginated).not.toHaveBeenCalled();
    // Priced against the line it replaced, after the commit.
    expect(t.subscriptionInvoiceRepository.prorateLaneSwitch).toHaveBeenCalledWith(
      expect.objectContaining({ newMemberSubscriptionId: 'new-pos-line', fromAmount: '300.00', toAmount: '450.00' }),
    );
  });

  it('a FAILED expire rolls the re-quote back — no second live line, no proration, logged not thrown', async () => {
    h.live = [{ id: 'pos-active', subscriptionId: POS.id, planName: POS.name, amount: '300.00', status: 'active' }];
    const t = setup();
    t.memberSubscriptionRepository.update.mockResolvedValueOnce(null as never);

    await expect(t.ledger.applyResolvedPriceToLedger(request(), 'admin-1')).resolves.toBeUndefined();

    expect(t.memberSubscriptionRepository.create).not.toHaveBeenCalled();
    expect(t.subscriptionInvoiceRepository.prorateLaneSwitch).not.toHaveBeenCalled();
    expect(h.committed).toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });

  it('a failed create is a rollback too, and nothing is prorated', async () => {
    h.live = [{ id: 'pos-active', subscriptionId: POS.id, planName: POS.name, amount: '300.00', status: 'active' }];
    const t = setup();
    t.memberSubscriptionRepository.create.mockResolvedValueOnce(null as never);

    await t.ledger.applyResolvedPriceToLedger(request(), 'admin-1');

    expect(h.committed).toBe(false);
    expect(t.subscriptionInvoiceRepository.prorateLaneSwitch).not.toHaveBeenCalled();
  });

  it('a first-time add-on (nothing live) opens one line and prorates nothing', async () => {
    const t = setup();
    await t.ledger.applyResolvedPriceToLedger(request(), 'admin-1');

    expect(t.memberSubscriptionRepository.update).not.toHaveBeenCalled();
    expect(t.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
    expect(t.subscriptionInvoiceRepository.prorateLaneSwitch).not.toHaveBeenCalled();
  });
});

describe('POS "switch back to plan-only" — the same lock and the same live definition', () => {
  it('cancels every live add-on line on the transaction, past_due included', async () => {
    h.live = [
      { id: 'pos-active', status: 'active' },
      { id: 'pos-past-due', status: 'past_due' },
    ];
    const t = setup();
    t.subscriptionRepository.getSubscriptionById.mockResolvedValueOnce({ id: 'plan-pro', kind: 'plan' });

    await t.ledger.applyResolvedPriceToLedger(request({ requestedPlanId: 'plan-pro' }), 'admin-1');

    expect(t.memberSubscriptionRepository.update).toHaveBeenCalledTimes(2);
    expect(t.memberSubscriptionRepository.update).toHaveBeenCalledWith(
      'pos-past-due',
      expect.objectContaining({ status: 'cancelled', adminRequestId: 'req-1' }),
      h.TX,
    );
    expect(t.memberSubscriptionRepository.create).not.toHaveBeenCalled();
  });

  it('a failed cancel is a rollback, not a half-ended add-on', async () => {
    h.live = [{ id: 'a', status: 'active' }, { id: 'b', status: 'active' }];
    const t = setup();
    t.subscriptionRepository.getSubscriptionById.mockResolvedValueOnce({ id: 'plan-pro', kind: 'plan' });
    t.memberSubscriptionRepository.update.mockResolvedValueOnce(null as never);

    await t.ledger.applyResolvedPriceToLedger(request({ requestedPlanId: 'plan-pro' }), 'admin-1');

    expect(t.memberSubscriptionRepository.update).toHaveBeenCalledTimes(1);
    expect(h.committed).toBe(false);
  });
});
