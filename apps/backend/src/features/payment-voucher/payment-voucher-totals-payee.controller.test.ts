import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST and PUT /payment-voucher — risks #19 (the header must balance) and
 * #9(a) (the payee must be on the agency's roster, named by their account) —
 * against fakes. `@/db/index` is stubbed, so no query can reach the shared
 * database; every repository is a recording fake.
 *
 * Pins:
 *  - a client subtotal / net is never what gets stored, and the answer says so;
 *  - a PUT that omits the deduction keeps it (it used to reset it to 0);
 *  - every PUT asks the repository to take the finance signature off if the
 *    money moves, and the answer says when it did;
 *  - a deduction change and a send are two steps;
 *  - a prId off the agency's roster is refused with one sentence, on both
 *    doors; an on-roster prId writes userId / name / IC from the account;
 *  - a voucher that already carries lines cannot be moved to another PR.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const h = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('@/features/notification/notify.js', () => ({
  notify: h.notify,
  notifyMany: vi.fn(),
}));
vi.mock('@/features/notification/notify', () => ({
  notify: h.notify,
  notifyMany: vi.fn(),
}));

import { PaymentVoucherControllerClass } from './payment-voucher.controller';

const VOUCHER = '7bf3962e-591e-452f-b781-edbe1cbe6ef0';
const RECEIPT = '9b48cae3-1111-4222-8333-944455556666';
const ASSIGNMENT = '4ff48fdd-1111-4222-8333-944455556666';
const OWN_PR = '1c5d0a3e-2222-4333-8444-955566667777';
const FOREIGN_PR = '2d6e1b4f-3333-4444-8555-a66677778888';

const drinkLine = {
  id: 'line-1',
  voucherId: VOUCHER,
  receiptId: RECEIPT,
  lineDate: '2026-09-15',
  outlet: 'Velvet 23',
  description: 'Lemon Drop',
  quantity: 2,
  amount: '24.00',
  ref: 'drinks|scan|120.00|ORD0389:0|drink',
  component: 'drink_commission' as const,
  proofPhotos: null,
  sortOrder: 0,
};

function voucher(overrides: Record<string, unknown> = {}) {
  return {
    id: VOUCHER,
    voucherNo: 'PV-000009',
    agencyId: 'agency-1',
    prId: 'pr-user',
    userId: 'pr-user',
    prName: 'Payee',
    prIc: null,
    weekStart: '2026-09-13',
    weekEnd: '2026-09-19',
    issuedDate: null,
    dueDate: null,
    subtotal: '24.00',
    deduction: '3.00',
    net: '21.00',
    status: 'pending_review',
    financeHeadSignedAt: new Date('2026-09-20T02:00:00Z'),
    prSignedAt: null,
    paidAt: null,
    disputedAt: null,
    lines: [drinkLine],
    ...overrides,
  };
}

const repo = {
  getById: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  existsForPrWeek: vi.fn(),
  listDayReviews: vi.fn(),
  listReceipts: vi.fn(),
};
const prs = {
  listMembershipAgencyIds: vi.fn(),
  getById: vi.fn(),
};
const assignments = {
  listPendingOvertimeForPrWeek: vi.fn(),
  getOutletForAssignment: vi.fn(),
  resolveDrinkMenusForShifts: vi.fn(),
};
const disputes = { listOpenForVoucher: vi.fn() };

const controller = new PaymentVoucherControllerClass(
  repo as never,
  { listByUser: vi.fn(async () => [{ agencyId: 'agency-1', status: 'active' }]) } as never,
  { getRolesForUserIds: vi.fn(async () => [{ roleName: 'agency' }]) } as never,
  prs as never,
  disputes as never,
  assignments as never,
);

function call(body: Record<string, unknown>) {
  const req = {
    params: { id: VOUCHER },
    body,
    user: { id: 'agency-user' },
    headers: {},
    header: () => undefined,
    query: {},
  } as unknown as Request;
  const out: {
    status: number;
    body: { success: boolean; message: string; data: unknown } | null;
  } = { status: 0, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(payload: never) {
      out.body = payload;
      return this;
    },
  } as unknown as Response;
  return { req, res, out };
}

