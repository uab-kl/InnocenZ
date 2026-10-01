import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `PUT /shift/:id` — THE EDIT'S OTHER RACES (30 Sep 2026).
 *
 *  - MOVING A SHIFT IN TIME beside a booking of one of its PRs elsewhere: the
 *    double-booking rule now re-reads her bookings inside the write, under the
 *    venue's lock, this shift's seat lock and her booking lock — in that order.
 *  - AN ADMIN MOVING A SHIFT TO ANOTHER VENUE answers to that venue's rules —
 *    clash, live, plan — before the write and again under both venues' locks.
 *
 * The REAL controller, rules and repository write over a fake database whose
 * reads answer differently inside the write than outside it. Nothing here can
 * reach the shared database.
 */

type Row = { id: string; shiftDate: string; slot: string | null; eventName: string | null };
type Booking = { shiftId: string; status: string; shiftDate: string; slot: string | null; outletId: string };
type Op = { at: string; op: string; query?: unknown };

const h = vi.hoisted(() => {
  const ids = {
    A: '11111111-1111-4111-8111-111111111111',
    B: '22222222-2222-4222-8222-222222222222',
    SHIFT: '33333333-3333-4333-8333-333333333333',
    ATLAS: '44444444-4444-4444-8444-444444444444',
    PR: '66666666-6666-4666-8666-666666666666',
    PR_2: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  };
  const state = {
    scope: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
    existing: {} as Record<string, unknown>,
    /** Each venue's stored shifts, through the pool and under the lock. */
    stored: {} as Record<string, Row[]>,
    storedUnderLock: {} as Record<string, Row[]>,
    /** Headcount asked per `outlet|date`, through the pool and under the lock. */
    used: {} as Record<string, number>,
    usedUnderLock: {} as Record<string, number>,
    venueStatus: {} as Record<string, string>,
    /** A venue's status as the write re-reads it under the lock, when it changed. */
    venueStatusUnderLock: {} as Record<string, string>,
    /** The agencies the shift was sent to, and each venue's approved ones. */
    invited: [] as string[],
    approved: {} as Record<string, string[]>,
    /** The approved-agencies read itself FAILS (1 Oct 2026). */
    approvedReadFails: false,
    /** Whose card each template is — any template is the asking venue's unless named here. */
    templateOwner: {} as Record<string, string>,
    /** Who is on the shift, and each PR's other bookings — pool / under the lock. */
    onShift: [] as { prId: string; status: string }[],
    onShiftUnderLock: [] as { prId: string; status: string }[],
    /** Successive answers under the lock, when a PR leaves between two reads. */
    onShiftUnderLockReads: [] as { prId: string; status: string }[][],
    bookings: {} as Record<string, Booking[]>,
    bookingsUnderLock: {} as Record<string, Booking[]>,
    ops: [] as Op[],
  };
  const client = (at: 'db' | 'tx') => ({
    at,
    execute: async (query: unknown) => {
      state.ops.push({ at, op: 'lock', query });
    },
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            state.ops.push({ at, op: 'update', query: values });
            return [{ ...state.existing, ...values }];
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
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/util/org-scope');
  return { ...actual, resolveOrgScope: vi.fn(async () => h.state.scope) };
});
const resolveActivePlanLimit = vi.hoisted(() =>
  vi.fn(async (params: { subscriberId: string }, client?: unknown) => {
    h.state.ops.push({ at: h.at(client), op: `plan@${params.subscriberId.slice(0, 1)}` });
    return { kind: 'plan', planName: 'Growth', limitAmount: 10 };
  }),
);
vi.mock('@/features/subscription/plan-limit', () => ({
  resolveActivePlanLimit,
  outletDailyPrUsage: vi.fn(
    async (params: { outletId: string; shiftDate: string }, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: `usage@${params.outletId.slice(0, 1)}` });
      const used = h.at(client) === 'tx' ? h.state.usedUnderLock : h.state.used;
      return used[`${params.outletId}|${params.shiftDate}`] ?? 0;
    },
  ),
}));
vi.mock('@/features/pr-personnel/pr.repository', () => ({ listMembershipPairs: vi.fn(async () => []) }));
vi.mock('@/features/shift-template/shift-template.repository', () => ({
  shiftTemplateBelongsToOutlet: vi.fn(
    async (templateId: string, outletId: string) =>
      (h.state.templateOwner[templateId] ?? outletId) === outletId,
  ),
}));
vi.mock('@/features/notification/notify.js', () => ({ notifyMany: vi.fn(async () => undefined) }));

