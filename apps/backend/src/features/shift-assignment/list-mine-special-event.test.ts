import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE PR'S OWN FEED SAYS WHICH SPECIAL NIGHT IT IS, AND CARRIES ITS PRICES —
 * TO SHOW (29 Sep 2026).
 *
 * `GET /shift-assignment/mine` served `eventKind` and nothing else about a
 * special night, so the phone printed a bare "Special event" on a VIP night
 * and on "Other · Merdeka Celebration" alike, and never saw the event's own
 * price list (0167). Pinned here against fakes — `@/db/index` is a recording
 * stand-in, so nothing can reach the shared database:
 *
 *  - the feed's query selects BOTH sub-type pairs (the shift's own, and its
 *    event card's) through the joins it already makes, and hands them on;
 *  - the controller adds the event's own prices for SPECIAL shifts only, from
 *    the same batched reader `GET /shift` uses (`eventDrinkMenu`, for the card
 *    that names them);
 *  - `drinkMenu`, the list every amount is logged from, is resolved PER SHIFT
 *    (owner, 29 Sep 2026: "Use event prices"): a special night's own list when
 *    it has one, the venue's Workspace list otherwise — with `drinkMenuSource`;
 *  - a failed display read leaves the PR's schedule standing, field omitted,
 *    but a failed PRICE-LIST read is a 500 — never the everyday prices on a
 *    special night;
 *  - the feed is still the caller's own, scoped exactly as before.
 */

const fake = vi.hoisted(() => {
  const state = {
    selects: [] as { fields: Record<string, unknown>; table: unknown }[],
    rows: [] as unknown[],
  };
  /** Every builder step returns the chain; awaiting it yields `state.rows`. */
  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};
    for (const step of ['innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) {
      c[step] = () => c;
    }
    c.then = (resolve: (rows: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(state.rows).then(resolve, reject);
    return c;
  }
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => {
        state.selects.push({ fields, table });
        return chain();
      },
    }),
  };
  return { state, db };
});

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import { ShiftAssignmentControllerClass } from './shift-assignment.controller';
import { ShiftAssignmentTable } from './shift-assignment.model';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';

const USER = '11111111-1111-4111-8111-111111111111';
const AGENCY = '22222222-2222-4222-8222-222222222222';
const OUTLET = '33333333-3333-4333-8333-333333333333';
const SPECIAL_SHIFT = '44444444-4444-4444-8444-444444444444';
const NORMAL_SHIFT = '55555555-5555-4555-8555-555555555555';

beforeEach(() => {
  fake.state.selects = [];
  fake.state.rows = [];
});

describe('listForUser — the query behind /mine', () => {
  it("selects the shift's own sub-type pair AND its event card's, and hands both on", async () => {
    fake.state.rows = [
      {
        assignment: { id: 'as-1', shiftId: SPECIAL_SHIFT, agencyId: AGENCY, userId: USER },
        shiftDate: '2026-10-03',
        slot: '22:00 - 04:00',
        eventName: 'Merdeka Celebration',
        eventKind: 'special',
        specialEventType: null,
        customSpecialEventName: null,
        templateSpecialEventType: 'other',
        templateCustomEventName: 'Merdeka Celebration',
        dressCode: null,
        languages: null,
        payPerHour: '500.00',
        outletId: OUTLET,
        outletName: 'UAB Emhub',
        outletLogo: null,
        templateCoverImage: null,
        outletAddressLine1: null,
        outletAddressLine2: null,
        outletCity: null,
        outletPostcode: null,
        outletState: null,
        outletLat: null,
        outletLng: null,
        outletGeoFenceRadius: null,
        agencyName: 'Atlas',
      },
    ];

    const rows = await new ShiftAssignmentRepositoryClass().listForUser(USER);

    const feedQuery = fake.state.selects.find((s) => s.table === ShiftAssignmentTable);
    expect(feedQuery).toBeDefined();
    // Read off the shift row and the template row already joined for the cover
    // picture — the same columns GET /shift serves, never a copy.
    expect(feedQuery?.fields.specialEventType).toBe(ShiftTable.specialEventType);
    expect(feedQuery?.fields.customSpecialEventName).toBe(ShiftTable.customSpecialEventName);
    expect(feedQuery?.fields.templateSpecialEventType).toBe(ShiftTemplateTable.specialEventType);
    expect(feedQuery?.fields.templateCustomEventName).toBe(
      ShiftTemplateTable.customSpecialEventName,
    );
    expect(rows[0]).toMatchObject({
      id: 'as-1',
      eventKind: 'special',
      specialEventType: null,
      customSpecialEventName: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Merdeka Celebration',
    });
  });
});

