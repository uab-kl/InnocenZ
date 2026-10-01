import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `requireOutletScopeByParam` — an AGENCY caller on a venue's route (1 Oct 2026).
 *
 * Its link check reads `listApprovedOutletIdsForAgency`, which answered `[]` when
 * its query FAILED, so a database blip refused a linked agency with "your agency
 * is not linked to this outlet" — a wrong reason. The read now throws, and this
 * guard's own catch answers 500.
 */

const h = vi.hoisted(() => ({
  linked: async (_agencyId: string): Promise<string[]> => [],
}));

vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/composition-root.js', () => ({
  // An agency operator: not an admin, no venue of their own, one active agency.
  authRepository: { getRolesForUserIds: async () => [{ roleName: 'agency' }] },
  outletMemberRepository: { listByUser: async () => [] },
  agencyMemberRepository: {
    listByUser: async () => [
      { agencyId: '44444444-4444-4444-8444-444444444444', status: 'active' },
    ],
  },
  agencyOutletRepository: {
    listApprovedOutletIdsForAgency: (agencyId: string) => h.linked(agencyId),
  },
}));

import { requireOutletScopeByParam } from './require-sub-role';

const OUTLET = '77777777-7777-4777-8777-777777777777';

async function guard() {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  const next = vi.fn();
  const req = {
    user: { id: 'agency-user-1' },
    params: { outletId: OUTLET },
    headers: {},
    header: () => undefined,
  } as unknown as Request;
  await requireOutletScopeByParam('outletId')(
    req,
    res as unknown as Response,
    next as unknown as NextFunction,
  );
  return { res, next };
}

beforeEach(() => {
  h.linked = async () => [];
});

describe('requireOutletScopeByParam — an agency caller', () => {
  it('a venue its agency is linked to: through', async () => {
    h.linked = async () => [OUTLET];

    const { res, next } = await guard();

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(0);
  });

  it('a venue it is not linked to: 403, not linked', async () => {
    const { res, next } = await guard();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      success: false,
      message: 'Forbidden — your agency is not linked to this outlet',
      data: null,
    });
  });

  it('the link read FAILS: 500 — never "not linked to this outlet"', async () => {
    h.linked = async () => {
      throw new Error('connection reset');
    };

    const { res, next } = await guard();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ success: false, message: 'Internal Server Error', data: null });
  });
});
