import { describe, expect, it } from 'vitest';
import {
  KPI_WINDOW_DAYS,
  kpiScore,
  kpiScoresByPr,
  kpiWindow,
  parseKpiWeights,
  type KpiAssignmentRow,
  type KpiWeights,
} from './kpi-score.js';

/**
 * The KPI score's rule, pinned — under ILLUSTRATIVE weights.
 *
 * ⚠️ The real weights are private (owner, 29 Sep 2026): they live only in each
 * server's `KPI_WEIGHTS` setting and are written nowhere in this repository —
 * not here either. `W` below is made up for these tests and every expected score
 * is worked out under it, so none of them says anything about the real ones. A
 * score built from one component alone is the same under any weights.
 *
 * Instants are ABSOLUTE (`…Z`): 22:00 Kuala Lumpur on 10 Sep is 14:00Z, and the
 * suite proves the same thing whatever timezone it runs in.
 */

/**
 * ILLUSTRATIVE WEIGHTS — NOT THE REAL ONES. Picked only so the arithmetic in the
 * comments below is easy to follow.
 */
const W: KpiWeights = { reliability: 3, punctuality: 1, rating: 1 };

const DAY = '2026-09-10';
/** Starts 2026-09-10T14:00:00Z (22:00 in Kuala Lumpur). */
const SLOT = '22:00 - 04:00';
const START = Date.parse('2026-09-10T14:00:00.000Z');
const MINUTE = 60_000;

function row(overrides: Partial<KpiAssignmentRow> = {}): KpiAssignmentRow {
  return {
    prId: 'pr-a',
    status: 'completed',
    shiftDate: DAY,
    slot: SLOT,
    checkInAt: new Date(START),
    cancelFeeRm: null,
    cancelFeeWaivedAt: null,
    stars: null,
    ...overrides,
  };
}

/** Completed, but on a slot with no clock time — no punctuality evidence. */
const keptUnjudged = (overrides: Partial<KpiAssignmentRow> = {}) =>
  row({ slot: 'Late night', ...overrides });
const onTime = (overrides: Partial<KpiAssignmentRow> = {}) =>
  row({ checkInAt: new Date(START), ...overrides });
const late = (overrides: Partial<KpiAssignmentRow> = {}) =>
  row({ checkInAt: new Date(START + 30 * MINUTE), ...overrides });
const noShow = () => row({ status: 'no_show', checkInAt: null });
const chargedCancel = (overrides: Partial<KpiAssignmentRow> = {}) =>
  row({ status: 'cancelled', checkInAt: null, cancelFeeRm: '20.00', ...overrides });

describe('parseKpiWeights — the private KPI_WEIGHTS setting', () => {
  it('reads the three weights', () => {
    expect(parseKpiWeights('reliability=3,punctuality=1,rating=1')).toEqual(W);
  });

  it('takes the keys in any order, with spaces around every key, value and comma', () => {
    expect(parseKpiWeights('rating=1,reliability=3,punctuality=1')).toEqual(W);
    expect(parseKpiWeights('  punctuality = 1 ,rating= 1,   reliability =3  ')).toEqual(W);
  });

  it('takes decimals, and a 0 for punctuality or rating', () => {
    expect(parseKpiWeights('reliability=2.5,punctuality=.25,rating=0')).toEqual({
      reliability: 2.5,
      punctuality: 0.25,
      rating: 0,
    });
    expect(parseKpiWeights('reliability=1,punctuality=0,rating=0.0')).toEqual({
      reliability: 1,
      punctuality: 0,
      rating: 0,
    });
  });

  it.each([
    ['unset', undefined],
    ['null', null],
    ['empty', ''],
    ['blank', '   '],
  ])('is null when %s', (_label, raw) => {
    expect(parseKpiWeights(raw)).toBeNull();
  });

  it.each(['reliability=3,punctuality=1', 'punctuality=1,rating=1', 'reliability=3'])(
    'is null when a key is missing: %s',
    (raw) => {
      expect(parseKpiWeights(raw)).toBeNull();
    },
  );

  it.each(['reliability=3,punctuality=-1,rating=1', 'reliability=-3,punctuality=1,rating=1'])(
    'is null for a negative weight: %s',
    (raw) => {
      expect(parseKpiWeights(raw)).toBeNull();
    },
  );

  it.each(['reliability=0,punctuality=1,rating=1', 'reliability=0.0,punctuality=1,rating=1'])(
    'is null when reliability is 0 — every score has that component: %s',
    (raw) => {
      expect(parseKpiWeights(raw)).toBeNull();
    },
  );

  it.each([
    'junk',
    'reliability 3, punctuality 1, rating 1',
    'reliability=3;punctuality=1;rating=1',
    'reliability=three,punctuality=1,rating=1',
    'reliability=,punctuality=1,rating=1',
    'reliability=3,punctuality=1,rating=1,',
    'reliability=3,,punctuality=1,rating=1',
    'reliability==3,punctuality=1,rating=1',
    'reliability=3=3,punctuality=1,rating=1',
    'reliability=3,reliability=3,punctuality=1,rating=1',
    'reliability=3,punctuality=1,rating=1,bonus=1',
    'Reliability=3,punctuality=1,rating=1',
    'reliability=+3,punctuality=1,rating=1',
    'reliability=1e3,punctuality=1,rating=1',
    'reliability=0x10,punctuality=1,rating=1',
    'reliability=Infinity,punctuality=1,rating=1',
    'reliability=NaN,punctuality=1,rating=1',
  ])('is null for anything else: %s', (raw) => {
    expect(parseKpiWeights(raw)).toBeNull();
  });

  it('is null for a number too long to be finite', () => {
    expect(parseKpiWeights(`reliability=1${'0'.repeat(400)},punctuality=1,rating=1`)).toBeNull();
  });
});

