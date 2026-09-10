import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { OutletControllerClass } from '@/features/outlet/outlet.controller';
import type { OutletRepositoryClass } from '@/features/outlet/outlet.repository';

/**
 * The regression this file exists for: saving an outlet's NAME silently reset
 * its check-in radius to 50 m.
 *
 * `UpdateOutletSchema` is `CreateOutletSchema.partial()`, and `.partial()`
 * leaves a `.default()` underneath the optional key intact — so a body of
 * `{ name }` parsed to `{ name, geoFenceRadius: 50 }`, which `update()` spreads
 * straight into the repository. A venue fenced at 999 m went back to 50 m every
 * time anyone saved its name, address or logo, and the operator who set 999 m
 * had no idea until staff standing at the door were refused check-in.
 *
 * The schema is unit-tested next door in `schema/update-schema-defaults.test.ts`.
 * This one asserts the thing that actually damaged the row: what the CONTROLLER
 * hands the repository. Both matter — a future refactor could re-introduce the
 * default at either end.
 */

/** Only the method `update()` reaches on a name-only save. */
function fakeOutletRepository(saved: Record<string, unknown>) {
  const row = { id: 'outlet-1', logoImage: null, ...saved };
  const update = vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...row,
    ...patch,
  }));
  return { update } as unknown as OutletRepositoryClass & { update: typeof update };
}

function fakeResponse() {
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
  return res as unknown as Response & typeof res;
}

/** The controller only needs its outlet repository on this path. */
function controllerWith(repo: OutletRepositoryClass) {
  const unused = {} as never;
  return new OutletControllerClass(
    repo,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
    unused,
  );
}

describe('PATCH /outlet preserves the check-in radius', () => {
  it('does not send a radius the caller never typed', async () => {
    const repo = fakeOutletRepository({ name: 'Blossom Palace', geoFenceRadius: 999 });
    const req = {
      params: { id: '11111111-1111-4111-8111-111111111111' },
      // Exactly what the outlet Settings save sends when only the name changed.
      body: { name: 'Blossom Palace' },
      user: { id: 'owner-1' },
    } as unknown as Request;
    const res = fakeResponse();

    await controllerWith(repo).update(req, res);

    expect(res.statusCode).toBe(200);
    const [, patch] = repo.update.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch).not.toHaveProperty('geoFenceRadius');
  });

  it('still writes a radius the caller DID type', async () => {
    const repo = fakeOutletRepository({ name: 'Blossom Palace', geoFenceRadius: 50 });
    const req = {
      params: { id: '11111111-1111-4111-8111-111111111111' },
      body: { geoFenceRadius: 999 },
      user: { id: 'owner-1' },
    } as unknown as Request;
    const res = fakeResponse();

    await controllerWith(repo).update(req, res);

    expect(res.statusCode).toBe(200);
    const [, patch] = repo.update.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.geoFenceRadius).toBe(999);
  });
});
