import type { NextFunction, Request, Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `POST /rating` IS DECIDED BY THE `rating` MODULE (29 Sep 2026).
 *
 * It asked `booking:create` — Post Job's permission — while the web offers the
 * rating button on `ratePrs` = `rating:create`. The two sets happened to agree
 * on the live table, so nothing visible was wrong; but the `rating` rows in
 * `role_permission` decided nothing on the server, and the first grant change
 * to either module would have split the button from the write.
 *
 * No database: the permission gate is replaced by one that answers from a
 * per-test grant list, so what is pinned is WHICH question the route asks.
 */

const h = vi.hoisted(() => ({
  /** `module:verb` the caller holds, for the fake gate below. */
  held: new Set<string>(),
  asked: [] as string[],
  upsert: vi.fn(),
  list: vi.fn(),
}));

vi.mock('@/composition-root.js', () => ({
  ratingController: { upsert: h.upsert, list: h.list },
}));
vi.mock('@/middlewares/require-role.js', () => ({
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('@/middlewares/require-permission.js', () => ({
  requirePermission: (moduleKey: string, verb: string) => {
    const key = `${moduleKey}:${verb}`;
    h.asked.push(key);
    return (_req: Request, res: Response, next: NextFunction) =>
      h.held.has(key) ? next() : res.status(403).json({ success: false });
  },
}));

import router from './rating.routes';

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: Request, res: Response, next: NextFunction) => unknown }>;
  };
};

/** Runs the POST / chain the way Express would, stopping where a handler does not call next. */
async function post(): Promise<{ status: number | null }> {
  const layer = (router as unknown as { stack: Layer[] }).stack.find(
    (l) => l.route?.path === '/' && l.route.methods.post,
  );
  if (!layer?.route) throw new Error('POST / is not registered');
  const out: { status: number | null } = { status: null };
  const res = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json() {
      return res;
    },
  } as unknown as Response;
  for (const { handle } of layer.route.stack) {
    let advanced = false;
    await handle({} as Request, res, () => {
      advanced = true;
    });
    if (!advanced) break;
  }
  return out;
}

beforeEach(() => {
  h.held.clear();
  h.upsert.mockReset();
});

describe('POST /rating — the rating module decides', () => {
  it('asks rating:create, and never booking:create', () => {
    expect(h.asked).toContain('rating:create');
    expect(h.asked).not.toContain('booking:create');
  });

  it('a lane holding rating:create reaches the write', async () => {
    h.held.add('rating:create');
    await post();
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });

  it('booking:create alone no longer opens it — 403, nothing written', async () => {
    h.held.add('booking:create');
    const out = await post();
    expect(out.status).toBe(403);
    expect(h.upsert).not.toHaveBeenCalled();
  });
});
