import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OPENING A LIVE ROW BY HAND (12 Nov 2026).
 *
 * `POST /member-subscription` was a plain insert and `PUT …/:id` with
 * `endedAt: null` a plain update: either could put a second live plan beside
 * the one a switch maintains (the posting limit then reads either), a second
 * line of one add-on, or a live row for an organisation that exists nowhere.
 * Driven against fakes — admin-only money writes are not probed with a write.
 */

const h = vi.hoisted(() => ({
  TX: { __tx: true },
  lane: 'plan' as 'plan' | 'addon' | 'missing',
  live: [] as Array<{ id: string; planName: string }>,
  exists: true,
  reopen: null as null | { target: Record<string, unknown>; facts: Record<string, unknown> },
  order: [] as string[],
}));

vi.mock('@/db/index.js', () => ({
  db: { transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(h.TX) },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/subscription/plan-limit.js', () => ({
  takePlanLane: vi.fn(async () => {
    h.order.push('lane-lock');
  }),
  subscriberOrgExists: vi.fn(async () => {
    h.order.push('org-exists');
    return h.exists;
  }),
  lockLivePlanRows: vi.fn(async () => h.live),
  readCloseLaneFacts: vi.fn(),
}));
// The DB reads are faked; `openLaneRefusal` — the decision — is the real one.
vi.mock('./live-lane-guard.js', async (importOriginal) => ({
  ...((await importOriginal()) as object),
  catalogLaneKind: vi.fn(async () => {
    h.order.push('catalog');
    return h.lane;
  }),
  lockLiveLaneRows: vi.fn(async () => {
    h.order.push('live-rows');
    return h.live;
  }),
  readReopenFacts: vi.fn(async () => h.reopen),
}));

import { PgDialect } from 'drizzle-orm/pg-core';
import { MemberSubscriptionControllerClass } from './member-subscription.controller';
import { lockLiveAddonRows, openLaneRefusal } from './live-lane-guard';

const OUTLET = '5b1f0d8e-7c1a-4a55-9d33-0a6f3c2e9b10';
const ROW_ID = '7a1b2c3d-4e5f-4a60-8b71-c2d3e4f5a6b7';

function fakeRes() {
  const res = {
    statusCode: 0,
    body: null as unknown as { success: boolean; message: string; data: unknown },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: { success: boolean; message: string; data: unknown }) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as Response & typeof res;
}

function setup() {
  const repository = {
    create: vi.fn(async (data: Record<string, unknown>) => ({ id: 'new-row', ...data })),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => ({ id, ...data })),
    closeUnlessLastPlan: vi.fn(),
  };
  const controller = new MemberSubscriptionControllerClass(repository as never, {} as never);
  return { controller, repository };
}

const body = (over: Record<string, unknown> = {}) => ({
  subscriberType: 'outlet',
  subscriberId: OUTLET,
  subscriberName: 'Velvet 23',
  subscriptionId: '9e2a7c44-1d0b-4f6e-8a21-3c5d7e9f0b12',
  planName: 'Pro',
  amount: 299,
  ...over,
});
const post = (b: unknown) => ({ body: b, user: { id: 'admin-1' } }) as unknown as Request;
const put = (b: unknown) => ({ params: { id: ROW_ID }, body: b, user: { id: 'admin-1' } }) as unknown as Request;

beforeEach(() => {
  h.lane = 'plan';
  h.live = [];
  h.exists = true;
  h.reopen = null;
  h.order = [];
});

describe('openLaneRefusal — the rule', () => {
  const facts = (over: Record<string, unknown> = {}) => ({
    lane: 'plan' as const,
    subscriberType: 'outlet' as const,
    subscriberExists: true,
    otherLiveRows: [] as Array<{ planName: string }>,
    ...over,
  });

  it('nothing live on the lane, a real org: allowed', () => {
    expect(openLaneRefusal(facts(), true)).toBeNull();
  });

  it('a second live PLAN is a 409 that names the plan held and the way out', () => {
    const refusal = openLaneRefusal(facts({ otherLiveRows: [{ planName: 'Plus' }] }), true);
    expect(refusal?.status).toBe(409);
    expect(refusal?.message).toMatch(/already on Plus/);
    expect(refusal?.message).toMatch(/plan change/);
  });

  it('a second live line of the same ADD-ON is a 409 too', () => {
    const refusal = openLaneRefusal(
      facts({ lane: 'addon', otherLiveRows: [{ planName: 'POS Integration' }] }),
      true,
    );
    expect(refusal?.status).toBe(409);
    expect(refusal?.message).toMatch(/POS Integration add-on/);
  });

  it('an organisation that does not exist is a 400 — even for a dead history row', () => {
    expect(openLaneRefusal(facts({ subscriberExists: false }), true)?.status).toBe(400);
    expect(openLaneRefusal(facts({ subscriberExists: false }), false)?.status).toBe(400);
  });

  it('a product missing from the catalog is a 400, not a foreign-key 500', () => {
    expect(openLaneRefusal(facts({ lane: 'missing' }), true)?.status).toBe(400);
  });

  it('a row written already DEAD sits beside nothing — allowed next to a live plan', () => {
    expect(openLaneRefusal(facts({ otherLiveRows: [{ planName: 'Plus' }] }), false)).toBeNull();
  });
});

