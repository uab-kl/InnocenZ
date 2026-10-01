import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A SPECIAL NIGHT'S TYPE, NAME AND PRICES NOW REACH THE DATABASE (0167).
 *
 * Post Job collected the sub-type, the "Other" name and the event's own price
 * list, and the post dropped all three — a blank VIP night came back a bare
 * "Special" priced from the everyday list. Pinned here against fakes
 * (`@/db/index` is stubbed, so nothing can reach the shared database):
 *
 *  - a post hands the normalised columns to the shift insert and the parsed
 *    price rows to the repository, which writes them in the shift's transaction;
 *  - a normal post stores none of it, whatever the composer carried over;
 *  - an edit keeps what it does not name, clears the prices when the shift turns
 *    normal, and a status change touches none of it;
 *  - both reads serve the event's own prices, asking only about special shifts.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));

const OUTLET = '11111111-1111-4111-8111-111111111111';
const SHIFT = '22222222-2222-4222-8222-222222222222';
const NORMAL_SHIFT = '33333333-3333-4333-8333-333333333333';
const ATLAS = '44444444-4444-4444-8444-444444444444';

const h = vi.hoisted(() => ({
  scope: { isAdmin: false, agencyId: null as string | null, outletIds: [] as string[] },
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
vi.mock('@/features/pr-personnel/pr.repository', () => ({
  listMembershipPairs: vi.fn(async () => []),
}));
vi.mock('@/features/shift-template/shift-template.repository', () => ({
  shiftTemplateBelongsToOutlet: vi.fn(async () => true),
}));
vi.mock('@/features/notification/notify.js', () => ({ notifyMany: vi.fn() }));

import { ShiftControllerClass } from './shift.controller';
import type { ShiftRepositoryClass } from './shift.repository';

const storedSpecial = {
  id: SHIFT,
  agencyId: ATLAS,
  outletId: OUTLET,
  shiftDate: '2026-10-10',
  slot: '22:00 - 04:00',
  eventName: 'Whisky night',
  eventKind: 'special',
  specialEventType: 'other',
  customSpecialEventName: 'Whisky tasting',
  quantity: 4,
  status: 'confirmed',
};
const storedNormal = {
  ...storedSpecial,
  id: NORMAL_SHIFT,
  eventName: 'Friday lounge',
  eventKind: 'normal',
  specialEventType: null,
  customSpecialEventName: null,
};
const cosmoRow = {
  id: 'row-1',
  shiftId: SHIFT,
  slug: 'cosmo',
  name: 'Cosmo',
  priceRm: '180.00',
  category: 'drink',
  sortOrder: 0,
};

function fakeShiftRepository(existing: Record<string, unknown> = storedSpecial) {
  return {
    getById: vi.fn(async () => existing),
    listPayTiersForShift: vi.fn(async () => []),
    listByOutletAroundDate: vi.fn(async () => []),
    listAgencyIdsForShifts: vi.fn(
      async (ids: string[]) => new Map(ids.map((id) => [id, [ATLAS]])),
    ),
    createWithPayTiers: vi.fn(async () => ({ ...storedSpecial })),
    updateWithPayTiers: vi.fn(async () => existing),
    listPaginated: vi.fn(async () => ({ shifts: [storedSpecial, storedNormal], totalCount: 2 })),
    listPayTiersForShifts: vi.fn(async () => new Map()),
    countStaffedForShifts: vi.fn(async () => new Map()),
    listRequestedPrsForShifts: vi.fn(async () => new Map()),
    listEventDrinkMenuForShifts: vi.fn(async () => new Map([[SHIFT, [cosmoRow]]])),
    listEventDrinkMenuForShift: vi.fn(async () => [cosmoRow]),
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
  return new ShiftControllerClass(
    repo as unknown as ShiftRepositoryClass,
    // The post-notification reads the invited agencies' members; none here.
    { listByAgency: vi.fn(async () => []) } as never,
    {} as never,
    {} as never,
    // The venue is live, so the post is allowed through.
    { getById: vi.fn(async () => ({ id: OUTLET, status: 'active', name: 'Venue' })) } as never,
    {} as never,
    { listApprovedAgencyIdsForOutlet: vi.fn(async () => [ATLAS]) } as never,
  );
}

function request(body: Record<string, unknown>, id?: string) {
  return {
    params: id ? { id } : {},
    body,
    user: { id: 'owner-1' },
    query: {},
    headers: {},
    header: () => undefined,
  } as unknown as Request;
}

const post = (body: Record<string, unknown>) =>
  request({ outletId: OUTLET, shiftDate: '2026-10-10', slot: '22:00 - 04:00', quantity: 4, ...body });

beforeEach(() => {
  h.scope = { isAdmin: false, agencyId: null, outletIds: [OUTLET] };
});

describe('POST /shift keeps the special night', () => {
  it('writes the type and the trimmed "Other" name, and hands the prices to the same transaction', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).create(
      post({
        eventKind: 'special',
        specialEventType: 'other',
        customSpecialEventName: '  Whisky tasting ',
        eventDrinkMenu: [
          { slug: 'cosmo', name: 'Cosmo', priceRm: 180, category: 'drink', sortOrder: 0 },
          { slug: 'tips', name: 'Tips', priceRm: 50, category: 'tip', sortOrder: 1 },
        ],
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    const call = repo.createWithPayTiers.mock.calls[0] as unknown[];
    expect(call[0]).toMatchObject({
      eventKind: 'special',
      specialEventType: 'other',
      customSpecialEventName: 'Whisky tasting',
    });
    // A child table, never a shift column.
    expect(call[0]).not.toHaveProperty('eventDrinkMenu');
    expect(call[5]).toEqual([
      { slug: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink', sortOrder: 0 },
      { slug: 'tips', name: 'Tips', priceRm: '50.00', category: 'tip', sortOrder: 1 },
    ]);
  });

  it('a normal post stores no sub-type and no event prices, whatever the composer carried', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).create(
      post({
        eventKind: 'normal',
        specialEventType: 'vip',
        customSpecialEventName: 'Stale',
        eventDrinkMenu: [{ slug: 'cosmo', name: 'Cosmo', priceRm: 180, category: 'drink' }],
      }),
      res,
    );

    expect(res.statusCode).toBe(201);
    const call = repo.createWithPayTiers.mock.calls[0] as unknown[];
    expect(call[0]).toMatchObject({ specialEventType: null, customSpecialEventName: null });
    expect(call[5]).toBeUndefined();
  });

  it('refuses a price list the schema cannot store, before anything is written', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();

    await controllerWith(repo).create(
      post({
        eventKind: 'special',
        eventDrinkMenu: [{ slug: 'cosmo', name: 'Cosmo', priceRm: -5, category: 'drink' }],
      }),
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(repo.createWithPayTiers).not.toHaveBeenCalled();
  });
});

describe('PUT /shift/:id and the special night', () => {
  it('a status change touches none of it', async () => {
    const repo = fakeShiftRepository();
    await controllerWith(repo).update(request({ status: 'confirmed' }, SHIFT), fakeResponse());

    const call = repo.updateWithPayTiers.mock.calls[0] as unknown[];
    expect(call[1]).not.toHaveProperty('specialEventType');
    expect(call[1]).not.toHaveProperty('customSpecialEventName');
    expect(call[5]).toBeUndefined();
  });

  it('turning the night normal clears its type, name and prices together', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).update(request({ eventKind: 'normal' }, SHIFT), res);

    expect(res.statusCode).toBe(200);
    const call = repo.updateWithPayTiers.mock.calls[0] as unknown[];
    expect(call[1]).toMatchObject({
      eventKind: 'normal',
      specialEventType: null,
      customSpecialEventName: null,
    });
    expect(call[5]).toEqual([]);
  });

  it('an empty price list clears the prices and keeps the stored type and name', async () => {
    const repo = fakeShiftRepository();
    await controllerWith(repo).update(request({ eventDrinkMenu: [] }, SHIFT), fakeResponse());

    const call = repo.updateWithPayTiers.mock.calls[0] as unknown[];
    expect(call[1]).toMatchObject({
      specialEventType: 'other',
      customSpecialEventName: 'Whisky tasting',
    });
    expect(call[5]).toEqual([]);
    // The named-PR argument is untouched by any of this.
    expect(call[4]).toBeUndefined();
  });
});

describe('GET /shift serves the event’s own prices', () => {
  it('the list attaches them, asking only about special shifts', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).list(request({}), res);

    expect(repo.listEventDrinkMenuForShifts).toHaveBeenCalledWith([SHIFT]);
    const rows = res.body.data as { id: string; eventDrinkMenu?: unknown[] }[];
    expect(rows.find((r) => r.id === SHIFT)?.eventDrinkMenu).toEqual([cosmoRow]);
    // Priced from the Workspace list: an empty array, never absent.
    expect(rows.find((r) => r.id === NORMAL_SHIFT)?.eventDrinkMenu).toEqual([]);
  });

  it('the single read attaches them for a special shift', async () => {
    const repo = fakeShiftRepository();
    const res = fakeResponse();
    await controllerWith(repo).getById(request({}, SHIFT), res);

    expect(res.statusCode).toBe(200);
    expect((res.body.data as { eventDrinkMenu?: unknown[] }).eventDrinkMenu).toEqual([cosmoRow]);
  });

  it('and does not look for any on a normal one', async () => {
    const repo = fakeShiftRepository(storedNormal);
    const res = fakeResponse();
    await controllerWith(repo).getById(request({}, NORMAL_SHIFT), res);

    expect(repo.listEventDrinkMenuForShift).not.toHaveBeenCalled();
    expect((res.body.data as { eventDrinkMenu?: unknown[] }).eventDrinkMenu).toEqual([]);
  });
});
