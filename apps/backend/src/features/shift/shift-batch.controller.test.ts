import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST JOB POSTS ITS SHIFTS ALL OR NOTHING (`POST /shift/batch`, 30 Sep 2026).
 *
 * The composer used to send several shifts one `POST /shift` at a time, so a
 * refusal halfway left the earlier ones posted while the form still held them
 * all. Pinned here against fakes (`@/db/index` is stubbed, so nothing can reach
 * the shared database):
 *
 *  - a valid batch is written through ONE repository call (one transaction), and
 *    each shift is announced once, after that write has committed;
 *  - one refused item writes nothing, answers with that check's own sentence and
 *    status, and names the item (`data: { index, shiftDate }`);
 *  - earlier items count as though already posted — two items that clash with
 *    each other are refused, and the plan counts their headcount on the day;
 *  - a draft (the admin path) counts for neither, as it would not once stored;
 *  - a venue's standing facts (approved agencies, status, plan) are read once
 *    per venue per batch, while what depends on the item is read per item;
 *  - the envelope is bounded, and an oversized batch is refused before any check;
 *  - a single `POST /shift` refuses the same shift with the same sentence.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));

const OUTLET = '11111111-1111-4111-8111-111111111111';
const OUTLET_B = '22222222-2222-4222-8222-222222222222';
const ATLAS = '44444444-4444-4444-8444-444444444444';

type PlanAnswer =
  | { kind: 'plan'; planName: string; limitAmount: number | null }
  | { kind: 'none' }
  | { kind: 'unknown' };

const h = vi.hoisted(() => ({
  scope: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
  plan: { kind: 'unknown' } as PlanAnswer,
  /** Stored headcount per date — what `outletDailyPrUsage` reads. */
  used: {} as Record<string, number>,
  /** Stored shifts the clash check reads back (`listByOutletAroundDate`). */
  stored: [] as { id: string; shiftDate: string; slot: string | null; eventName: string | null }[],
  /** The order things happened in: writes, the response, notifications. */
  events: [] as string[],
  /** How often each fact had been read when the write began (`readsSoFar`). */
  readsAtWrite: null as null | Record<string, number>,
}));

vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const resolveOrgScope = vi.hoisted(() => vi.fn(async () => h.scope));
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/util/org-scope');
  return { ...actual, resolveOrgScope };
});
const outletDailyPrUsage = vi.hoisted(() =>
  vi.fn(async (params: { shiftDate: string }) => h.used[params.shiftDate] ?? 0),
);
const resolveActivePlanLimit = vi.hoisted(() => vi.fn(async () => h.plan));
vi.mock('@/features/subscription/plan-limit', () => ({
  resolveActivePlanLimit,
  outletDailyPrUsage,
}));
vi.mock('@/features/pr-personnel/pr.repository', () => ({
  listMembershipPairs: vi.fn(async () => []),
}));
vi.mock('@/features/shift-template/shift-template.repository', () => ({
  shiftTemplateBelongsToOutlet: vi.fn(async () => true),
}));
const notifyMany = vi.hoisted(() =>
  vi.fn(async (_recipients: string[], input: { payload: { shiftId: string } }) => {
    h.events.push(`notify:${input.payload.shiftId}`);
  }),
);
vi.mock('@/features/notification/notify.js', () => ({ notifyMany }));

import {
  SHIFT_BATCH_EMPTY,
  SHIFT_BATCH_MAX,
  SHIFT_BATCH_NOT_A_LIST,
  SHIFT_BATCH_TOO_MANY,
  SLOT_NEEDS_WINDOW,
} from '@/schema/shift.schema';
import { ShiftControllerClass, shiftsPostedMessage } from './shift.controller';
import type { ShiftPostWrite, ShiftRepositoryClass } from './shift.repository';

function fakeShiftRepository() {
  const repo = {
    listByOutletAroundDate: vi.fn(async () => h.stored),
    createWithPayTiers: vi.fn(async (data: { shiftDate: string }) => {
      h.events.push('write:1');
      h.readsAtWrite = readsSoFar(repo);
      return { id: 'shift-single', quantity: 0, slot: null, eventName: null, ...data };
    }),
    createManyWithPayTiers: vi.fn(async (posts: ShiftPostWrite[]) => {
      h.events.push(`write:${posts.length}`);
      h.readsAtWrite = readsSoFar(repo);
      return posts.map((post, i) => ({
        id: `shift-${i}`,
        quantity: 0,
        slot: null,
        eventName: null,
        ...post.data,
      }));
    }),
  };
  return repo;
}

