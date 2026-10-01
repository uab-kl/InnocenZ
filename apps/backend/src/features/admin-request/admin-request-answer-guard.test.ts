import { beforeEach, describe, expect, it, vi } from 'vitest';

// `transaction` only hands its callback a token: approve's claim and the plan
// switch run through the fakes below, never a real connection.
vi.mock('@/db/index.js', () => ({
  db: { transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ __tx: true }) },
}));
vi.mock('@/db/index', () => ({
  db: { transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb({ __tx: true }) },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
// Every organisation in these tests exists — the ghost rule has its own tests.
vi.mock('@/features/subscription/plan-limit.js', () => ({
  subscriberOrgExists: vi.fn(async () => true),
  lockLivePlanRows: vi.fn(async () => []),
}));

import type { Request, Response } from 'express';
import type { AdminRequest } from './admin-request.model';
import { AdminRequestControllerClass } from './admin-request.controller';

/**
 * 28 Sep 2026 follow-up: "admin-request `resolve` has no status guard —
 * re-resolving a POS/Custom request applies it again".
 *
 * Every resolve of a POS quote closes the venue's add-on and opens a new one at
 * the agreed price; a Custom resolve switches the plan. So a second resolve —
 * a double-click, a stale screen, or a request re-opened with "Mark contacted"
 * — billed the answer twice, and a WITHDRAWN request could be resolved into
 * billing the subscriber had called off. Driven against fakes: this project
 * does not probe a write gate with a write.
 */

const REQUEST_ID = '7a1b2c3d-4e5f-4a60-8b71-c2d3e4f5a6b7';
const OUTLET_ID = '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10';
const POS_ADDON = { id: 'addon-pos', name: 'POS Integration', billingCycle: 'monthly', kind: 'addon' };

function request(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    id: REQUEST_ID,
    type: 'pos_integration_quote',
    subscriberType: 'outlet',
    subscriberId: OUTLET_ID,
    subscriberName: 'Velvet 23',
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    currentPlanId: null,
    requestedPlanId: null,
    message: null,
    remarks: null,
    status: 'pending',
    quotedAmount: null,
    contactedAt: null,
    contactedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'owner',
    updatedBy: 'owner',
    ...overrides,
  } as AdminRequest;
}

function setup(start: AdminRequest) {
  // ONE stored row, whose status the fake claim reads and moves — the same
  // test `UPDATE … WHERE status IN ('pending','contacted')` applies.
  const stored = { row: { ...start } };
  const repository = {
    getById: vi.fn(async () => ({ ...stored.row })),
    claimAwaitingAnswer: vi.fn(async (_id: string, data: Partial<AdminRequest>) => {
      if (stored.row.status !== 'pending' && stored.row.status !== 'contacted') return null;
      stored.row = { ...stored.row, ...data } as AdminRequest;
      return { ...stored.row };
    }),
    update: vi.fn(async (_id: string, data: Partial<AdminRequest>) => {
      stored.row = { ...stored.row, ...data } as AdminRequest;
      return { ...stored.row };
    }),
  };
  const memberSubscriptionRepository = {
    listPaginated: vi.fn(async () => ({ records: [], totalCount: 0 })),
    update: vi.fn(async () => ({})),
    create: vi.fn(async () => ({ id: 'new-addon-line' })),
  };
  const subscriptionRepository = {
    getSubscriptionById: vi.fn(async () => null),
    findAddonByName: vi.fn(async () => POS_ADDON),
  };
  const controller = new AdminRequestControllerClass(
    repository as never,
    memberSubscriptionRepository as never,
    subscriptionRepository as never,
    { prorateLaneSwitch: vi.fn(async () => 'none') } as never,
    {} as never,
  );
  return { controller, repository, memberSubscriptionRepository, subscriptionRepository, stored };
}

type FakeRes = Response & { statusCode: number; body: { success: boolean; message: string } };

function fakeRes(): FakeRes {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as FakeRes;
}

function req(body: unknown = {}): Request {
  return { params: { id: REQUEST_ID }, body, user: { id: 'admin-1' } } as unknown as Request;
}

async function call(
  ctx: ReturnType<typeof setup>,
  method: 'resolve' | 'markContacted' | 'decline' | 'approve',
  body: unknown = {},
) {
  const res = fakeRes();
  await ctx.controller[method](req(body), res);
  return res;
}

describe('resolve — only a request still awaiting an answer, claimed atomically', () => {
  it('resolves a pending POS quote once, and opens its add-on line once', async () => {
    const ctx = setup(request());

    const res = await call(ctx, 'resolve', { quotedAmount: 450 });

    expect(res.statusCode).toBe(200);
    expect(ctx.stored.row.status).toBe('resolved');
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('a SECOND resolve is refused — the price is never applied to billing twice', async () => {
    const ctx = setup(request());

    await call(ctx, 'resolve', { quotedAmount: 450 });
    const again = await call(ctx, 'resolve', { quotedAmount: 450 });

    expect(again.statusCode).toBe(409);
    expect(again.body.message).toMatch(/already resolved/);
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('a double-click that passed the early check still loses the claim', async () => {
    const ctx = setup(request());
    // Both clicks read `pending` before either wrote.
    ctx.repository.getById.mockResolvedValueOnce(request()).mockResolvedValueOnce(request());

    const [first, second] = await Promise.all([
      call(ctx, 'resolve', { quotedAmount: 450 }),
      call(ctx, 'resolve', { quotedAmount: 450 }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it.each(['resolved', 'declined', 'withdrawn', 'approved', 'direct'] as const)(
    'a %s request cannot be resolved into billing',
    async (status) => {
      const ctx = setup(request({ status }));

      const res = await call(ctx, 'resolve', { quotedAmount: 450 });

      expect(res.statusCode).toBe(409);
      expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
      expect(ctx.memberSubscriptionRepository.create).not.toHaveBeenCalled();
      expect(ctx.stored.row.status).toBe(status);
    },
  );

  it('a CONTACTED request is still open, and resolves', async () => {
    const ctx = setup(request({ status: 'contacted' }));
    expect((await call(ctx, 'resolve', { quotedAmount: 450 })).statusCode).toBe(200);
  });
});

describe('mark contacted / decline — never re-open or rewrite an answer', () => {
  it('Mark contacted on a RESOLVED request is refused (it used to re-open it for a second resolve)', async () => {
    const ctx = setup(request({ status: 'resolved' }));

    const res = await call(ctx, 'markContacted');

    expect(res.statusCode).toBe(409);
    expect(ctx.stored.row.status).toBe('resolved');
  });

  it('Mark contacted on a pending request still works', async () => {
    const ctx = setup(request());
    const res = await call(ctx, 'markContacted');
    expect(res.statusCode).toBe(200);
    expect(ctx.stored.row.status).toBe('contacted');
  });

  it('a WITHDRAWN request is not the admin’s to decline', async () => {
    const ctx = setup(request({ status: 'withdrawn' }));

    const res = await call(ctx, 'decline');

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/withdrew/);
    expect(ctx.stored.row.status).toBe('withdrawn');
  });

  it('a pending request still declines', async () => {
    const ctx = setup(request());
    expect((await call(ctx, 'decline')).statusCode).toBe(200);
    expect(ctx.stored.row.status).toBe('declined');
  });
});

/**
 * 29 Sep 2026 follow-up: "an outlet plan change marked contacted can never be
 * approved". `contacted` decides nothing — resolve, decline and withdraw all
 * accept it — but approve claimed `pending` alone, so the Plan Change page's
 * Approve (which reads a contacted row as pending) was refused every time.
 */
describe('approve — a plan change still awaiting an answer, claimed once', () => {
  const PREMIER = {
    id: 'plan-premier',
    name: 'Premier',
    subscriptionType: 'outlet',
    kind: 'plan',
    status: 'active',
    price: '299.00',
    billingCycle: 'monthly',
  };
  const planChange = (status: AdminRequest['status']) =>
    request({ type: 'plan_change', status, requestedPlanId: PREMIER.id, currentPlanId: 'plan-plus' });
  const setupSwitch = (status: AdminRequest['status']) => {
    const ctx = setup(planChange(status));
    // The catalog row the switch moves the venue onto, and the ledger row it opens.
    ctx.subscriptionRepository.getSubscriptionById.mockResolvedValue(PREMIER as never);
    ctx.memberSubscriptionRepository.create.mockResolvedValue({ id: 'new-plan-row', planName: 'Premier' } as never);
    return ctx;
  };

  it('a CONTACTED plan change approves, and the switch is applied once', async () => {
    const ctx = setupSwitch('contacted');

    const res = await call(ctx, 'approve', { quotedAmount: 299 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/is now on Premier/);
    expect(ctx.stored.row.status).toBe('approved');
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('a pending plan change still approves', async () => {
    const ctx = setupSwitch('pending');
    expect((await call(ctx, 'approve', { quotedAmount: 299 })).statusCode).toBe(200);
    expect(ctx.stored.row.status).toBe('approved');
  });

  it('a SECOND approve is refused — the switch never reaches billing twice', async () => {
    const ctx = setupSwitch('contacted');

    await call(ctx, 'approve', { quotedAmount: 299 });
    const again = await call(ctx, 'approve', { quotedAmount: 299 });

    expect(again.statusCode).toBe(409);
    expect(again.body.message).toMatch(/already approved/);
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('a double-click on a contacted request applies it once', async () => {
    const ctx = setupSwitch('contacted');
    // Both clicks read `contacted` before either claimed.
    ctx.repository.getById
      .mockResolvedValueOnce(planChange('contacted'))
      .mockResolvedValueOnce(planChange('contacted'));

    const [first, second] = await Promise.all([
      call(ctx, 'approve', { quotedAmount: 299 }),
      call(ctx, 'approve', { quotedAmount: 299 }),
    ]);

    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 409]);
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it.each(['approved', 'declined', 'withdrawn', 'direct', 'resolved'] as const)(
    'a %s plan change cannot be approved',
    async (status) => {
      const ctx = setupSwitch(status);

      const res = await call(ctx, 'approve', { quotedAmount: 299 });

      expect(res.statusCode).toBe(409);
      expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
      expect(ctx.memberSubscriptionRepository.create).not.toHaveBeenCalled();
      expect(ctx.stored.row.status).toBe(status);
    },
  );
});

/**
 * 29 Sep 2026 follow-up: "custom-destination plan_change requests may never
 * reach billing". A plain plan change onto Custom is listed on Plan REQUEST
 * (the inboxes split on destination), whose only "yes" is Resolve — and resolve
 * claimed it `resolved` and moved nothing. It now takes approve's own path.
 */
describe('resolve on a plan change — approve’s path, one path', () => {
  const AGENCY_ID = '9e2a7c44-1d0b-4f6e-8a21-3c5d7e9f0b12';
  const CUSTOM = {
    id: 'plan-custom',
    name: 'Custom',
    subscriptionType: 'agency',
    kind: 'plan',
    status: 'active',
    price: '0.00',
    billingCycle: 'weekly',
  };
  const toCustom = (status: AdminRequest['status'] = 'pending') =>
    request({
      type: 'plan_change',
      status,
      subscriberType: 'agency',
      subscriberId: AGENCY_ID,
      subscriberName: 'Atlas Agency',
      requestedPlanId: CUSTOM.id,
      currentPlanId: 'plan-scale',
    });
  const setupCustom = (status: AdminRequest['status'] = 'pending') => {
    const ctx = setup(toCustom(status));
    ctx.subscriptionRepository.getSubscriptionById.mockResolvedValue(CUSTOM as never);
    ctx.memberSubscriptionRepository.create.mockResolvedValue({
      id: 'new-custom-row',
      planName: 'Custom',
    } as never);
    return ctx;
  };

  it('Resolve APPLIES the switch to billing and answers as approve does — never "Request resolved"', async () => {
    const ctx = setupCustom();

    const res = await call(ctx, 'resolve', { quotedAmount: 1800 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Plan change approved — Atlas Agency is now on Custom.');
    expect(ctx.stored.row.status).toBe('approved');
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
    // (data, tx) — opened inside the switch's own transaction.
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriberType: 'agency',
        subscriberId: AGENCY_ID,
        subscriptionId: 'plan-custom',
        planName: 'Custom',
        amount: '1800.00',
        status: 'active',
      }),
      expect.anything(),
    );
  });

  it('Resolve and Approve give the same answer for the same request', async () => {
    const byResolve = setupCustom();
    const byApprove = setupCustom();

    const resolved = await call(byResolve, 'resolve', { quotedAmount: 1800 });
    const approved = await call(byApprove, 'approve', { quotedAmount: 1800 });

    const answer = (res: FakeRes) => ({
      status: res.statusCode,
      success: res.body.success,
      message: res.body.message,
      requestStatus: (res.body as unknown as { data: { status: string } }).data.status,
    });
    expect(answer(resolved)).toEqual(answer(approved));
    // The same row opened by both doors. `startedAt` is the switch's own
    // `new Date()`, so two runs differ by a millisecond or so — it is checked
    // to BE an instant, and everything else is compared exactly.
    const opened = (ctx: ReturnType<typeof setupCustom>) =>
      (ctx.memberSubscriptionRepository.create.mock.calls as unknown as [Record<string, unknown>, unknown][]).map(
        ([data, tx]) => {
          expect(data.startedAt).toBeInstanceOf(Date);
          return { data: { ...data, startedAt: 'the switch instant' }, tx };
        },
      );
    expect(opened(byResolve)).toHaveLength(1);
    expect(opened(byResolve)).toEqual(opened(byApprove));
  });

  it('a second Resolve (or an Approve after it) is refused — the switch reaches billing once', async () => {
    const ctx = setupCustom();

    await call(ctx, 'resolve', { quotedAmount: 1800 });
    const again = await call(ctx, 'resolve', { quotedAmount: 1800 });
    const approveAfter = await call(ctx, 'approve', { quotedAmount: 1800 });

    expect(again.statusCode).toBe(409);
    expect(again.body.message).toMatch(/already approved/);
    expect(approveAfter.statusCode).toBe(409);
    expect(ctx.memberSubscriptionRepository.create).toHaveBeenCalledTimes(1);
  });

  it('a CONTACTED plan change resolves the same way', async () => {
    const ctx = setupCustom('contacted');
    expect((await call(ctx, 'resolve', { quotedAmount: 1800 })).statusCode).toBe(200);
    expect(ctx.stored.row.status).toBe('approved');
  });

  it('a switch the ledger refuses leaves the request OPEN and says why', async () => {
    const ctx = setupCustom();
    // A plan change onto an add-on: the rule refuses it before anything is written.
    ctx.subscriptionRepository.getSubscriptionById.mockResolvedValue({
      ...POS_ADDON,
      subscriptionType: 'agency',
      status: 'active',
      price: '0.00',
    } as never);

    const res = await call(ctx, 'resolve', {});

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toMatch(/add-on/);
    expect(ctx.stored.row.status).toBe('pending');
    expect(ctx.repository.claimAwaitingAnswer).not.toHaveBeenCalled();
    expect(ctx.memberSubscriptionRepository.create).not.toHaveBeenCalled();
  });

  it('an answered plan change cannot be resolved into billing either', async () => {
    const ctx = setupCustom('declined');

    const res = await call(ctx, 'resolve', { quotedAmount: 1800 });

    expect(res.statusCode).toBe(409);
    expect(ctx.memberSubscriptionRepository.create).not.toHaveBeenCalled();
    expect(ctx.stored.row.status).toBe('declined');
  });
});
