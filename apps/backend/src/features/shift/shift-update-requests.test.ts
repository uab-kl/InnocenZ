import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * EDITING A SHIFT NO LONGER DROPS ITS NAMED PRs (29 Sep 2026 audit).
 *
 * `PUT /shift/:id` parsed `requestedPrs` (and `agencyIds`) through the shared
 * schema and then spread them into the shift UPDATE, where drizzle ignores any
 * key that is not a column — so an edit that renamed the venue's picks answered
 * "Shift updated" and changed nothing. Pinned here:
 *
 *  - named picks are RE-RESOLVED against the agencies invited on the shift, the
 *    same rule create uses, and handed to the repository to replace atomically;
 *  - an absent list leaves the picks alone, an empty one clears them;
 *  - changing the invited agencies is refused out loud, never ignored;
 *  - a template that is not the venue's own is refused, as on create;
 *  - the list tells the VENUE which agencies it sent each shift to, and tells an
 *    agency nothing about who else was asked.
 */

const OUTLET = '11111111-1111-4111-8111-111111111111';
const SHIFT = '22222222-2222-4222-8222-222222222222';
const ATLAS = '33333333-3333-4333-8333-333333333333';
const WWM = '44444444-4444-4444-8444-444444444444';
const VICKY = '55555555-5555-4555-8555-555555555555';
const ALICE = '66666666-6666-4666-8666-666666666666';

const h = vi.hoisted(() => ({
  scope: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
  ownsTemplate: true,
  pairs: [] as { userId: string; agencyId: string }[],
}));

vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('@/util/org-scope');
  return { ...actual, resolveOrgScope: vi.fn(async () => h.scope) };
});
vi.mock('@/features/subscription/plan-limit', () => ({
  resolveActivePlanLimit: vi.fn(async () => ({ kind: 'unknown' })),
  outletDailyPrUsage: vi.fn(async () => 0),
}));
const listMembershipPairs = vi.hoisted(() =>
  vi.fn(async (_userIds: string[], _agencyIds: string[]) => h.pairs),
);
vi.mock('@/features/pr-personnel/pr.repository', () => ({ listMembershipPairs }));
vi.mock('@/features/shift-template/shift-template.repository', () => ({
  shiftTemplateBelongsToOutlet: vi.fn(async () => h.ownsTemplate),
}));
vi.mock('@/features/notification/notify.js', () => ({ notifyMany: vi.fn() }));

import { ShiftControllerClass } from './shift.controller';
import type { ShiftRepositoryClass } from './shift.repository';

const existingShift = {
  id: SHIFT,
  agencyId: ATLAS,
  outletId: OUTLET,
  shiftDate: '2026-10-10',
  slot: '22:00 - 04:00',
  eventName: 'Friday lounge',
  quantity: 4,
  status: 'confirmed',
};

function fakeShiftRepository() {
  return {
    getById: vi.fn(async () => existingShift),
    listPayTiersForShift: vi.fn(async () => []),
    listByOutletAroundDate: vi.fn(async () => []),
    listAgencyIdsForShifts: vi.fn(async (ids: string[]) => new Map(ids.map((id) => [id, [ATLAS, WWM]]))),
    updateWithPayTiers: vi.fn(async () => existingShift),
    listPaginated: vi.fn(async () => ({ shifts: [existingShift], totalCount: 1 })),
    listPayTiersForShifts: vi.fn(async () => new Map()),
    countStaffedForShifts: vi.fn(async () => new Map()),
    listRequestedPrsForShifts: vi.fn(async () => new Map()),
    // The event's own prices (0167) — none here; see shift-special-event.controller.test.ts.
    listEventDrinkMenuForShifts: vi.fn(async () => new Map()),
    listEventDrinkMenuForShift: vi.fn(async () => []),
  };
}

type Body = { success: boolean; message: string; data: unknown };
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
      return res;
    },
  };
  return res as unknown as Response & FakeResponse;
}

function controllerWith(repo: ReturnType<typeof fakeShiftRepository>) {
  const unused = {} as never;
  return new ShiftControllerClass(
    repo as unknown as ShiftRepositoryClass,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
}

function put(body: Record<string, unknown>) {
  return { params: { id: SHIFT }, body, user: { id: 'owner-1' }, query: {} } as unknown as Request;
}

beforeEach(() => {
  h.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET] };
  h.ownsTemplate = true;
  h.pairs = [];
  listMembershipPairs.mockClear();
});

describe('PUT /shift/:id keeps the venue’s named PRs', () => {
  it('re-resolves the picks against the invited agencies and replaces them with the edit', async () => {
    h.pairs = [
      { userId: VICKY, agencyId: ATLAS },
      { userId: VICKY, agencyId: WWM },
      { userId: ALICE, agencyId: WWM },
    ];
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).update(
      put({
        // The client's pairing is advisory — Vicky is named once, through Atlas.
        requestedPrs: [
          { userId: VICKY, agencyId: ATLAS },
          { userId: VICKY, agencyId: ATLAS },
          { userId: ALICE, agencyId: ATLAS },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(200);
    // Deduped people, and the agencies THIS shift was sent to — never the client's.
    expect(listMembershipPairs).toHaveBeenCalledWith([VICKY, ALICE], [ATLAS, WWM]);
    const call = repo.updateWithPayTiers.mock.calls[0] as unknown[];
    expect(call[4]).toEqual(h.pairs);
    // Not a shift column: it must never reach the UPDATE itself.
    expect(call[1]).not.toHaveProperty('requestedPrs');
  });

  it('an empty list clears the picks; an absent one leaves them alone', async () => {
    const cleared = fakeShiftRepository();
    await controllerWith(cleared).update(put({ requestedPrs: [] }), fakeResponse());
    expect((cleared.updateWithPayTiers.mock.calls[0] as unknown[])[4]).toEqual([]);
    listMembershipPairs.mockClear();

    const untouched = fakeShiftRepository();
    await controllerWith(untouched).update(put({ quantity: 5 }), fakeResponse());
    expect((untouched.updateWithPayTiers.mock.calls[0] as unknown[])[4]).toBeUndefined();
    expect(listMembershipPairs).toHaveBeenCalledTimes(0);
  });

  it('refuses to re-address the shift instead of silently ignoring it', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).update(put({ agencyIds: [WWM] }), res);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/cannot be changed/);
    expect(repo.updateWithPayTiers).not.toHaveBeenCalled();
  });

  it('refuses a template that is not this venue’s own', async () => {
    h.ownsTemplate = false;
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).update(
      put({ templateId: '77777777-7777-4777-8777-777777777777' }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(repo.updateWithPayTiers).not.toHaveBeenCalled();
  });
});

describe('GET /shift names who the venue sent each shift to', () => {
  const list = { query: {}, user: { id: 'u-1' } } as unknown as Request;

  it('tells the venue its invited agencies', async () => {
    const res = fakeResponse();
    await controllerWith(fakeShiftRepository()).list(list, res);

    const rows = res.body.data as { agencyIds?: string[] }[];
    expect(rows[0]?.agencyIds).toEqual([ATLAS, WWM]);
  });

  it('tells an agency nothing about who else was asked', async () => {
    h.scope = { isAdmin: false, agencyId: ATLAS, outletIds: [] };
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).list(list, res);

    const rows = res.body.data as Record<string, unknown>[];
    expect(rows[0]).not.toHaveProperty('agencyIds');
    expect(repo.listAgencyIdsForShifts).not.toHaveBeenCalled();
  });
});
