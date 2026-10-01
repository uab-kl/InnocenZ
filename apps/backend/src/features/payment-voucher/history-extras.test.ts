import { describe, expect, it } from 'vitest';
import {
  computeHistoryExtras,
  foldHistoryExtras,
  HistoryExtrasQuerySchema,
  type HistoryLineRow,
  type HistoryReceiptRow,
  MAX_HISTORY_WINDOW_DAYS,
  selectHistoryVoucherIds,
} from './history-extras';

/**
 * The rules behind `GET /payment-voucher/history-extras`, case by case. The
 * commission and penalty cases are the web's own (history-take-home.test.ts,
 * `commissionSenByAssignment` / `voucherPenaltyRm`), moved here with the code;
 * history-extras.parity.test.ts compares the whole against the web original.
 */

const WINDOW = { fromDate: '2025-09-30', toDate: '2026-09-30' };

describe('HistoryExtrasQuerySchema', () => {
  it('accepts a one-year window, both ends inclusive', () => {
    expect(HistoryExtrasQuerySchema.safeParse(WINDOW)).toMatchObject({
      success: true,
      data: WINDOW,
    });
  });

  it.each([
    ['a missing fromDate', { toDate: '2026-09-30' }],
    ['a missing toDate', { fromDate: '2026-09-01' }],
    ['a timestamp', { fromDate: '2026-09-01T00:00:00Z', toDate: '2026-09-30' }],
    ['a day that does not exist', { fromDate: '2026-02-30', toDate: '2026-09-30' }],
    ['a repeated parameter (an array)', { fromDate: ['2026-09-01', '2026-09-02'], toDate: '2026-09-30' }],
    ['a reversed window', { fromDate: '2026-09-30', toDate: '2026-09-01' }],
    ['a window past the cap', { fromDate: '2025-09-28', toDate: '2026-09-30' }],
    // A real day to JavaScript, not to Postgres — must be a 400, not a 500.
    ['year 0000', { fromDate: '0000-01-01', toDate: '0000-12-31' }],
    ['a day past 2100', { fromDate: '2101-01-01', toDate: '2101-01-31' }],
  ])('refuses %s', (_label, query) => {
    expect(HistoryExtrasQuerySchema.safeParse(query).success).toBe(false);
  });

  it('allows exactly the cap and a single day', () => {
    const start = new Date('2026-09-30T00:00:00Z');
    start.setUTCDate(start.getUTCDate() - MAX_HISTORY_WINDOW_DAYS);
    const fromDate = start.toISOString().slice(0, 10);
    expect(HistoryExtrasQuerySchema.safeParse({ fromDate, toDate: '2026-09-30' }).success).toBe(true);
    expect(
      HistoryExtrasQuerySchema.safeParse({ fromDate: '2026-09-30', toDate: '2026-09-30' }).success,
    ).toBe(true);
  });
});

describe('selectHistoryVoucherIds', () => {
  const ledger = new Set(['pr-1', 'pr-2']);
  const v = (id: string, prId: string | null, weekStart: string | null, weekEnd: string | null) => ({
    id,
    prId,
    weekStart,
    weekEnd,
  });

  it('keeps a ledger PR’s voucher whose week touches the window, or that has no week', () => {
    const ids = selectHistoryVoucherIds(
      [
        v('v-in', 'pr-1', '2026-09-13', '2026-09-19'),
        v('v-no-week', 'pr-2', null, null),
        v('v-half-week', 'pr-2', '2026-09-13', null),
        v('v-straddles-start', 'pr-1', '2025-09-28', '2025-10-04'),
        v('v-starts-on-end', 'pr-1', '2026-09-30', '2026-10-06'),
        v('v-before', 'pr-1', '2025-09-21', '2025-09-27'),
        v('v-after', 'pr-1', '2026-10-04', '2026-10-10'),
        v('v-off-ledger', 'pr-9', '2026-09-13', '2026-09-19'),
        v('v-no-pr', null, '2026-09-13', '2026-09-19'),
      ],
      ledger,
      WINDOW,
    );
    expect(ids).toEqual([
      'v-half-week',
      'v-in',
      'v-no-week',
      'v-starts-on-end',
      'v-straddles-start',
    ]);
  });

  it('tolerates a timestamp-shaped week', () => {
    expect(
      selectHistoryVoucherIds(
        [v('v', 'pr-1', '2026-09-13T00:00:00.000Z', '2026-09-19T00:00:00.000Z')],
        ledger,
        WINDOW,
      ),
    ).toEqual(['v']);
  });

  it('reads nothing when nobody is on the ledger', () => {
    expect(
      selectHistoryVoucherIds([v('v', 'pr-1', null, null)], new Set(), WINDOW),
    ).toEqual([]);
  });
});

