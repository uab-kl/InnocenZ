/**
 * Throwaway probe: does the new voucher audit actually catch the four faults
 * found by hand on PV-000002 (TEST_SCRIPT §8 X36)?
 *
 * PURE — no DB connection, no network, all records synthetic. Delete after use.
 */
import {
  auditVoucher,
  normaliseOrderNo,
  isSameOrderNo,
  checkLineAgainstWeek,
  checkLineAgainstShift,
  assignmentIdFromRef,
} from '@/features/payment-voucher/payment-voucher-audit';
import { checkVoucherBalance } from '@/features/payment-voucher/payment-voucher-balance';
import {
  voucherSendGate,
  type DayReviewView,
} from '@/features/payment-voucher/payment-voucher-day-review';
import { klToday } from '@/features/payment-voucher/payment-voucher-week';
import { overtimeFromStamps } from '@/features/shift-assignment/overtime';
import { MAX_PLAUSIBLE_SHIFT_HOURS } from '@/features/payment-voucher/payment-voucher-audit';

let failures = 0;
function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label} ${detail}`);
  }
}

// Victoria's real week: Mon 27 Jul – Sun 2 Aug 2026. One completed shift on the
// 27th worth 700.00, stamped for exactly 6 hours (so zero overtime budget). The
// 28th is `assigned` with no stamps at all — the day PV-000002 paid 700.00 for.
const voucher = { id: 'v1', voucherNo: 'PV-000002', weekStart: '2026-07-27', weekEnd: '2026-08-02' };
const assignments = [
  {
    id: 'a-27',
    shiftDate: '2026-07-27',
    status: 'completed',
    payAmount: '700.00',
    checkInAt: '2026-07-27T12:00:00Z',
    checkOutAt: '2026-07-27T18:00:00Z',
  },
  {
    id: 'a-28',
    shiftDate: '2026-07-28',
    status: 'assigned',
    payAmount: '700.00',
    checkInAt: null,
    checkOutAt: null,
  },
];

console.log('\n--- 1. the PV-000002 faults ---');
const report = auditVoucher({
  voucher,
  lines: [
    // legitimate: the one day actually worked
    { id: 'l1', lineDate: '2026-07-27', amount: '700.00', component: 'wages' },
    // fault A: wages for a day whose assignment is `assigned`, no stamps
    { id: 'l2', lineDate: '2026-07-28', amount: '700.00', component: 'wages' },
    // fault B: 678.78 of OT on a 6-hour slot that ran exactly to schedule
    { id: 'l3', lineDate: '2026-07-27', amount: '678.78', component: 'ot' },
    // fault C: a drink six weeks outside the voucher's own week
    { id: 'l4', lineDate: '2026-06-16', amount: '3.60', component: 'drink_commission' },
  ],
  sources: {
    assignments,
    // fault D: the same paper twice, O vs 0 straight from OCR
    receipts: [
      { receiptNo: 'RCP-000010', orderNo: 'ORD0389', shiftAssignmentId: 'a-27' },
      { receiptNo: 'RCP-000011', orderNo: 'ORDO389', shiftAssignmentId: 'a-27' },
    ],
    // fault E: the duplicate voucher for the same PR + week
    siblingVouchers: [{ id: 'v2', voucherNo: 'PV-000004', status: 'pending_review' }],
  },
});

const codes = report.findings.map((f) => f.code);
check('wages on an unworked day', codes.includes('wages_without_completed_shift'));
check('overtime beyond the shift window', codes.includes('overtime_exceeds_shift_window'));
check('line outside the voucher week', codes.includes('line_outside_week'));
check('duplicate OCR order number', codes.includes('duplicate_order_no'));
check('second voucher for the same week', codes.includes('duplicate_voucher_for_week'));
check('the legitimate 700.00 line is NOT flagged', !codes.includes('wages_amount_mismatch'));
console.log(`\n  findings (${report.findings.length}):`);
for (const f of report.findings) console.log(`    [${f.code}] ${f.message}`);

console.log('\n--- 2. a clean week must produce NOTHING ---');
const clean = auditVoucher({
  voucher,
  lines: [{ id: 'k1', lineDate: '2026-07-27', amount: '700.00', component: 'wages' }],
  sources: { assignments: [assignments[0]], receipts: [], siblingVouchers: [] },
});
check('clean voucher is ok', clean.ok, JSON.stringify(clean.problems));

console.log('\n--- 3. unpaid work is caught in the other direction ---');
const unpaid = auditVoucher({ voucher, lines: [], sources: { assignments: [assignments[0]] } });
check(
  'completed shift with no wages line',
  unpaid.findings.some((f) => f.code === 'completed_shift_without_wages'),
);

console.log('\n--- 4. order-number folding ---');
check('ORD0389 == ORDO389', isSameOrderNo('ORD0389', 'ORDO389'));
check('ord-0389 == ORD0389 (case + separators)', isSameOrderNo('ord-0389', 'ORD0389'));
check('ORD0389 != ORD0390 (a real difference survives)', !isSameOrderNo('ORD0389', 'ORD0390'));
check('empty never matches empty', !isSameOrderNo(null, ''));
check('normalise is stable across the pair', normaliseOrderNo('ORDO389') === normaliseOrderNo('ORD0389'));

console.log('\n--- 5. REAL overtime is still allowed through ---');
// Same 700.00 day, stamped 12:00-20:00 = 8h, so 2h of genuine overtime.
// Budget = 700/6 * 1.5 * 2 = 350.00. A 300.00 line must pass; 400.00 must not.
const otAssignment = { ...assignments[0], checkOutAt: '2026-07-27T20:00:00Z' };
const otOk = auditVoucher({
  voucher,
  lines: [
    { id: 'o1', lineDate: '2026-07-27', amount: '700.00', component: 'wages' },
    { id: 'o2', lineDate: '2026-07-27', amount: '300.00', component: 'ot' },
  ],
  sources: { assignments: [otAssignment] },
});
check(
  '2h of real OT at 300.00 passes',
  !otOk.findings.some((f) => f.code === 'overtime_exceeds_shift_window'),
  JSON.stringify(otOk.problems),
);
const otBad = auditVoucher({
  voucher,
  lines: [
    { id: 'o1', lineDate: '2026-07-27', amount: '700.00', component: 'wages' },
    { id: 'o2', lineDate: '2026-07-27', amount: '400.00', component: 'ot' },
  ],
  sources: { assignments: [otAssignment] },
});
check(
  'the same day at 400.00 is refused',
  otBad.findings.some((f) => f.code === 'overtime_exceeds_shift_window'),
);

console.log('\n--- 6. the per-write week guard ---');
check('in-week date passes', checkLineAgainstWeek('2026-07-28', voucher) === null);
check('out-of-week date is refused', checkLineAgainstWeek('2026-06-16', voucher) !== null);
check('missing date is refused', checkLineAgainstWeek(null, voucher) !== null);
check('week boundaries are inclusive', checkLineAgainstWeek('2026-08-02', voucher) === null);

console.log('\n--- 6b. the line-date-vs-shift guard (the fictional-wage-day cause) ---');
// The exact live fault: wages dated 28 Jul whose ref names the 23 Jul assignment.
// Both dates sit inside the same week, which is why the week guard let it through.
const ASSIGN = 'f5a1f227-a1ca-449d-8d02-10bddc05a1c9';
const UNKNOWN_ASSIGN = '00000000-1111-2222-3333-444444444444';
const shiftDates = new Map([[ASSIGN, '2026-07-23']]);
check(
  'the live fault is refused (28 Jul line, 23 Jul shift)',
  checkLineAgainstShift('2026-07-28', `wages|checkin|700.00|${ASSIGN}|`, shiftDates) !== null,
);
check(
  '...and the week guard alone would NOT have caught it',
  checkLineAgainstWeek('2026-07-28', voucher) === null,
);
check(
  'a line dated its own shift passes',
  checkLineAgainstShift('2026-07-23', `wages|checkin|700.00|${ASSIGN}|`, shiftDates) === null,
);
check(
  'the overtime ref (uuid + "-ot" suffix) is still matched',
  checkLineAgainstShift('2026-07-28', `others|checkin|678.78|${ASSIGN}-ot|`, shiftDates) !== null,
);
check(
  'a bare assignment id (the generator shape) is matched',
  checkLineAgainstShift('2026-07-28', ASSIGN, shiftDates) !== null,
);
check(
  'a scanned order ref names no shift and is not judged',
  checkLineAgainstShift('2026-07-28', 'drinks|scan|30.00|ORD0389:0|drink', shiftDates) === null,
);
check(
  'an unknown assignment id is not judged',
  checkLineAgainstShift('2026-07-28', `wages|checkin|1.00|${UNKNOWN_ASSIGN}|`, shiftDates) === null,
);
check(
  'a ref with no uuid yields no assignment',
  assignmentIdFromRef('drinks|manual|150.00|') === null,
);

console.log('\n--- 7. balance: `amount` is the LINE TOTAL, quantity must not scale it ---');
// The regression this guards: multiplying by quantity double-counted any
// multi-item receipt and reported a healthy voucher as imbalanced, which would
// have had the Monday job tell someone to hold a correct payment.
const qtyVoucher = { subtotal: '30.00', deduction: '0.00', net: '30.00' };
const qtyLines = [
  { amount: '10.00', quantity: 1 },
  { amount: '20.00', quantity: 4 }, // 4 drinks, 20.00 of commission IN TOTAL
];
const qtyReport = checkVoucherBalance(qtyVoucher, qtyLines);
check('a quantity-4 line balances at its face amount', qtyReport.balanced, JSON.stringify(qtyReport.problems));
check('line total is 30.00, not 90.00', qtyReport.lineTotalCents === 3000, `got ${qtyReport.lineTotalCents}`);

// A genuinely broken voucher must still be caught — the fix must not have
// turned the check off.
const brokenReport = checkVoucherBalance(
  { subtotal: '99.00', deduction: '0.00', net: '99.00' },
  [{ amount: '10.00', quantity: 1 }],
);
check('a real imbalance is still reported', !brokenReport.balanced);

// A bad quantity is still a finding, and must NOT swallow the line's money.
const badQty = checkVoucherBalance({ subtotal: '10.00', deduction: '0.00', net: '10.00' }, [
  { amount: '10.00', quantity: 1.5 },
]);
check('non-integer quantity is reported', badQty.problems.some((p) => p.includes('whole number')));
check('…and its amount still counts', badQty.lineTotalCents === 1000, `got ${badQty.lineTotalCents}`);

console.log('\n--- 8. send gate: a week that has not FINISHED cannot be sent ---');
// The act that created the live PV-000002 / PV-000004 duplicate pair. Every
// other fix in this area addressed the consequence; this one refuses the act.
const reviewed: DayReviewView[] = [
  {
    date: '2026-07-27',
    totalCents: 70000,
    status: 'approved',
    approvedTotalCents: 70000,
    stale: false,
    note: null,
    bulk: false,
    reviewedAt: null,
    reviewedBy: null,
  },
];
const WEEK_END = '2026-08-02';

check(
  'mid-week send is refused',
  !voucherSendGate(reviewed, [], { weekEnd: WEEK_END, today: '2026-07-29' }).allowed,
);
check(
  'the LAST day of the week is still mid-week',
  !voucherSendGate(reviewed, [], { weekEnd: WEEK_END, today: WEEK_END }).allowed,
);
check(
  'the day AFTER the week ends is allowed',
  voucherSendGate(reviewed, [], { weekEnd: WEEK_END, today: '2026-08-03' }).allowed,
);
// The over-fire guard that matters most: the Monday job runs on
// `previousCompleteWeek`, so if this ever refused, no voucher would ever issue.
check(
  'the Monday payout case is NOT refused',
  voucherSendGate(reviewed, [], { weekEnd: '2026-07-26', today: '2026-07-27' }).allowed,
);
check(
  'a voucher with no weekEnd is not judged',
  voucherSendGate(reviewed, [], { weekEnd: null, today: '2026-07-29' }).allowed,
);
check('omitting the week argument keeps the old behaviour', voucherSendGate(reviewed, []).allowed);

// The refusal must be the WEEK one, not a review one — an unreviewed day inside
// a running week would otherwise mask the real reason with a misleading message.
const midWeek = voucherSendGate(
  [{ ...reviewed[0], status: null, approvedTotalCents: null }],
  [{ receiptNo: 'RCP-000009', status: 'pending' }],
  { weekEnd: WEEK_END, today: '2026-07-29' },
);
check(
  'the reason given is the week, not the review',
  !midWeek.allowed && midWeek.weekEndsOn === WEEK_END,
);
check(
  '…and it does not also blame unreviewed days',
  !midWeek.allowed && midWeek.unreviewedDays.length === 0 && midWeek.pendingReceipts.length === 0,
);

// klToday must read KL local, not UTC. 2026-08-02T17:00Z is already 01:00 on the
// 3rd in KL — the case a UTC date gets wrong, and the one that would hold the
// 02:00 Monday job for its first eight hours.
check('klToday reads KL, not UTC', klToday(new Date('2026-08-02T17:00:00Z')) === '2026-08-03');
check('klToday is stable mid-day', klToday(new Date('2026-08-03T00:30:00Z')) === '2026-08-03');

console.log('\n--- 9. overtime is RECORDED at check-out, before the clamp destroys the evidence ---');
// A 22:00–04:00 slot: check in at 22:00, scheduled to end 04:00.
const IN = new Date('2026-07-27T22:00:00+08:00');
const SCHED = new Date('2026-07-28T04:00:00+08:00');
const at = (iso: string) => new Date(iso);

check(
  '90 minutes past the scheduled end is recorded',
  overtimeFromStamps(IN, SCHED, at('2026-07-28T05:30:00+08:00')).minutes === 90,
);
check(
  'checking out on time claims nothing',
  overtimeFromStamps(IN, SCHED, SCHED).minutes === null,
);
check(
  'checking out EARLY claims nothing',
  overtimeFromStamps(IN, SCHED, at('2026-07-28T03:00:00+08:00')).minutes === null,
);
check(
  'seconds past the end round to no claim, not a 0-minute one',
  overtimeFromStamps(IN, SCHED, at('2026-07-28T04:00:20+08:00')).minutes === null,
);
check(
  'an unparseable slot (no scheduled end) claims nothing',
  overtimeFromStamps(IN, null, at('2026-07-28T05:30:00+08:00')).reason === 'no_schedule',
);

// The 113.1h bug, in the place it would be born rather than where it was found.
const forgotten = overtimeFromStamps(IN, SCHED, at('2026-07-30T09:00:00+08:00'));
check('a forgotten check-out claims NOTHING', forgotten.minutes === null);
check('…and says why', forgotten.reason === 'implausible_stamp');
check(
  '…and is NOT capped to a plausible-looking figure',
  forgotten.minutes !== MAX_PLAUSIBLE_SHIFT_HOURS * 60,
);
// The boundary itself: 16h elapsed is still believable, a minute more is not.
check(
  'exactly MAX_PLAUSIBLE_SHIFT_HOURS elapsed still records',
  overtimeFromStamps(IN, SCHED, at('2026-07-28T14:00:00+08:00')).minutes === 600,
);
check(
  'one minute beyond it does not',
  overtimeFromStamps(IN, SCHED, at('2026-07-28T14:01:00+08:00')).minutes === null,
);

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
