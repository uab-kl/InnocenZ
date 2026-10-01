import { getTableName, type SQL, type Table } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE CHECK-THEN-INSERT RACE, CLOSED (30 Sep 2026) — `POST /shift`,
 * `POST /shift/batch` and `PUT /shift/:id`.
 *
 * Two writes landing together used to both pass the clash and plan checks, and
 * both commit. Now the write's own transaction locks each venue first and
 * re-runs those two rules through itself. Pinned here with the REAL controller,
 * post check, guard and repository over a fake database whose reads can answer
 * differently inside the write than outside it — which is exactly what a post
 * landing between the check and the lock looks like:
 *
 *  - the lock is taken per distinct venue, sorted, before any row is written;
 *  - a clash, or a full day, seen only under the lock is refused with the
 *    sentence and status the check itself gives — and the batch names the item
 *    and its date — with nothing written and no bell;
 *  - the batch's earlier items are counted on top of the day read under the lock;
 *  - every read inside the write goes through the transaction, never the pool;
 *  - a clean post still writes, and its bell still follows the commit.
 */

const OUTLET = '11111111-1111-4111-8111-111111111111';
const OUTLET_B = '22222222-2222-4222-8222-222222222222';
const ATLAS = '44444444-4444-4444-8444-444444444444';
const SHIFT = '55555555-5555-4555-8555-555555555555';

type StoredShift = { id: string; shiftDate: string; slot: string | null; eventName: string | null };
type PlanAnswer =
  | { kind: 'plan'; planName: string; limitAmount: number | null }
  | { kind: 'none' }
  | { kind: 'unknown' };
type Op = { at: string; op: string; table?: unknown; query?: unknown };

const h = vi.hoisted(() => {
  const state = {
    scope: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
    plan: { kind: 'unknown' } as PlanAnswer,
    /** The plan as the WRITE reads it under the lock, when it changed after the check. */
    planUnderLock: null as PlanAnswer | null,
    /** The venue's shifts as the CHECK reads them, through the pool… */
    stored: [] as StoredShift[],
    /** …and as the WRITE reads them under the lock: a post may have landed. */
    storedUnderLock: [] as StoredShift[],
    /** Headcount already asked per date, through the pool / under the lock. */
    used: {} as Record<string, number>,
    usedUnderLock: {} as Record<string, number>,
    /** The row `PUT` edits. */
    existing: {} as Record<string, unknown>,
    /** Everything in order — database calls, the answer, the bells. */
    ops: [] as Op[],
    nextId: 0,
  };
  const client = (at: 'db' | 'tx') => ({
    at,
    execute: async (query: unknown) => {
      state.ops.push({ at, op: 'lock', query });
    },
    select: () => ({
      from: (table: unknown) => ({
        where: async () => {
          state.ops.push({ at, op: 'select', table });
          return at === 'tx' ? state.storedUnderLock : state.stored;
        },
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        state.ops.push({ at, op: 'insert', table });
        return Object.assign(Promise.resolve(undefined), {
          returning: async () => [
            { id: `shift-${(state.nextId += 1)}`, slot: null, eventName: null, ...values },
          ],
          onConflictDoNothing: async () => undefined,
        });
      },
    }),
    delete: (table: unknown) => ({
      where: async () => {
        state.ops.push({ at, op: 'delete', table });
      },
    }),
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.ops.push({ at, op: 'update', table });
            return [{ ...state.existing, ...values }];
          },
        }),
      }),
    }),
  });
  const db = {
    ...client('db'),
    // A FRESH transaction object each time, as drizzle makes one — the lock
    // order is tracked per transaction (shift-write-guard.ts).
    transaction: async <T>(work: (t: unknown) => Promise<T>): Promise<T> => {
      state.ops.push({ at: 'db', op: 'begin' });
      try {
        const result = await work(client('tx'));
        state.ops.push({ at: 'db', op: 'commit' });
        return result;
      } catch (error) {
        state.ops.push({ at: 'db', op: 'rollback' });
        throw error;
      }
    },
  };
  /** Did this read come through a write's transaction? */
  const underLock = (client: unknown) => (client as { at?: string } | undefined)?.at === 'tx';
  return { state, db, underLock };
});

