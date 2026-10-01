// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test as globals.
import { translations } from '../i18n/translations';
import type { PrCurrentWeek, PrReceiptLine, PrWeekShift } from './api';
import { claimShifts } from './cell-evidence';
import { eventKindLabel } from './special-event';

/*
 * WHICH SPECIAL NIGHT A CLAIM WAS ABOUT (30 Sep 2026). The Payment claim list
 * tagged every claimed shift with a bare "Special event": its rows come from the
 * week's `shifts[]`, which carried the kind but not the sub-type, and the screen
 * kept its own two-way label. The week now carries both sub-type pairs; these pin
 * that a claim's rows keep them and the tag names the night — and that a week
 * from a backend that has not restarted still lists its claims.
 */

const EN = translations.en;
const ZH = translations.zh;
const DAY = '2026-09-29';
const ASSIGNMENT = 'as-1';

function drinksLine(extra: Partial<PrReceiptLine> = {}): PrReceiptLine {
  return {
    id: 'line-1',
    kind: 'drinks',
    component: 'drink_commission',
    source: 'scan',
    item: 'Lemon Drop',
    quantity: 1,
    sales: 150,
    commission: 15,
    lineDate: DAY,
    outlet: 'UAB Emhub',
    at: '2026-09-29T15:00:00.000Z',
    pending: false,
    proofPhotos: [],
    receiptStatus: 'approved',
    receiptNo: 'RCP-000010',
    receiptId: 'rc-1',
    orderNo: 'ORD0389',
    shiftAssignmentId: ASSIGNMENT,
    ...extra,
  };
}

/** A week-read shift as an OLD backend sends it: no sub-type fields at all. */
function shift(extra: Partial<PrWeekShift> = {}): PrWeekShift {
  return {
    id: ASSIGNMENT,
    shiftDate: DAY,
    slot: '22:00 - 04:00',
    eventName: 'Launch party',
    eventKind: 'special',
    outletName: 'UAB Emhub',
    checkInAt: '2026-09-29T14:00:00.000Z',
    checkOutAt: '2026-09-29T20:00:00.000Z',
    overtimeMinutes: null,
    ...extra,
  };
}

function week(shifts: PrWeekShift[] | undefined, lines = [drinksLine()]): PrCurrentWeek {
  return {
    voucherId: 'pv-1',
    weekStart: '2026-09-27',
    weekEnd: '2026-10-03',
    net: '15.00',
    status: 'pending_review',
    lines,
    ...(shifts ? { shifts } : {}),
  };
}

/** A drinks claim on that day that named its receipt by the FK. */
const CLAIM = {
  disputeDate: DAY,
  component: 'drinks' as const,
  receiptId: 'rc-1',
  receiptRefs: null,
};

describe('the claim list names WHICH special night', () => {
  test('a claim on a VIP night is tagged "Special event · VIP night"', () => {
    const [row] = claimShifts(week([shift({ specialEventType: 'vip' })]), CLAIM);
    expect(row).toMatchObject({
      receiptNo: 'RCP-000010',
      eventKind: 'special',
      specialEventType: 'vip',
    });
    expect(eventKindLabel(row, EN)).toBe('Special event · VIP night');
    expect(eventKindLabel(row, ZH)).toBe('特别活动 · VIP 之夜');
  });

  test("a shift posted before 0167 names its event card's night", () => {
    const [row] = claimShifts(
      week([
        shift({
          specialEventType: null,
          templateSpecialEventType: 'other',
          templateCustomEventName: 'Whisky tasting',
        }),
      ]),
      CLAIM,
    );
    expect(row).toMatchObject({
      templateSpecialEventType: 'other',
      templateCustomEventName: 'Whisky tasting',
    });
    expect(eventKindLabel(row, EN)).toBe('Special event · Whisky tasting');
  });

  test('a special night that names no sub-type is still a bare "Special event"', () => {
    const [row] = claimShifts(
      week([
        shift({
          specialEventType: null,
          customSpecialEventName: null,
          templateSpecialEventType: null,
          templateCustomEventName: null,
        }),
      ]),
      CLAIM,
    );
    expect(eventKindLabel(row, EN)).toBe('Special event');
  });

  test('a normal shift reads "Normal shift", whatever a stale column holds', () => {
    const [row] = claimShifts(
      week([shift({ eventKind: 'normal', specialEventType: 'vip' })]),
      CLAIM,
    );
    expect(eventKindLabel(row, EN)).toBe('Normal shift');
  });
});

describe('a week from a backend that has not restarted', () => {
  test('shifts without the sub-type fields still list — tagged a bare "Special event"', () => {
    const [row] = claimShifts(week([shift()]), CLAIM);
    expect(row).toMatchObject({
      receiptNo: 'RCP-000010',
      eventName: 'Launch party',
      specialEventType: null,
      customSpecialEventName: null,
      templateSpecialEventType: null,
      templateCustomEventName: null,
    });
    expect(eventKindLabel(row, EN)).toBe('Special event');
  });

  test('a shift sent without even its kind still lists, as the screen always tagged it', () => {
    const [row] = claimShifts(week([shift({ eventKind: undefined })]), CLAIM);
    expect(row.eventKind).toBeNull();
    expect(eventKindLabel(row, EN)).toBe('Normal shift');
  });

  test('a week with no shifts array at all still lists the claimed receipt', () => {
    const rows = claimShifts(week(undefined), CLAIM);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      receiptNo: 'RCP-000010',
      eventName: null,
      outletName: null,
    });
    expect(eventKindLabel(rows[0], EN)).toBe('Normal shift');
  });
});

describe('which shifts a claim names — unchanged by the move out of PaymentScreen', () => {
  const twoShifts = week(
    [shift(), shift({ id: 'as-2', eventName: 'Late set', eventKind: 'normal' })],
    [
      drinksLine(),
      drinksLine({
        id: 'line-2',
        receiptNo: 'RCP-000011',
        receiptId: 'rc-2',
        orderNo: 'ORD0400',
        shiftAssignmentId: 'as-2',
      }),
    ],
  );
  const named = (claim: Parameters<typeof claimShifts>[1]) =>
    claimShifts(twoShifts, claim).map((r) => r.receiptNo);

  test('by the receipt FK: that shift only', () => {
    expect(named(CLAIM)).toEqual(['RCP-000010']);
  });

  test('by pre-0088 receipt numbers: those shifts', () => {
    expect(named({ ...CLAIM, receiptId: null, receiptRefs: ['RCP-000011'] })).toEqual([
      'RCP-000011',
    ]);
  });

  test('naming nothing: the whole cell, every shift in it', () => {
    expect(named({ ...CLAIM, receiptId: null, receiptRefs: null })).toEqual([
      'RCP-000010',
      'RCP-000011',
    ]);
  });

  test('another bucket on that day: nothing', () => {
    expect(named({ ...CLAIM, component: 'tips' })).toEqual([]);
  });
});