/**
 * How often each fact had been read — taken when the write begins, so the
 * announcements that follow it (which read the venue's name) never count.
 */
function readsSoFar(repo: { listByOutletAroundDate: { mock: { calls: unknown[] } } }) {
  return {
    approvedAgencies: approvedAgencies.mock.calls.length,
    venue: outletGetById.mock.calls.length,
    plan: resolveActivePlanLimit.mock.calls.length,
    aroundDate: repo.listByOutletAroundDate.mock.calls.length,
    dayUsage: outletDailyPrUsage.mock.calls.length,
  };
}

type Body = { success: boolean; message?: string; data: unknown };
type FakeResponse = {
  statusCode: number;
  body: Body;
  status(code: number): FakeResponse;
  json(payload: Body): FakeResponse;
};

function fakeResponse() {
  const res: FakeResponse = {
    statusCode: 0,
    body: { success: false, message: '', data: null },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      h.events.push(`respond:${res.statusCode}`);
      return res;
    },
  };
  return res as unknown as Response & FakeResponse;
}

const approvedAgencies = vi.fn(async (_outletId: string) => [ATLAS]);
/** Every venue is live unless a test says otherwise. The post check reads its
 *  status, the bell its name. */
const liveVenue = async (id: string) => ({ id, status: 'active', name: 'Emhub' });
const outletGetById = vi.fn(liveVenue);

function controllerWith(repo: ReturnType<typeof fakeShiftRepository>) {
  return new ShiftControllerClass(
    repo as unknown as ShiftRepositoryClass,
    // The invited agency has one active member, so each post is announced.
    { listByAgency: vi.fn(async () => [{ userId: 'agency-user-1', status: 'active' }]) } as never,
    {} as never,
    {} as never,
    { getById: outletGetById } as never,
    {} as never,
    { listApprovedAgencyIdsForOutlet: approvedAgencies } as never,
  );
}

function request(body: unknown) {
  return {
    params: {},
    body,
    user: { id: 'owner-1' },
    query: {},
    headers: {},
    header: () => undefined,
  } as unknown as Request;
}

/** One composer shift — the body `POST /shift` takes. */
const item = (shiftDate: string, slot: string, extra: Record<string, unknown> = {}) => ({
  outletId: OUTLET,
  shiftDate,
  slot,
  quantity: 4,
  ...extra,
});

async function postBatch(items: unknown) {
  const repo = fakeShiftRepository();
  const res = fakeResponse();
  await controllerWith(repo).createBatch(request({ items }), res);
  return { repo, res };
}

/**
 * Wait for `n` announcements. They run in the background AFTER the response,
 * so a test that posts must see its own through — or they land in the next
 * test's record.
 */
const announced = (n: number) =>
  vi.waitFor(() => expect(notifyMany).toHaveBeenCalledTimes(n));

beforeEach(() => {
  h.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET] };
  h.plan = { kind: 'plan', planName: 'Growth', limitAmount: 10 };
  h.used = {};
  h.stored = [];
  h.events = [];
  h.readsAtWrite = null;
  notifyMany.mockClear();
  outletDailyPrUsage.mockClear();
  resolveOrgScope.mockClear();
  resolveActivePlanLimit.mockClear();
  approvedAgencies.mockClear();
  outletGetById.mockClear().mockImplementation(liveVenue);
});

describe('POST /shift/batch — a valid batch', () => {
  it('writes every shift through ONE repository call and answers with the server’s own sentence', async () => {
    const { repo, res } = await postBatch([
      item('2026-10-10', '22:00 - 04:00'),
      item('2026-10-11', '22:00 - 04:00'),
      item('2026-10-12', '22:00 - 04:00'),
    ]);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Posted 3 shifts');
    expect(res.body.message).toBe(shiftsPostedMessage(3));
    expect((res.body.data as unknown[]).length).toBe(3);
    // One call = one transaction (see shift-batch.repository.test.ts); never
    // the single-post path, which would open one per shift.
    expect(repo.createManyWithPayTiers).toHaveBeenCalledTimes(1);
    expect(repo.createWithPayTiers).not.toHaveBeenCalled();
    const [posts, actor] = repo.createManyWithPayTiers.mock.calls[0] as unknown as [
      ShiftPostWrite[],
      string,
    ];
    expect(actor).toBe('owner-1');
    expect(posts.map((p) => p.data.shiftDate)).toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
    // Exactly what a single post writes: confirmed, anchored and fanned out to
    // the approved agency, stamped with the actor.
    expect(posts[0]).toMatchObject({
      data: {
        outletId: OUTLET,
        agencyId: ATLAS,
        status: 'confirmed',
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
      },
      agencyIds: [ATLAS],
      requestedPrs: [],
    });
    // The caller's scope is asked once for the whole batch.
    expect(resolveOrgScope).toHaveBeenCalledTimes(1);
    await announced(3);
  });

  it('announces each shift once, and only after the write has committed', async () => {
    await postBatch([item('2026-10-10', '20:00 - 23:00'), item('2026-10-11', '20:00 - 23:00')]);

    await announced(2);
    expect(h.events).toEqual(['write:2', 'respond:201', 'notify:shift-0', 'notify:shift-1']);
  });

  it('says so in the singular for one shift', async () => {
    const { res } = await postBatch([item('2026-10-10', '20:00 - 23:00')]);
    expect(res.body.message).toBe('Posted 1 shift');
    await announced(1);
  });
});