/* ─── The controller: GET /shift-assignment/mine ─── */

const WORKSPACE_MENU = [
  { id: 'cosmo', name: 'Cosmo', priceRm: '150.00', category: 'drink' },
  { id: 'tips', name: 'Tips', priceRm: '50.00', category: 'tip' },
];
const EVENT_ROWS = [
  {
    id: 'row-1',
    shiftId: SPECIAL_SHIFT,
    slug: 'cosmo',
    name: 'Cosmo',
    priceRm: '180.00',
    category: 'drink',
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'owner',
    updatedBy: 'owner',
  },
];

function feedRow(shiftId: string, eventKind: 'normal' | 'special', extra: object = {}) {
  return {
    id: `as-${shiftId.slice(0, 4)}`,
    shiftId,
    agencyId: AGENCY,
    userId: USER,
    outletId: OUTLET,
    eventKind,
    specialEventType: null,
    customSpecialEventName: null,
    templateSpecialEventType: null,
    templateCustomEventName: null,
    ...extra,
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

const EVENT_MENU = [{ id: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink' }];

function controllerWith(
  rows: object[],
  listEventDrinkMenuForShifts: (ids: string[]) => Promise<Map<string, unknown[]>>,
  /** The shifts whose OWN list the price resolver finds (default: none). */
  pricedFromEvent: ReadonlySet<string> = new Set(),
) {
  const assignmentRepo = {
    listForUser: vi.fn(async () => rows),
    resolveTierRatesForOutlets: vi.fn(async () => new Map()),
    resolveShiftTierOverrides: vi.fn(async () => new Map()),
    resolveDrinkMenusForShifts: vi.fn(
      async (shifts: ReadonlyArray<{ shiftId: string }>) =>
        new Map(
          shifts.map((s) => [
            s.shiftId,
            pricedFromEvent.has(s.shiftId)
              ? { source: 'event', items: EVENT_MENU }
              : { source: 'workspace', items: WORKSPACE_MENU },
          ]),
        ),
    ),
  };
  const shiftRepo = { listEventDrinkMenuForShifts: vi.fn(listEventDrinkMenuForShifts) };
  const prRepo = { getByUserId: vi.fn(async () => ({ id: USER, tier: 'tier_1' })) };
  const controller = new ShiftAssignmentControllerClass(
    assignmentRepo as never,
    shiftRepo as never,
    prRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { controller, assignmentRepo, shiftRepo };
}

const asCaller = (id: string | undefined) => ({ user: id ? { id } : undefined }) as unknown as Request;
const dataOf = (res: FakeResponse) => res.body.data as Record<string, unknown>[];

describe('GET /shift-assignment/mine', () => {
  it("adds a special night's own prices, asking only about special shifts", async () => {
    const { controller, shiftRepo } = controllerWith(
      [feedRow(SPECIAL_SHIFT, 'special'), feedRow(NORMAL_SHIFT, 'normal')],
      async () => new Map([[SPECIAL_SHIFT, EVENT_ROWS]]),
    );
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);

    expect(res.statusCode).toBe(200);
    expect(shiftRepo.listEventDrinkMenuForShifts).toHaveBeenCalledWith([SPECIAL_SHIFT]);
    const [special, normal] = dataOf(res);
    // The Workspace list's wire shape — slug as id, money as a string, and no
    // audit columns on a PR's feed.
    expect(special.eventDrinkMenu).toEqual([
      { id: 'cosmo', name: 'Cosmo', priceRm: '180.00', category: 'drink' },
    ]);
    expect(normal.eventDrinkMenu).toEqual([]);
  });

  it('prices a special night from its OWN list, every other shift from the Workspace list (owner: "Use event prices")', async () => {
    const { controller, assignmentRepo } = controllerWith(
      [feedRow(SPECIAL_SHIFT, 'special'), feedRow(NORMAL_SHIFT, 'normal')],
      async () => new Map([[SPECIAL_SHIFT, EVENT_ROWS]]),
      new Set([SPECIAL_SHIFT]),
    );
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);

    // One resolver call, per SHIFT, carrying what it needs to choose the list.
    expect(assignmentRepo.resolveDrinkMenusForShifts).toHaveBeenCalledWith([
      { shiftId: SPECIAL_SHIFT, outletId: OUTLET, eventKind: 'special' },
      { shiftId: NORMAL_SHIFT, outletId: OUTLET, eventKind: 'normal' },
    ]);
    const [special, normal] = dataOf(res);
    expect(special).toMatchObject({ drinkMenu: EVENT_MENU, drinkMenuSource: 'event' });
    expect(normal).toMatchObject({ drinkMenu: WORKSPACE_MENU, drinkMenuSource: 'workspace' });
  });

  it('a failed PRICE-LIST read is a 500 — a special night is never priced from the everyday list by accident', async () => {
    const { controller, assignmentRepo } = controllerWith(
      [feedRow(SPECIAL_SHIFT, 'special')],
      async () => new Map(),
    );
    assignmentRepo.resolveDrinkMenusForShifts.mockRejectedValueOnce(new Error('connection reset'));
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);

    expect(res.statusCode).toBe(500);
  });

  it('hands the sub-type pairs on exactly as the query read them', async () => {
    const { controller } = controllerWith(
      [
        feedRow(SPECIAL_SHIFT, 'special', {
          specialEventType: 'vip',
          templateSpecialEventType: 'other',
          templateCustomEventName: 'Whisky tasting',
        }),
      ],
      async () => new Map(),
    );
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);

    expect(dataOf(res)[0]).toMatchObject({
      specialEventType: 'vip',
      customSpecialEventName: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Whisky tasting',
      // No own list = priced from the Workspace list, which is what [] says.
      eventDrinkMenu: [],
    });
  });

  it('a failed event read leaves the schedule standing — the field is left off, not faked empty', async () => {
    const { controller } = controllerWith([feedRow(SPECIAL_SHIFT, 'special')], async () => {
      throw new Error('connection reset');
    });
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);

    expect(res.statusCode).toBe(200);
    const [row] = dataOf(res);
    expect(row).not.toHaveProperty('eventDrinkMenu');
    expect(row.drinkMenu).toEqual(WORKSPACE_MENU);
  });

  it('is still the caller’s own feed, scoped as before', async () => {
    const { controller, assignmentRepo } = controllerWith([], async () => new Map());
    const res = fakeResponse();

    await controller.listMine(asCaller(USER), res);
    expect(assignmentRepo.listForUser).toHaveBeenCalledTimes(1);
    expect(assignmentRepo.listForUser).toHaveBeenCalledWith(USER);

    const anonymous = fakeResponse();
    const { controller: again, assignmentRepo: untouched, shiftRepo } = controllerWith(
      [],
      async () => new Map(),
    );
    await again.listMine(asCaller(undefined), anonymous);
    expect(anonymous.body.data).toEqual([]);
    expect(untouched.listForUser).not.toHaveBeenCalled();
    expect(shiftRepo.listEventDrinkMenuForShifts).not.toHaveBeenCalled();
  });
});
