import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NOTHING WAITS ON AN ORGANISATION THAT NO LONGER EXISTS (22 Oct 2026).
 *
 * The admin dashboard said "2 need attention" — "Finish quote: Bear Lounge"
 * among them — for venues found in neither `outlet` nor `agency`. Both of the
 * repository's admin reads, the inbox list (`listPaginated`, which the dashboard,
 * Plan Request and Plan Change all page through) and the bell/badge count
 * (`countPending`), must now carry the org-exists test in their WHERE.
 *
 * The database is faked: no row is read or written by this file. That the clause
 * finds the right ROWS is proved against the live table, read-only, by
 * `_close-orphaned-org-records.ts`'s instrument check (it hid exactly the 2 open
 * requests the raw scan called orphaned on 22 Oct).
 */

const h = vi.hoisted(() => ({ wheres: [] as unknown[] }));

vi.mock('@/db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (where: unknown) => {
          h.wheres.push(where);
          const rows = Promise.resolve([{ value: 0 }]);
          return Object.assign(rows, {
            orderBy: () => ({ limit: () => ({ offset: async () => [] }) }),
          });
        },
      }),
    }),
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  AdminRequestRepositoryClass,
  notAwaitingAGoneOrg,
  requestOrgStillExists,
} from './admin-request.repository';

const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as SQL).sql;

const OUTLET_LOOKUP =
  'exists (select 1 from "main"."outlet" o where o.id = "main"."admin_request"."subscriber_id")';
const AGENCY_LOOKUP =
  'exists (select 1 from "main"."agency" a where a.id = "main"."admin_request"."subscriber_id")';

describe('requestOrgStillExists', () => {
  it('looks the org up in the table its type names, and lets a row naming no org through', () => {
    const text = render(requestOrgStillExists());
    expect(text).toContain('"main"."admin_request"."subscriber_id" is null');
    expect(text).toContain('"main"."admin_request"."subscriber_type" is null');
    expect(text).toContain(
      `"main"."admin_request"."subscriber_type" = 'outlet'`,
    );
    expect(text).toContain(OUTLET_LOOKUP);
    expect(text).toContain(
      `"main"."admin_request"."subscriber_type" = 'agency'`,
    );
    expect(text).toContain(AGENCY_LOOKUP);
  });
});

describe('notAwaitingAGoneOrg', () => {
  it('only drops rows still AWAITING an answer — answered history stays listed', () => {
    const { sql, params } = dialect.sqlToQuery(notAwaitingAGoneOrg());
    expect(
      sql.startsWith('(not "main"."admin_request"."status" in ($1, $2) or'),
    ).toBe(true);
    expect(params).toEqual(['pending', 'contacted']);
    expect(sql).toContain(OUTLET_LOOKUP);
  });
});

describe('the admin reads carry it', () => {
  const repository = new AdminRequestRepositoryClass();
  beforeEach(() => {
    h.wheres.length = 0;
  });

  it('listPaginated — with no filter at all, the count and the page both apply it', async () => {
    await repository.listPaginated({ page: 1, pageSize: 5 });
    expect(h.wheres).toHaveLength(2);
    for (const where of h.wheres)
      expect(render(where)).toContain(OUTLET_LOOKUP);
  });

  it('listPaginated — the dashboard\'s "contacted" read (Finish quote: …) applies it beside its own filter', async () => {
    await repository.listPaginated({
      filter: { status: 'contacted' },
      page: 1,
      pageSize: 5,
    });
    const text = render(h.wheres[0]);
    expect(text).toContain(OUTLET_LOOKUP);
    expect(text).toContain('"main"."admin_request"."status" = $');
  });

  it('countPending — the bell and the sidebar badges apply it too', async () => {
    await repository.countPending({ excludeType: 'plan_change' });
    expect(h.wheres).toHaveLength(1);
    const text = render(h.wheres[0]);
    expect(text).toContain(OUTLET_LOOKUP);
    expect(text).toContain(AGENCY_LOOKUP);
  });
});