vi.mock('@/db/index', () => ({ db: h.db }));
vi.mock('@/db/index.js', () => ({ db: h.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/util/org-scope');
  return { ...actual, resolveOrgScope: vi.fn(async () => h.state.scope) };
});
const resolveActivePlanLimit = vi.hoisted(() =>
  vi.fn(async (_params: unknown, client?: unknown) => {
    const underLock = h.underLock(client);
    h.state.ops.push({ at: underLock ? 'tx' : 'db', op: 'plan' });
    return (underLock ? h.state.planUnderLock : null) ?? h.state.plan;
  }),
);
const outletDailyPrUsage = vi.hoisted(() =>
  vi.fn(async (params: { shiftDate: string }, client?: unknown) => {
    const underLock = h.underLock(client);
    h.state.ops.push({ at: underLock ? 'tx' : 'db', op: 'usage' });
    return (underLock ? h.state.usedUnderLock : h.state.used)[params.shiftDate] ?? 0;
  }),
);
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
    h.state.ops.push({ at: 'app', op: `notify:${input.payload.shiftId}` });
  }),
);
vi.mock('@/features/notification/notify.js', () => ({ notifyMany }));

import { ShiftControllerClass } from './shift.controller';
import { ShiftRepositoryClass } from './shift.repository';

const LOCK_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';
const dialect = new PgDialect();

/** What happened, in order, as `where:op[:table]` — e.g. `tx:insert:shift`. */
function trace(): string[] {
  return h.state.ops.map(({ at, op, table }) =>
    table ? `${at}:${op}:${getTableName(table as Table)}` : `${at}:${op}`,
  );
}

/** Everything between the write's BEGIN and its end — the guarded part. */
function insideTheWrite(): string[] {
  const all = trace();
  const begin = all.indexOf('db:begin');
  const end = all.findIndex((entry, i) => i > begin && /^db:(commit|rollback)$/.test(entry));
  return all.slice(begin + 1, end);
}

/** The real repository, with only the reads a PUT makes before its rules faked. */
function shiftRepository() {
  return Object.assign(new ShiftRepositoryClass(), {
    getById: vi.fn(async () => h.state.existing),
    listPayTiersForShift: vi.fn(async () => []),
  });
}

function controller() {
  return new ShiftControllerClass(
    shiftRepository() as unknown as ShiftRepositoryClass,
    // The invited agency has one active member, so each post is announced.
    { listByAgency: vi.fn(async () => [{ userId: 'agency-user-1', status: 'active' }]) } as never,
    {} as never,
    {} as never,
    { getById: vi.fn(async (id: string) => ({ id, status: 'active', name: 'Emhub' })) } as never,
    { listByShift: vi.fn(async () => []), listForPr: vi.fn(async () => []) } as never,
    { listApprovedAgencyIdsForOutlet: vi.fn(async () => [ATLAS]) } as never,
  );
}

type Body = { success: boolean; message?: string; data: unknown };
type FakeResponse = Response & { statusCode: number; body: Body };

function fakeResponse(): FakeResponse {
  const res = {
    statusCode: 0,
    body: { success: false, message: '', data: null } as Body,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: Body) {
      res.body = payload;
      h.state.ops.push({ at: 'app', op: `respond:${res.statusCode}` });
      return res;
    },
  };
  return res as unknown as FakeResponse;
}

function request(body: unknown, id?: string) {
  return {
    params: id ? { id } : {},
    body,
    user: { id: 'owner-1' },
    query: {},
    headers: {},
    header: () => undefined,
  } as unknown as Request;
}

const item = (shiftDate: string, slot: string, extra: Record<string, unknown> = {}) => ({
  outletId: OUTLET,
  shiftDate,
  slot,
  quantity: 4,
  ...extra,
});

async function postOne(body: unknown) {
  const res = fakeResponse();
  await controller().create(request(body), res);
  return res;
}

async function postBatch(items: unknown[]) {
  const res = fakeResponse();
  await controller().createBatch(request({ items }), res);
  return res;
}

async function edit(body: Record<string, unknown>) {
  const res = fakeResponse();
  await controller().update(request(body, SHIFT), res);
  return res;
}

/** Start the next request from a clean record, keeping the database as set. */
function forgetTheRecord() {
  h.state.ops = [];
  h.state.nextId = 0;
  notifyMany.mockClear();
}

