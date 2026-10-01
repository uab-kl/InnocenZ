import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * ONE PERSON, ONE PLACE — the booking lanes re-check under the PR's lock
 * (30 Sep 2026): `POST /shift-assignment`, the re-staffing
 * `PUT /shift-assignment/:id`, and outlet-swap approval.
 *
 * Each lane checked the PR's other bookings, then wrote in a separate step; two
 * bookings of one PR at two venues could pass each other in between. Pinned
 * here with the REAL controllers, seating rules and assignment repository over
 * a fake database whose reads answer differently inside the write than outside
 * it — what a booking landing between the check and the lock looks like:
 *
 *  - the shift's seat lock, then the PR's booking lock, before any row lock;
 *  - a booking (or a re-timed shift) seen only under the lock is refused with
 *    the lane's own sentence and status — exactly what the check says once it
 *    can see it — and nothing is written;
 *  - a clean booking still writes.
 *
 * Nothing here can reach the shared database.
 */

type Held = {
  id: string;
  shiftId: string;
  prId: string;
  status: string;
  agencyId: string;
  shiftDate: string;
  slot: string | null;
  outletId: string;
  outletName: string | null;
  outletLat: number | null;
  outletLng: number | null;
  checkOutAt: Date | null;
};
type Op = { at: string; op: string; query?: unknown };

const h = vi.hoisted(() => {
  const ids = {
    HERE: '11111111-1111-4111-8111-111111111111',
    FAR: '22222222-2222-4222-8222-222222222222',
    SHIFT: '33333333-3333-4333-8333-333333333333',
    ATLAS: '44444444-4444-4444-8444-444444444444',
    RIVAL: '77777777-7777-4777-8777-777777777777',
    PR: '66666666-6666-4666-8666-666666666666',
    ASSIGNMENT: '88888888-8888-4888-8888-888888888888',
    SWAP: '99999999-9999-4999-8999-999999999999',
    ORIGIN: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  };
  const state = {
    /** The shift as the lane first reads it, and as the write re-reads it under the lock. */
    shift: {} as Record<string, unknown>,
    shiftUnderLock: {} as Record<string, unknown>,
    /** The PR's bookings (`listForPr`) through the pool, and under the lock. */
    held: [] as Held[],
    heldUnderLock: [] as Held[],
    /** The cancelled row the re-staffing PATCH puts back. */
    assignment: {} as Record<string, unknown>,
    ops: [] as Op[],
  };
  /** A chainable select that answers by what it selects — the seat reads `create` makes. */
  const select = (at: string, fields: Record<string, unknown> | undefined) => {
    let forUpdate = false;
    const rows = () => {
      state.ops.push({ at, op: forUpdate ? 'select-for-update' : 'select' });
      if (fields && 'staffed' in fields) return [{ staffed: 1 }];
      if (fields && 'quantity' in fields) {
        return [{ quantity: 4, shiftDate: state.shiftUnderLock.shiftDate }];
      }
      return [];
    };
    const chain = {
      from: () => chain,
      where: () => chain,
      limit: () => chain,
      orderBy: () => chain,
      innerJoin: () => chain,
      leftJoin: () => chain,
      for: () => {
        forUpdate = true;
        return chain;
      },
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve().then(rows).then(resolve, reject),
    };
    return chain;
  };
  const client = (at: 'db' | 'tx') => ({
    at,
    execute: async (query: unknown) => {
      state.ops.push({ at, op: 'lock', query });
    },
    select: (fields?: Record<string, unknown>) => select(at, fields),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          state.ops.push({ at, op: 'insert' });
          return [{ id: 'assignment-new', ...values }];
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.ops.push({ at, op: 'update' });
            return [{ ...state.assignment, ...values }];
          },
        }),
      }),
    }),
  });
  const db = {
    ...client('db'),
    // A FRESH transaction object each time, as drizzle makes one.
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
  const at = (c: unknown) => ((c as { at?: string } | undefined)?.at === 'tx' ? 'tx' : 'db');
  return { ids, state, db, at };
});

