import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GET /payment-voucher/history-extras — the controller against fakes.
 * `@/db/index` is stubbed, so nothing here can reach the shared database.
 *
 * Pins WHOSE figures are answered: the agency comes from the caller's own
 * active membership (the list read's `pickAgencyId`), never from the request.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { HistoryExtrasControllerClass } from './history-extras.controller';
import type { HistoryExtrasRows } from './history-extras';

const OURS = '11111111-1111-4111-8111-111111111111';
const SECOND = '22222222-2222-4222-8222-222222222222';
const FOREIGN = '33333333-3333-4333-8333-333333333333';
const WINDOW = { fromDate: '2025-09-30', toDate: '2026-09-30' };

const ROWS: HistoryExtrasRows = {
  ledgerPrIds: ['pr-1'],
  vouchers: [{ id: 'v1', prId: 'pr-1', weekStart: '2026-09-13', weekEnd: '2026-09-19' }],
  lines: [
    { voucherId: 'v1', component: 'drink_commission', amount: '15.00', receiptId: 'r1' },
    { voucherId: 'v1', component: 'deduction', amount: '-20.00', receiptId: null },
  ],
  receipts: [{ id: 'r1', voucherId: 'v1', status: 'approved', shiftAssignmentId: 'a1' }],
};

const readRows = vi.fn();
const listByUser = vi.fn();
const controller = new HistoryExtrasControllerClass({ readRows }, { listByUser });

function membership(agencyId: string, status = 'active') {
  return { agencyId, status };
}

async function call(opts: {
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  userId?: string | null;
}) {
  const headers = opts.headers ?? {};
  const req = {
    user: opts.userId === null ? undefined : { id: opts.userId ?? 'user-1' },
    query: opts.query ?? WINDOW,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
  const out: { status: number | null; body: any } = { status: null, body: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  } as unknown as Response;
  await controller.get(req, res);
  return out;
}

beforeEach(() => {
  readRows.mockReset().mockResolvedValue(ROWS);
  listByUser.mockReset().mockResolvedValue([membership(OURS)]);
});

describe('HistoryExtrasController.get — scope', () => {
  it('answers for the caller’s own agency', async () => {
    const out = await call({});
    expect(out.status).toBe(200);
    expect(readRows).toHaveBeenCalledWith(OURS, WINDOW);
  });

  it('never takes the agency from the query', async () => {
    const out = await call({ query: { ...WINDOW, agencyId: FOREIGN } });
    expect(out.status).toBe(200);
    expect(readRows).toHaveBeenCalledWith(OURS, WINDOW);
  });

  it('honours the acting-org header only when it names an ACTIVE membership', async () => {
    listByUser.mockResolvedValue([membership(OURS), membership(SECOND)]);
    await call({ headers: { 'x-org-id': SECOND } });
    expect(readRows).toHaveBeenLastCalledWith(SECOND, WINDOW);

    await call({ headers: { 'x-org-id': FOREIGN } });
    expect(readRows).toHaveBeenLastCalledWith(OURS, WINDOW);
  });

  it.each([
    ['no membership', []],
    ['only a deactivated membership', [membership(OURS, 'inactive')]],
  ])('refuses a caller with %s, reading nothing', async (_label, memberships) => {
    listByUser.mockResolvedValue(memberships);
    const out = await call({});
    expect(out.status).toBe(403);
    expect(out.body).toMatchObject({ success: false, data: null });
    expect(readRows).not.toHaveBeenCalled();
  });

  it('refuses a request with no signed-in user', async () => {
    const out = await call({ userId: null });
    expect(out.status).toBe(403);
    expect(listByUser).not.toHaveBeenCalled();
    expect(readRows).not.toHaveBeenCalled();
  });
});

describe('HistoryExtrasController.get — window', () => {
  it.each([
    ['no window', {}],
    ['a malformed date', { fromDate: '30/09/2025', toDate: '2026-09-30' }],
    ['a reversed window', { fromDate: '2026-09-30', toDate: '2025-09-30' }],
    ['more than a year', { fromDate: '2024-09-30', toDate: '2026-09-30' }],
  ])('answers 400 for %s, reading nothing', async (_label, query) => {
    const out = await call({ query });
    expect(out.status).toBe(400);
    expect(out.body.success).toBe(false);
    expect(typeof out.body.message).toBe('string');
    expect(readRows).not.toHaveBeenCalled();
  });
});

describe('HistoryExtrasController.get — answer', () => {
  it('states commission per assignment and penalty per voucher, in sen', async () => {
    const out = await call({});
    expect(out.body).toEqual({
      success: true,
      message: 'OK',
      data: {
        ...WINDOW,
        assignments: [{ assignmentId: 'a1', drinkCommissionSen: 1500, tipCommissionSen: 0 }],
        vouchers: [{ voucherId: 'v1', penaltySen: 2000 }],
      },
    });
  });

  it('answers a failed read with a bare 500 — no detail', async () => {
    readRows.mockRejectedValue(Object.assign(new Error('boom'), { detail: 'secret column' }));
    const out = await call({});
    expect(out.status).toBe(500);
    expect(out.body.success).toBe(false);
    expect(JSON.stringify(out.body)).not.toContain('secret');
  });
});
