import type { Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * POST /shift-sale — "Count services too" (owner, 29 Sep 2026), against fakes.
 * `@/db/index` is stubbed, so nothing here can reach the shared database.
 *
 * The total used to be drinks + tips: a row carrying a receipt's SERVICE sales
 * was under-stated the moment a venue logged it, so Log Sales kept such rows
 * read-only. Now services sent are written, services left out are the row's own,
 * and the total always includes them.
 */
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
const scope = vi.hoisted(() => ({
  value: { isAdmin: false, agencyId: null as string | null, outletIds: ['outlet-1'] },
}));
vi.mock('@/util/org-scope', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/util/org-scope')>();
  return { ...actual, resolveOrgScope: vi.fn(async () => scope.value) };
});

import { ShiftSaleControllerClass } from './shift-sale.controller';
import { SALES_CEILING_RM, SALES_TOTAL_TOO_LARGE } from '@/schema/shift-sale.schema';

const SHIFT = '4ff48fdd-1111-4222-8333-944455556666';
const PR_USER = '93ea08b0-1111-4222-8333-944455556666';

const sales = { getByShiftAndPr: vi.fn(), upsert: vi.fn() };
const shifts = {
  getById: vi.fn(async () => ({ id: SHIFT, outletId: 'outlet-1', agencyId: 'agency-1', shiftDate: '2026-09-29' })),
  isAgencyInvited: vi.fn(async () => false),
};
const assignments = {
  listByShift: vi.fn(async () => [
    { prId: PR_USER, userId: PR_USER, status: 'completed', agencyId: 'agency-1' },
  ]),
};
const prs = {
  getById: vi.fn(),
  getByUserId: vi.fn(async () => ({ id: PR_USER, userId: PR_USER })),
};

const controller = new ShiftSaleControllerClass(
  sales as never,
  shifts as never,
  assignments as never,
  prs as never,
  {} as never,
  {} as never,
  {} as never,
);

function call(body: Record<string, unknown>) {
  const req = { body, user: { id: 'outlet-owner' }, headers: {}, header: () => undefined, query: {} } as unknown as Request;
  const out: { status: number; body: { success: boolean; message: string } | null } = { status: 0, body: null };
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

const written = () => sales.upsert.mock.calls[0]?.[0] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  sales.upsert.mockImplementation(async (row: Record<string, unknown>) => ({ id: 'sale-1', ...row }));
  sales.getByShiftAndPr.mockResolvedValue({ serviceUnits: 2, serviceSalesRm: '300.00' });
});

describe('POST /shift-sale — services count in the total', () => {
  it('a log that edits only drinks KEEPS the row’s services and counts them', async () => {
    const { req, res, out } = call({ shiftId: SHIFT, userId: PR_USER, drinkSalesRm: 600, tipSalesRm: 40 });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    expect(sales.getByShiftAndPr).toHaveBeenCalledWith(SHIFT, PR_USER);
    expect(written()).toMatchObject({
      drinkSalesRm: '600.00',
      tipSalesRm: '40.00',
      serviceUnits: 2,
      serviceSalesRm: '300.00',
      totalSalesRm: '940.00',
    });
  });

  it('services the caller sends are written — the stored row is not read', async () => {
    const { req, res, out } = call({
      shiftId: SHIFT,
      userId: PR_USER,
      drinkSalesRm: 100,
      serviceUnits: 1,
      serviceSalesRm: 50,
    });

    await controller.create(req, res);

    expect(out.status).toBe(201);
    expect(sales.getByShiftAndPr).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ serviceUnits: 1, serviceSalesRm: '50.00', totalSalesRm: '150.00' });
  });

  it('a first log for the PR (no row yet) counts no services', async () => {
    sales.getByShiftAndPr.mockResolvedValue(null);
    const { req, res } = call({ shiftId: SHIFT, userId: PR_USER, drinkSalesRm: 80 });

    await controller.create(req, res);

    expect(written()).toMatchObject({ serviceUnits: 0, serviceSalesRm: '0.00', totalSalesRm: '80.00' });
  });

  it('refuses a total the column cannot hold once the stored services are added', async () => {
    sales.getByShiftAndPr.mockResolvedValue({ serviceUnits: 1, serviceSalesRm: '10.00' });
    const { req, res, out } = call({ shiftId: SHIFT, userId: PR_USER, drinkSalesRm: SALES_CEILING_RM });

    await controller.create(req, res);

    expect(out.status).toBe(400);
    expect(out.body?.message).toBe(SALES_TOTAL_TOO_LARGE);
    expect(sales.upsert).not.toHaveBeenCalled();
  });

  it('a failed read of the stored row is a 500, never a silent zero', async () => {
    sales.getByShiftAndPr.mockRejectedValue(new Error('db down'));
    const { req, res, out } = call({ shiftId: SHIFT, userId: PR_USER, drinkSalesRm: 80 });

    await controller.create(req, res);

    expect(out.status).toBe(500);
    expect(sales.upsert).not.toHaveBeenCalled();
  });
});