describe('kpiScore — the weights are a parameter', () => {
  it('scores with the weights it is given', () => {
    // Kept (1), late (0): (3·1 + 1·0) / 4 under W; (1·1 + 1·0) / 2 under even weights.
    expect(kpiScore([late()], W)).toBe(75);
    expect(kpiScore([late()], { reliability: 1, punctuality: 1, rating: 1 })).toBe(50);
  });

  it('they are relative: scaling all three by one factor changes nothing', () => {
    expect(kpiScore([late()], { reliability: 6, punctuality: 2, rating: 2 })).toBe(75);
  });

  it('a zero weight switches a component off', () => {
    // Late and rated 1 star, but only reliability counts.
    expect(kpiScore([late({ stars: 1 })], { reliability: 1, punctuality: 0, rating: 0 })).toBe(
      100,
    );
  });
});

describe('kpiScore — nothing to score', () => {
  it('is null for no rows at all', () => {
    expect(kpiScore([], W)).toBeNull();
  });

  it('is null — never 0 — when nothing was kept or missed', () => {
    expect(
      kpiScore(
        [
          row({ status: 'leave_approved', checkInAt: null }),
          row({ status: 'assigned', checkInAt: null }),
          row({ status: 'confirmed', checkInAt: null }),
          // An agency's or a venue's cancel: no fee was ever sealed.
          row({ status: 'cancelled', checkInAt: null, cancelFeeRm: null }),
          // Enough notice: a free cancel.
          chargedCancel({ cancelFeeRm: '0.00' }),
          // Charged, then forgiven.
          chargedCancel({ cancelFeeWaivedAt: new Date('2026-09-11T00:00:00Z') }),
        ],
        W,
      ),
    ).toBeNull();
  });

  it('a star rating alone is not a record', () => {
    expect(kpiScore([row({ status: 'assigned', checkInAt: null, stars: 5 })], W)).toBeNull();
  });
});

describe('kpiScore — reliability', () => {
  it('kept ÷ (kept + missed), alone when there is no other evidence', () => {
    expect(kpiScore([keptUnjudged(), keptUnjudged(), keptUnjudged(), noShow()], W)).toBe(75);
  });

  it('a charged cancellation is a miss, like a no-show', () => {
    expect(kpiScore([keptUnjudged(), keptUnjudged(), noShow(), chargedCancel()], W)).toBe(50);
  });

  it('a waived fee, a free cancel, an agency cancel and approved leave are not misses', () => {
    expect(
      kpiScore(
        [
          keptUnjudged(),
          chargedCancel({ cancelFeeWaivedAt: new Date('2026-09-11T00:00:00Z') }),
          chargedCancel({ cancelFeeRm: '0.00' }),
          row({ status: 'cancelled', checkInAt: null, cancelFeeRm: null }),
          row({ status: 'leave_approved', checkInAt: null }),
        ],
        W,
      ),
    ).toBe(100);
  });

  it('reads the fee as the numeric column delivers it — a string — or a number', () => {
    expect(kpiScore([keptUnjudged(), chargedCancel({ cancelFeeRm: 27.5 })], W)).toBe(50);
  });

  it('nothing kept and something missed is a real 0', () => {
    expect(kpiScore([noShow(), chargedCancel()], W)).toBe(0);
  });
});