import { ShiftControllerClass } from './shift.controller';
import { ShiftRepositoryClass } from './shift.repository';

const { A, B, SHIFT, ATLAS, PR, PR_2 } = h.ids;
const LOCK_SQL = 'select pg_advisory_xact_lock(hashtextextended($1, 0))';

const trace = () => h.state.ops.map(({ at, op }) => `${at}:${op}`);
const locks = () =>
  h.state.ops
    .filter((o) => o.op === 'lock')
    .map((o) => new PgDialect().sqlToQuery(o.query as SQL).params);
const updated = () => h.state.ops.filter((o) => o.op === 'update');

function controller() {
  const shifts = Object.assign(new ShiftRepositoryClass(), {
    getById: vi.fn(async () => h.state.existing),
    listPayTiersForShift: vi.fn(async () => []),
    // Keyed in lower case, as the database returns a uuid whatever case it was asked in.
    listAgencyIdsForShifts: vi.fn(
      async (shiftIds: string[]) =>
        new Map(shiftIds.map((id) => [id.toLowerCase(), h.state.invited])),
    ),
    listByOutletAroundDate: vi.fn(
      async (params: { outletId: string }, client?: unknown) => {
        h.state.ops.push({ at: h.at(client), op: `shifts@${params.outletId.slice(0, 1)}` });
        const stored = h.at(client) === 'tx' ? h.state.storedUnderLock : h.state.stored;
        return stored[params.outletId] ?? [];
      },
    ),
  });
  const assignments = {
    listByShift: vi.fn(async (_id: string, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: 'on-shift' });
      if (h.at(client) !== 'tx') return h.state.onShift;
      return h.state.onShiftUnderLockReads.shift() ?? h.state.onShiftUnderLock;
    }),
    listForPr: vi.fn(async (prId: string, client?: unknown) => {
      h.state.ops.push({ at: h.at(client), op: 'bookings' });
      const bookings = h.at(client) === 'tx' ? h.state.bookingsUnderLock : h.state.bookings;
      return bookings[prId] ?? [];
    }),
  };
  return {
    assignments,
    controller: new ShiftControllerClass(
      shifts,
      {} as never,
      {} as never,
      {} as never,
      {
        getById: vi.fn(async (id: string, client?: unknown) => {
          const underLock = h.at(client) === 'tx';
          if (underLock) h.state.ops.push({ at: 'tx', op: `venue@${id.slice(0, 1)}` });
          const status =
            (underLock ? h.state.venueStatusUnderLock[id] : undefined) ??
            h.state.venueStatus[id] ??
            'active';
          return { id, status, name: 'Venue' };
        }),
      } as never,
      assignments as never,
      {
        listApprovedAgencyIdsForOutlet: vi.fn(async (outletId: string) => {
          if (h.state.approvedReadFails) throw new Error('connection reset');
          return h.state.approved[outletId] ?? [ATLAS];
        }),
      } as never,
    ),
  };
}

type Body = { success: boolean; message?: string; data: unknown };
type FakeResponse = Response & { statusCode: number; body: Body };

async function edit(body: Record<string, unknown>, id: string = SHIFT) {
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
  const req = { params: { id }, body, user: { id: 'owner-1' }, query: {} } as unknown as Request;
  const built = controller();
  await built.controller.update(req, res as unknown as Response);
  return Object.assign(res as unknown as FakeResponse, { assignments: built.assignments });
}

const forget = () => {
  h.state.ops = [];
};

beforeEach(() => {
  h.state.scope = { isAdmin: false, agencyId: null, outletIds: [A] };
  h.state.existing = {
    id: SHIFT,
    agencyId: ATLAS,
    outletId: A,
    shiftDate: '2027-03-10',
    slot: '20:00 - 23:00',
    eventName: 'Friday lounge',
    eventKind: 'normal',
    specialEventType: null,
    customSpecialEventName: null,
    quantity: 4,
    status: 'confirmed',
  };
  h.state.stored = {};
  h.state.storedUnderLock = {};
  h.state.used = {};
  h.state.usedUnderLock = {};
  h.state.venueStatus = {};
  h.state.venueStatusUnderLock = {};
  h.state.invited = [ATLAS];
  h.state.approved = {};
  h.state.approvedReadFails = false;
  h.state.templateOwner = {};
  h.state.onShift = [{ prId: PR, status: 'assigned' }];
  h.state.onShiftUnderLock = [{ prId: PR, status: 'assigned' }];
  h.state.onShiftUnderLockReads = [];
  h.state.bookings = {};
  h.state.bookingsUnderLock = {};
  forget();
});