/** The header patch the controller handed the repository. */
const patchSent = () => repo.update.mock.calls[0]?.[1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  h.notify.mockResolvedValue({ id: 'n1' });
  repo.listDayReviews.mockResolvedValue([]);
  repo.listReceipts.mockResolvedValue([
    { id: RECEIPT, receiptNo: 'RCP-000007', shiftAssignmentId: ASSIGNMENT, status: 'verified' },
  ]);
  repo.existsForPrWeek.mockResolvedValue(false);
  assignments.listPendingOvertimeForPrWeek.mockResolvedValue([]);
  assignments.getOutletForAssignment.mockResolvedValue({
    outletId: 'outlet-1',
    outletName: 'Velvet 23',
    shiftId: 'shift-1',
    eventKind: 'normal',
  });
  assignments.resolveDrinkMenusForShifts.mockResolvedValue(
    new Map([
      [
        'shift-1',
        {
          source: 'workspace',
          items: [{ id: 'i1', name: 'Lemon Drop', priceRm: 60, category: 'drink' }],
        },
      ],
    ]),
  );
  disputes.listOpenForVoucher.mockResolvedValue([]);
  // The repository answers with the row as stored — totals derived.
  repo.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
    ...voucher(),
    ...patch,
  }));
  repo.create.mockImplementation(async (data: Record<string, unknown>, lines: unknown[]) => ({
    id: VOUCHER,
    ...data,
    lines,
  }));
  prs.listMembershipAgencyIds.mockImplementation(async (id: string) =>
    id === OWN_PR ? ['agency-9', 'agency-1'] : id === FOREIGN_PR ? ['agency-2'] : [],
  );
  prs.getById.mockImplementation(async (id: string) =>
    id === OWN_PR
      ? { id: OWN_PR, userId: OWN_PR, name: 'Vicky Tan', icNo: '900101-14-5678' }
      : null,
  );
});