vi.mock('@/db/index', () => ({ db: h.db }));
vi.mock('@/db/index.js', () => ({ db: h.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const scope = vi.hoisted(() => ({
  current: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
}));
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/util/org-scope');
  return { ...actual, resolveOrgScope: vi.fn(async () => scope.current) };
});
vi.mock('@/features/notification/notify.js', () => ({
  notify: vi.fn(async () => undefined),
  notifyMany: vi.fn(async () => undefined),
  resolveCoverNeeded: vi.fn(async () => undefined),
  resolveCoverNeededForShift: vi.fn(async () => undefined),
}));

import { OutletSwapControllerClass } from '@/features/outlet-swap/outlet-swap.controller';
import type { OutletSwapRepositoryClass } from '@/features/outlet-swap/outlet-swap.repository';
import type { ShiftRepositoryClass } from '@/features/shift/shift.repository';
import { ShiftAssignmentControllerClass } from './shift-assignment.controller';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';
import { PR_UNAVAILABLE_THEN } from './travel-gap';

const { HERE, FAR, SHIFT, ATLAS, RIVAL, PR, ASSIGNMENT, SWAP, ORIGIN } = h.ids;
const LOCK_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';
const PINS: Record<string, { outletId: string; lat: number; lng: number }> = {
  [HERE]: { outletId: HERE, lat: 3.139, lng: 101.6869 },
  // ~20 km away — about 80 minutes door to door.
  [FAR]: { outletId: FAR, lat: 3.0738, lng: 101.5183 },
};

const trace = () => h.state.ops.map(({ at, op }) => `${at}:${op}`);
const locks = () =>
  h.state.ops
    .filter((o) => o.op === 'lock')
    .map((o) => new PgDialect().sqlToQuery(o.query as SQL))
    .map((q) => [q.sql, q.params]);
const written = () => trace().filter((entry) => /:(insert|update|move)$/.test(entry));

/** The real repository, with the reads that answer per client faked. */
function assignments() {
  return Object.assign(new ShiftAssignmentRepositoryClass(), {
    listForPr: vi.fn(async (_prId: string, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: 'bookings' });
      return h.at(client) === 'tx' ? h.state.heldUnderLock : h.state.held;
    }),
    getOutletPin: vi.fn(async (outletId: string, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: 'pin' });
      return PINS[outletId] ?? null;
    }),
    getById: vi.fn(async () => h.state.assignment),
    listByShift: vi.fn(async () => []),
    hasFreeSeat: vi.fn(async () => ({ free: true, quantity: 4, staffed: 1 })),
  });
}

function shifts() {
  return {
    getById: vi.fn(async (_id: string, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: 'shift' });
      return h.at(client) === 'tx' ? h.state.shiftUnderLock : h.state.shift;
    }),
    isAgencyInvited: vi.fn(async () => true),
  };
}

const pr = { id: PR, userId: PR, tier: 'commission_only' };

function assignmentController() {
  return new ShiftAssignmentControllerClass(
    assignments() as unknown as ShiftAssignmentRepositoryClass,
    shifts() as unknown as ShiftRepositoryClass,
    { getById: vi.fn(async () => pr), getByUserId: vi.fn(async () => pr) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { listByUser: vi.fn(async () => [{ agencyId: ATLAS, approveStatus: 'approved' }]) } as never,
    { listApprovedOutletIdsForAgency: vi.fn(async () => [HERE]) } as never,
    {} as never,
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
      return res;
    },
  };
  return res as unknown as FakeResponse;
}

const request = (body: unknown, id?: string) =>
  ({
    params: id ? { id } : {},
    body,
    user: { id: PR },
    query: {},
    headers: {},
    header: () => undefined,
  }) as unknown as Request;

async function assign() {
  const res = fakeResponse();
  await assignmentController().create(request({ shiftId: SHIFT, prId: PR }), res);
  return res;
}

async function putBack() {
  const res = fakeResponse();
  await assignmentController().update(request({ status: 'assigned' }, ASSIGNMENT), res);
  return res;
}

function held(extra: Partial<Held> = {}): Held {
  return {
    id: 'held-1',
    shiftId: 'elsewhere',
    prId: PR,
    status: 'assigned',
    agencyId: ATLAS,
    shiftDate: '2027-03-10',
    slot: '21:00 - 01:00',
    outletId: FAR,
    outletName: 'JK House',
    outletLat: PINS[FAR].lat,
    outletLng: PINS[FAR].lng,
    checkOutAt: null,
    ...extra,
  };
}

/** Start the next request from a clean record, keeping the database as set. */
const forget = () => {
  h.state.ops = [];
};

beforeEach(() => {
  scope.current = { isAdmin: false, agencyId: ATLAS, outletIds: [] };
  h.state.shift = {
    id: SHIFT,
    agencyId: ATLAS,
    outletId: HERE,
    shiftDate: '2027-03-10',
    slot: '18:00 - 20:00',
    status: 'confirmed',
    quantity: 4,
  };
  h.state.shiftUnderLock = { ...h.state.shift };
  h.state.held = [];
  h.state.heldUnderLock = [];
  h.state.assignment = {
    id: ASSIGNMENT,
    shiftId: SHIFT,
    prId: PR,
    userId: PR,
    agencyId: ATLAS,
    status: 'cancelled',
  };
  forget();
});