const AWAY = 'A PR on this shift is not available at that time — pick another time, or unassign them here.';
/** Her other booking, 23:30 – 03:00 — clear of 20:00 – 23:00, inside 21:00 – 01:00. */
const lateElsewhere = (outletId: string): Booking => ({
  shiftId: 'elsewhere',
  status: 'assigned',
  shiftDate: '2027-03-10',
  slot: '23:30 - 03:00',
  outletId,
});

describe('PUT /shift/:id — moving a shift in time re-checks its PRs under their locks', () => {
  it('her booking at another venue lands between the check and the lock: the anonymous 400, and no UPDATE', async () => {
    h.state.bookingsUnderLock = { [PR]: [lateElsewhere(B)] };

    const underLock = await edit({ slot: '21:00 - 01:00' });

    expect(underLock.statusCode).toBe(400);
    expect(underLock.body).toEqual({ success: false, message: AWAY, data: null });
    expect(updated()).toEqual([]);
    expect(trace()).toContain('db:rollback');

    // The one order: the venue, then this shift's seats, then the PR — before any row.
    expect(locks()).toEqual([[`shift-post:${A}`], [`shift-seat:${SHIFT}`], [`pr-booking:${PR}`]]);
    const all = trace();
    const inside = all.slice(all.indexOf('db:begin') + 1, all.indexOf('db:rollback'));
    expect(inside).toEqual([
      'tx:lock',
      'tx:shifts@1',
      'tx:plan@1',
      'tx:usage@1',
      'tx:lock',
      'tx:on-shift',
      'tx:lock',
      'tx:on-shift',
      'tx:bookings',
    ]);

    // …exactly what the check answers once it can see the booking.
    forget();
    h.state.bookings = { [PR]: [lateElsewhere(B)] };
    const byTheCheck = await edit({ slot: '21:00 - 01:00' });
    expect(byTheCheck.body).toEqual(underLock.body);
    expect(trace()).not.toContain('db:begin');
  });

  it('at this venue it is named as this venue’s own shift', async () => {
    h.state.bookingsUnderLock = { [PR]: [lateElsewhere(A)] };

    const res = await edit({ slot: '21:00 - 01:00' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(
      'That time clashes with another shift this PR works here (23:30 - 03:00) — move that one first, or unassign them here.',
    );
  });

  it('locks every PR on the shift, distinct and sorted', async () => {
    const both = [
      { prId: PR_2, status: 'assigned' },
      { prId: PR, status: 'assigned' },
      // A cancelled row puts nobody there and is neither locked nor checked.
      { prId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'cancelled' },
    ];
    h.state.onShift = both;
    h.state.onShiftUnderLock = both;
    h.state.bookingsUnderLock = { [PR_2]: [lateElsewhere(B)] };

    const res = await edit({ slot: '21:00 - 01:00' });

    expect(res.statusCode).toBe(400);
    expect(locks()).toEqual([
      [`shift-post:${A}`],
      [`shift-seat:${SHIFT}`],
      [`pr-booking:${PR}`],
      [`pr-booking:${PR_2}`],
    ]);
  });

  it('checks only the PRs still on the shift once their locks are held', async () => {
    // Read under the lock: both on. Re-read after their locks: PR_2 has come off —
    // her clash elsewhere is no longer this shift's business.
    h.state.onShift = [
      { prId: PR_2, status: 'assigned' },
      { prId: PR, status: 'assigned' },
    ];
    h.state.onShiftUnderLockReads = [h.state.onShift, [{ prId: PR, status: 'assigned' }]];
    h.state.bookingsUnderLock = { [PR_2]: [lateElsewhere(B)] };

    const res = await edit({ slot: '21:00 - 01:00' });

    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveLength(1);
  });

  it('an edit that does not move the shift in time takes no seat or PR lock', async () => {
    const res = await edit({ quantity: 5 });

    expect(res.statusCode).toBe(200);
    expect(locks()).toEqual([[`shift-post:${A}`]]);
    expect(trace()).not.toContain('tx:bookings');
  });

  it('a shift id in capitals: her booking on THIS shift is still this shift, not a clash', async () => {
    // An id WITH letters — SHIFT's is all digits, so capitals would not change it.
    const LETTERED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    h.state.existing = { ...h.state.existing, id: LETTERED };
    // Her bookings carry this very shift at its stored time, which the new time overlaps.
    const ownBooking: Booking = {
      shiftId: LETTERED,
      status: 'assigned',
      shiftDate: '2027-03-10',
      slot: '20:00 - 23:00',
      outletId: A,
    };
    h.state.bookings = { [PR]: [ownBooking] };
    h.state.bookingsUnderLock = { [PR]: [ownBooking] };

    const res = await edit({ slot: '21:00 - 01:00' }, LETTERED.toUpperCase());

    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveLength(1);
  });
});

describe('PUT /shift/:id — an admin moving a shift to another venue answers to that venue', () => {
  beforeEach(() => {
    h.state.scope = { isAdmin: true, agencyId: null, outletIds: [] };
  });

  const ON_B_AT_EIGHT: Row = { id: 'b-1', shiftDate: '2027-03-10', slot: '20:00 - 23:00', eventName: 'Ladies Night' };
  const SAME_TIME_AT_B =
    'You already have a shift at 20:00 - 23:00 on 2027-03-10 ("Ladies Night"). ' +
    "Raise that shift's headcount instead of posting a second one for the same time.";
  const ONLY_SOME =
    "Only some of this shift's agencies are approved for that outlet — " +
    'link the others to it first, or withdraw the shift and post it again';

  it('the target’s clash, read at the TARGET: 409 with the target shift named', async () => {
    h.state.stored = { [B]: [ON_B_AT_EIGHT] };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, message: SAME_TIME_AT_B, data: null });
    expect(trace()).toContain('db:shifts@2');
    expect(trace()).not.toContain('db:shifts@1');
    expect(trace()).not.toContain('db:begin');
  });

  it('a target that is not live: 403 with the post’s own sentence', async () => {
    h.state.venueStatus = { [B]: 'suspended' };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(
      'This venue is suspended and cannot post shifts. Contact InnocenZ to restore access.',
    );
  });

  it('the target’s plan, counted on the TARGET’s day: 409', async () => {
    h.state.used = { [`${B}|2027-03-10`]: 8 };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(
      'Your Growth plan covers 10 PRs a day. 8 already requested on 2027-03-10, ' +
        'so this shift can ask for at most 2 more — lower the headcount or upgrade the plan.',
    );
  });

  it('a clash that lands at the target under the lock: the same 409 — both venues locked, sorted', async () => {
    h.state.storedUnderLock = { [B]: [ON_B_AT_EIGHT] };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SAME_TIME_AT_B);
    expect(updated()).toEqual([]);
    expect(locks()).toEqual([[`shift-post:${A}`], [`shift-post:${B}`]]);
  });

  it('a clean move: checked at the target, both venues locked, re-checked, then written there', async () => {
    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(200);
    expect(locks()).toEqual([[`shift-post:${A}`], [`shift-post:${B}`]]);
    expect(updated()).toHaveLength(1);
    expect(updated()[0].query).toMatchObject({ outletId: B });
    // Under both locks: the target's clock, its status, its plan and its day,
    // all through the transaction.
    const all = trace();
    expect(all.slice(all.indexOf('db:begin'))).toEqual([
      'db:begin',
      'tx:lock',
      'tx:lock',
      'tx:shifts@2',
      'tx:venue@2',
      'tx:plan@2',
      'tx:usage@2',
      'tx:update',
      'db:commit',
    ]);
  });

  it('a target suspended between the check and the lock: the live 403, and no UPDATE', async () => {
    h.state.venueStatusUnderLock = { [B]: 'suspended' };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(
      'This venue is suspended and cannot post shifts. Contact InnocenZ to restore access.',
    );
    expect(updated()).toEqual([]);
  });

  it('its agencies must all be approved at the target — 403 saying only some or none are, and 400 when it has none', async () => {
    const WWM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const DELTA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    h.state.invited = [ATLAS, WWM];
    h.state.approved = { [B]: [ATLAS] };

    // Atlas IS approved there: "none" would overstate it (1 Oct 2026).
    const partly = await edit({ outletId: B });
    expect(partly.statusCode).toBe(403);
    expect(partly.body).toEqual({ success: false, message: ONLY_SOME, data: null });

    // Not one of its agencies is approved there: the post's own sentence.
    h.state.approved = { [B]: [DELTA] };
    const noneOfThem = await edit({ outletId: B });
    expect(noneOfThem.statusCode).toBe(403);
    expect(noneOfThem.body.message).toBe('None of the selected agencies are approved for this outlet');

    h.state.approved = { [B]: [] };
    const none = await edit({ outletId: B });
    expect(none.statusCode).toBe(400);
    expect(none.body.message).toBe(
      'No approved agency to request PR from — link an agency in Settings first',
    );

    forget();
    h.state.approved = { [B]: [WWM, ATLAS] };
    const all = await edit({ outletId: B });
    expect(all.statusCode).toBe(200);
  });

  it('an agency named in capitals is the same agency — Postgres reads a uuid in either case', async () => {
    // An id WITH letters: Atlas's is all digits, so capitals would not change it.
    const WWM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    expect(WWM.toUpperCase()).not.toBe(WWM);
    h.state.invited = [WWM];
    h.state.approved = { [B]: [WWM] };

    const res = await edit({ outletId: B, agencyId: WWM.toUpperCase() });

    expect(res.statusCode).toBe(200);
    expect(updated()).toHaveLength(1);
  });

  it('a new anchor the target has not approved is refused too — it is one of the shift’s agencies', async () => {
    // Every invited agency is approved at B; only the anchor the edit names is not.
    const ZETA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    h.state.invited = [ATLAS];
    h.state.approved = { [B]: [ATLAS] };

    const res = await edit({ outletId: B, agencyId: ZETA });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(ONLY_SOME);
    expect(updated()).toEqual([]);
  });

  it('a shift id in capitals still finds the agencies the shift was sent to', async () => {
    const LETTERED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const WWM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    h.state.existing = { ...h.state.existing, id: LETTERED };
    h.state.invited = [ATLAS, WWM];
    h.state.approved = { [B]: [ATLAS] };

    // Read under the URL's capitals, the map missed and only the anchor (approved) was checked.
    const res = await edit({ outletId: B }, LETTERED.toUpperCase());

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe(ONLY_SOME);
    expect(updated()).toEqual([]);
  });

  it('a failed read of the target’s approved agencies: 500, never the Settings sentence, and no UPDATE', async () => {
    h.state.approvedReadFails = true;

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal Server Error', data: null });
    expect(updated()).toEqual([]);
    expect(trace()).not.toContain('db:begin');
  });

  it('its template must be the TARGET’s card — the one it carries, or the one the edit names', async () => {
    h.state.existing = { ...h.state.existing, templateId: 'card-of-a' };
    h.state.templateOwner = { 'card-of-a': A, 'card-of-b': B };

    const carried = await edit({ outletId: B });
    expect(carried.statusCode).toBe(400);
    expect(carried.body).toEqual({
      success: false,
      message: 'Unknown event template for this outlet',
      data: null,
    });

    const named = await edit({ outletId: B, templateId: '99999999-9999-4999-8999-999999999999' });
    expect(named.statusCode).toBe(200);

    h.state.templateOwner = { ...h.state.templateOwner, '99999999-9999-4999-8999-999999999999': A };
    const namedForA = await edit({ outletId: B, templateId: '99999999-9999-4999-8999-999999999999' });
    expect(namedForA.statusCode).toBe(400);
    expect(updated()).toHaveLength(1);
  });

  it('an OUTLET’s outletId is not a move — dropped, as it always was, and no target rules run', async () => {
    h.state.scope = { isAdmin: false, agencyId: null, outletIds: [A] };
    h.state.venueStatus = { [B]: 'suspended' };

    const res = await edit({ outletId: B });

    expect(res.statusCode).toBe(200);
    expect(updated()[0].query).not.toHaveProperty('outletId');
    expect(locks()).toEqual([[`shift-post:${A}`]]);
  });
});