describe('foldHistoryExtras — commission', () => {
  const receipts: HistoryReceiptRow[] = [
    { id: 'r-ok', voucherId: 'v1', status: 'approved', shiftAssignmentId: 'a1' },
    { id: 'r-ver', voucherId: 'v1', status: 'verified', shiftAssignmentId: 'a2' },
    { id: 'r-pend', voucherId: 'v1', status: 'pending', shiftAssignmentId: 'a1' },
    { id: 'r-free', voucherId: 'v1', status: 'approved', shiftAssignmentId: null },
  ];
  const line = (
    component: HistoryLineRow['component'],
    amount: string,
    receiptId: string | null,
    voucherId = 'v1',
  ): HistoryLineRow => ({ voucherId, component, amount, receiptId });

  it('buckets drink and tip commission by the receipt’s assignment', () => {
    const { assignments } = foldHistoryExtras({
      voucherIds: ['v1'],
      receipts,
      lines: [
        line('drink_commission', '15.00', 'r-ok'),
        line('tip_commission', '7.50', 'r-ok'),
        line('tip_commission', '30.10', 'r-ver'),
      ],
    });
    expect(assignments).toEqual([
      { assignmentId: 'a1', drinkCommissionSen: 1500, tipCommissionSen: 750 },
      { assignmentId: 'a2', drinkCommissionSen: 0, tipCommissionSen: 3010 },
    ]);
  });

  it('keeps the allow-list and the receipt gate', () => {
    const { assignments } = foldHistoryExtras({
      voucherIds: ['v1'],
      receipts,
      lines: [
        // A pending receipt has raised no commission yet.
        line('drink_commission', '99.00', 'r-pend'),
        // No assignment on the receipt, no night to credit.
        line('drink_commission', '99.00', 'r-free'),
        // Not commission — never counted here, whatever the receipt.
        line('deduction', '-20.00', 'r-ok'),
        line('ot', '40.00', 'r-ok'),
        line('wages', '500.00', 'r-ok'),
        line('other', '10.00', 'r-ok'),
        line(null, '10.00', 'r-ok'),
        // No receipt behind the line, or one this voucher does not hold.
        line('tip_commission', '99.00', null),
        line('tip_commission', '99.00', 'r-gone'),
      ],
    });
    expect(assignments).toEqual([]);
  });

  it('credits a line only through a receipt on its OWN voucher', () => {
    const { assignments } = foldHistoryExtras({
      voucherIds: ['v1', 'v2'],
      receipts,
      // r-ok is v1's receipt; the line sits on v2.
      lines: [line('drink_commission', '15.00', 'r-ok', 'v2')],
    });
    expect(assignments).toEqual([]);
  });

  it('reads nothing from a voucher whose receipts were not returned', () => {
    const { assignments } = foldHistoryExtras({
      voucherIds: ['v1'],
      receipts: [],
      lines: [line('drink_commission', '15.00', 'r-ok')],
    });
    expect(assignments).toEqual([]);
  });

  it('adds one assignment’s receipts across vouchers', () => {
    const { assignments } = foldHistoryExtras({
      voucherIds: ['v1', 'v2'],
      receipts: [
        { id: 'x', voucherId: 'v1', status: 'approved', shiftAssignmentId: 'a1' },
        { id: 'y', voucherId: 'v2', status: 'verified', shiftAssignmentId: 'a1' },
      ],
      lines: [
        line('drink_commission', '1.10', 'x', 'v1'),
        line('drink_commission', '2.20', 'y', 'v2'),
      ],
    });
    expect(assignments).toEqual([
      { assignmentId: 'a1', drinkCommissionSen: 330, tipCommissionSen: 0 },
    ]);
  });

  it('ignores rows of a voucher that was not selected', () => {
    const extras = foldHistoryExtras({
      voucherIds: ['v1'],
      receipts: [
        ...receipts,
        { id: 'r-x', voucherId: 'v9', status: 'approved', shiftAssignmentId: 'a1' },
      ],
      lines: [
        line('drink_commission', '15.00', 'r-x', 'v9'),
        line('deduction', '-5.00', null, 'v9'),
      ],
    });
    expect(extras).toEqual({
      assignments: [],
      vouchers: [{ voucherId: 'v1', penaltySen: 0 }],
    });
  });
});

