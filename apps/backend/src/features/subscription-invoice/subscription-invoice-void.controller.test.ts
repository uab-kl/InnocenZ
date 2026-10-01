import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Owner, 29 Sep 2026: "Add Void". The HTTP half: `PATCH /subscription-invoice/
 * :id/void` and the paid/unpaid route's refusal to touch a void bill. Driven
 * against recording fakes — no gate is probed with a write.
 */
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { SubscriptionInvoiceControllerClass } from './subscription-invoice.controller';

const bill = (overrides: Record<string, unknown> = {}) => ({
  id: 'inv-1',
  invoiceNo: 'INV-000049',
  status: 'unpaid',
  amount: '125.00',
  note: null,
  subscriberType: 'agency',
  subscriberId: 'agency-1',
  ...overrides,
});

function setup() {
  const repository = {
    getById: vi.fn(async () => bill({ status: 'void', note: 'Voided: Duplicate charge' })),
    voidUnpaid: vi.fn(),
  };
  const payments = { recordAttempt: vi.fn(), voidSettlements: vi.fn() };
  const controller = new SubscriptionInvoiceControllerClass(
    repository as never,
    {} as never,
    payments as never,
    { listFor: vi.fn(async () => []) } as never,
  );
  return { controller, repository, payments };
}

function call(body: unknown) {
  const out = { status: 0, body: null as null | { success: boolean; message: string; data: unknown } };
  const req = { params: { id: 'inv-1' }, body, user: { id: 'admin-1' } } as unknown as Request;
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: typeof out.body) {
      out.body = payload;
      return res;
    },
  } as unknown as Response;
  return { req, res, out };
}

let ctx: ReturnType<typeof setup>;
beforeEach(() => {
  ctx = setup();
});

describe('PATCH /:id/void', () => {
  it('a void needs a reason — nothing is asked of the ledger without one', async () => {
    for (const body of [{}, { reason: '  ' }, { reason: 'ok' }]) {
      const { req, res, out } = call(body);
      await ctx.controller.voidInvoice(req, res);
      expect(out.status).toBe(400);
      expect(out.body?.message).toMatch(/reason is required/);
    }
    expect(ctx.repository.voidUnpaid).not.toHaveBeenCalled();
  });

  it('voids, confirms in the server’s own sentence, and hands the audit the row it replaced', async () => {
    ctx.repository.voidUnpaid.mockResolvedValue({
      ok: true,
      before: bill(),
      after: bill({ status: 'void', note: 'Voided: Duplicate charge' }),
    });
    const { req, res, out } = call({ reason: '  Duplicate charge ' });

    await ctx.controller.voidInvoice(req, res);

    expect(ctx.repository.voidUnpaid).toHaveBeenCalledWith({ id: 'inv-1', reason: 'Duplicate charge', actor: 'admin-1' });
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({
      success: true,
      message: 'INV-000049 voided — it no longer counts as owed, and the reason is kept on its record.',
      data: { status: 'void' },
    });
    expect((req as Request & { auditOldData?: unknown }).auditOldData).toEqual({
      id: 'inv-1',
      invoiceNo: 'INV-000049',
      status: 'unpaid',
      amount: '125.00',
      note: null,
    });
  });

  it('a refusal is answered with its own status and sentence', async () => {
    ctx.repository.voidUnpaid.mockResolvedValue({
      ok: false,
      refusal: { status: 409, message: 'INV-000049 is paid — only an unpaid bill can be voided. Nothing was changed.' },
    });
    const { req, res, out } = call({ reason: 'Duplicate charge' });

    await ctx.controller.voidInvoice(req, res);

    expect(out).toEqual({
      status: 409,
      body: { success: false, message: expect.stringMatching(/only an unpaid bill can be voided/), data: null },
    });
  });

  it('an id that names no bill is a 404', async () => {
    ctx.repository.voidUnpaid.mockResolvedValue({ ok: false, notFound: true });
    const { req, res, out } = call({ reason: 'Duplicate charge' });

    await ctx.controller.voidInvoice(req, res);

    expect(out.status).toBe(404);
  });
});

describe('PUT /:id — paid / unpaid never touches a void bill', () => {
  it.each(['paid', 'unpaid'] as const)('marking a void bill %s is refused, and nothing is recorded', async (status) => {
    const { req, res, out } = call({ status });

    await ctx.controller.update(req, res);

    expect(out.status).toBe(409);
    expect(out.body?.message).toMatch(/INV-000049 was voided — a void bill cannot be marked paid or unpaid/);
    expect(ctx.payments.recordAttempt).not.toHaveBeenCalled();
    expect(ctx.payments.voidSettlements).not.toHaveBeenCalled();
  });

  it('the route no longer accepts `void` as a status — the void has its own guarded action', async () => {
    const { req, res, out } = call({ status: 'void' });

    await ctx.controller.update(req, res);

    expect(out.status).toBe(400);
    expect(ctx.payments.voidSettlements).not.toHaveBeenCalled();
  });
});
