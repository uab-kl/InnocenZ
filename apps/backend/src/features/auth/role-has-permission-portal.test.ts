import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `roleHasPermission` — the check every agency and outlet member request goes
 * through (`requirePermission`, `requireOutletPermissionIfMember`,
 * `requireAgencyPermissionIfNotOutletMember`) — requires the grant's MODULE to
 * sit on the ROLE'S OWN portal (risk #25).
 *
 * `settings`, `dashboard`, `history`, `billing` and `special_service` are a
 * separate module row per portal, and the key filter alone matched any of
 * them, so a grant placed on another portal's twin row answered here while
 * `/auth/me` (`permissionsForRoleNames`, which already had the rule) hid the
 * button. Pinned by rendering the WHERE clause the query really sends.
 */

const h = vi.hoisted(() => ({
  where: [] as unknown[],
  rows: [] as { id: string }[],
  fail: false,
}));

vi.mock('@/db/index', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: (condition: unknown) => {
      h.where.push(condition);
      return chain;
    },
    limit: async () => {
      if (h.fail) throw new Error('db down');
      return h.rows;
    },
  };
  return { db: { select: () => chain } };
});
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { AuthRepositoryClass } from './auth.repository';

function repo() {
  return new AuthRepositoryClass({} as never, {} as never, {} as never);
}

function renderedWhere(): { sql: string; params: unknown[] } {
  expect(h.where).toHaveLength(1);
  return new PgDialect().sqlToQuery(h.where[0] as SQL);
}

describe('roleHasPermission — the module must be on the role\'s own portal', () => {
  beforeEach(() => {
    h.where = [];
    h.rows = [];
    h.fail = false;
  });

  it('asks for m_module.portal_id = role.portal_id', async () => {
    await repo().roleHasPermission('Owner', 'agency', 'settings', 'update');
    const { sql } = renderedWhere();
    expect(sql).toMatch(
      /"main"\."m_module"\."portal_id" = "main"\."role"\."portal_id"/,
    );
  });

  it('keeps every condition it already had', async () => {
    await repo().roleHasPermission('Finance', 'outlet', 'booking', 'create');
    const { sql, params } = renderedWhere();
    expect(sql).toMatch(/"role"\."role_name" = \$\d/);
    expect(sql).toMatch(/"role"\."status" = \$\d/);
    expect(sql).toMatch(/"portal"\."code" = \$\d/);
    expect(sql).toMatch(/"m_permission"\."status" = \$\d/);
    expect(sql).toMatch(/"m_module"\."status" = \$\d/);
    expect(sql).toMatch(/"m_module"\."module_key" = \$\d/);
    expect(sql).toMatch(/"m_permission"\."permission_type" = \$\d/);
    expect(params).toEqual(
      expect.arrayContaining(['Finance', 'outlet', 'booking', 'create', 'active']),
    );
  });

  it('answers true only when a row comes back', async () => {
    expect(await repo().roleHasPermission('Owner', 'agency', 'settings', 'update')).toBe(false);
    h.rows = [{ id: 'rp-1' }];
    expect(await repo().roleHasPermission('Owner', 'agency', 'settings', 'update')).toBe(true);
  });

  it('never softens to true when the grant table cannot be read', async () => {
    h.fail = true;
    expect(await repo().roleHasPermission('Owner', 'agency', 'settings', 'update')).toBe(false);
  });
});