const OWN_OVERLAP =
  'This PR already works 21:00 - 01:00 at JK House that day — pick a time that does not overlap.';

describe('POST /shift-assignment — the booking re-checks under the PR’s lock', () => {
  it('a clean booking: the shift’s lock, then the PR’s, then her bookings re-read — all before the seat row is locked', async () => {
    const res = await assign();

    expect(res.statusCode).toBe(201);
    expect(res.body.message).toBe('PR assigned to shift');
    const all = trace();
    const begin = all.indexOf('db:begin');
    expect(all.slice(begin, begin + 7)).toEqual([
      'db:begin',
      'tx:lock',
      'tx:lock',
      'tx:shift',
      'tx:pin',
      'tx:bookings',
      'tx:select-for-update',
    ]);
    expect(all).toContain('tx:insert');
    expect(locks()).toEqual([
      [LOCK_SQL, [`shift-seat:${SHIFT}`]],
      [LOCK_SQL, [`pr-booking:${PR}`]],
    ]);
  });

  it('her own booking that lands between the check and the lock: the check’s own 400, nothing written', async () => {
    h.state.shift = { ...h.state.shift, slot: '20:00 - 23:00' };
    h.state.shiftUnderLock = { ...h.state.shift };
    h.state.heldUnderLock = [held()];

    const underLock = await assign();

    expect(underLock.statusCode).toBe(400);
    expect(underLock.body).toEqual({ success: false, message: OWN_OVERLAP, data: null });
    expect(written()).toEqual([]);
    expect(trace()).toContain('db:rollback');
    expect(trace()).not.toContain('tx:select-for-update');

    // …which is exactly what the check answers once it can see the booking.
    forget();
    h.state.held = [held()];
    const byTheCheck = await assign();
    expect(byTheCheck.statusCode).toBe(400);
    expect(byTheCheck.body).toEqual(underLock.body);
    expect(trace()).not.toContain('db:begin');
  });

  it('a rival agency’s booking under the lock: the anonymous sentence — never its venue or hours', async () => {
    h.state.shift = { ...h.state.shift, slot: '20:00 - 23:00' };
    h.state.shiftUnderLock = { ...h.state.shift };
    h.state.heldUnderLock = [held({ agencyId: RIVAL })];

    const res = await assign();

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(PR_UNAVAILABLE_THEN);
    expect(written()).toEqual([]);
  });

  it('the same PR booked onto this shift a moment earlier: the "already assigned" 409, not a unique-index 500', async () => {
    h.state.heldUnderLock = [held({ shiftId: SHIFT, outletId: HERE })];

    const res = await assign();

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('PR is already assigned to this shift');
    expect(written()).toEqual([]);
  });

  it('judges the shift as it stands under the lock — an edit that re-timed it onto her other booking is caught', async () => {
    // The check saw 18:00-20:00, clear of her 21:00 booking; an edit then moved the shift onto it.
    h.state.held = [held()];
    h.state.heldUnderLock = [held()];
    h.state.shiftUnderLock = { ...h.state.shift, slot: '20:00 - 23:00' };

    const res = await assign();

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(OWN_OVERLAP);
    expect(written()).toEqual([]);
  });
});

describe('PUT /shift-assignment/:id — putting a cancelled PR back takes the same locks', () => {
  it('a booking that lands under the lock: the re-staff 409 in its own words, and no UPDATE', async () => {
    h.state.shift = { ...h.state.shift, slot: '20:00 - 23:00' };
    h.state.shiftUnderLock = { ...h.state.shift };
    h.state.heldUnderLock = [held()];

    const res = await putBack();

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message:
        'This PR already works 21:00 - 01:00 at JK House that day — they cannot be put back on this shift.',
      data: null,
    });
    expect(written()).toEqual([]);
    expect(locks()).toEqual([
      [LOCK_SQL, [`shift-seat:${SHIFT}`]],
      [LOCK_SQL, [`pr-booking:${PR}`]],
    ]);
  });

  it('a clean re-staff: locked, re-checked, then the seat verdict and the UPDATE', async () => {
    const res = await putBack();

    expect(res.statusCode).toBe(200);
    const all = trace();
    expect(all.indexOf('tx:bookings')).toBeLessThan(all.indexOf('tx:select-for-update'));
    expect(all).toContain('tx:update');
  });
});