describe('POST /shift/batch — one refused item writes nothing', () => {
  it('a plan refusal on the second item: its own sentence and status, the item named, no write, no bell', async () => {
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00', { quantity: 12 }),
      item('2026-10-12', '20:00 - 23:00'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Growth plan covers 10 PRs a day. 0 already requested on 2026-10-11, ' +
        'so this shift can ask for at most 10 more — lower the headcount or upgrade the plan.',
      data: { index: 1, shiftDate: '2026-10-11' },
    });
    // The first item had passed — and still nothing was written.
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
    expect(repo.createWithPayTiers).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('a venue with no plan is refused on the first item, with the no-plan sentence', async () => {
    h.plan = { kind: 'none' };
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'This venue has no active subscription plan, so it cannot post shifts. ' +
        'Choose a plan under Settings → Subscription, or contact InnocenZ.',
      data: { index: 0, shiftDate: '2026-10-10' },
    });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });

  it('a malformed later item: the schema’s own sentence, its index and date, and nothing written', async () => {
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', 'Late night'),
    ]);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: SLOT_NEEDS_WINDOW,
      data: { index: 1, shiftDate: '2026-10-11' },
    });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('never echoes a date that is not one', async () => {
    const { res } = await postBatch([item('10/10/2026', '20:00 - 23:00')]);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Date must be yyyy-MM-dd');
    expect(res.body.data).toEqual({ index: 0, shiftDate: null });
  });

  it('a clash with a STORED shift: the same 409 and sentence a single post gets', async () => {
    h.stored = [
      { id: 'stored-1', shiftDate: '2026-10-11', slot: '22:00 - 04:00', eventName: 'Friday lounge' },
    ];
    const sentence =
      'You already have a shift at 22:00 - 04:00 on 2026-10-11 ("Friday lounge"). ' +
      "Raise that shift's headcount instead of posting a second one for the same time.";

    const single = fakeResponse();
    const singleRepo = fakeShiftRepository();
    await controllerWith(singleRepo).create(request(item('2026-10-11', '22:00 - 04:00')), single);
    expect(single.statusCode).toBe(409);
    expect(single.body).toEqual({ success: false, message: sentence, data: null });
    expect(singleRepo.createWithPayTiers).not.toHaveBeenCalled();

    const { repo, res } = await postBatch([
      item('2026-10-05', '22:00 - 04:00'),
      item('2026-10-11', '22:00 - 04:00'),
    ]);
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: sentence,
      data: { index: 1, shiftDate: '2026-10-11' },
    });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });

  it('a caller who is not an outlet is refused on the first item, before anything is read', async () => {
    h.scope = { isAdmin: false, agencyId: ATLAS, outletIds: [] };
    const { repo, res } = await postBatch([item('2026-10-10', '20:00 - 23:00')]);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: 'Only an outlet can post a shift. The outlet posts the job to its agency.',
      data: { index: 0, shiftDate: '2026-10-10' },
    });
    expect(approvedAgencies).not.toHaveBeenCalled();
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });
});