describe('kpiScore — punctuality', () => {
  it('a check-in exactly 10 minutes after the scheduled start is on time', () => {
    expect(kpiScore([row({ checkInAt: new Date(START + 10 * MINUTE) })], W)).toBe(100);
  });

  it('one millisecond past those 10 minutes is late', () => {
    // Kept (1) and late (0), renormalised over the two present: (3·1 + 1·0) / 4.
    expect(kpiScore([row({ checkInAt: new Date(START + 10 * MINUTE + 1) })], W)).toBe(75);
  });

  it('an early check-in is on time', () => {
    expect(kpiScore([row({ checkInAt: new Date(START - 45 * MINUTE) })], W)).toBe(100);
  });

  it('accepts the stamp as an ISO string', () => {
    expect(
      kpiScore([row({ checkInAt: new Date(START + 11 * MINUTE).toISOString() })], W),
    ).toBe(75);
  });

  it('reads the slot in venue time, meridiem slots included', () => {
    // "8pm - 2am" on 10 Sep starts 12:00Z. 12:05Z is on time; 20:05Z (a
    // server-timezone misreading of 8pm) would not be.
    expect(
      kpiScore([row({ slot: '8pm - 2am', checkInAt: new Date('2026-09-10T12:05:00Z') })], W),
    ).toBe(100);
    expect(
      kpiScore([row({ slot: '8pm - 2am', checkInAt: new Date('2026-09-10T12:11:00Z') })], W),
    ).toBe(75);
  });

  it('cannot be judged without a check-in stamp or a clock-time slot — which is not late', () => {
    expect(kpiScore([row({ checkInAt: null })], W)).toBe(100);
    expect(
      kpiScore([keptUnjudged({ checkInAt: new Date(START + 5 * 60 * MINUTE) })], W),
    ).toBe(100);
  });

  it('only completed assignments are judged', () => {
    // The no-show carries a stamp far past its start; it is a miss, not a late
    // arrival. Kept 1 of 2, on time 1 of 1: (3·0.5 + 1·1) / 4 = 62.5, a half,
    // rounded up. Judged as late it would have been (3·0.5 + 1·0.5) / 4 = 50.
    expect(
      kpiScore(
        [onTime(), row({ status: 'no_show', checkInAt: new Date(START + 60 * MINUTE) })],
        W,
      ),
    ).toBe(63);
  });
});

describe('kpiScore — rating', () => {
  it('maps stars 1–5 onto 0–1', () => {
    expect(kpiScore([keptUnjudged({ stars: 5 })], W)).toBe(100);
    // Kept (1) and rated 3 (0.5): (3·1 + 1·0.5) / 4 = 87.5, rounded up.
    expect(kpiScore([keptUnjudged({ stars: 3 })], W)).toBe(88);
    // Rated 1 (0): (3·1 + 1·0) / 4.
    expect(kpiScore([keptUnjudged({ stars: 1 })], W)).toBe(75);
  });

  it('averages every rated assignment in the window, whatever became of it', () => {
    // Stars 5 and 1 average to 0.5: (3·1 + 1·0.5) / 4 = 87.5.
    expect(
      kpiScore(
        [keptUnjudged({ stars: 5 }), row({ status: 'assigned', checkInAt: null, stars: 1 })],
        W,
      ),
    ).toBe(88);
  });

  it('a verdict written without stars (0) carries no rating', () => {
    expect(kpiScore([keptUnjudged({ stars: 0 })], W)).toBe(100);
  });
});