/** Bells go out after the answer, in the background — let any that would, land. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const announced = (n: number) => vi.waitFor(() => expect(notifyMany).toHaveBeenCalledTimes(n));

beforeEach(() => {
  h.state.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET] };
  h.state.plan = { kind: 'plan', planName: 'Growth', limitAmount: 10 };
  h.state.planUnderLock = null;
  h.state.stored = [];
  h.state.storedUnderLock = [];
  h.state.used = {};
  h.state.usedUnderLock = {};
  h.state.existing = {
    id: SHIFT,
    agencyId: ATLAS,
    outletId: OUTLET,
    shiftDate: '2026-10-10',
    slot: '20:00 - 23:00',
    eventName: 'Friday lounge',
    eventKind: 'normal',
    specialEventType: null,
    customSpecialEventName: null,
    quantity: 4,
    status: 'confirmed',
  };
  forgetTheRecord();
});

const SAME_TIME_ON_THE_10TH =
  'You already have a shift at 20:00 - 23:00 on 2026-10-10 ("Ladies Night"). ' +
  "Raise that shift's headcount instead of posting a second one for the same time.";
const LANDED_ON_THE_10TH: StoredShift = {
  id: 'landed-1',
  shiftDate: '2026-10-10',
  slot: '20:00 - 23:00',
  eventName: 'Ladies Night',
};

describe('POST /shift — the write re-checks under the venue’s lock', () => {
  it('a clean post: checked, locked, re-read through the lock, written, committed, then announced', async () => {
    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Shift created');
    await announced(1);
    expect(trace()).toEqual([
      // The check, unchanged, through the pool.
      'db:select:shift',
      'db:plan',
      'db:usage',
      // The write: the lock first, the two rules again through it — the plan
      // read again too — then the rows.
      'db:begin',
      'tx:lock',
      'tx:select:shift',
      'tx:plan',
      'tx:usage',
      'tx:insert:shift',
      'tx:insert:shift_agency',
      'db:commit',
      'app:respond:201',
      'app:notify:shift-1',
    ]);
    const [lock] = h.state.ops
      .filter((o) => o.op === 'lock')
      .map((o) => dialect.sqlToQuery(o.query as SQL));
    expect(lock).toMatchObject({ sql: LOCK_SQL, params: [`shift-post:${OUTLET}`] });
  });

  it('a clash that lands between the check and the lock: the clash sentence, 409, nothing written, no bell', async () => {
    h.state.storedUnderLock = [LANDED_ON_THE_10TH];

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, message: SAME_TIME_ON_THE_10TH, data: null });
    expect(insideTheWrite()).toEqual(['tx:lock', 'tx:select:shift']);
    expect(trace()).toContain('db:rollback');
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
    await settle();
    expect(notifyMany).not.toHaveBeenCalled();
  });

  it('…is exactly what the check answers once the other post is visible to it', async () => {
    h.state.storedUnderLock = [LANDED_ON_THE_10TH];
    const underLock = await postOne(item('2026-10-10', '20:00 - 23:00'));

    forgetTheRecord();
    h.state.stored = [LANDED_ON_THE_10TH];
    const byTheCheck = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(byTheCheck.statusCode).toBe(underLock.statusCode);
    expect(byTheCheck.body).toEqual(underLock.body);
    // Refused by the check itself: no write was ever opened.
    expect(trace()).not.toContain('db:begin');
  });

  it('the day fills up between the check and the lock: the plan sentence, 409, nothing written, no bell', async () => {
    h.state.usedUnderLock = { '2026-10-10': 8 };

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Growth plan covers 10 PRs a day. 8 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
      data: null,
    });
    expect(insideTheWrite()).toEqual(['tx:lock', 'tx:select:shift', 'tx:plan', 'tx:usage']);
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
    await settle();
    expect(notifyMany).not.toHaveBeenCalled();

    // The same body the check gives when it can already see those 8.
    forgetTheRecord();
    h.state.used = { '2026-10-10': 8 };
    const byTheCheck = await postOne(item('2026-10-10', '20:00 - 23:00'));
    expect(byTheCheck.statusCode).toBe(409);
    expect(byTheCheck.body).toEqual(res.body);
  });

  it('clash before plan under the lock too: a clash that also fills the day is named as the clash', async () => {
    h.state.storedUnderLock = [LANDED_ON_THE_10TH];
    h.state.usedUnderLock = { '2026-10-10': 10 };

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.body.message).toBe(SAME_TIME_ON_THE_10TH);
    // The plan was never asked: the more specific cause won.
    expect(insideTheWrite()).toEqual(['tx:lock', 'tx:select:shift']);
  });
});

describe('POST /shift/batch — one guard over the whole batch', () => {
  it('locks each venue it touches once, sorted, before the first row — and every read inside is the transaction’s', async () => {
    h.state.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET, OUTLET_B] };

    const res = await postBatch([
      item('2026-10-10', '20:00 - 23:00', { outletId: OUTLET_B }),
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00', { outletId: OUTLET_B }),
    ]);

    expect(res.statusCode).toBe(201);
    const inside = insideTheWrite();
    expect(inside.slice(0, 2)).toEqual(['tx:lock', 'tx:lock']);
    expect(inside.filter((entry) => entry === 'tx:lock')).toHaveLength(2);
    expect(inside.indexOf('tx:insert:shift')).toBeGreaterThan(inside.lastIndexOf('tx:usage'));
    // Nothing inside the write reached for the pool. The plan is read once per
    // venue by the check, and once per venue AGAIN under the locks — after both.
    expect(inside.every((entry) => entry.startsWith('tx:'))).toBe(true);
    expect(trace().filter((entry) => entry === 'db:plan')).toHaveLength(2);
    expect(inside.filter((entry) => entry === 'tx:plan')).toHaveLength(2);
    expect(inside.indexOf('tx:plan')).toBeGreaterThan(inside.lastIndexOf('tx:lock'));
    const locks = h.state.ops
      .filter((o) => o.op === 'lock')
      .map((o) => dialect.sqlToQuery(o.query as SQL));
    expect(locks.map((q) => q.sql)).toEqual([LOCK_SQL, LOCK_SQL]);
    expect(locks.map((q) => q.params)).toEqual([[`shift-post:${OUTLET}`], [`shift-post:${OUTLET_B}`]]);
    await announced(3);
  });

  it('a clash that lands inside the write names the item and its date, and nothing at all is written', async () => {
    const landed: StoredShift = {
      id: 'landed-2',
      shiftDate: '2026-10-11',
      slot: '22:00 - 04:00',
      eventName: 'Friday lounge',
    };
    h.state.storedUnderLock = [landed];
    const items = [
      item('2026-10-10', '22:00 - 04:00'),
      item('2026-10-11', '22:00 - 04:00'),
      item('2026-10-12', '22:00 - 04:00'),
    ];

    const res = await postBatch(items);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'You already have a shift at 22:00 - 04:00 on 2026-10-11 ("Friday lounge"). ' +
        "Raise that shift's headcount instead of posting a second one for the same time.",
      data: { index: 1, shiftDate: '2026-10-11' },
    });
    // The first item passed its re-check — and still nothing was written.
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
    expect(trace()).toContain('db:rollback');
    await settle();
    expect(notifyMany).not.toHaveBeenCalled();

    // The check's own answer once it can see the same row: identical.
    forgetTheRecord();
    h.state.stored = [landed];
    const byTheCheck = await postBatch(items);
    expect(byTheCheck.statusCode).toBe(409);
    expect(byTheCheck.body).toEqual(res.body);
  });

  it('the plan counts the batch’s earlier items on top of the day read under the lock', async () => {
    // The check saw an empty day: 4 + 4 fits in 10. Under the lock 3 have landed.
    h.state.usedUnderLock = { '2026-10-10': 3 };

    const res = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-10', '23:00 - 02:00'),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Growth plan covers 10 PRs a day. 7 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 3 more — lower the headcount or upgrade the plan.',
      data: { index: 1, shiftDate: '2026-10-10' },
    });
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
  });

  it('a clean batch still writes every shift in one transaction and announces each after the commit', async () => {
    const res = await postBatch([
      item('2026-10-10', '20:00 - 23:00'),
      item('2026-10-11', '20:00 - 23:00'),
    ]);

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('Posted 2 shifts');
    await announced(2);
    const all = trace();
    expect(all.filter((entry) => entry === 'db:begin')).toHaveLength(1);
    expect(all.slice(all.indexOf('db:commit'))).toEqual([
      'db:commit',
      'app:respond:201',
      'app:notify:shift-1',
      'app:notify:shift-2',
    ]);
  });
});

describe('PUT /shift/:id — the edit takes the same lock', () => {
  it('a move onto a time taken between the check and the lock: the clash sentence, and no UPDATE', async () => {
    const landed: StoredShift = {
      id: 'landed-3',
      shiftDate: '2026-10-10',
      slot: '23:00 - 02:00',
      eventName: null,
    };
    h.state.storedUnderLock = [landed];

    const res = await edit({ slot: '22:00 - 04:00' });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'This clashes with your shift at 23:00 - 02:00 on 2026-10-10 — ' +
        "an outlet's shifts cannot overlap. Change this shift's time, or move the other one first.",
      data: null,
    });
    expect(insideTheWrite()).toEqual(['tx:lock', 'tx:select:shift']);
    expect(trace()).not.toContain('tx:update:shift');

    // The check's own answer once it can see the row.
    forgetTheRecord();
    h.state.stored = [landed];
    const byTheCheck = await edit({ slot: '22:00 - 04:00' });
    expect(byTheCheck.body).toEqual(res.body);
    expect(trace()).not.toContain('db:begin');
  });

  it('a raise that no longer fits the day under the lock: the plan sentence, and no UPDATE', async () => {
    h.state.usedUnderLock = { '2026-10-10': 8 };

    const res = await edit({ quantity: 5 });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'Your Growth plan covers 10 PRs a day. 8 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
    );
    expect(trace()).not.toContain('tx:update:shift');
  });

  it('a clean edit: its rules checked, the venue locked and re-checked, then the UPDATE', async () => {
    const res = await edit({ quantity: 5 });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Shift updated');
    expect(trace()).toEqual([
      'db:plan',
      'db:usage',
      'db:begin',
      'tx:lock',
      // Not moved in time, so no clash read — exactly as the check.
      'tx:plan',
      'tx:usage',
      'tx:update:shift',
      'db:commit',
      'app:respond:200',
    ]);
  });
});

describe('the PLAN is read again under the lock (1 Oct 2026)', () => {
  const STARTER_5: PlanAnswer = { kind: 'plan', planName: 'Starter', limitAmount: 5 };

  it('a plan switched to a smaller one between the check and the lock: the NEW plan’s sentence, 409, nothing written, no bell', async () => {
    // The check sees Growth (10): 3 + 4 fits. Under the lock the venue is on Starter (5).
    h.state.used = { '2026-10-10': 3 };
    h.state.usedUnderLock = { '2026-10-10': 3 };
    h.state.planUnderLock = STARTER_5;

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Starter plan covers 5 PRs a day. 3 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
      data: null,
    });
    expect(insideTheWrite()).toEqual(['tx:lock', 'tx:select:shift', 'tx:plan', 'tx:usage']);
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
    await settle();
    expect(notifyMany).not.toHaveBeenCalled();

    // The check's own answer once it reads the new plan: identical.
    forgetTheRecord();
    h.state.plan = STARTER_5;
    const byTheCheck = await postOne(item('2026-10-10', '20:00 - 23:00'));
    expect(byTheCheck.statusCode).toBe(409);
    expect(byTheCheck.body).toEqual(res.body);
    expect(trace()).not.toContain('db:begin');
  });

  it('a plan that ended between the check and the lock: the no-plan sentence, nothing written', async () => {
    h.state.planUnderLock = { kind: 'none' };

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'This venue has no active subscription plan, so it cannot post shifts. ' +
        'Choose a plan under Settings → Subscription, or contact InnocenZ.',
    );
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
  });

  it('a check whose plan read FAILED no longer waves the post past the cap — the guard asks again', async () => {
    h.state.plan = { kind: 'unknown' };
    h.state.planUnderLock = { kind: 'plan', planName: 'Growth', limitAmount: 10 };
    h.state.usedUnderLock = { '2026-10-10': 8 };

    const res = await postOne(item('2026-10-10', '20:00 - 23:00'));

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'Your Growth plan covers 10 PRs a day. 8 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
    );
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
  });

  it('a batch: the venue’s plan read ONCE under the lock, and the new plan counts the earlier items', async () => {
    h.state.planUnderLock = STARTER_5;

    const res = await postBatch([
      item('2026-10-10', '20:00 - 23:00', { quantity: 3 }),
      item('2026-10-10', '23:00 - 02:00', { quantity: 3 }),
    ]);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'Your Starter plan covers 5 PRs a day. 3 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
      data: { index: 1, shiftDate: '2026-10-10' },
    });
    expect(insideTheWrite().filter((entry) => entry === 'tx:plan')).toHaveLength(1);
    expect(trace().filter((entry) => entry.includes(':insert:'))).toEqual([]);
  });

  it('PUT: a raise judged against the plan in force under the lock, and no UPDATE', async () => {
    h.state.planUnderLock = { kind: 'plan', planName: 'Starter', limitAmount: 4 };

    const res = await edit({ quantity: 5 });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'Your Starter plan covers 4 PRs a day. 0 already requested on 2026-10-10, ' +
        'so this shift can ask for at most 4 more — lower the headcount or upgrade the plan.',
    );
    expect(trace()).not.toContain('tx:update:shift');
  });
});