describe('foldHistoryExtras — penalty', () => {
  it('is the negated sum of the voucher’s deduction lines, per voucher', () => {
    const { vouchers } = foldHistoryExtras({
      voucherIds: ['v1', 'v2'],
      receipts: [],
      lines: [
        { voucherId: 'v1', component: 'deduction', amount: '-20.00', receiptId: null },
        { voucherId: 'v1', component: 'deduction', amount: '-27.50', receiptId: null },
        { voucherId: 'v1', component: 'wages', amount: '500.00', receiptId: null },
        { voucherId: 'v1', component: null, amount: '-5.00', receiptId: null },
        { voucherId: 'v2', component: 'deduction', amount: '-0.30', receiptId: null },
      ],
    });
    expect(vouchers).toEqual([
      { voucherId: 'v1', penaltySen: 4750 },
      { voucherId: 'v2', penaltySen: 30 },
    ]);
  });

  it('lists every selected voucher, a voucher with no penalty as 0 (never -0)', () => {
    const { vouchers } = foldHistoryExtras({
      voucherIds: ['v1'],
      receipts: [],
      lines: [{ voucherId: 'v1', component: 'wages', amount: '500.00', receiptId: null }],
    });
    expect(vouchers).toEqual([{ voucherId: 'v1', penaltySen: 0 }]);
    expect(Object.is(vouchers[0]?.penaltySen, -0)).toBe(false);
  });

  it('adds in sen, so a year of cents does not drift', () => {
    const lines: HistoryLineRow[] = Array.from({ length: 300 }, () => ({
      voucherId: 'v1',
      component: 'deduction',
      amount: '-0.10',
      receiptId: null,
    }));
    expect(foldHistoryExtras({ voucherIds: ['v1'], receipts: [], lines }).vouchers).toEqual([
      { voucherId: 'v1', penaltySen: 3000 },
    ]);
  });
});

describe('computeHistoryExtras', () => {
  it('selects, then folds — an off-window voucher’s lines never count', () => {
    const extras = computeHistoryExtras(
      {
        ledgerPrIds: ['pr-1'],
        vouchers: [
          { id: 'v-in', prId: 'pr-1', weekStart: '2026-09-13', weekEnd: '2026-09-19' },
          { id: 'v-old', prId: 'pr-1', weekStart: '2024-09-15', weekEnd: '2024-09-21' },
        ],
        receipts: [
          { id: 'r1', voucherId: 'v-in', status: 'verified', shiftAssignmentId: 'a1' },
          { id: 'r2', voucherId: 'v-old', status: 'verified', shiftAssignmentId: 'a1' },
        ],
        lines: [
          { voucherId: 'v-in', component: 'tip_commission', amount: '12.05', receiptId: 'r1' },
          { voucherId: 'v-old', component: 'tip_commission', amount: '99.00', receiptId: 'r2' },
          { voucherId: 'v-old', component: 'deduction', amount: '-50.00', receiptId: null },
        ],
      },
      WINDOW,
    );
    expect(extras).toEqual({
      assignments: [{ assignmentId: 'a1', drinkCommissionSen: 0, tipCommissionSen: 1205 }],
      vouchers: [{ voucherId: 'v-in', penaltySen: 0 }],
    });
  });
});