describe('PUT — subtotal and net are derived, the deduction is kept', () => {
  it('never hands a sent subtotal / net to the repository, and says it was not used', async () => {
    repo.getById.mockResolvedValue(voucher());
    const { req, res, out } = call({ subtotal: 500, net: 500 });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(patchSent()).not.toHaveProperty('subtotal');
    expect(patchSent()).not.toHaveProperty('net');
    expect(out.body?.message).toMatch(/worked out from the lines/);
    expect(out.body?.message).toMatch(/RM 21\.00/);
  });

  it('a round trip of the stored figures is just "updated"', async () => {
    repo.getById.mockResolvedValue(voucher());
    const { req, res, out } = call({ subtotal: 24, net: 21 });

    await controller.update(req, res);

    expect(out.body?.message).toBe('Payment voucher updated');
  });

  it('a header-only deduction reaches the repository as the one money input', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call({ deduction: 5 });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(patchSent()).toMatchObject({ deduction: '5.00' });
    // Never asks for the signature void (review, 12 Nov 2026): voiding on a
    // disputed edit let "Resend to PR" deliver an unsigned voucher.
    expect(repo.update.mock.calls[0]?.[5]).toBeUndefined();
  });

  it('a line edit that omits the deduction keeps it (it used to reset it to 0)', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call({
      lines: [
        {
          lineDate: drinkLine.lineDate,
          outlet: drinkLine.outlet,
          description: 'Lemon Drop',
          quantity: 2,
          amount: 30,
          ref: drinkLine.ref,
        },
      ],
    });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(patchSent()).not.toHaveProperty('deduction');
    expect(patchSent()).not.toHaveProperty('subtotal');
    expect(patchSent()).not.toHaveProperty('net');
  });

  it('a deduction edit is just "updated" — no signature note, since nothing voids it', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    repo.update.mockImplementation(async () =>
      voucher({ status: 'disputed', deduction: '5.00', net: '19.00' }),
    );
    const { req, res, out } = call({ deduction: 5 });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(out.body?.message).toBe('Payment voucher updated');
  });

  it('refuses a new deduction and a send in one call — two steps', async () => {
    repo.getById.mockResolvedValue(voucher({ weekEnd: '2026-09-19' }));
    const { req, res, out } = call({ status: 'sent', deduction: 9 });

    await controller.update(req, res);

    expect(out.status).toBe(409);
    expect(out.body?.message).toMatch(/deduction and send in two steps/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('a send repeating the SAME deduction still goes out', async () => {
    repo.getById.mockResolvedValue(voucher({ weekEnd: '2026-09-19' }));
    const { req, res, out } = call({ status: 'sent', deduction: 3 });

    await controller.update(req, res);

    expect(out.status).toBe(200);
  });
});

describe('PUT — the payee stays on the roster and moves with user_id', () => {
  it('refuses a PR from another agency, writing nothing', async () => {
    repo.getById.mockResolvedValue(voucher({ lines: [], prId: null, userId: null }));
    const { req, res, out } = call({ prId: FOREIGN_PR });

    await controller.update(req, res);

    expect(out.status).toBe(400);
    expect(out.body?.message).toMatch(/not on this agency's roster/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('answers an id that is nobody with the SAME sentence — no existence oracle', async () => {
    repo.getById.mockResolvedValue(voucher({ lines: [], prId: null, userId: null }));
    const foreign = call({ prId: FOREIGN_PR });
    const nobody = call({ prId: '3e7f2c5a-4444-4555-8666-b77788889999' });

    await controller.update(foreign.req, foreign.res);
    await controller.update(nobody.req, nobody.res);

    expect(nobody.out.status).toBe(400);
    expect(nobody.out.body?.message).toBe(foreign.out.body?.message);
  });

  it('refuses re-pointing a voucher that already carries lines', async () => {
    repo.getById.mockResolvedValue(voucher());
    const { req, res, out } = call({ prId: OWN_PR });

    await controller.update(req, res);

    expect(out.status).toBe(409);
    expect(out.body?.message).toMatch(/cannot be changed/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('re-points an empty voucher with all four facts from the account', async () => {
    repo.getById.mockResolvedValue(
      voucher({ lines: [], prId: 'pr-user', userId: 'pr-user', prIc: 'OLD-IC' }),
    );
    const { req, res, out } = call({ prId: OWN_PR, prName: 'Typed Name', prIc: 'typed' });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(prs.listMembershipAgencyIds).toHaveBeenCalledWith(OWN_PR);
    expect(patchSent()).toMatchObject({
      prId: OWN_PR,
      userId: OWN_PR,
      prName: 'Vicky Tan',
      prIc: '900101-14-5678',
    });
  });

  it('refuses moving an empty voucher onto a PR who already has that week', async () => {
    repo.getById.mockResolvedValue(voucher({ lines: [] }));
    repo.existsForPrWeek.mockResolvedValue(true);
    const { req, res, out } = call({ prId: OWN_PR });

    await controller.update(req, res);

    expect(out.status).toBe(409);
    expect(repo.existsForPrWeek).toHaveBeenCalledWith(
      'agency-1',
      OWN_PR,
      '2026-09-13',
      '2026-09-19',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('the stored prId sent back unchanged is a round trip — no lookup, no write', async () => {
    repo.getById.mockResolvedValue(
      voucher({ status: 'disputed', prId: OWN_PR, userId: OWN_PR }),
    );
    const { req, res, out } = call({ prId: OWN_PR, disputeNote: 'checked' });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(prs.listMembershipAgencyIds).not.toHaveBeenCalled();
    expect(patchSent()).not.toHaveProperty('prId');
  });
});

describe('POST — totals derived, payee on the roster', () => {
  const lines = [
    { lineDate: '2026-09-15', description: 'Shift on 2026-09-15', amount: 50 },
    { lineDate: '2026-09-15', description: 'Lemon Drop', amount: 4.3 },
  ];

  it('derives subtotal and net from the lines, whatever was sent', async () => {
    const { req, res, out } = call({
      prName: 'Payee',
      weekStart: '2026-09-13',
      weekEnd: '2026-09-19',
      subtotal: 999,
      deduction: 4.3,
      net: 999,
      lines,
    });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    const data = repo.create.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(data).toMatchObject({ subtotal: '54.30', deduction: '4.30', net: '50.00' });
    expect(out.body?.message).toMatch(/worked out from the lines/);
  });

  it('a voucher raised with no PR asks the roster nothing', async () => {
    const { req, res, out } = call({ prName: 'Walk-in', lines });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    expect(prs.listMembershipAgencyIds).not.toHaveBeenCalled();
    expect(out.body?.message).toBe('Payment voucher created');
  });

  it('refuses a PR from another agency before anything is written', async () => {
    const { req, res, out } = call({ prId: FOREIGN_PR, prName: 'Someone', lines });

    await controller.create(req, res);

    expect(out.status).toBe(400);
    expect(out.body?.message).toMatch(/not on this agency's roster/);
    expect(repo.existsForPrWeek).not.toHaveBeenCalled();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('an on-roster PR is named from the account: userId, name and IC', async () => {
    const { req, res, out } = call({
      prId: OWN_PR,
      prName: 'Typed Name',
      prIc: 'typed guess',
      weekStart: '2026-09-13',
      weekEnd: '2026-09-19',
      lines,
    });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    expect(repo.create.mock.calls[0]?.[0]).toMatchObject({
      agencyId: 'agency-1',
      prId: OWN_PR,
      userId: OWN_PR,
      prName: 'Vicky Tan',
      prIc: '900101-14-5678',
    });
  });

  it('a PR who has LEFT the agency still counts — past weeks are still owed', async () => {
    // listMembershipAgencyIds is every status, which is the point.
    prs.listMembershipAgencyIds.mockResolvedValue(['agency-1']);
    prs.getById.mockResolvedValue(null);
    const { req, res, out } = call({ prId: OWN_PR, prName: 'Former PR', lines });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    expect(repo.create.mock.calls[0]?.[0]).toMatchObject({
      prId: OWN_PR,
      userId: OWN_PR,
      prName: 'Former PR',
      prIc: null,
    });
  });
});
