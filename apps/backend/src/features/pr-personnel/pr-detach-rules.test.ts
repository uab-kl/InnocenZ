import { describe, expect, it } from 'vitest';
import {
  detachableFrom,
  isLiveMembership,
  tiedSince,
  tiedUnderOneYear,
  underOneYearRefusal,
} from './pr-detach-rules';

/**
 * The one-year tie rule (owner, 20 Nov 2026 — "Keep rule, real admin request").
 * Pure: the boundary, the date it counts from, and the sentence it refuses with.
 */

const DAY = 86_400_000;
const NOW = new Date('2026-11-20T12:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

describe('tiedUnderOneYear', () => {
  it('is under a year one day short of 365 days', () => {
    expect(tiedUnderOneYear({ approvedAt: daysAgo(364), createdAt: daysAgo(500) }, NOW)).toBe(true);
  });

  it('is a year exactly at 365 days — Detach works directly from that moment', () => {
    expect(tiedUnderOneYear({ approvedAt: daysAgo(365), createdAt: daysAgo(500) }, NOW)).toBe(false);
  });

  it('counts from approved_at, not from when the row was created', () => {
    // A PR who left and re-joined: the row is old, the membership is new.
    expect(tiedUnderOneYear({ approvedAt: daysAgo(30), createdAt: daysAgo(700) }, NOW)).toBe(true);
  });

  it('falls back to created_at when approved_at is null — the back-fill rule', () => {
    expect(tiedSince({ approvedAt: null, createdAt: daysAgo(10) })).toEqual(daysAgo(10));
    expect(tiedUnderOneYear({ approvedAt: null, createdAt: daysAgo(400) }, NOW)).toBe(false);
  });

  it('every live membership on 20 Nov 2026 (approved Jul–Sep 2026) is under a year', () => {
    const july = new Date('2026-07-20T08:21:18Z');
    expect(tiedUnderOneYear({ approvedAt: july, createdAt: july }, NOW)).toBe(true);
  });
});

describe('underOneYearRefusal', () => {
  it('names the join date, the first day Detach is allowed, and what to press', () => {
    const m = { approvedAt: new Date('2026-08-01T00:00:00Z'), createdAt: daysAgo(900) };
    expect(detachableFrom(m).toISOString().slice(0, 10)).toBe('2027-08-01');
    const sentence = underOneYearRefusal(m);
    expect(sentence).toContain('2026-08-01');
    expect(sentence).toContain('2027-08-01');
    expect(sentence).toMatch(/admin request/);
  });
});

describe('isLiveMembership', () => {
  it('counts approved and a pending departure as still on the roster', () => {
    expect(isLiveMembership('approved')).toBe(true);
    expect(isLiveMembership('leave_pending')).toBe(true);
  });

  it('does not count an applicant, a refusal or a PR who already left', () => {
    expect(isLiveMembership('pending')).toBe(false);
    expect(isLiveMembership('rejected')).toBe(false);
    expect(isLiveMembership('left')).toBe(false);
    expect(isLiveMembership(null)).toBe(false);
  });
});
