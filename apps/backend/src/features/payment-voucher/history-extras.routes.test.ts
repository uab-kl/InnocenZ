import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

/**
 * WHERE `GET /payment-voucher/history-extras` SITS IN THE ROUTER — which is
 * what decides its guard.
 *
 * Express applies `router.use(...)` only to routes registered AFTER it; the
 * export-ticket route once sat above the router-wide role gate and was
 * reachable by any signed-in token. So this pins, from the router's own stack:
 *   · after `requireRole('admin', 'agency')` — the voucher list's guard;
 *   · with no extra gate of its own — the list has none either, so every lane
 *     that can open the vouchers can read what the screen derives from them;
 *   · before `/:id`, which would otherwise read "history-extras" as an id.
 */

const h = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/composition-root.js', () => {
  const anyController = new Proxy(
    {},
    { get: (_target, prop) => (prop === 'then' ? undefined : () => undefined) },
  );
  return {
    paymentVoucherController: anyController,
    historyExtrasController: { get: h.get },
  };
});
vi.mock('@/middlewares/require-role.js', () => ({
  requireRole: (...roles: string[]) =>
    Object.assign((_req: Request, _res: Response, next: NextFunction) => next(), {
      gate: `role:${roles.join(',')}`,
    }),
}));
vi.mock('@/middlewares/require-permission.js', () => ({
  requirePermission: (moduleKey: string, verb: string) =>
    Object.assign((_req: Request, _res: Response, next: NextFunction) => next(), {
      gate: `permission:${moduleKey}:${verb}`,
    }),
}));
vi.mock('@/middlewares/require-sub-role.js', () => ({
  agencyOwnerOrFinance: Object.assign(
    (_req: Request, _res: Response, next: NextFunction) => next(),
    { gate: 'sub-role:owner-or-finance' },
  ),
}));

import router from './payment-voucher.routes';

type Layer = {
  handle: { gate?: string };
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: ((...args: unknown[]) => unknown) & { gate?: string } }>;
  };
};
const stack = (router as unknown as { stack: Layer[] }).stack;
const indexOfGet = (path: string) =>
  stack.findIndex((l) => l.route?.path === path && l.route.methods.get);

describe('GET /payment-voucher/history-extras — placement', () => {
  const at = indexOfGet('/history-extras');

  it('is registered', () => {
    expect(at).toBeGreaterThanOrEqual(0);
  });

  it('sits behind the router-wide agency/admin role gate, like the list', () => {
    const roleGate = stack.findIndex(
      (l) => !l.route && l.handle.gate === 'role:admin,agency',
    );
    expect(roleGate).toBeGreaterThanOrEqual(0);
    expect(at).toBeGreaterThan(roleGate);
    expect(indexOfGet('/')).toBeGreaterThan(roleGate);
  });

  it('carries no gate the list does not carry', () => {
    const gatesOf = (i: number) =>
      (stack[i]?.route?.stack ?? []).map((s) => s.handle.gate).filter(Boolean);
    expect(gatesOf(at)).toEqual(gatesOf(indexOfGet('/')));
  });

  it('is matched before "/:id"', () => {
    expect(at).toBeLessThan(indexOfGet('/:id'));
  });

  it('hands the request to the history-extras controller', async () => {
    h.get.mockReset();
    const route = stack[at]?.route;
    const handler = route?.stack[route.stack.length - 1]?.handle;
    await handler?.({} as Request, {} as Response, () => undefined);
    expect(h.get).toHaveBeenCalledTimes(1);
  });
});
