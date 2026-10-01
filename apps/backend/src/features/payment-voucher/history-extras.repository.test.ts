import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE SQL BEHIND `GET /payment-voucher/history-extras`, pinned.
 *
 * The parity test proves the RULES against the old web code; it cannot run the
 * SQL. Here drizzle runs for real over a RECORDING driver — no connection, no
 * database, nothing written — so every predicate the repository sends is read
 * back: the tenant scoping above all (each read binds the caller's agency), the
 * ledger's KL-day window in the shift list's own spelling, and the pushdowns.
 */
const h = vi.hoisted(() => ({
  calls: [] as { text: string; params: unknown[] }[],
  rowsFor: (_text: string): unknown[][] => [],
}));

vi.mock('@/db/index', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const client = {
    query: async (config: { text: string }, params: unknown[] = []) => {
      h.calls.push({ text: config.text, params });
      return { rows: h.rowsFor(config.text), rowCount: 0, command: 'SELECT', fields: [] };
    },
  };
  return { db: drizzle({ client: client as never }) };
});
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { HistoryExtrasRepositoryClass } from './history-extras.repository';

const AGENCY = '11111111-1111-4111-8111-111111111111';
const PR_A = '22222222-2222-4222-8222-222222222222';
const PR_B = '33333333-3333-4333-8333-333333333333';
const WINDOW = { fromDate: '2025-09-30', toDate: '2026-09-30' };

/**
 * Lower-cased, one space, and without the `"main".` schema qualifier drizzle
 * puts on every name — so a formatting change in drizzle is not a failure.
 */
const norm = (text: string) =>
  text.replace(/\s+/g, ' ').toLowerCase().replaceAll('"main".', '');
/** The table after a query's FIRST `from` — a subquery's own `from` comes later. */
const mainTable = (text: string) => /^select .*? from "(\w+)"/.exec(norm(text))?.[1];
const from = (table: string) => (text: string) => mainTable(text) === table;
const isLedger = from('shift_assignment');
const isVouchers = from('payment_voucher');
const isLines = from('payment_voucher_line');
const isReceipts = from('payment_voucher_receipt');

function callFor(test: (text: string) => boolean) {
  const found = h.calls.filter((c) => test(c.text));
  expect(found).toHaveLength(1);
  return { text: norm(found[0]!.text), params: found[0]!.params };
}

beforeEach(() => {
  h.calls.length = 0;
  h.rowsFor = (text) => {
    if (isLedger(text)) return [[PR_A], [PR_B]];
    if (isVouchers(text)) return [['v1', PR_A, '2026-09-13', '2026-09-19'], ['v2', PR_B, null, null]];
    if (isLines(text)) return [['v1', 'tip_commission', '12.05', 'r1']];
    if (isReceipts(text)) return [['r1', 'v1', 'verified', 'a1']];
    return [];
  };
});

describe('HistoryExtrasRepository.readRows — the SQL it sends', () => {
  it('reads the ledger as the screen builds it: this agency’s completed bookings, on shifts sent to it, KL day in the window', async () => {
    await new HistoryExtrasRepositoryClass().readRows(AGENCY, WINDOW);
    const { text, params } = callFor(isLedger);
    expect(text).toContain('select distinct "shift_assignment"."pr_id"');
    expect(text).toContain('inner join "shift" on "shift"."id" = "shift_assignment"."shift_id"');
    expect(text).toMatch(/"shift_assignment"\."agency_id" = \$\d+/);
    expect(text).toMatch(/"shift_assignment"\."status" = \$\d+/);
    expect(text).toMatch(
      /"shift"\."id" in \(select "shift_id" from "shift_agency" where "shift_agency"\."agency_id" = \$\d+\)/,
    );
    // ShiftRepository.listPaginated's own expression — the list the screen joins to.
    expect(text).toMatch(
      /\("shift"\."shift_date" at time zone 'asia\/kuala_lumpur'\)::date >= \$\d+::date/,
    );
    expect(text).toMatch(
      /\("shift"\."shift_date" at time zone 'asia\/kuala_lumpur'\)::date <= \$\d+::date/,
    );
    expect(params).toEqual([AGENCY, 'completed', AGENCY, WINDOW.fromDate, WINDOW.toDate]);
  });

  it('confines every voucher read to the caller’s agency and the ledger’s PRs, with the week pushdown', async () => {
    await new HistoryExtrasRepositoryClass().readRows(AGENCY, WINDOW);
    for (const test of [isVouchers, isLines, isReceipts]) {
      const { text, params } = callFor(test);
      expect(text).toMatch(/"payment_voucher"\."agency_id" = \$\d+/);
      expect(text).toMatch(/"payment_voucher"\."pr_id" in \(\$\d+, \$\d+\)/);
      expect(text).toMatch(
        /\("payment_voucher"\."week_start" is null or "payment_voucher"\."week_end" is null or \("payment_voucher"\."week_end" >= \$\d+ and "payment_voucher"\."week_start" <= \$\d+\)\)/,
      );
      expect(params).toEqual(
        expect.arrayContaining([AGENCY, PR_A, PR_B, WINDOW.fromDate, WINDOW.toDate]),
      );
    }
  });

  it('reads lines and receipts only through that agency-scoped voucher set, narrowed to what the fold reads', async () => {
    await new HistoryExtrasRepositoryClass().readRows(AGENCY, WINDOW);
    const lines = callFor(isLines);
    expect(lines.text).toMatch(
      /"payment_voucher_line"\."voucher_id" in \(select "id" from "payment_voucher" where/,
    );
    expect(lines.text).toMatch(/"payment_voucher_line"\."component" in \(\$\d+, \$\d+, \$\d+\)/);
    expect(lines.params).toEqual(
      expect.arrayContaining(['drink_commission', 'tip_commission', 'deduction']),
    );

    const receipts = callFor(isReceipts);
    expect(receipts.text).toMatch(
      /"payment_voucher_receipt"\."voucher_id" in \(select "id" from "payment_voucher" where/,
    );
    expect(receipts.text).toMatch(/"payment_voucher_receipt"\."status" in \(\$\d+, \$\d+\)/);
    expect(receipts.text).toContain('"payment_voucher_receipt"."shift_assignment_id" is not null');
    expect(receipts.params).toEqual(expect.arrayContaining(['approved', 'verified']));
  });

  it('returns the rows in the shape the fold reads', async () => {
    const rows = await new HistoryExtrasRepositoryClass().readRows(AGENCY, WINDOW);
    expect(rows).toEqual({
      ledgerPrIds: [PR_A, PR_B],
      vouchers: [
        { id: 'v1', prId: PR_A, weekStart: '2026-09-13', weekEnd: '2026-09-19' },
        { id: 'v2', prId: PR_B, weekStart: null, weekEnd: null },
      ],
      lines: [{ voucherId: 'v1', component: 'tip_commission', amount: '12.05', receiptId: 'r1' }],
      receipts: [{ id: 'r1', voucherId: 'v1', status: 'verified', shiftAssignmentId: 'a1' }],
    });
    expect(h.calls).toHaveLength(4);
  });

  it('stops after the ledger when nobody is on it — no voucher is read', async () => {
    h.rowsFor = () => [];
    const rows = await new HistoryExtrasRepositoryClass().readRows(AGENCY, WINDOW);
    expect(rows).toEqual({ ledgerPrIds: [], vouchers: [], lines: [], receipts: [] });
    expect(h.calls).toHaveLength(1);
  });
});
