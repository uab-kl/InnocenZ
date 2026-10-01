import { describe, expect, it } from 'vitest';
import {
  chargeForPeriod,
  joinNotes,
  parseProRataNote,
  proRataNote,
  proRatedSen,
  switchDifference,
  type ProRata,
} from './pro-rata';
import { billingPeriodsFor, periodShareFor } from './subscription-period';

/**
 * Owner, 29 Sep 2026 — "whether to bill a first partial week in full": no.
 *
 * INV-000049 is the case that raised it: an agency approved on Friday 7 Aug was
 * billed the whole Sun–Sat week of 2–8 Aug at RM 125 for the two days it held.
 */

/** Every period a lane opens up to `today`, each with what it is charged. */
function charges(params: {
  billingCycle: string;
  anchor: string;
  today: string;
  price: string;
}) {
  const startedAt = new Date(params.anchor);
  return billingPeriodsFor({ billingCycle: params.billingCycle, startedAt, endedAt: null, today: params.today }).map(
    (period) => ({ ...period, ...chargeForPeriod(params.price, periodShareFor(period, startedAt)) }),
  );
}

describe('a weekly lane (agency, Sun–Sat) — the first partial week is pro-rated', () => {
  it('a SUNDAY start holds the whole week, so it is billed the whole price and says nothing', () => {
    expect(
      charges({ billingCycle: 'weekly', anchor: '2026-08-09T02:00:00Z', today: '2026-08-09', price: '125.00' }),
    ).toEqual([{ periodStart: '2026-08-09', periodEnd: '2026-08-15', amount: '125.00', proRata: null }]);
  });

  it('a FRIDAY start is billed 2 of 7 days — INV-000049 under the new rule', () => {
    expect(
      charges({ billingCycle: 'weekly', anchor: '2026-08-07T02:00:00Z', today: '2026-08-07', price: '125.00' }),
    ).toEqual([
      {
        periodStart: '2026-08-02',
        periodEnd: '2026-08-08',
        amount: '35.71',
        proRata: { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' },
      },
    ]);
  });

  it('a SATURDAY start is billed its single day, 1 of 7', () => {
    const [first] = charges({
      billingCycle: 'weekly',
      anchor: '2026-08-08T03:00:00Z',
      today: '2026-08-08',
      price: '125.00',
    });
    expect(first).toMatchObject({ periodStart: '2026-08-02', periodEnd: '2026-08-08', amount: '17.86' });
    expect(first?.proRata).toMatchObject({ billedDays: 1, periodDays: 7, billedFrom: '2026-08-08' });
  });

  it('a start in a week that crosses a month counts the days in both months, on the KL calendar', () => {
    // 16:30Z on 29 Sep is 00:30 on WEDNESDAY 30 Sep in Kuala Lumpur. Reading
    // the UTC day would bill from Tuesday — 5 days instead of 4.
    const [first] = charges({
      billingCycle: 'weekly',
      anchor: '2026-09-29T16:30:00Z',
      today: '2026-09-30',
      price: '125.00',
    });
    expect(first).toMatchObject({ periodStart: '2026-09-27', periodEnd: '2026-10-03', amount: '71.43' });
    expect(first?.proRata).toMatchObject({ billedDays: 4, periodDays: 7, billedFrom: '2026-09-30' });
  });

  it('only the FIRST week is pro-rated — every week after it is whole', () => {
    const periods = charges({
      billingCycle: 'weekly',
      anchor: '2026-08-07T02:00:00Z',
      today: '2026-08-17',
      price: '125.00',
    });
    expect(periods.map((p) => [p.periodStart, p.amount, p.proRata?.billedDays ?? null])).toEqual([
      ['2026-08-02', '35.71', 2],
      ['2026-08-09', '125.00', null],
      ['2026-08-16', '125.00', null],
    ]);
  });

  it('a free plan stays free and carries no pro-rata sentence', () => {
    const [first] = charges({ billingCycle: 'weekly', anchor: '2026-08-07T02:00:00Z', today: '2026-08-07', price: '0.00' });
    expect(first).toMatchObject({ amount: '0.00', proRata: null });
  });
});

describe('a monthly lane (outlet) — anchored on its start day, so never partial', () => {
  it('a MID-MONTH start opens a whole month from that day and is billed in full', () => {
    expect(
      charges({ billingCycle: 'monthly', anchor: '2026-09-17T02:00:00Z', today: '2026-10-20', price: '999.00' }),
    ).toEqual([
      { periodStart: '2026-09-17', periodEnd: '2026-10-16', amount: '999.00', proRata: null },
      { periodStart: '2026-10-17', periodEnd: '2026-11-16', amount: '999.00', proRata: null },
    ]);
  });

  it('a start on the 31st keeps billing whole (clamped) months', () => {
    const periods = charges({
      billingCycle: 'monthly',
      anchor: '2026-01-31T02:00:00Z',
      today: '2026-03-01',
      price: '999.00',
    });
    expect(periods.every((p) => p.proRata === null && p.amount === '999.00')).toBe(true);
  });
});

describe('periodShareFor', () => {
  it('reads an anchor outside the period, or an unreadable one, as the whole period', () => {
    const period = { periodStart: '2026-08-02', periodEnd: '2026-08-08' };
    const whole = { billedFrom: '2026-08-02', billedDays: 7, periodDays: 7 };
    expect(periodShareFor(period, new Date('2026-07-30T02:00:00Z'))).toEqual(whole);
    expect(periodShareFor(period, new Date('2026-08-12T02:00:00Z'))).toEqual(whole);
    expect(periodShareFor(period, new Date('not a date'))).toEqual(whole);
  });
});

describe('the money — integer sen, rounded once', () => {
  it('rounds the product once at the end, never per day', () => {
    // Per day: round(10000 / 7) = 1429, × 3 = 4287. Once: round(30000 / 7) = 4286.
    expect(proRatedSen('100.00', { billedDays: 3, periodDays: 7 })).toBe(4286);
  });

  it('returns a whole share unscaled, and refuses an amount it cannot read', () => {
    expect(proRatedSen('125.00', { billedDays: 7, periodDays: 7 })).toBe(12500);
    expect(proRatedSen('125.00', null)).toBe(12500);
    expect(proRatedSen('abc', { billedDays: 2, periodDays: 7 })).toBeNull();
  });

  it('keeps a whole period’s price string exactly as stored', () => {
    expect(chargeForPeriod('125', { billedFrom: '2026-08-09', billedDays: 7, periodDays: 7 }).amount).toBe('125');
  });

  it('stays exact at the top of the rate card', () => {
    expect(
      chargeForPeriod('999999.00', { billedFrom: '2026-08-06', billedDays: 3, periodDays: 7 }).amount,
    ).toBe('428571.00');
  });
});

describe('the stored sentence', () => {
  const proRata: ProRata = { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' };

  it('is written in one format and read back to the same numbers', () => {
    const note = proRataNote(proRata);
    expect(note).toBe('Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)');
    expect(parseProRataNote(note)).toEqual(proRata);
  });

  it('is not found in any other note', () => {
    expect(parseProRataNote(null)).toBeNull();
    expect(parseProRataNote('')).toBeNull();
    expect(parseProRataNote('Upgrade Starter → Growth: 250.00 − 125.00 billed this period')).toBeNull();
    expect(parseProRataNote('Switched Growth → Starter mid-period; Growth already billed')).toBeNull();
    // A "share" of the whole period is not a pro-rata.
    expect(parseProRataNote('Pro-rated: 7 of 7 days from 2026-08-02 (full period 125.00)')).toBeNull();
  });

  it('survives a credit reason joined after it', () => {
    const joined = joinNotes(proRataNote(proRata), 'Switched Growth → Starter mid-period; Growth already billed');
    expect(joined).toBe(
      'Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00) · Switched Growth → Starter mid-period; Growth already billed',
    );
    expect(parseProRataNote(joined)).toEqual(proRata);
  });
});

describe('joinNotes', () => {
  it('keeps whichever side exists, and nothing when neither does', () => {
    expect(joinNotes('first', null)).toBe('first');
    expect(joinNotes(null, 'second')).toBe('second');
    expect(joinNotes(undefined, undefined)).toBeNull();
    expect(joinNotes('  ', '')).toBeNull();
  });

  it('never outgrows the varchar(255) column, and keeps the first sentence whole', () => {
    const first = 'Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)';
    const joined = joinNotes(first, 'x'.repeat(400));
    expect(joined).toHaveLength(255);
    expect(joined?.startsWith(first)).toBe(true);
  });
});

/**
 * Owner, 29 Sep 2026: "Charge the full weekly price difference as in any other
 * week." A switch moves by the whole period's difference — inside a pro-rated
 * first week exactly as anywhere else. Only the first period's CHARGE is
 * pro-rated (`chargeForPeriod`, above).
 */
describe('a plan switch moves by the FULL period difference, pro-rated week or not', () => {
  it('an upgrade is the whole weekly difference', () => {
    expect(switchDifference('125.00', '250.00')).toEqual({ fromSen: 12500, toSen: 25000, diffSen: 12500 });
  });

  it('a downgrade is the whole weekly difference, negative — the credit', () => {
    expect(switchDifference('250.00', '125.00')?.diffSen).toBe(-12500);
  });

  it('two upgrades in one week telescope to the top plan’s whole price', () => {
    const first = switchDifference('125.00', '250.00')?.diffSen ?? 0;
    const second = switchDifference('250.00', '500.00')?.diffSen ?? 0;
    expect(12500 + first + second).toBe(50000);
  });

  it('takes no share at all: a 2-of-7 first week is not what a switch is priced on', () => {
    const twoOfSeven: ProRata = { billedDays: 2, periodDays: 7, billedFrom: '2026-08-07', fullAmount: '125.00' };
    // The first week's CHARGE is pro-rated…
    expect(proRatedSen('125.00', twoOfSeven)).toBe(3571);
    // …a switch inside it is not.
    expect(switchDifference('125.00', '250.00')?.diffSen).toBe(12500);
    expect(switchDifference.length).toBe(2);
  });

  it('refuses a price it cannot read rather than pricing it at zero', () => {
    expect(switchDifference('abc', '250.00')).toBeNull();
    expect(switchDifference('125.00', 'n/a')).toBeNull();
  });
});
