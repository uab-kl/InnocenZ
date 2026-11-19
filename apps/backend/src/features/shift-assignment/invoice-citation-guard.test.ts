import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Billed work is never deleted (Support Desk risk, 16 Nov 2026) — the rule and
 * the query that feeds it, over a fake database. No delete is ever fired.
 */
const h = vi.hoisted(() => ({
  queries: [] as unknown[],
  rows: [] as Record<string, unknown>[],
}));
vi.mock('@/db/index', () => ({
  db: {
    execute: vi.fn(async (query: unknown) => {
      h.queries.push(query);
      return { rows: h.rows };
    }),
  },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { invoiceCitationRefusal, type InvoiceCitation } from './invoice-citation-guard';
import { ShiftAssignmentRepositoryClass } from './shift-assignment.repository';

const citation = (over: Partial<InvoiceCitation> = {}): InvoiceCitation => ({
  invoiceId: 'inv-1',
  weekStart: '2026-11-09',
  outletName: 'Test Venue',
  status: 'issued',
  ...over,
});

describe('invoiceCitationRefusal', () => {
  it('lets an unbilled row through', () => {
    expect(invoiceCitationRefusal([], 'assignment')).toBeNull();
  });

  it('ignores a VOID invoice — it cites nothing that matters', () => {
    expect(invoiceCitationRefusal([citation({ status: 'void' })], 'shift')).toBeNull();
  });

  it.each(['draft', 'issued', 'settled'])('refuses when a %s invoice cites the work', (status) => {
    const message = invoiceCitationRefusal([citation({ status })], 'assignment');
    expect(message).toMatch(/^This assignment is already billed/);
    expect(message).toContain('Test Venue, week of 2026-11-09');
    expect(message).toContain('void or correct the invoice first');
  });

  it('names the shift case and counts the other invoices', () => {
    const message = invoiceCitationRefusal(
      [citation(), citation({ invoiceId: 'inv-2', weekStart: '2026-11-16T00:00:00.000Z' })],
      'shift',
    );
    expect(message).toMatch(/^Work on this shift is already billed/);
    expect(message).toContain('and 1 more invoice(s)');
  });
});

describe('ShiftAssignmentRepository.listInvoiceCitations', () => {
  beforeEach(() => {
    h.queries.length = 0;
    h.rows = [];
  });

  it('asks nothing for an empty list', async () => {
    expect(await new ShiftAssignmentRepositoryClass().listInvoiceCitations([])).toEqual([]);
    expect(h.queries).toHaveLength(0);
  });

  it('matches ANY id in the jsonb array, skips void invoices, and maps the row', async () => {
    h.rows = [{ invoice_id: 'inv-1', week_start: '2026-11-09', outlet_name: 'Test Venue', status: 'issued' }];
    const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const out = await new ShiftAssignmentRepositoryClass().listInvoiceCitations(ids);

    expect(out).toEqual([
      { invoiceId: 'inv-1', weekStart: '2026-11-09', outletName: 'Test Venue', status: 'issued' },
    ]);
    const { sql, params } = new PgDialect().sqlToQuery(h.queries[0] as SQL);
    expect(sql).toContain("status <> 'void'");
    expect(sql).toContain('source_assignment_ids ?| array[$1, $2]::text[]');
    expect(params).toEqual(ids);
  });
});
