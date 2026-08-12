/**
 * PURE probe for the billing-period rule behind `subscription_invoice`.
 *
 * No DB, no network, synthetic records — so a PASS here is a real test of the
 * calendar rule rather than a smoke check. Run:
 *
 *   pnpm --filter innocenz-backend exec tsx src/scripts/probe-subscription-invoice.ts
 */
import { billingPeriodsFor, klDayOf } from '@/features/subscription-invoice/subscription-period.js';

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const starts = (periods: { periodStart: string; periodEnd: string }[]) =>
  periods.map((p) => `${p.periodStart}..${p.periodEnd}`);

console.log('KL day conversion');
// 2026-07-31T16:30Z is 2026-08-01 00:30 in KL. Reading the UTC day would take
// the monthly anchor as the 31st — the one day the month clamp then mangles.
check('16:30Z rolls forward into the next KL day', klDayOf(new Date('2026-07-31T16:30:00Z')), '2026-08-01');
check('midday UTC stays on the same KL day', klDayOf(new Date('2026-08-04T04:00:00Z')), '2026-08-04');

console.log('\nAgency — WEEKLY, Sun-Sat');
check(
  'a Thursday start bills from the Sunday its week began',
  starts(
    billingPeriodsFor({
      billingCycle: 'weekly',
      startedAt: new Date('2026-08-06T02:00:00Z'),
      endedAt: null,
      today: '2026-08-12',
    }),
  ),
  ['2026-08-02..2026-08-08', '2026-08-09..2026-08-15'],
);
check(
  'a Sunday is the FIRST day of its own week, not the last of the previous one',
  starts(
    billingPeriodsFor({
      billingCycle: 'weekly',
      startedAt: new Date('2026-08-09T02:00:00Z'),
      endedAt: null,
      today: '2026-08-09',
    }),
  ),
  ['2026-08-09..2026-08-15'],
);
check(
  'nothing is billed past the week a subscription ended in',
  starts(
    billingPeriodsFor({
      billingCycle: 'weekly',
      startedAt: new Date('2026-08-04T02:00:00Z'),
      endedAt: new Date('2026-08-06T02:00:00Z'),
      today: '2026-08-12',
    }),
  ),
  ['2026-08-02..2026-08-08'],
);

console.log('\nOutlet — MONTHLY, anchored on the start day');
check(
  'one period for a plan started this month',
  starts(
    billingPeriodsFor({
      billingCycle: 'monthly',
      startedAt: new Date('2026-08-04T02:00:00Z'),
      endedAt: null,
      today: '2026-08-12',
    }),
  ),
  ['2026-08-04..2026-09-03'],
);
check(
  'a 31st anchor clamps to short months and RETURNS to the 31st',
  starts(
    billingPeriodsFor({
      billingCycle: 'monthly',
      startedAt: new Date('2026-01-31T02:00:00Z'),
      endedAt: null,
      today: '2026-04-01',
    }),
  ),
  ['2026-01-31..2026-02-27', '2026-02-28..2026-03-30', '2026-03-31..2026-04-29'],
);
check(
  'the anchor is the KL day, so a 16:30Z start bills the 1st and not the 31st',
  starts(
    billingPeriodsFor({
      billingCycle: 'monthly',
      startedAt: new Date('2026-07-31T16:30:00Z'),
      endedAt: null,
      today: '2026-09-05',
    }),
  ),
  ['2026-08-01..2026-08-31', '2026-09-01..2026-09-30'],
);

console.log('\nThe plan-switch artefact');
check(
  'started and ended the same KL day → never billed',
  billingPeriodsFor({
    billingCycle: 'monthly',
    startedAt: new Date('2026-08-04T04:00:00Z'),
    endedAt: new Date('2026-08-04T05:00:00Z'),
    today: '2026-08-12',
  }),
  [],
);
check(
  'ended seconds later across the UTC midnight boundary is still the same KL day',
  billingPeriodsFor({
    billingCycle: 'weekly',
    startedAt: new Date('2026-08-03T16:10:00Z'),
    endedAt: new Date('2026-08-03T16:20:00Z'),
    today: '2026-08-12',
  }),
  [],
);

console.log('\nBounds');
check(
  'a future start bills nothing',
  billingPeriodsFor({
    billingCycle: 'monthly',
    startedAt: new Date('2026-12-01T02:00:00Z'),
    endedAt: null,
    today: '2026-08-12',
  }),
  [],
);
check(
  'periods are billed in advance — the current one counts, the next does not',
  starts(
    billingPeriodsFor({
      billingCycle: 'weekly',
      startedAt: new Date('2026-08-09T02:00:00Z'),
      endedAt: null,
      today: '2026-08-15',
    }),
  ),
  ['2026-08-09..2026-08-15'],
);
check(
  'maxPeriods bounds a long history',
  billingPeriodsFor({
    billingCycle: 'weekly',
    startedAt: new Date('2020-01-01T02:00:00Z'),
    endedAt: null,
    today: '2026-08-12',
    maxPeriods: 5,
  }).length,
  5,
);

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAIL`}`);
process.exit(failures === 0 ? 0 : 1);
