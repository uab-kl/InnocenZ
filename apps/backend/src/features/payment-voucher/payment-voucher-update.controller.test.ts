import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PUT /payment-voucher/:id — the agency's Send to PR, Mark as paid and the
 * Disputed voucher's line edit — against fakes. `@/db/index` is stubbed, so no
 * query can reach the shared database; every repository is a recording fake.
 *
 * Pins the 28 Sep audit's findings on this route:
 *  - a send stamps the dates the Sunday job stamps, and never re-dates;
 *  - a send and a payment tell the PR, a retry or a refusal does not;
 *  - a line edit keeps a receipt's money on its day and a renamed drink on its
 *    outlet's list, storing the catalogue's spelling.
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
import { klToday } from './payment-voucher-week';

const VOUCHER = '7bf3962e-591e-452f-b781-edbe1cbe6ef0';
const RECEIPT = '9b48cae3-1111-4222-8333-944455556666';
const ASSIGNMENT = '4ff48fdd-1111-4222-8333-944455556666';

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
    weekStart: '2026-09-13',
    weekEnd: '2026-09-19',
    issuedDate: null,
    dueDate: null,
    subtotal: '24.00',
    deduction: '0.00',
    net: '24.00',
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
  listDayReviews: vi.fn(),
  listReceipts: vi.fn(),
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
  {} as never,
  disputes as never,
  assignments as never,
);

function call(body: Record<string, unknown>) {
  const req = {
    params: { id: VOUCHER },
    body,
    user: { id: 'agency-user' },
    headers: {},
    // No acting-organisation header: the caller's one membership answers.
    header: () => undefined,
    query: {},
  } as unknown as Request;
  const out: { status: number; body: { success: boolean; message: string } | null } = {
    status: 0,
    body: null,
  };
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

beforeEach(() => {
  vi.clearAllMocks();
  h.notify.mockResolvedValue({ id: 'n1' });
  repo.listDayReviews.mockResolvedValue([]);
  repo.listReceipts.mockResolvedValue([
    { id: RECEIPT, receiptNo: 'RCP-000007', shiftAssignmentId: ASSIGNMENT, status: 'verified' },
  ]);
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
          items: [
            { id: 'i1', name: 'Lemon Drop', priceRm: 60, category: 'drink' },
            { id: 'i2', name: 'Espresso Martini', priceRm: 70, category: 'drink' },
          ],
        },
      ],
    ]),
  );
  disputes.listOpenForVoucher.mockResolvedValue([]);
  repo.update.mockImplementation(async (_id: string, patch: Record<string, unknown>) => ({
    ...voucher(),
    ...patch,
  }));
});

describe('Send to PR', () => {
  it('stamps the issued and pay-by dates and tells the PR', async () => {
    repo.getById.mockResolvedValue(voucher());
    const { req, res, out } = call({ status: 'sent' });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(repo.update.mock.calls[0]?.[1]).toMatchObject({
      status: 'sent',
      issuedDate: klToday(),
      dueDate: '2026-09-26',
    });
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'pr-user',
        kind: 'payment_voucher_issued',
        payload: expect.objectContaining({ voucherId: VOUCHER, voucherNo: 'PV-000009' }),
      }),
    );
  });

  it('never re-dates a voucher that already carries its dates', async () => {
    repo.getById.mockResolvedValue(voucher({ issuedDate: '2026-09-14', dueDate: '2026-09-26' }));
    const { req, res } = call({ status: 'sent' });

    await controller.update(req, res);

    const patch = repo.update.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(patch.issuedDate).toBeUndefined();
    expect(patch.dueDate).toBeUndefined();
  });

  it('"Resend to PR" rings again as a reminder, and keeps the issued date', async () => {
    // Owner, 29 Sep 2026: a resend should notify (it used to stay silent).
    repo.getById.mockResolvedValue(voucher({ status: 'sent', issuedDate: '2026-09-20' }));
    const { req, res } = call({ status: 'sent' });

    await controller.update(req, res);

    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]?.[0]).toMatchObject({
      kind: 'payment_voucher_issued',
      payload: expect.objectContaining({ resent: true }),
    });
    expect(repo.update.mock.calls[0]?.[1]).not.toHaveProperty('issuedDate');
  });

  it('a refused send writes nothing and tells nobody', async () => {
    repo.getById.mockResolvedValue(voucher({ financeHeadSignedAt: null }));
    const { req, res, out } = call({ status: 'sent' });

    await controller.update(req, res);

    expect(out.status).toBe(409);
    expect(repo.update).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe('Mark as paid', () => {
  it('tells the PR they have been paid', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'signed', prSignedAt: new Date() }));
    const { req, res, out } = call({ status: 'paid', bankRef: 'CLICK-TEST' });

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'pr-user', kind: 'payment_voucher_paid' }),
    );
  });

  it('attaching a bank reference to a paid voucher later is silent', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'paid', paidAt: new Date() }));
    const { req, res } = call({ status: 'paid', bankRef: 'LATE-REF' });

    await controller.update(req, res);

    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe('Edit line items', () => {
  const asSent = (description: string, lineDate = drinkLine.lineDate) => ({
    lines: [
      {
        lineDate,
        outlet: drinkLine.outlet,
        description,
        quantity: drinkLine.quantity,
        amount: 30,
        ref: drinkLine.ref,
      },
    ],
  });

  it('corrects an amount on a faithful round trip', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call(asSent('Lemon Drop'));

    await controller.update(req, res);

    expect(out.status).toBe(200);
    expect(repo.update).toHaveBeenCalledTimes(1);
  });

  it('refuses moving a receipt’s money to another day', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call(asSent('Lemon Drop', '2026-09-17'));

    await controller.update(req, res);

    expect(out.status).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('refuses renaming a drink to something the outlet does not sell', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call(asSent('Imaginary Cocktail'));

    await controller.update(req, res);

    expect(out.status).toBe(400);
    expect(out.body?.message).toMatch(/not on Velvet 23's drinks list/);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('on a special night with its OWN list, accepts an item only that list carries (owner: "Use event prices")', async () => {
    assignments.getOutletForAssignment.mockResolvedValue({
      outletId: 'outlet-1',
      outletName: 'Velvet 23',
      shiftId: 'shift-vip',
      eventKind: 'special',
    });
    assignments.resolveDrinkMenusForShifts.mockResolvedValue(
      new Map([
        [
          'shift-vip',
          { source: 'event', items: [{ id: 'e1', name: 'VIP Bottle Package', priceRm: 900, category: 'drink' }] },
        ],
      ]),
    );
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call(asSent('vip bottle package'));

    await controller.update(req, res);

    expect(assignments.resolveDrinkMenusForShifts).toHaveBeenCalledWith([
      { shiftId: 'shift-vip', outletId: 'outlet-1', eventKind: 'special' },
    ]);
    expect(out.status).toBe(200);
    const rows = repo.update.mock.calls[0]?.[2] as { description: string }[];
    expect(rows[0]?.description).toBe('VIP Bottle Package');
  });

  it('accepts a rename onto the outlet’s list, stored in the list’s spelling', async () => {
    repo.getById.mockResolvedValue(voucher({ status: 'disputed' }));
    const { req, res, out } = call(asSent('espresso martini'));

    await controller.update(req, res);

    expect(out.status).toBe(200);
    const rows = repo.update.mock.calls[0]?.[2] as { description: string }[];
    expect(rows[0]?.description).toBe('Espresso Martini');
  });
});
