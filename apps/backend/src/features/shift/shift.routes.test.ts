import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

/**
 * `POST /shift/batch` IS GATED EXACTLY AS `POST /shift` (30 Sep 2026).
 *
 * A batch is only a list of posts, so it must ask the same two questions — the
 * outlet (or admin) ROLE, then the `booking:create` LANE that Outlet Finance and
 * the Director do not hold. Pinned by identity: the batch route runs the very
 * same guard functions the single post runs, so a later change to one door's
 * gate cannot quietly leave the other behind. No database: the guards and the
 * controller are stand-ins that only record what they are.
 */

const h = vi.hoisted(() => ({
  controller: {
    list: vi.fn(),
    getById: vi.fn(),
    create: vi.fn(),
    createBatch: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/composition-root.js', () => ({ shiftController: h.controller }));
vi.mock('@/middlewares/require-role.js', () => ({
  requireRole: (...roles: string[]) =>
    Object.assign((_req: Request, _res: Response, next: NextFunction) => next(), { roles }),
}));
vi.mock('@/middlewares/require-sub-role.js', () => ({
  outletOwnerOrOps: Object.assign(
    (_req: Request, _res: Response, next: NextFunction) => next(),
    { lane: 'booking:create' },
  ),
}));

import router from './shift.routes';

type Route = {
  path: string;
  methods: Record<string, boolean>;
  stack: { handle: (req: Request, res: Response, next: NextFunction) => unknown }[];
};

const layers = (router as unknown as { stack: { route?: Route }[] }).stack;

function route(method: string, path: string): Route {
  const found = layers.find((l) => l.route?.path === path && l.route.methods[method])?.route;
  if (!found) throw new Error(`${method.toUpperCase()} ${path} is not registered`);
  return found;
}

/** Every handler before the controller — the gate. */
const guardsOf = (r: Route) => r.stack.slice(0, -1).map((layer) => layer.handle);

describe('POST /shift/batch', () => {
  it('runs the very same role and lane guards as POST /shift', () => {
    const batchGuards = guardsOf(route('post', '/batch'));

    expect(batchGuards).toEqual(guardsOf(route('post', '/')));
    expect(batchGuards).toHaveLength(2);
    expect((batchGuards[0] as unknown as { roles: string[] }).roles).toEqual(['admin', 'outlet']);
    expect((batchGuards[1] as unknown as { lane: string }).lane).toBe('booking:create');
  });

  it('ends at the batch handler, not the single post', () => {
    const handler = route('post', '/batch').stack.at(-1)?.handle;
    handler?.({} as Request, {} as Response, () => undefined);

    expect(h.controller.createBatch).toHaveBeenCalledTimes(1);
    expect(h.controller.create).not.toHaveBeenCalled();
  });

  it('sits above the /:id writes, so it can never be read as an id', () => {
    const batchAt = layers.findIndex((l) => l.route?.path === '/batch');
    const idWrites = layers
      .map((l, index) => ({ route: l.route, index }))
      .filter(({ route: r }) => r?.path === '/:id' && !r.methods.get);

    expect(idWrites.length).toBeGreaterThan(0);
    for (const { index } of idWrites) expect(batchAt).toBeLessThan(index);
  });
});
