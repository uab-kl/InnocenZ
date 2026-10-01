import type { NextFunction, Request, Response } from 'express';
import { Error } from '@/error/index.js';
import { uuidParam } from '@/util/params.js';

/**
 * A MALFORMED ID IS A 404 — decided ONCE, for every route (28 Sep audit).
 *
 * Every `:id` / `:…Id` route param in this API names a uuid column, and handing
 * a non-uuid to Postgres raises `22P02 invalid input syntax for type uuid`.
 * Each controller catches its own errors, so that surfaced as a 500 wherever a
 * repository re-threw — indistinguishable from the backend being down — and
 * `uuidParam` (util/params.ts) could only fix it one handler at a time, which is
 * how `GET /payment-voucher/not-a-uuid` and `GET /shift/not-a-uuid` kept
 * answering 500 while `/user` and `/agency` answered 404.
 *
 * So the check moves in front of the handlers: `router.param` callbacks run
 * before a matched route's own middleware, and the id never reaches a guard, a
 * query or a log line. 404 rather than 400 because that is the rule
 * `uuidParam` already states — a malformed id is a row that does not exist —
 * and the controllers that already check answer 404; one API, one answer.
 */

/** `id`, or any camelCase name ending in `Id` — `agencyId`, `memberId`, `voucherId`. */
export function isIdParamName(name: string): boolean {
  return name === 'id' || /[a-z0-9]Id$/.test(name);
}

/** The param names a route path declares (`/:id/members/:memberId` → id, memberId). */
export function paramNamesOf(path: unknown): string[] {
  const paths = Array.isArray(path) ? path : [path];
  const names: string[] = [];
  for (const one of paths) {
    if (typeof one !== 'string') continue;
    for (const match of one.matchAll(/[:*]([A-Za-z_$][\w$]*)/g)) names.push(match[1]);
  }
  return names;
}

export function refuseMalformedId(
  _req: Request,
  res: Response,
  next: NextFunction,
  value: unknown,
): void {
  if (typeof value === 'string' && uuidParam(value)) {
    next();
    return;
  }
  res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
}

/** The slice of an Express router this walks. */
type GuardableRouter = {
  stack: { route?: { path?: unknown }; handle?: unknown }[];
  param(name: string, fn: typeof refuseMalformedId): unknown;
};

function isRouter(value: unknown): value is GuardableRouter {
  const candidate = value as Partial<GuardableRouter> | null;
  return (
    typeof value === 'function' &&
    candidate !== null &&
    Array.isArray(candidate.stack) &&
    typeof candidate.param === 'function'
  );
}

/** Which names each router already guards, so a second call registers nothing twice. */
const guarded = new WeakMap<object, Set<string>>();

/**
 * Register `refuseMalformedId` for every id-like param declared on `router` and
 * on every router mounted beneath it. `router.param` is LOCAL to the router
 * that declares the route, which is why this walks the tree rather than
 * registering once at the top — and why the names come from the routes
 * themselves: a `:fooId` added next month is covered without anyone
 * remembering this file. Returns `router:param` labels for the test to read.
 *
 * Call it AFTER every route is mounted.
 */
export function guardIdParams(router: unknown): string[] {
  const registered: string[] = [];
  const walk = (current: GuardableRouter, label: string) => {
    const done = guarded.get(current) ?? new Set<string>();
    guarded.set(current, done);
    for (const layer of current.stack) {
      if (layer.route) {
        for (const name of paramNamesOf(layer.route.path)) {
          if (!isIdParamName(name) || done.has(name)) continue;
          current.param(name, refuseMalformedId);
          done.add(name);
          registered.push(`${label}:${name}`);
        }
      } else if (isRouter(layer.handle)) {
        walk(layer.handle, `${label}>`);
      }
    }
  };
  if (isRouter(router)) walk(router, 'v1');
  return registered;
}