describe('POST /member-subscription — guarded', () => {
  it('opens the row INSIDE the transaction, after the lane lock and the lane read', async () => {
    const t = setup();
    const res = fakeRes();
    await t.controller.create(post(body()), res);

    expect(res.statusCode).toBe(201);
    expect(h.order[0]).toBe('lane-lock');
    expect(h.order).toEqual(expect.arrayContaining(['catalog', 'live-rows', 'org-exists']));
    expect(t.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscriberId: OUTLET, currency: 'MYR', status: 'active' }),
      h.TX,
    );
  });

  it('refuses a second live plan, and writes nothing', async () => {
    h.live = [{ id: 'old', planName: 'Plus' }];
    const t = setup();
    const res = fakeRes();
    await t.controller.create(post(body()), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already on Plus/);
    expect(t.repository.create).not.toHaveBeenCalled();
  });

  it('refuses a subscriber organisation that does not exist', async () => {
    h.exists = false;
    const t = setup();
    const res = fakeRes();
    await t.controller.create(post(body()), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/No outlet with this id is registered/);
    expect(t.repository.create).not.toHaveBeenCalled();
  });

  it('a failed insert rolls back and says nothing was changed — never a silent 201', async () => {
    const t = setup();
    t.repository.create.mockResolvedValueOnce(null as never);
    const res = fakeRes();
    await t.controller.create(post(body()), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toMatch(/Nothing was changed/);
  });

  it('refuses a currency other than MYR before anything is read', async () => {
    const t = setup();
    const res = fakeRes();
    await t.controller.create(post(body({ currency: 'USD' })), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/MYR/);
    expect(h.order).toEqual([]);
  });
});

describe('PUT /member-subscription/:id — a reopen is guarded, other edits are not', () => {
  const ended = { id: ROW_ID, status: 'expired', endedAt: new Date('2026-09-01'), subscriptionId: null };
  const reopenFacts = (others: Array<{ planName: string }>) => ({
    lane: 'plan',
    subscriberType: 'outlet',
    subscriberExists: true,
    otherLiveRows: others,
  });

  it('reopening an ended plan beside the live one that replaced it is a 409', async () => {
    h.reopen = { target: ended, facts: reopenFacts([{ planName: 'Premier' }]) };
    const t = setup();
    const res = fakeRes();
    await t.controller.update(put({ endedAt: null, status: 'active' }), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toMatch(/already on Premier/);
    expect(t.repository.update).not.toHaveBeenCalled();
  });

  it('reopening the ONLY plan row is allowed, written in the same transaction', async () => {
    h.reopen = { target: ended, facts: reopenFacts([]) };
    const t = setup();
    const res = fakeRes();
    await t.controller.update(put({ endedAt: null, status: 'active' }), res);

    expect(res.statusCode).toBe(200);
    expect(t.repository.update).toHaveBeenCalledWith(ROW_ID, expect.objectContaining({ endedAt: null }), h.TX);
  });

  it('a live row moving past_due → active is not a reopen — allowed even beside a duplicate', async () => {
    h.reopen = {
      target: { ...ended, status: 'past_due', endedAt: null },
      facts: reopenFacts([{ planName: 'Premier' }]),
    };
    const t = setup();
    const res = fakeRes();
    await t.controller.update(put({ status: 'active' }), res);
    expect(res.statusCode).toBe(200);
  });

  it('a row that does not exist is a 404', async () => {
    const t = setup();
    const res = fakeRes();
    await t.controller.update(put({ endedAt: null }), res);
    expect(res.statusCode).toBe(404);
  });

  it('an edit that cannot reopen anything keeps the plain update (no lane read)', async () => {
    const t = setup();
    const res = fakeRes();
    await t.controller.update(put({ planName: 'Pro', amount: 310 }), res);

    expect(res.statusCode).toBe(200);
    expect(t.repository.update).toHaveBeenCalledWith(ROW_ID, expect.objectContaining({ planName: 'Pro' }));
    expect(h.order).toEqual([]);
  });
});

describe('lockLiveAddonRows — the read the add-on doors decide on', () => {
  function recordingTx() {
    const seen = { where: null as unknown, lock: null as unknown };
    const tx = {
      select: () => ({
        from: () => ({
          where: (cond: unknown) => {
            seen.where = cond;
            return {
              orderBy: () => ({
                for: async (strength: unknown) => {
                  seen.lock = strength;
                  h.order.push('addon-rows');
                  return [];
                },
              }),
            };
          },
        }),
      }),
    };
    return { tx, seen };
  }
  const render = (cond: unknown) => new PgDialect().sqlToQuery(cond as never);

  it('takes the lane lock FIRST, then locks the rows FOR UPDATE', async () => {
    const { tx, seen } = recordingTx();
    await lockLiveAddonRows(tx as never, { subscriberType: 'outlet', subscriberId: OUTLET });
    expect(h.order).toEqual(['lane-lock', 'addon-rows']);
    expect(seen.lock).toBe('update');
  });

  it('"live" is active AND past_due with no end date — a past_due line is not skipped', async () => {
    const { tx, seen } = recordingTx();
    await lockLiveAddonRows(tx as never, { subscriberType: 'outlet', subscriberId: OUTLET });
    const q = render(seen.where);
    expect(q.sql).toMatch(/"ended_at" is null/);
    expect(q.params).toEqual(expect.arrayContaining(['active', 'past_due']));
    // Every add-on product when none is named…
    expect(q.sql).toMatch(/s\.kind = 'addon'/);
  });

  it('…and only that product when one is named', async () => {
    const { tx, seen } = recordingTx();
    await lockLiveAddonRows(tx as never, { subscriberType: 'outlet', subscriberId: OUTLET }, 'addon-pos');
    const q = render(seen.where);
    expect(q.sql).not.toMatch(/s\.kind = 'addon'/);
    expect(q.params).toContain('addon-pos');
  });
});
