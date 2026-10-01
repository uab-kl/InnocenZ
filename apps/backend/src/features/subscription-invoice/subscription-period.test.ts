import { describe, expect, it } from 'vitest';
import { lanePeriodShare, spanHoldsPeriod } from './subscription-period';

/**
 * How much of one billing period a lane HELD (29 Sep 2026 follow-up: "a
 * re-joined billing lane keeps its EARLIEST anchor"). Pure — the repository's
 * wiring of it is pinned in `subscription-invoice.repository.test.ts`.
 *
 * Instants are written at 10:00 KL (02:00Z) so each lands on the KL day named.
 */
const kl = (day: string) => new Date(`${day}T02:00:00Z`);
const WEEK_OF_9_AUG = { periodStart: '2026-08-09', periodEnd: '2026-08-15' };
const WEEK_OF_12_JUL = { periodStart: '2026-07-12', periodEnd: '2026-07-18' };
const ANCHOR = kl('2026-06-01');
const LEFT_30_JUN = { startedAt: ANCHOR, endedAt: kl('2026-06-30') };
const BACK_12_AUG = { startedAt: kl('2026-08-12'), endedAt: null };

describe('spanHoldsPeriod', () => {
  it('a row that ended ON a period’s first day held none of it', () => {
    expect(spanHoldsPeriod({ startedAt: ANCHOR, endedAt: kl('2026-08-09') }, WEEK_OF_9_AUG)).toBe(false);
    expect(spanHoldsPeriod({ startedAt: ANCHOR, endedAt: kl('2026-08-10') }, WEEK_OF_9_AUG)).toBe(true);
  });

  it('a row starting on a period’s last day holds it; one starting after does not', () => {
    expect(spanHoldsPeriod({ startedAt: kl('2026-08-15'), endedAt: null }, WEEK_OF_9_AUG)).toBe(true);
    expect(spanHoldsPeriod({ startedAt: kl('2026-08-16'), endedAt: null }, WEEK_OF_9_AUG)).toBe(false);
  });
});

describe('lanePeriodShare', () => {
  it('a period no row held is not billed at all — the gap', () => {
    expect(lanePeriodShare(WEEK_OF_12_JUL, ANCHOR, [LEFT_30_JUN, BACK_12_AUG])).toBeNull();
  });

  it('the period the lane came back in is billed from the day it came back', () => {
    expect(lanePeriodShare(WEEK_OF_9_AUG, ANCHOR, [LEFT_30_JUN, BACK_12_AUG])).toEqual({
      billedFrom: '2026-08-12',
      billedDays: 4,
      periodDays: 7,
    });
  });

  it('a period the lane held on its first day is whole, whatever happened inside it', () => {
    const leftAndBack = [
      { startedAt: kl('2026-08-02'), endedAt: kl('2026-08-11') },
      { startedAt: kl('2026-08-13'), endedAt: null },
    ];
    expect(lanePeriodShare(WEEK_OF_9_AUG, kl('2026-08-02'), leftAndBack)).toEqual({
      billedFrom: '2026-08-09',
      billedDays: 7,
      periodDays: 7,
    });
  });

  it('the anchor’s own period is pro-rated from the anchor, exactly as before', () => {
    const anchorFriday = kl('2026-08-14');
    expect(lanePeriodShare(WEEK_OF_9_AUG, anchorFriday, [{ startedAt: anchorFriday, endedAt: null }])).toEqual({
      billedFrom: '2026-08-14',
      billedDays: 2,
      periodDays: 7,
    });
  });

  it('with several rows starting inside the period, it bills from the EARLIEST of them', () => {
    const back = [
      { startedAt: kl('2026-08-11'), endedAt: kl('2026-08-13') },
      { startedAt: kl('2026-08-13'), endedAt: null },
    ];
    expect(lanePeriodShare(WEEK_OF_9_AUG, ANCHOR, [LEFT_30_JUN, ...back])?.billedFrom).toBe('2026-08-11');
  });

  it('a re-joined month is measured against its own calendar month', () => {
    const month = { periodStart: '2026-09-05', periodEnd: '2026-10-04' };
    const spans = [
      { startedAt: kl('2026-01-05'), endedAt: kl('2026-03-10') },
      { startedAt: kl('2026-09-20'), endedAt: null },
    ];
    expect(lanePeriodShare(month, kl('2026-01-05'), spans)).toEqual({
      billedFrom: '2026-09-20',
      billedDays: 15,
      periodDays: 30,
    });
  });
});
