import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE PR'S WEEK SAYS WHICH SPECIAL NIGHT A SHIFT WAS (30 Sep 2026).
 *
 * `GET /payment-voucher/mine/current-week` sends `shifts[]` beside its lines —
 * the stamps behind the money — and the PR app's Payment claim list names each
 * claim's shift from it. That array carried `eventKind` and nothing else about a
 * special night, so every claim on one read a bare "Special event" while the
 * rest of the app (fed by /shift-assignment/mine) said "Special event · VIP
 * night". Pinned here against fakes — `@/db/index` is a recording stand-in, so
 * nothing can reach the shared database:
 *
 *  - the week read's shift query selects BOTH sub-type pairs — the SAME column
 *    objects the /mine feed selects, through the joins it already makes — and
 *    hands them on;
 *  - the route puts them on `shifts[]` untouched, still scoped to the caller.
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
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/notification/notify.js', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock('@/features/notification/notify', () => ({ notify: vi.fn(), notifyMany: vi.fn() }));

import { PaymentVoucherControllerClass } from '@/features/payment-voucher/payment-voucher.controller';
import { ShiftTable } from '@/features/shift/shift.model';
import { ShiftTemplateTable } from '@/features/shift-template/shift-template.model';
import { ShiftAssignmentTable } from './shift-assignment.model';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';

const PR = '11111111-1111-4111-8111-111111111111';
const AGENCY = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT = '66666666-6666-4666-8666-666666666666';
const VOUCHER = '77777777-7777-4777-8777-777777777777';

const SUBTYPE_FIELDS = [
  'specialEventType',
  'customSpecialEventName',
  'templateSpecialEventType',
  'templateCustomEventName',
] as const;

/** One row as the week read's shift query returns it from the database. */
function shiftRow(extra: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT,
    prId: PR,
    checkInAt: new Date('2026-09-29T14:00:00Z'),
    checkOutAt: new Date('2026-09-29T20:00:00Z'),
    overtimeMinutes: null,
    shiftDate: '2026-09-29',
    slot: '22:00 - 04:00',
    eventName: 'Launch party',
    eventKind: 'special',
    specialEventType: 'vip',
    customSpecialEventName: null,
    templateSpecialEventType: 'other',
    templateCustomEventName: 'Whisky tasting',
    outletName: 'UAB Emhub',
    outletLogo: null,
    templateCoverImage: null,
    status: 'completed',
    cancelFeeRm: null,
    cancelFeePct: null,
    cancelNoticeHours: null,
    ...extra,
  };
}

beforeEach(() => {
  fake.state.selects = [];
  fake.state.rows = [];
});

describe('listByIdsForPr — the shift query behind the PR week reads', () => {
  it("selects the shift's own sub-type pair AND its event card's, and hands both on", async () => {
    fake.state.rows = [shiftRow()];

    const rows = await new ShiftAssignmentRepositoryClass().listByIdsForPr(PR, [ASSIGNMENT]);

    const query = fake.state.selects.find((s) => s.table === ShiftAssignmentTable);
    expect(query).toBeDefined();
    // Off the shift row, and off the template row already joined for the cover.
    expect(query?.fields.specialEventType).toBe(ShiftTable.specialEventType);
    expect(query?.fields.customSpecialEventName).toBe(ShiftTable.customSpecialEventName);
    expect(query?.fields.templateSpecialEventType).toBe(ShiftTemplateTable.specialEventType);
    expect(query?.fields.templateCustomEventName).toBe(ShiftTemplateTable.customSpecialEventName);
    expect(rows[0]).toMatchObject({
      id: ASSIGNMENT,
      eventKind: 'special',
      specialEventType: 'vip',
      customSpecialEventName: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Whisky tasting',
    });
  });

  it('reads the very columns the /mine feed reads — one selection, not a second one', async () => {
    const repo = new ShiftAssignmentRepositoryClass();
    await repo.listForUser(PR);
    await repo.listByIdsForPr(PR, [ASSIGNMENT]);

    const [mine, week] = fake.state.selects.filter((s) => s.table === ShiftAssignmentTable);
    for (const field of SUBTYPE_FIELDS) {
      expect(week?.fields[field]).toBeDefined();
      expect(week?.fields[field]).toBe(mine?.fields[field]);
    }
  });

  it('a normal shift passes its nulls through — nothing is invented', async () => {
    fake.state.rows = [
      shiftRow({
        eventKind: 'normal',
        specialEventType: null,
        templateSpecialEventType: null,
        templateCustomEventName: null,
      }),
    ];

    const [row] = await new ShiftAssignmentRepositoryClass().listByIdsForPr(PR, [ASSIGNMENT]);

    expect(row).toMatchObject({
      eventKind: 'normal',
      specialEventType: null,
      customSpecialEventName: null,
      templateSpecialEventType: null,
      templateCustomEventName: null,
    });
  });
});