describe('POST /shift/batch — earlier items count as already posted', () => {
  it('two items at the same time on the same night are refused as a duplicate', async () => {
    const { repo, res } = await postBatch([
      item('2026-10-10', '22:00 - 04:00', { eventName: 'Ladies Night' }),
      item('2026-10-10', '10:00 PM - 4:00 AM'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'You already have a shift at 22:00 - 04:00 on 2026-10-10 ("Ladies Night"). ' +
        "Raise that shift's headcount instead of posting a second one for the same time.",
      data: { index: 1, shiftDate: '2026-10-10' },
    });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });

  it('an overnight item clashes with the next morning’s, across the date line', async () => {
    const { res } = await postBatch([
      item('2026-10-10', '22:00 - 04:00'),
      item('2026-10-11', '02:00 - 06:00'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'This clashes with your shift at 22:00 - 04:00 on 2026-10-10 — ' +
        "an outlet's shifts cannot overlap. Change this shift's time, or move the other one first.",
      data: { index: 1, shiftDate: '2026-10-11' },
    });
  });

  it('back-to-back items still post — the venue rule refuses overlaps, not neighbours', async () => {
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-10', '23:00 - 02:00'),
    ]);

    expect(res.statusCode).toBe(201);
    expect(repo.createManyWithPayTiers).toHaveBeenCalledTimes(1);
    await announced(2);
  });

  it('the plan counts the earlier items’ headcount on the same date — and only that date', async () => {
    h.used = { '2026-10-10': 3 };
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      // Another date: never counted against the 10th.
      item('2026-10-11', '20:00 - 23:00'),
      // 3 stored + 4 earlier in this batch + 4 here = 11 > 10.
      item('2026-10-10', '23:00 - 02:00'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Growth plan covers 10 PRs a day. 7 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 3 more — lower the headcount or upgrade the plan.',
      data: { index: 2, shiftDate: '2026-10-10' },
    });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });

  it('and lets the same batch through when the day has exactly the room', async () => {
    h.plan = { kind: 'plan', planName: 'Growth', limitAmount: 11 };
    h.used = { '2026-10-10': 3 };
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
      item('2026-10-10', '23:00 - 02:00'),
    ]);

    expect(res.statusCode).toBe(201);
    expect(repo.createManyWithPayTiers).toHaveBeenCalledTimes(1);
    await announced(3);
  });

  it('an admin’s drafts neither clash nor count — exactly as stored drafts do not', async () => {
    h.scope = { isAdmin: true, agencyId: null, outletIds: [] };
    h.plan = { kind: 'plan', planName: 'Growth', limitAmount: 4 };
    const { repo, res } = await postBatch([
      item('2026-10-10', '22:00 - 04:00', { agencyId: ATLAS }),
      item('2026-10-10', '22:00 - 04:00', { agencyId: ATLAS }),
    ]);

    expect(res.statusCode).toBe(201);
    const [posts] = repo.createManyWithPayTiers.mock.calls[0] as unknown as [ShiftPostWrite[]];
    expect(posts.map((p) => p.data.status)).toEqual([undefined, undefined]);
    await announced(2);
  });
});

describe('POST /shift/batch — a venue’s standing facts are read once per batch', () => {
  it('three shifts at one venue: its agencies, status and plan read once — the rest per item', async () => {
    const { res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
      item('2026-10-12', '20:00 - 23:00'),
    ]);

    expect(res.statusCode).toBe(201);
    expect(h.readsAtWrite).toEqual({
      approvedAgencies: 1,
      venue: 1,
      plan: 1,
      // What depends on the ITEM — the shifts around its date, the headcount
      // already on its day — is still read for every item.
      aroundDate: 3,
      dayUsage: 3,
    });
    await announced(3);
  });

  it('two venues in one batch: once per venue — and neither venue’s shifts clash with the other’s', async () => {
    h.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET, OUTLET_B] };
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-10', '20:00 - 23:00', { outletId: OUTLET_B }),
      item('2026-10-11', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00', { outletId: OUTLET_B }),
    ]);

    expect(res.statusCode).toBe(201);
    expect(h.readsAtWrite).toMatchObject({ approvedAgencies: 2, venue: 2, plan: 2 });
    expect(approvedAgencies.mock.calls.map(([outletId]) => outletId)).toEqual([OUTLET, OUTLET_B]);
    expect(repo.createManyWithPayTiers).toHaveBeenCalledTimes(1);
    await announced(4);
  });

  it('a later item of a venue that is not live is refused from the same one read', async () => {
    outletGetById.mockImplementation(async (id: string) => ({
      id,
      status: id === OUTLET_B ? 'suspended' : 'active',
      name: 'Emhub',
    }));
    h.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET, OUTLET_B] };
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
      item('2026-10-12', '20:00 - 23:00', { outletId: OUTLET_B }),
    ]);

    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: 'This venue is suspended and cannot post shifts. Contact InnocenZ to restore access.',
      data: { index: 2, shiftDate: '2026-10-12' },
    });
    // One read of each venue — the live one for its two items, then the other.
    expect(outletGetById.mock.calls.map(([id]) => id)).toEqual([OUTLET, OUTLET_B]);
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });
});

