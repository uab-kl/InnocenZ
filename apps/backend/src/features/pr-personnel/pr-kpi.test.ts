import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `loadPrKpiScores` — whose shifts a score may be built from, and what a server
 * without the private weights setting does.
 *
 * An agency sees its OWN work with a PR and nothing a rival booked; an admin
 * sees the PR's shifts at every agency. Pinned twice over: the query's WHERE
 * clause is rendered and read, and the rows a (hypothetically loosened) query
 * hands back are re-checked before they are scored.
 *
 * The weights come only from the server's `KPI_WEIGHTS` setting (owner, 29 Sep
 * 2026). Without a usable one nothing is queried, every score is blank ("—"),
 * and the log says so once — naming the setting, never its value.
 *
 * Nothing here opens a database connection: `db` is a recording fake.
 */

const h = vi.hoisted(() => ({
  calls: [] as {
    fields: Record<string, unknown>;
    table: unknown;
    joined: unknown;
    on: unknown;
    condition: unknown;
  }[],
  rows: [] as Record<string, unknown>[],
  fail: false,
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/db/index', () => ({
  db: {
    select: (fields: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        innerJoin: (joined: unknown, on: unknown) => ({
          where: async (condition: unknown) => {
            h.calls.push({ fields, table, joined, on, condition });
            if (h.fail) throw new Error('connection reset');
            return h.rows;
          },
        }),
      }),
    }),
  },
}));
// The SAME functions for every copy of the module, so a test that loads a fresh
// `pr-kpi` (see below) still sees what it logs.
vi.mock('@/util/logger', () => ({ logger: h.logger }));

import { loadPrKpiScores } from './pr-kpi';
import { ShiftAssignmentTable } from '@/features/shift-assignment/shift-assignment.model';
import { ShiftTable } from '@/features/shift/shift.model';

/**
 * ILLUSTRATIVE WEIGHTS — NOT THE REAL ONES, which live only in each server's
 * setting. Every score below but one is built from reliability alone and so is
 * the same under any weights; the one that is not says so.
 */
const TEST_WEIGHTS = 'reliability=3,punctuality=1,rating=1';

const AGENCY_A = '44444444-4444-4444-8444-444444444444';
const AGENCY_B = '66666666-6666-4666-8666-666666666666';
const PR_1 = '11111111-1111-4111-8111-111111111111';
const PR_2 = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
/** 10:00 in Kuala Lumpur on 29 Sep 2026: the window is [1 Jul, 29 Sep). */
const NOW = new Date('2026-09-29T02:00:00Z');

function fetched(
  prId: string,
  agencyId: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    prId,
    agencyId,
    status,
    shiftDate: '2026-09-10',
    // No clock time, so only kept-versus-missed decides these scores.
    slot: 'Late night',
    checkInAt: status === 'completed' ? new Date('2026-09-10T14:00:00Z') : null,
    cancelFeeRm: null,
    cancelFeeWaivedAt: null,
    stars: null,
    ...overrides,
  };
}

/** Every line logged at any level, as one string to search. */
function everythingLogged(): string {
  return JSON.stringify(
    Object.values(h.logger).map((fn) => fn.mock.calls),
    (_key, value: unknown) => (value instanceof Error ? value.message : value),
  );
}

const dialect = new PgDialect();
const render = (value: unknown) => dialect.sqlToQuery(value as SQL);

beforeEach(() => {
  h.calls.length = 0;
  h.rows = [];
  h.fail = false;
  vi.clearAllMocks();
  // Explicit, whatever the machine's own .env holds.
  vi.stubEnv('KPI_WEIGHTS', TEST_WEIGHTS);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the query', () => {
  it('an agency: ONE query, confined to its own assignments inside the window', async () => {
    await loadPrKpiScores({ prIds: [PR_1, PR_2, PR_1], agencyId: AGENCY_A, now: NOW });

    expect(h.calls).toHaveLength(1);
    const [call] = h.calls;
    expect(call.table).toBe(ShiftAssignmentTable);
    expect(call.joined).toBe(ShiftTable);
    const where = render(call.condition);
    expect(where.sql).toContain('"main"."shift_assignment"."agency_id" = $');
    expect(where.sql).toContain('"main"."shift"."shift_date" >= $');
    expect(where.sql).toContain('"main"."shift"."shift_date" < $');
    expect(where.sql).toMatch(/"main"."shift_assignment"."pr_id" in \(\$\d+, \$\d+\)/);
    // De-duplicated ids, the asking agency, and [1 Jul, 29 Sep).
    expect(where.params).toEqual([PR_1, PR_2, '2026-07-01', '2026-09-29', AGENCY_A]);
  });

  it('an admin (agencyId null): the same query with no agency predicate', async () => {
    await loadPrKpiScores({ prIds: [PR_1], agencyId: null, now: NOW });

    expect(h.calls).toHaveLength(1);
    const where = render(h.calls[0].condition);
    expect(where.sql).not.toContain('agency_id');
    expect(where.params).toEqual([PR_1, '2026-07-01', '2026-09-29']);
  });

  it('reads the stars through the rated assignment, never by PR alone', async () => {
    await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });

    const stars = render(h.calls[0].fields.stars);
    expect(stars.sql).toContain(
      '"main"."rating"."shift_assignment_id" = "main"."shift_assignment"."id"',
    );
    expect(stars.sql).not.toContain('"pr_id"');
    expect(stars.sql).toMatch(/limit 1/i);
  });

  it('asks nothing for an empty page', async () => {
    const scores = await loadPrKpiScores({ prIds: [], agencyId: AGENCY_A, now: NOW });
    expect(scores.size).toBe(0);
    expect(h.calls).toHaveLength(0);
  });
});

