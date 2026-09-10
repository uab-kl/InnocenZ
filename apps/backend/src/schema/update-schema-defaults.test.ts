/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { CreateOutletSchema, UpdateOutletSchema } from '@/schema/outlet.schema';
import { UpdateRoleSchema } from '@/schema/rbac.schema';

/**
 * A PATCH schema may never invent a field the caller did not send.
 *
 * `.partial()` makes every key OPTIONAL but does NOT remove a `.default()`
 * underneath it — in zod 4 `z.object({ r: z.number().default(50) }).partial()`
 * still answers `{ r: 50 }` for a body of `{}`. Every controller behind these
 * schemas spreads the parsed result straight into a repository `update()`, so
 * an injected default is written to the row as if the operator had typed it.
 *
 * That is how a venue fenced at 999 m silently went back to 50 m every time
 * someone saved its NAME, ADDRESS or LOGO: PATCH /outlet carries no radius, and
 * zod supplied one. The same shape re-activated deactivated roles, modules,
 * permissions and plans, and turned special-event templates back into normal
 * ones.
 *
 * This test is the guard, and it DISCOVERS its subjects rather than listing
 * them: every `Update*Schema` exported anywhere under `src/schema/` is checked,
 * so a PATCH schema added next year is covered the day it is written. Adding a
 * `.default()` to a base schema fails here rather than quietly overwriting live
 * data months later. If a default is genuinely wanted on CREATE, keep it there
 * and re-declare the field as a plain `.optional()` on the UPDATE schema.
 *
 * That discovery is also why the RBAC and subscription PATCH shapes are now
 * NAMED exports instead of `XSchema.partial()` written inline in a controller —
 * a schema built inside a request handler is one no test can reach.
 */
const modules: Record<string, Record<string, unknown>> = import.meta.glob(
  './*.schema.ts',
  { eager: true },
);

type NamedSchema = readonly [label: string, schema: z.ZodType];

const UPDATE_SCHEMAS: readonly NamedSchema[] = Object.entries(modules)
  .flatMap(([path, mod]) =>
    Object.entries(mod)
      .filter(([name]) => /^Update.*Schema$/.test(name))
      .flatMap(([name, exported]) =>
        exported instanceof z.ZodType
          ? [[`${path.replace('./', '')} → ${name}`, exported] as NamedSchema]
          : [],
      ),
  )
  // A schema whose PATCH body has required fields (the ids a role move acts on,
  // say) is not a "patch the row" shape and cannot be probed with `{}` — the
  // empty-body assertion below would fail on the requirement, not on an
  // invented field.
  .filter(([, schema]) => schema.safeParse({}).success)
  .sort(([a], [b]) => a.localeCompare(b));

describe('update schemas never invent fields', () => {
  it('finds the update schemas to check', () => {
    // Guards the guard: a glob that silently matched nothing would make every
    // assertion below vacuous — a green run proving only that no test ran.
    expect(UPDATE_SCHEMAS.length).toBeGreaterThanOrEqual(8);
  });

  it.each(UPDATE_SCHEMAS)('%s parses an empty body to an empty patch', (_name, schema) => {
    const parsed = schema.safeParse({});

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({});
  });

  it('PATCH /outlet with only a name leaves the radius alone', () => {
    // The exact shape the outlet Settings save sends — no radius anywhere in it.
    const parsed = UpdateOutletSchema.safeParse({ name: 'Blossom Palace' });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('geoFenceRadius');
  });

  it('renaming a deactivated role does not re-activate it', () => {
    const parsed = UpdateRoleSchema.safeParse({ roleName: 'Floor Manager' });

    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty('status');
  });

  it('still accepts a radius the caller really sent', () => {
    const parsed = UpdateOutletSchema.safeParse({ geoFenceRadius: 999 });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ geoFenceRadius: 999 });
  });

  it('still defaults the radius on CREATE, where there is no row to preserve', () => {
    // Guards the other direction: stripping the default from the update schema
    // must not strip it from the create schema, which is where 50 m belongs.
    const parsed = CreateOutletSchema.safeParse({
      packageId: '00000000-0000-4000-8000-000000000000',
      name: 'Blossom Palace',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.geoFenceRadius).toBe(50);
  });
});