describe('outlet-swap approval — the move takes the same locks', () => {
  function swapController() {
    const approve = vi.fn(
      async (params: { guard?: (tx: never) => Promise<void> }) =>
        // The move's own transaction, faked: the guard first, then the move.
        h.db.transaction(async (tx) => {
          await params.guard?.(tx as never);
          h.state.ops.push({ at: 'tx', op: 'move' });
          return { ok: true as const, request: { id: SWAP, status: 'approved' } };
        }),
    );
    const create = vi.fn(async () => {
      h.state.ops.push({ at: 'db', op: 'request' });
      return { id: SWAP };
    });
    const controller = new OutletSwapControllerClass(
      {
        getById: vi.fn(async () => ({ id: SWAP, assignmentId: ASSIGNMENT, toShiftId: SHIFT })),
        approve,
        // What raising a swap screens first: the destination's headcount and tier.
        countLiveAssignments: vi.fn(async () => new Map([[SHIFT, 1]])),
        listSwapTargets: vi.fn(async () => [{ shiftId: SHIFT, tierBlocked: false }]),
        create,
      } as unknown as OutletSwapRepositoryClass,
      assignments() as unknown as ShiftAssignmentRepositoryClass,
      shifts() as unknown as ShiftRepositoryClass,
      { getByUserId: vi.fn(async () => pr) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { controller, approve, create };
  }

  const TOO_CLOSE =
    'Another of your shifts is too close to this one — there is not enough time to travel between the venues, so this swap can no longer be approved.';

  it('a booking that OVERLAPS the destination, landing under the lock: refused — it used to be approved', async () => {
    h.state.heldUnderLock = [held()];
    const { controller } = swapController();
    const underLock = fakeResponse();

    await controller.approveMine(request({}, SWAP), underLock);

    expect(underLock.statusCode).toBe(409);
    expect(underLock.body).toEqual({ success: false, message: TOO_CLOSE, data: null });
    expect(written()).toEqual([]);

    // …and the check says the same once it can see the booking.
    forget();
    h.state.held = [held()];
    const byTheCheck = fakeResponse();
    await swapController().controller.approveMine(request({}, SWAP), byTheCheck);
    expect(byTheCheck.body).toEqual(underLock.body);
    expect(trace()).not.toContain('db:begin');
  });

  it('raising a swap onto an overlapping time: the assign lane’s own 400 — her own agency’s booking named, a rival’s never', async () => {
    const raise = async () => {
      const { controller, create } = swapController();
      const res = fakeResponse();
      await controller.create(request({ assignmentId: ASSIGNMENT, toShiftId: SHIFT }), res);
      return { res, create };
    };

    h.state.held = [held()];
    const own = await raise();
    expect(own.res.statusCode).toBe(400);
    expect(own.res.body.message).toBe(OWN_OVERLAP);
    expect(own.create).not.toHaveBeenCalled();

    h.state.held = [held({ agencyId: RIVAL })];
    const rival = await raise();
    expect(rival.res.statusCode).toBe(400);
    expect(rival.res.body.message).toBe(PR_UNAVAILABLE_THEN);
    expect(rival.create).not.toHaveBeenCalled();

    h.state.held = [];
    const clear = await raise();
    expect(clear.res.statusCode).toBe(201);
    expect(clear.create).toHaveBeenCalledTimes(1);
  });

  beforeEach(() => {
    // She is being moved from ORIGIN onto SHIFT, 20:00-23:00 at HERE.
    h.state.assignment = { ...h.state.assignment, shiftId: ORIGIN, status: 'assigned' };
    h.state.shift = { ...h.state.shift, slot: '20:00 - 23:00' };
    h.state.shiftUnderLock = { ...h.state.shift };
  });

  it('a rival booking too far to travel from, landing under the lock: the PR’s plain 409, and nothing moves', async () => {
    h.state.heldUnderLock = [held({ agencyId: RIVAL, slot: '17:00 - 19:30' })];
    const { controller } = swapController();
    const res = fakeResponse();

    await controller.approveMine(request({}, SWAP), res);

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'Another of your shifts is too close to this one — there is not enough time to travel between the venues, so this swap can no longer be approved.',
    );
    expect(written()).toEqual([]);
    expect(locks()).toEqual([
      [LOCK_SQL, [`shift-seat:${SHIFT}`]],
      [LOCK_SQL, [`pr-booking:${PR}`]],
    ]);
  });

  it('a clean approval still moves her', async () => {
    const { controller, approve } = swapController();
    const res = fakeResponse();

    await controller.approveMine(request({}, SWAP), res);

    expect(res.statusCode).toBe(200);
    expect(approve).toHaveBeenCalledWith(expect.objectContaining({ guard: expect.any(Function) }));
    expect(written()).toEqual(['tx:move']);
  });
});
