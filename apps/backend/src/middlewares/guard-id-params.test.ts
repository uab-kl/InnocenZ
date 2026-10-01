import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { guardIdParams, isIdParamName, paramNamesOf } from './guard-id-params';

/**
 * MALFORMED IDS ANSWERED 500 (28 Sep 2026 audit, backend).
 *
 * Pinned against a REAL Express router tree — nested the way `router/v1.ts`
 * nests the feature routers — because `router.param` is local to the router
 * that declares the route. A version that registered only at the top would
 * pass a unit test of the callback and guard nothing.
 */

const UUID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

const handled = vi.fn();
let server: Server;
let base = '';
let registered: string[] = [];

beforeAll(async () => {
  const feature = express.Router();
  feature.get('/mine/:date', (req, res) => {
    handled(req.params);
    res.json({ ok: true });
  });
  feature.get('/:id', (req, res) => {
    handled(req.params);
    res.json({ ok: true });
  });
  feature.put('/:id/members/:memberId', (req, res) => {
    handled(req.params);
    res.json({ ok: true });
  });

  const nested = express.Router();
  nested.get('/:roleId', (req, res) => {
    handled(req.params);
    res.json({ ok: true });
  });
  const rbac = express.Router();
  rbac.use('/role', nested);

  const v1 = express.Router();
  v1.use((_req, _res, next) => next());
  v1.use('/thing', feature);
  v1.use('/rbac', rbac);
  registered = guardIdParams(v1);
  // Idempotent: a second pass registers nothing new.
  expect(guardIdParams(v1)).toEqual([]);

  const app = express();
  app.use(express.json());
  app.use('/api/v1', v1);
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function call(method: string, path: string) {
  handled.mockClear();
  const res = await fetch(`${base}${path}`, { method });
  return { status: res.status, body: (await res.json()) as { success: boolean; message: string } };
}

describe('guardIdParams — every id-like route param, in every mounted router', () => {
  it('registers the id params it finds, nested routers included, and nothing else', () => {
    expect(registered).toEqual(['v1>:id', 'v1>:memberId', 'v1>>:roleId']);
  });

  it('a malformed :id is 404 and the handler never runs', async () => {
    const { status, body } = await call('GET', '/thing/not-a-uuid');
    expect(status).toBe(404);
    expect(body).toEqual({ success: false, message: 'Not Found', data: null });
    expect(handled).not.toHaveBeenCalled();
  });

  it('a 15,000-character id is refused before any handler (the review case)', async () => {
    const { status } = await call('GET', `/thing/${'x'.repeat(15_000)}`);
    expect(status).toBe(404);
    expect(handled).not.toHaveBeenCalled();
  });

  it('a valid uuid passes through untouched', async () => {
    const { status } = await call('GET', `/thing/${UUID}`);
    expect(status).toBe(200);
    expect(handled).toHaveBeenCalledWith({ id: UUID });
  });

  it('the SECOND id in a path is judged too', async () => {
    expect((await call('PUT', `/thing/${UUID}/members/nope`)).status).toBe(404);
    expect(handled).not.toHaveBeenCalled();
    expect((await call('PUT', `/thing/${UUID}/members/${UUID}`)).status).toBe(200);
  });

  it('a router two levels down is guarded (rbac → role → :roleId)', async () => {
    expect((await call('GET', '/rbac/role/123')).status).toBe(404);
    expect((await call('GET', `/rbac/role/${UUID}`)).status).toBe(200);
  });

  it('a param that is not an id (:date) is left to its handler', async () => {
    const { status } = await call('GET', '/thing/mine/2026-09-29');
    expect(status).toBe(200);
    expect(handled).toHaveBeenCalledWith({ date: '2026-09-29' });
  });
});

describe('the naming rule', () => {
  it.each(['id', 'agencyId', 'outletId', 'memberId', 'voucherId', 'lineId', 'chargeId'])(
    '%s is an id',
    (name) => expect(isIdParamName(name)).toBe(true),
  );

  it.each(['date', 'slot', 'side', 'code', 'ticket', 'gateway', 'Id', 'identity'])(
    '%s is not',
    (name) => expect(isIdParamName(name)).toBe(false),
  );

  it('reads every param a path declares, arrays of paths included', () => {
    expect(paramNamesOf('/:id/members/:memberId')).toEqual(['id', 'memberId']);
    expect(paramNamesOf(['/a/:id', '/b/:outletId'])).toEqual(['id', 'outletId']);
    expect(paramNamesOf('/literal')).toEqual([]);
  });
});