describe('POST /shift/batch — the envelope', () => {
  it(`refuses more than ${SHIFT_BATCH_MAX} shifts before checking any of them`, async () => {
    const days = Array.from({ length: SHIFT_BATCH_MAX + 1 }, (_, i) =>
      item(`2026-11-${String((i % 28) + 1).padStart(2, '0')}`, '20:00 - 23:00'),
    );
    const { repo, res } = await postBatch(days);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: SHIFT_BATCH_TOO_MANY, data: null });
    expect(SHIFT_BATCH_TOO_MANY).toBe(
      `You can post at most ${SHIFT_BATCH_MAX} shifts at once — split the rest into a second post.`,
    );
    expect(resolveOrgScope).not.toHaveBeenCalled();
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });

  it('takes exactly the maximum', async () => {
    const days = Array.from({ length: SHIFT_BATCH_MAX }, (_, i) =>
      item(`2026-12-${String(i + 1).padStart(2, '0')}`, '20:00 - 23:00'),
    );
    const { repo, res } = await postBatch(days);

    expect(res.statusCode).toBe(201);
    expect((repo.createManyWithPayTiers.mock.calls[0] as unknown as [unknown[]])[0]).toHaveLength(
      SHIFT_BATCH_MAX,
    );
    await announced(SHIFT_BATCH_MAX);
  });

  it.each([
    ['an empty list', { items: [] }, SHIFT_BATCH_EMPTY],
    ['no list at all', {}, SHIFT_BATCH_NOT_A_LIST],
    ['a list that is not one', { items: 'shift' }, SHIFT_BATCH_NOT_A_LIST],
    ['no body', undefined, SHIFT_BATCH_NOT_A_LIST],
  ])('refuses %s', async (_label, body, message) => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).createBatch(request(body), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message, data: null });
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });
});

describe('POST /shift keeps behaving as it did', () => {
  it('a single valid post still writes through createWithPayTiers and answers "Shift created"', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).create(request(item('2026-10-10', '20:00 - 23:00')), res);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Shift created');
    expect(repo.createWithPayTiers).toHaveBeenCalledTimes(1);
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
    const call = repo.createWithPayTiers.mock.calls[0] as unknown as unknown[];
    expect(call[0]).toMatchObject({ outletId: OUTLET, agencyId: ATLAS, status: 'confirmed' });
    expect(call.slice(1, 6)).toEqual([undefined, 'owner-1', [ATLAS], [], undefined]);
    // …and the guard that re-runs the clash and plan rules under the venue's lock
    // (shift-post-race.controller.test.ts runs it).
    expect(call[6]).toEqual(expect.any(Function));
    await announced(1);
    expect(h.events).toEqual(['write:1', 'respond:201', 'notify:shift-single']);
    // Every fact read exactly once, as it always was — the memo changes nothing here.
    expect(h.readsAtWrite).toEqual({
      approvedAgencies: 1,
      venue: 1,
      plan: 1,
      aroundDate: 1,
      dayUsage: 1,
    });
  });

  it('a single malformed post is refused before the caller’s scope is read', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).create(request(item('2026-10-10', 'Late night')), res);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: SLOT_NEEDS_WINDOW, data: null });
    expect(resolveOrgScope).not.toHaveBeenCalled();
  });
});

describe('a FAILED read of the venue’s approved agencies (1 Oct 2026)', () => {
  // It used to read as "no approved agency" and answer 400 "link an agency in
  // Settings first" — a venue that HAS agencies, sent to Settings by a blip.
  const NO_AGENCY = 'No approved agency to request PR from — link an agency in Settings first';
  const SERVER_ERROR = { success: false, message: 'Internal Server Error', data: null };

  it('a single post answers 500, never the Settings sentence, and writes nothing', async () => {
    approvedAgencies.mockRejectedValueOnce(new Error('connection reset'));
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).create(request(item('2026-10-10', '20:00 - 23:00')), res);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(SERVER_ERROR);
    expect(res.body.message).not.toBe(NO_AGENCY);
    expect(repo.createWithPayTiers).not.toHaveBeenCalled();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('a batch answers 500 with nothing written', async () => {
    approvedAgencies.mockRejectedValueOnce(new Error('connection reset'));
    const { repo, res } = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
    ]);

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual(SERVER_ERROR);
    expect(repo.createManyWithPayTiers).not.toHaveBeenCalled();
  });
});
