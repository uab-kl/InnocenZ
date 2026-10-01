import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner, 29 Sep 2026: "Add Void". A voided bill is owed by nobody, so no
 * payment path may treat it as payable: the FPX checkout refuses it, and money
 * a gateway reports for it anyway is RECORDED with a refund-due note but never
 * turns the bill back into `paid`. Against fakes — no database.
 */
const h = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const state = {
    selects: [] as Row[][],
    inserts: [] as Row[][],
    updates: [] as { set: Row }[],
  };
  const query = (answer: () => unknown) => {
    const builder: Record<string, unknown> = {};
    for (const step of ['from', 'where', 'orderBy', 'limit', 'for']) builder[step] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve().then(answer).then(resolve, reject);
    return builder;
  };
  const tx = {
    select: () => query(() => state.selects.shift() ?? []),
    insert: () => ({
      values: (values: Row) => {
        state.inserts.push([values]);
        return { returning: async () => [{ id: 'pay-new', ...values }] };
      },
    }),
    update: () => ({
      set: (set: Row) => ({
        where: () => {
          state.updates.push({ set });
          const done = Promise.resolve([{ id: 'pay-prior', ...set }]);
          return Object.assign(done, { returning: () => done });
        },
      }),
    }),
  };
  const db = { transaction: (body: (t: typeof tx) => Promise<unknown>) => body(tx) };
  return { state, db, error: vi.fn() };
});

vi.mock('@/db/index.js', () => ({ db: h.db }));
vi.mock('@/env.js', () => ({ env: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: h.error, debug: vi.fn() },
}));
vi.mock('./auto-charge.js', () => ({
  AUTO_CHARGE_ACTOR: 'job:auto-charge',
  autoChargeInFlight: () => false,
  notifyAutoChargeFailed: vi.fn(),
}));
vi.mock('./payment-gateway.js', () => ({ getGateway: () => null, listGateways: () => [] }));
vi.mock('@/util/org-scope.js', () => ({
  resolveOrgScope: async () => ({ isAdmin: false, agencyId: 'agency-1', outletIds: [] }),
  pickedOrgKind: () => null,
  resolveActingOrgId: async () => null,
}));

import { SubscriptionPaymentControllerClass } from './subscription-payment.controller';
import { SubscriptionPaymentRepositoryClass } from './subscription-payment.repository';

const VOID_BILL = {
  id: 'inv-1',
  invoiceNo: 'INV-000049',
  status: 'void',
  amount: '125.00',
  currency: 'MYR',
  subscriberType: 'agency',
  subscriberId: 'agency-1',
  subscriberName: 'Test Agency',
};

beforeEach(() => {
  h.state.selects = [];
  h.state.inserts = [];
  h.state.updates = [];
  h.error.mockReset();
});

describe('FPX checkout refuses a voided bill', () => {
  it('answers 409 in words and opens nothing', async () => {
    const payments = { listFor: vi.fn(async () => []), recordAttempt: vi.fn() };
    const controller = new SubscriptionPaymentControllerClass(
      payments as never,
      { getById: vi.fn(async () => VOID_BILL) } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const out = { status: 0, body: null as null | { message: string } };
    const res = {
      status(code: number) {
        out.status = code;
        return res;
      },
      json(payload: { message: string }) {
        out.body = payload;
        return res;
      },
    } as unknown as Response;

    await controller.checkout({ body: { invoiceIds: ['inv-1'] }, user: { id: 'owner-1' } } as unknown as Request, res);

    expect(out.status).toBe(409);
    expect(out.body?.message).toBe('INV-000049 was voided — there is nothing to pay');
    expect(payments.recordAttempt).not.toHaveBeenCalled();
  });
});

describe('recordAttempt on a voided bill — recorded, never settled', () => {
  const repository = new SubscriptionPaymentRepositoryClass();

  it('money a gateway reports for it is written with a refund-due note, and the bill stays void', async () => {
    h.state.selects.push([VOID_BILL], []);

    const result = await repository.recordAttempt({
      subscriptionInvoiceId: 'inv-1',
      methodType: 'fpx',
      gateway: 'fiuu',
      gatewayPaymentId: 'fiuu-123',
      outcome: 'succeeded',
      actor: 'gateway:fiuu',
    });

    expect(result).toMatchObject({ ok: true, alreadyRecorded: false, paidTwice: true });
    expect(h.state.inserts).toEqual([
      [
        expect.objectContaining({
          subscriptionInvoiceId: 'inv-1',
          // NON-SETTLING since 30 Sep 2026: `succeeded` made a second payment on
          // the same voided bill collide with the one-settlement index.
          status: 'pending',
          paidAt: null,
          amount: '125.00',
          failureReason: expect.stringMatching(/PAID FOR A VOIDED BILL — money taken for INV-000049.*refund due/),
        }),
      ],
    ]);
    // No UPDATE at all: nothing turned the bill to `paid`.
    expect(h.state.updates).toEqual([]);
    expect(h.error).toHaveBeenCalledTimes(1);
  });

  it('a pending checkout that clears after the void is flagged on its own row, not re-recorded', async () => {
    h.state.selects.push([VOID_BILL], [{ id: 'pay-prior', status: 'pending', reference: 'chk_1' }]);

    const result = await repository.recordAttempt({
      subscriptionInvoiceId: 'inv-1',
      methodType: 'fpx',
      gateway: 'fiuu',
      gatewayPaymentId: 'fiuu-123',
      outcome: 'succeeded',
      actor: 'gateway:fiuu',
    });

    expect(result).toMatchObject({ ok: true, alreadyRecorded: true, paidTwice: true });
    expect(h.state.inserts).toEqual([]);
    expect(h.state.updates).toEqual([
      { set: expect.objectContaining({ failureReason: expect.stringMatching(/PAID FOR A VOIDED BILL/) }) },
    ]);
  });

  it('a decline on a voided bill is ordinary history', async () => {
    h.state.selects.push([VOID_BILL]);

    const result = await repository.recordAttempt({
      subscriptionInvoiceId: 'inv-1',
      methodType: 'card',
      outcome: 'failed',
      failureReason: 'Insufficient funds',
      actor: 'gateway:fiuu',
    });

    expect(result).toMatchObject({ ok: true, alreadyRecorded: false });
    expect(h.state.inserts[0]?.[0]).toMatchObject({ status: 'failed', failureReason: 'Insufficient funds' });
    expect(h.state.updates).toEqual([]);
  });
});
