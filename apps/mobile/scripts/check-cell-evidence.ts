/**
 * PC harness for `buildCellEvidence` — the selector behind the Payment page's
 * "how come Drinks says RM 7.20?" sheet. Runs on a laptop, no emulator:
 *
 *   cd apps/mobile && npx tsx scripts/check-cell-evidence.ts
 *
 * Exits non-zero on any failure so it can gate a commit.
 *
 * The fixture is Victoria's REAL 4 Aug 2026 voucher, copied out of the live DB
 * (see backend probe-day-buckets.ts). That matters: it is the day whose Drinks
 * cell read RM 7.20 off a single RM 30 Lemon Drop scanned twice, so these cases
 * pin both the arithmetic AND the requirement that a duplicated paper stays
 * VISIBLE as two rows rather than being tidied into one.
 */
import { buildCellEvidence, evidenceMatchesCell } from '../src/lib/cell-evidence';
import {
  cellDisputable,
  dayStatusLabel,
  disputesForDay,
  kindDisputable,
  openDisputeKeys,
  thisWeekDayStatus,
} from '../src/lib/receipt-review';
import type { PrCurrentWeek, PrReceiptLine, PrWeekShift } from '../src/lib/api';

let failures = 0;
function check(name: string, pass: boolean, detail = '') {
  if (pass) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const SHIFT_A = 'd24c4329-2857-4b85-8cc4-1fa13d0802be';
const SHIFT_B = '43f7e17e-fae2-4727-a06a-4b6e4ec8fd6a';
const SHIFT_C = 'ac63bead-56de-4242-a6ef-5c0bb2c2e1c6';

const shifts: PrWeekShift[] = [
  { id: SHIFT_A, shiftDate: '2026-08-04', slot: '10:00 - 12:00', eventName: null, outletName: 'Emhub Testing', checkInAt: '2026-08-04T01:54:27.126Z', checkOutAt: '2026-08-04T03:08:59.621Z', overtimeMinutes: 0 },
  { id: SHIFT_B, shiftDate: '2026-08-04', slot: '13:00 - 14:00', eventName: null, outletName: 'Emhub Testing', checkInAt: '2026-08-04T03:09:47.951Z', checkOutAt: '2026-08-04T03:14:13.687Z', overtimeMinutes: 0 },
  { id: SHIFT_C, shiftDate: '2026-08-04', slot: '16:00 - 17:00', eventName: null, outletName: 'Emhub Testing', checkInAt: '2026-08-04T03:29:36.526Z', checkOutAt: '2026-08-04T04:05:08.832Z', overtimeMinutes: 0 },
];

let seq = 0;
function line(
  p: Partial<PrReceiptLine> & Pick<PrReceiptLine, 'kind' | 'item' | 'commission'>,
): PrReceiptLine {
  seq++;
  return {
    id: `l${seq}`,
    source: 'scan',
    quantity: 1,
    sales: 0,
    lineDate: '2026-08-04',
    outlet: 'Emhub Testing',
    at: '2026-08-04T01:00:00.000Z',
    pending: false,
    proofPhotos: [],
    ...p,
  } as PrReceiptLine;
}

const week: PrCurrentWeek = {
  voucherId: 'v1',
  weekStart: '2026-08-02',
  weekEnd: '2026-08-08',
  net: '3708.20',
  status: null,
  shifts,
  lines: [
    // The one real drink — and the same paper logged a second time.
    line({ kind: 'drinks', item: 'Lemon Drop', commission: 3.6, sales: 30, receiptNo: 'RCP-000010', orderNo: 'ORD0389', receiptDate: '2026-06-16', receiptTime: '21:43', shiftAssignmentId: SHIFT_A, proofPhotos: ['a.jpg'] }),
    line({ kind: 'drinks', item: 'Lemon Drop', commission: 3.6, sales: 30, receiptNo: 'RCP-000012', orderNo: 'ORD0389', receiptDate: '2026-06-16', receiptTime: '21:43', shiftAssignmentId: SHIFT_C, proofPhotos: ['a.jpg'] }),
    // Tips: one self-logged receipt of three items per shift.
    line({ kind: 'tips', item: 'Tips', commission: 8.5, source: 'manual', receiptNo: 'RCP-000011', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_B, pending: true, proofPhotos: ['b.jpg'] }),
    line({ kind: 'tips', item: 'Booking commission', commission: 17, source: 'manual', receiptNo: 'RCP-000011', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_B, pending: true, proofPhotos: ['b.jpg'] }),
    line({ kind: 'tips', item: 'Havoc', quantity: 2, commission: 340, source: 'manual', receiptNo: 'RCP-000011', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_B, pending: true, proofPhotos: ['b.jpg'] }),
    line({ kind: 'tips', item: 'Booking commission', commission: 17, source: 'manual', receiptNo: 'RCP-000013', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_C, pending: true }),
    line({ kind: 'tips', item: 'Havoc', quantity: 3, commission: 510, source: 'manual', receiptNo: 'RCP-000013', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_C, pending: true }),
    line({ kind: 'tips', item: 'Tips', commission: 8.5, source: 'manual', receiptNo: 'RCP-000013', orderNo: 'ORD1111', shiftAssignmentId: SHIFT_C, pending: true }),
    // Wage seals: no receipt at all, shift recovered from the ref server-side.
    line({ kind: 'wages', item: 'Daily wages', commission: 700, source: 'checkin', shiftAssignmentId: SHIFT_A }),
    line({ kind: 'wages', item: 'Daily wages', commission: 700, source: 'checkin', shiftAssignmentId: SHIFT_B }),
    line({ kind: 'wages', item: 'Daily wages', commission: 700, source: 'checkin', shiftAssignmentId: SHIFT_C }),
    // A different day — must never leak into 4 Aug.
    line({ kind: 'wages', item: 'Daily wages', commission: 700, source: 'checkin', lineDate: '2026-08-03', shiftAssignmentId: SHIFT_A }),
  ],
};

console.log('\nDRINKS · Tue 4 Aug');
const drinks = buildCellEvidence(week, '2026-08-04', 'drinks');
check('total equals the grid cell (7.20)', drinks.total === 7.2, `got ${drinks.total}`);
check('evidenceMatchesCell agrees with 7.20', evidenceMatchesCell(drinks, 7.2));
check('evidenceMatchesCell rejects a wrong cell', !evidenceMatchesCell(drinks, 3.6));
check('one group per shift (2)', drinks.groups.length === 2, `got ${drinks.groups.length}`);
check(
  'the duplicate paper stays visible as two receipts',
  drinks.groups.flatMap((g) => g.receipts).length === 2,
);
check(
  'both receipts carry the SAME order number — the duplicate is legible',
  drinks.groups.flatMap((g) => g.receipts).every((r) => r.orderNo === 'ORD0389'),
);
check(
  'receipt numbers differ, so they are not collapsed',
  new Set(drinks.groups.flatMap((g) => g.receipts.map((r) => r.receiptNo))).size === 2,
);
check('shift stamps resolved for every group', drinks.groups.every((g) => g.shift !== null));
check(
  'check-in stamp is the real one',
  drinks.groups[0].shift?.checkInAt === '2026-08-04T01:54:27.126Z',
);
check('shiftsKnown is true when the payload carried shifts', drinks.shiftsKnown);

console.log('\nTIPS · Tue 4 Aug');
const tips = buildCellEvidence(week, '2026-08-04', 'tips');
check(
  'total equals the grid cell (901.00)',
  Math.round(tips.total * 100) === 90100,
  `got ${tips.total}`,
);
check('two shifts', tips.groups.length === 2, `got ${tips.groups.length}`);
check('three items grouped under ONE receipt', tips.groups[0].receipts[0].lines.length === 3);
check(
  'receipt subtotal sums its lines (365.50)',
  Math.round(tips.groups[0].receipts[0].subtotal * 100) === 36550,
  `got ${tips.groups[0].receipts[0].subtotal}`,
);
check(
  'one photo, not three, for a three-item receipt',
  tips.groups[0].receipts[0].photos.length === 1,
);
check(
  'quantity survives to the sheet (Havoc x2)',
  tips.groups[0].receipts[0].lines.some((l) => l.item === 'Havoc' && l.quantity === 2),
);
check('a pending receipt is flagged', tips.groups[0].receipts[0].pending);

console.log('\nWAGES · Tue 4 Aug (no receipt, shift from the ref)');
const wages = buildCellEvidence(week, '2026-08-04', 'wages');
check('total 2100.00 — three check-ins, three wages', wages.total === 2100, `got ${wages.total}`);
check('one group per shift (3)', wages.groups.length === 3, `got ${wages.groups.length}`);
check('every wage group still names its shift', wages.groups.every((g) => g.shift !== null));
check(
  'no order number invented for a wage seal',
  wages.groups.every((g) => g.receipts.every((r) => r.orderNo === null)),
);

console.log('\nISOLATION AND HONESTY');
const other = buildCellEvidence(week, '2026-08-03', 'wages');
check('3 Aug sees only its own line', other.total === 700 && other.groups.length === 1);
const emptyCell = buildCellEvidence(week, '2026-08-05', 'drinks');
check('an empty day yields no groups', emptyCell.groups.length === 0 && emptyCell.total === 0);
check('null week is handled', buildCellEvidence(null, '2026-08-04', 'drinks').total === 0);

const unlinked: PrCurrentWeek = {
  ...week,
  lines: [line({ kind: 'drinks', item: 'Mystery', commission: 5, receiptNo: 'RCP-999', orderNo: null })],
};
const u = buildCellEvidence(unlinked, '2026-08-04', 'drinks');
check(
  'a line with no shift link groups under "not linked", never a guessed shift',
  u.groups.length === 1 && u.groups[0].shift === null,
);
check('its money is still counted, so the sheet adds up', u.total === 5);

const noShifts: PrCurrentWeek = { ...week, shifts: undefined };
const ns = buildCellEvidence(noShifts, '2026-08-04', 'drinks');
check('shiftsKnown false when the backend has not shipped shifts', !ns.shiftsKnown);
check('and the money still totals correctly', ns.total === 7.2);

/*
 * DAY STATUS LIFECYCLE — pending → approved → disputed → verified.
 *
 * Owner: "then after solve dispute turn from the approved to the verified or
 * disputed to the verified". BOTH arrows must land on VERIFIED, which is why
 * they are asserted separately: a settled claim promotes the day whatever it
 * read beforehand.
 */
console.log('\nDAY STATUS LIFECYCLE');
const DAY = '2026-08-04';
function weekWith(disputes: PrCurrentWeek['disputes']): PrCurrentWeek {
  return { ...week, disputes };
}
function claim(outcome: 'accepted' | 'rejected' | 'withdrawn' | null) {
  return {
    id: `d-${outcome ?? 'open'}`,
    disputeDate: DAY,
    component: 'drinks' as const,
    reason: 'Unmatch commission',
    note: null,
    raisedAt: '2026-08-04T08:51:20.609Z',
    disputedAmount: '7.21',
    claimedAmount: null,
    outcome,
    resolvedAt: outcome ? '2026-08-04T10:00:00.000Z' : null,
    resolutionNote: outcome ? 'Checked against the paper' : null,
  };
}

check(
  'no claim, agency approved -> APPROVED',
  dayStatusLabel(weekWith([]), DAY, 'approved') === 'APPROVED',
);
check('no claim, nobody looked -> PENDING', dayStatusLabel(weekWith([]), DAY, 'pending') === 'PENDING');
check('empty day stays a dash', dayStatusLabel(weekWith([]), DAY, 'empty') === '—');
check(
  'open claim outranks an APPROVED day -> DISPUTED',
  dayStatusLabel(weekWith([claim(null)]), DAY, 'approved') === 'DISPUTED',
);
check(
  'open claim outranks a PENDING day -> DISPUTED',
  dayStatusLabel(weekWith([claim(null)]), DAY, 'pending') === 'DISPUTED',
);
check(
  'APPROVED -> VERIFIED once the claim is accepted',
  dayStatusLabel(weekWith([claim('accepted')]), DAY, 'approved') === 'VERIFIED',
);
check(
  'DISPUTED -> VERIFIED once the claim is rejected (answered is answered)',
  dayStatusLabel(weekWith([claim('rejected')]), DAY, 'approved') === 'VERIFIED',
);
check(
  'a still-open claim beside a settled one keeps the day DISPUTED',
  dayStatusLabel(weekWith([claim('accepted'), claim(null)]), DAY, 'approved') === 'DISPUTED',
);
check(
  'WITHDRAWN is not settled — the day falls back to APPROVED',
  dayStatusLabel(weekWith([claim('withdrawn')]), DAY, 'approved') === 'APPROVED',
);
check(
  'an in-session claim (not yet refetched) still reads DISPUTED',
  dayStatusLabel(weekWith([]), DAY, 'approved', true) === 'DISPUTED',
);
check(
  "another day is unaffected by this day's claim",
  dayStatusLabel(weekWith([claim(null)]), '2026-08-05', 'approved') === 'APPROVED',
);

/*
 * ACROSS THE WEEK BOUNDARY — owner: "if status verified for this week section,
 * then next week section also status verified".
 *
 * The same day is rendered by two call sites: This-week passes the grid status
 * straight through, Last-week maps 'approved' → 'verified' first (a closed
 * week's day sign-off is final). A day that reads VERIFIED must NOT regress
 * when Monday rolls it into the Last-week card — a status that downgrades on
 * its own is indistinguishable from work being undone.
 */
check(
  'VERIFIED this week stays VERIFIED once it rolls into last week',
  dayStatusLabel(weekWith([claim('accepted')]), DAY, 'verified') === 'VERIFIED',
);
check(
  'a settled claim reads VERIFIED from BOTH call sites',
  dayStatusLabel(weekWith([claim('accepted')]), DAY, 'approved') ===
    dayStatusLabel(weekWith([claim('accepted')]), DAY, 'verified'),
);
check(
  'no claim: a sent/closed week still reads VERIFIED, not PENDING',
  dayStatusLabel(weekWith([]), DAY, 'verified') === 'VERIFIED',
);
check(
  'an open claim still outranks a closed week',
  dayStatusLabel(weekWith([claim(null)]), DAY, 'verified') === 'DISPUTED',
);

/*
 * THIS WEEK TOPS OUT AT APPROVED — owner: "in this week section all approved,
 * after dispute make then only verified".
 *
 * Resolving one dispute SENDS the voucher, which made buildWeekGridFromLines
 * call every non-downgraded day 'verified' — so a settled claim about Tuesday
 * flipped MONDAY to VERIFIED, a day nobody had disputed or said anything new
 * about. `thisWeekDayStatus` stops the voucher's own status promoting a day on
 * the live week.
 */
check(
  'this week: a sent voucher does NOT verify an undisputed day',
  dayStatusLabel(weekWith([]), DAY, thisWeekDayStatus('verified')) === 'APPROVED',
);
check(
  'this week: VERIFIED still comes from a settled claim',
  dayStatusLabel(weekWith([claim('accepted')]), DAY, thisWeekDayStatus('verified')) === 'VERIFIED',
);
check(
  'this week: an unreviewed day is still PENDING',
  dayStatusLabel(weekWith([]), DAY, thisWeekDayStatus('pending')) === 'PENDING',
);
check(
  'last week is unaffected — a closed week still reads VERIFIED',
  dayStatusLabel(weekWith([]), DAY, 'verified') === 'VERIFIED',
);

/*
 * A PENDING DAY CANNOT BE DISPUTED — owner: "pending is the agency havent
 * approved, then how can dispute".
 *
 * `cellDisputable` always enforced it and `openDispute` refused with an alert,
 * but the flag icon and the sheet's Dispute button were gated only on the KIND
 * and the WEEK — so the control was offered on money nobody had stated yet.
 */
console.log('\nDISPUTABILITY');
const pendingLine = line({
  kind: 'drinks',
  item: 'Lemon Drop',
  commission: 3.6,
  receiptNo: 'RCP-PEND',
  receiptStatus: 'pending',
  disputable: false,
});
const approvedLine = line({
  kind: 'drinks',
  item: 'Lemon Drop',
  commission: 3.6,
  receiptNo: 'RCP-OK',
  receiptStatus: 'approved',
  disputable: true,
});
check(
  'a day whose receipt is still PENDING is not disputable',
  !cellDisputable({ ...week, lines: [pendingLine] }, DAY, 'drinks'),
);
check(
  'once the agency approves it, it is',
  cellDisputable({ ...week, lines: [approvedLine] }, DAY, 'drinks'),
);
check(
  'one pending line poisons the cell — every line must be reviewed',
  !cellDisputable({ ...week, lines: [approvedLine, pendingLine] }, DAY, 'drinks'),
);
check('wages are never disputable', !kindDisputable('wages'));
check('OT / others are never disputable', !kindDisputable('others'));
check('drinks and tips are', kindDisputable('drinks') && kindDisputable('tips'));

const painted = openDisputeKeys(weekWith([claim(null), claim('accepted')]));
check('only the OPEN claim paints a cell red', painted.size === 1 && painted.has(`${DAY}-drinks`));
check(
  'a resolved claim stops painting red',
  openDisputeKeys(weekWith([claim('accepted')])).size === 0,
);

const split = disputesForDay(weekWith([claim(null), claim('rejected'), claim('withdrawn')]), DAY);
check(
  'disputesForDay splits open from settled and drops withdrawn',
  split.open.length === 1 && split.settled.length === 1,
);

console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