describe('kpiScore — all three together', () => {
  it('weights the components and renormalises over the ones present', () => {
    // Kept 3 of 4 (0.75); on time 2 of 3 (0.667); stars 4 and 2 (0.75, 0.25 → 0.5).
    // All three: (3·0.75 + 1·0.667 + 1·0.5) / 5 = 68.3.
    const rows = [onTime({ stars: 4 }), onTime({ stars: 2 }), late(), noShow()];
    expect(kpiScore(rows, W)).toBe(68);
    // No rating: (3·0.75 + 1·0.667) / 4 = 72.9.
    expect(kpiScore([onTime(), onTime(), late(), noShow()], W)).toBe(73);
    // No punctuality evidence: (3·0.75 + 1·0.5) / 4 = 68.75.
    const unjudged = [
      keptUnjudged({ stars: 4 }),
      keptUnjudged({ stars: 2 }),
      keptUnjudged(),
      noShow(),
    ];
    expect(kpiScore(unjudged, W)).toBe(69);
  });

  it('rounds an exact half UP, despite floating-point drift', () => {
    // Kept 5 of 8 (0.625); on time 1 of 2 (0.5); stars 5 and 1 (0.5):
    // (3·0.625 + 1·0.5 + 1·0.5) / 5 is exactly 57.5 on paper.
    const rows = [
      onTime({ stars: 5 }),
      late({ stars: 1 }),
      keptUnjudged(),
      keptUnjudged(),
      keptUnjudged(),
      noShow(),
      noShow(),
      chargedCancel(),
    ];
    expect(kpiScore(rows, W)).toBe(58);

    // The instrument: naive binary arithmetic on these very numbers lands a
    // hair BELOW the half and rounds down, so this case really exercises drift.
    const naive =
      (W.reliability * (5 / 8) + W.punctuality * (1 / 2) + W.rating * (1 / 2)) /
      (W.reliability + W.punctuality + W.rating);
    expect(naive * 100).toBeLessThan(57.5);
    expect(Math.round(naive * 100)).toBe(57);
  });

  it('otherwise rounds to the nearest whole number', () => {
    // Kept 1 of 1, on time 1 of 3: (3·1 + 1·0.333) / 4 = 83.3.
    expect(kpiScore([onTime(), late(), late()], W)).toBe(83);
    // Kept 1 of 1, on time 2 of 3: (3·1 + 1·0.667) / 4 = 91.7.
    expect(kpiScore([onTime(), onTime(), late()], W)).toBe(92);
    // Kept 2 of 3, no other evidence: 66.67.
    expect(kpiScore([keptUnjudged(), keptUnjudged(), noShow()], W)).toBe(67);
    // Kept 1 of 3: 33.33.
    expect(kpiScore([keptUnjudged(), noShow(), noShow()], W)).toBe(33);
  });

  it('is always a whole number from 0 to 100', () => {
    const samples = [
      [onTime({ stars: 5 })],
      [late({ stars: 1 }), noShow(), chargedCancel()],
      [keptUnjudged(), late({ stars: 2 }), onTime({ stars: 4 })],
    ];
    for (const rows of samples) {
      const score = kpiScore(rows, W);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });
});

describe('kpiScoresByPr', () => {
  it('scores each PR from its own rows only', () => {
    const scores = kpiScoresByPr(
      [
        keptUnjudged({ prId: 'pr-a' }),
        noShow(),
        keptUnjudged({ prId: 'pr-b' }),
        row({ prId: 'pr-c', status: 'leave_approved', checkInAt: null }),
      ],
      W,
    );
    // `noShow()` is pr-a's.
    expect(scores.get('pr-a')).toBe(50);
    expect(scores.get('pr-b')).toBe(100);
    expect(scores.get('pr-c')).toBeNull();
    expect(scores.has('pr-d')).toBe(false);
  });
});

describe('kpiWindow — the last 90 days on the Kuala Lumpur calendar', () => {
  it('runs from 90 days back up to, but not including, today', () => {
    // 10:00 KL on 29 Sep.
    expect(kpiWindow(new Date('2026-09-29T02:00:00Z'))).toEqual({
      fromDate: '2026-07-01',
      toDate: '2026-09-29',
    });
    expect(KPI_WINDOW_DAYS).toBe(90);
  });

  it('turns the day at midnight in Kuala Lumpur, not at midnight UTC', () => {
    // 23:59:59 KL on 28 Sep, then 00:00:00 KL on 29 Sep.
    expect(kpiWindow(new Date('2026-09-28T15:59:59Z')).toDate).toBe('2026-09-28');
    expect(kpiWindow(new Date('2026-09-28T16:00:00Z')).toDate).toBe('2026-09-29');
  });

  it('crosses a month and a year boundary', () => {
    expect(kpiWindow(new Date('2027-01-15T04:00:00Z'))).toEqual({
      fromDate: '2026-10-17',
      toDate: '2027-01-15',
    });
  });
});