/* ─── The route: GET /payment-voucher/mine/current-week ─── */

type Body = { success: boolean; message: string; data: Record<string, unknown> | null };

function fakeResponse() {
  const out: { status: number; body: Body | null } = { status: 0, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: Body) {
      out.body = payload;
      return this;
    },
  } as unknown as Response;
  return { res, out };
}

/** This week's voucher, holding one generated wage line for ASSIGNMENT. */
function weekVoucher() {
  return {
    id: VOUCHER,
    voucherNo: 'PV-000012',
    agencyId: AGENCY,
    prId: PR,
    userId: PR,
    prName: 'Payee',
    weekStart: '2026-09-27',
    weekEnd: '2026-10-03',
    net: '500.00',
    status: 'pending_review',
    financeHeadName: null,
    financeHeadRole: null,
    financeHeadSignedAt: null,
    prSignedAt: null,
    disputeReason: null,
    disputeNote: null,
    disputedAt: null,
    agencyName: 'Atlas',
    agencyLogo: null,
    lines: [
      {
        id: 'line-1',
        voucherId: VOUCHER,
        receiptId: null,
        lineDate: '2026-09-29',
        outlet: 'UAB Emhub',
        description: 'Daily wages',
        quantity: 1,
        amount: '500.00',
        // The weekly generator's wage line: the assignment id, bare.
        ref: ASSIGNMENT,
        component: 'wages',
        proofPhotos: null,
        sortOrder: 0,
        createdAt: new Date('2026-09-29T20:00:00Z'),
      },
    ],
  };
}

function weekController() {
  const assignments = new ShiftAssignmentRepositoryClass();
  const vouchers = {
    listWeekVouchers: vi.fn(async () => [weekVoucher()]),
    listReceipts: vi.fn(async () => []),
    listDayReviews: vi.fn(async () => []),
  };
  const disputes = { listForVoucher: vi.fn(async () => []) };
  const prs = { getByUserId: vi.fn(async () => ({ id: PR, userId: PR })) };
  const controller = new PaymentVoucherControllerClass(
    vouchers as never,
    {} as never,
    {} as never,
    prs as never,
    disputes as never,
    assignments,
  );
  return { controller, assignments };
}

const asCaller = (id: string) => ({ user: { id }, params: {}, query: {} }) as unknown as Request;

describe('GET /payment-voucher/mine/current-week', () => {
  it('puts both sub-type pairs on the shift a line points at', async () => {
    fake.state.rows = [shiftRow()];
    const { controller, assignments } = weekController();
    const lookup = vi.spyOn(assignments, 'listByIdsForPr');
    const { res, out } = fakeResponse();

    await controller.getMyCurrentWeek(asCaller(PR), res);

    expect(out.status).toBe(200);
    // Still the caller's own shifts, resolved from the ids the lines carry.
    expect(lookup).toHaveBeenCalledWith(PR, [ASSIGNMENT]);
    const shifts = out.body?.data?.shifts as Record<string, unknown>[];
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({
      id: ASSIGNMENT,
      eventName: 'Launch party',
      eventKind: 'special',
      specialEventType: 'vip',
      customSpecialEventName: null,
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Whisky tasting',
    });
  });
});
