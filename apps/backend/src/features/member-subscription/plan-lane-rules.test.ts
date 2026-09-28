import { describe, expect, it } from 'vitest';
import {
  type CloseLaneFacts,
  type LivePlanRow,
  closeLaneRefusal,
  closeLaneVerdict,
  pickSupersededLivePlans,
} from './plan-lane-rules.js';

/**
 * The last-plan guard and the duplicate-row selection, tested as decisions.
 * Both sit in front of writes to the billing ledger, so neither is probed
 * against the shared database.
 */

const livePlan = { kind: 'plan' as const, status: 'active', endedAt: null };

function facts(overrides: Partial<CloseLaneFacts> = {}): CloseLaneFacts {
  return { target: livePlan, otherLivePlanRows: 0, subscriberExists: true, ...overrides };
}

describe('closeLaneVerdict — would closing this row leave a real org planless?', () => {
  it('refuses the only live plan of a real organisation', () => {
    expect(closeLaneVerdict(facts())).toBe('last_plan');
  });

  it('lets a plan go when another live plan remains', () => {
    expect(closeLaneVerdict(facts({ otherLivePlanRows: 1 }))).toBe('another_plan_live');
  });

  it('calls a live plan whose organisation does not exist a ghost — even as its only row', () => {
    // The row the admin could not cancel today: an ACTIVE Premier row for an
    // outlet id that exists nowhere. It cannot leave a real org planless,
    // because there is no org.
    expect(closeLaneVerdict(facts({ subscriberExists: false }))).toBe('ghost');
  });

  it('counts past_due as still on the lane', () => {
    expect(closeLaneVerdict(facts({ target: { ...livePlan, status: 'past_due' } }))).toBe(
      'last_plan',
    );
  });

  it('never guards an add-on — POS is held beside a plan, not instead of one', () => {
    expect(closeLaneVerdict(facts({ target: { ...livePlan, kind: 'addon' } }))).toBe(
      'not_a_live_plan',
    );
  });

  it('does not guard a plan row already dead by status', () => {
    expect(closeLaneVerdict(facts({ target: { ...livePlan, status: 'cancelled' } }))).toBe(
      'not_a_live_plan',
    );
    expect(closeLaneVerdict(facts({ target: { ...livePlan, status: 'expired' } }))).toBe(
      'not_a_live_plan',
    );
  });

  it('reports a row that already ended', () => {
    const ended = { ...livePlan, endedAt: new Date('2026-09-01T00:00:00Z') };
    expect(closeLaneVerdict(facts({ target: ended }))).toBe('already_ended');
  });

  it('reports a missing row', () => {
    expect(closeLaneVerdict(facts({ target: null }))).toBe('not_found');
  });
});

describe('closeLaneRefusal — which verdicts stop the write', () => {
  it('cancel refuses the last plan, a missing row, and a row that already ended', () => {
    expect(closeLaneRefusal('last_plan', 'cancel')).toBe('last_plan');
    expect(closeLaneRefusal('not_found', 'cancel')).toBe('not_found');
    // Re-cancelling would re-stamp ended_at and rewrite when the org left.
    expect(closeLaneRefusal('already_ended', 'cancel')).toBe('already_ended');
  });

  it('cancel lets a ghost row, a covered plan and a non-plan row through', () => {
    expect(closeLaneRefusal('ghost', 'cancel')).toBeNull();
    expect(closeLaneRefusal('another_plan_live', 'cancel')).toBeNull();
    expect(closeLaneRefusal('not_a_live_plan', 'cancel')).toBeNull();
  });

  it('an edit may correct the date on a row that already ended', () => {
    expect(closeLaneRefusal('already_ended', 'edit')).toBeNull();
    expect(closeLaneRefusal('last_plan', 'edit')).toBe('last_plan');
    expect(closeLaneRefusal('not_found', 'edit')).toBe('not_found');
    expect(closeLaneRefusal('ghost', 'edit')).toBeNull();
  });
});

const at = (iso: string) => new Date(iso);

function row(
  id: string,
  startedAt: string,
  overrides: Partial<LivePlanRow> = {},
): LivePlanRow {
  return {
    id,
    subscriberType: 'agency',
    subscriberId: 'org-1',
    startedAt: at(startedAt),
    createdAt: at(startedAt),
    ...overrides,
  };
}

describe('pickSupersededLivePlans — which duplicate live plan rows to close', () => {
  it('finds nothing when every subscriber holds one live plan', () => {
    expect(pickSupersededLivePlans([])).toEqual([]);
    expect(
      pickSupersededLivePlans([
        row('a', '2026-09-01T00:00:00Z'),
        row('b', '2026-09-02T00:00:00Z', { subscriberId: 'org-2' }),
      ]),
    ).toEqual([]);
  });

  it('keeps the newest and ends the older one when the newer one started', () => {
    const superseded = pickSupersededLivePlans([
      row('new', '2026-09-10T02:00:00Z'),
      row('old', '2026-09-01T00:00:00Z'),
    ]);
    expect(superseded).toEqual([
      {
        id: 'old',
        subscriberType: 'agency',
        subscriberId: 'org-1',
        endedAt: at('2026-09-10T02:00:00Z'),
        keptId: 'new',
      },
    ]);
  });

  it('ends each row of a chain at its own successor, not at the newest', () => {
    const superseded = pickSupersededLivePlans([
      row('c', '2026-09-20T00:00:00Z'),
      row('a', '2026-09-01T00:00:00Z'),
      row('b', '2026-09-10T00:00:00Z'),
    ]);
    expect(superseded.map((r) => [r.id, r.endedAt.toISOString(), r.keptId])).toEqual([
      ['a', '2026-09-10T00:00:00.000Z', 'c'],
      ['b', '2026-09-20T00:00:00.000Z', 'c'],
    ]);
  });

  it('treats the same id under a different subscriber type as a different lane', () => {
    const superseded = pickSupersededLivePlans([
      row('agency-row', '2026-09-01T00:00:00Z'),
      row('outlet-row', '2026-09-05T00:00:00Z', { subscriberType: 'outlet' }),
    ]);
    expect(superseded).toEqual([]);
  });

  it('breaks a started_at tie by created_at, then id, so a re-run picks the same survivor', () => {
    const sameStart = '2026-09-10T00:00:00Z';
    const rows = [
      row('z', sameStart, { createdAt: at('2026-09-10T00:00:01Z') }),
      row('y', sameStart, { createdAt: at('2026-09-10T00:00:02Z') }),
    ];
    const first = pickSupersededLivePlans(rows);
    const second = pickSupersededLivePlans([...rows].reverse());
    expect(first).toEqual(second);
    expect(first.map((r) => r.keptId)).toEqual(['y']);
    expect(first.map((r) => r.id)).toEqual(['z']);
  });
});