describe('the rows that reach the score', () => {
  it("a rival agency's rows never reach an agency's score — even if the query let them through", async () => {
    // PR_1 kept a shift for A and missed one for B.
    h.rows = [fetched(PR_1, AGENCY_A, 'completed'), fetched(PR_1, AGENCY_B, 'no_show')];

    const forA = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });
    const forB = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_B, now: NOW });
    const forAdmin = await loadPrKpiScores({ prIds: [PR_1], agencyId: null, now: NOW });

    expect(forA.get(PR_1)).toBe(100);
    expect(forB.get(PR_1)).toBe(0);
    // An admin sees the PR's shifts at every agency.
    expect(forAdmin.get(PR_1)).toBe(50);
  });

  it('a PR nobody asked about is dropped', async () => {
    h.rows = [fetched(PR_1, AGENCY_A, 'completed'), fetched(STRANGER, AGENCY_A, 'completed')];

    const scores = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });
    expect([...scores.keys()]).toEqual([PR_1]);
  });

  it('a PR with nothing to score is simply absent (the caller spells it null)', async () => {
    h.rows = [fetched(PR_1, AGENCY_A, 'leave_approved')];

    const scores = await loadPrKpiScores({ prIds: [PR_1, PR_2], agencyId: AGENCY_A, now: NOW });
    expect(scores.get(PR_1)).toBeNull();
    expect(scores.has(PR_2)).toBe(false);
  });

  it("scores with the weights this server's setting holds", async () => {
    // Kept, but checked in 30 minutes after a 22:00 KL start: reliability 1,
    // punctuality 0 — the one score in this file that depends on the weights.
    h.rows = [
      fetched(PR_1, AGENCY_A, 'completed', {
        slot: '22:00 - 04:00',
        checkInAt: new Date('2026-09-10T14:30:00Z'),
      }),
    ];

    const underTest = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });
    vi.stubEnv('KPI_WEIGHTS', 'reliability=1,punctuality=1,rating=1');
    const underEven = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });

    // (3·1 + 1·0) / 4, then (1·1 + 1·0) / 2.
    expect(underTest.get(PR_1)).toBe(75);
    expect(underEven.get(PR_1)).toBe(50);
    // A usable setting is read silently.
    for (const fn of Object.values(h.logger)) expect(fn).not.toHaveBeenCalled();
  });

  it('fails soft: a broken query leaves the scores blank and logs the error, never a score', async () => {
    h.fail = true;

    const scores = await loadPrKpiScores({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });
    expect(scores.size).toBe(0);
    expect(h.logger.error).toHaveBeenCalledTimes(1);
    expect(h.logger.error.mock.calls[0]).toEqual([
      '[loadPrKpiScores] query failed:',
      expect.any(Error),
    ]);
  });
});

describe('without a usable KPI_WEIGHTS setting', () => {
  /**
   * A fresh copy of the module. The warning is once per PROCESS, which inside
   * one test file means once per module instance — so each test starts clean.
   */
  async function freshLoader() {
    vi.resetModules();
    return (await import('./pr-kpi')).loadPrKpiScores;
  }

  it('unset: no query, every score blank, and ONE warning however often it is asked', async () => {
    vi.stubEnv('KPI_WEIGHTS', undefined);
    const load = await freshLoader();
    h.rows = [fetched(PR_1, AGENCY_A, 'completed')];

    const forAgency = await load({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });
    const forAdmin = await load({ prIds: [PR_1, PR_2], agencyId: null, now: NOW });
    // Once per process, not once per cause: turning malformed later adds nothing.
    vi.stubEnv('KPI_WEIGHTS', 'nonsense');
    const later = await load({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });

    expect(forAgency.size).toBe(0);
    expect(forAdmin.size).toBe(0);
    expect(later.size).toBe(0);
    expect(h.calls).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(h.logger.warn.mock.calls[0]).toEqual([
      expect.stringContaining('KPI_WEIGHTS is not set'),
    ]);
    expect(h.logger.error).not.toHaveBeenCalled();
  });

  it('blank is the same as unset', async () => {
    vi.stubEnv('KPI_WEIGHTS', '   ');
    const load = await freshLoader();
    h.rows = [fetched(PR_1, AGENCY_A, 'completed')];

    const scores = await load({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });

    expect(scores.size).toBe(0);
    expect(h.calls).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    expect(h.logger.warn.mock.calls[0]).toEqual([
      expect.stringContaining('KPI_WEIGHTS is not set'),
    ]);
  });

  it('malformed: the same, and nothing logged carries any part of the value', async () => {
    // Distinctive pieces, so a leak of any one of them would be found.
    const value = 'reliability=424242, punctuality=oops ,rating=171717';
    vi.stubEnv('KPI_WEIGHTS', value);
    const load = await freshLoader();
    h.rows = [fetched(PR_1, AGENCY_A, 'completed')];

    const scores = await load({ prIds: [PR_1], agencyId: AGENCY_A, now: NOW });

    expect(scores.size).toBe(0);
    expect(h.calls).toHaveLength(0);
    expect(h.logger.warn).toHaveBeenCalledTimes(1);
    const logged = everythingLogged();
    // The instrument reads the logged text: it finds the setting's name…
    expect(logged).toContain('KPI_WEIGHTS is malformed');
    // …so it would find the value, or any piece of it, were it there.
    for (const piece of [value, '424242', 'oops', '171717']) {
      expect(logged).not.toContain(piece);
    }
  });
});
