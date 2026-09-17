import { describe, expect, it } from 'vitest';
import { DecoyRequests } from './decoy-requests';

const T0 = Date.parse('2026-09-17T10:00:00.000Z');

describe('DecoyRequests', () => {
  it('counts guesses to the cap, then answers expired', () => {
    const decoys = new DecoyRequests(5, 600_000);
    decoys.supersede('email:nobody@x.my', 'id-1', T0);
    decoys.issue('email:nobody@x.my', 'id-1', T0 + 600_000);
    const answers = Array.from({ length: 6 }, () => decoys.guess('id-1', T0 + 1_000));
    expect(answers).toEqual(['invalid', 'invalid', 'invalid', 'invalid', 'exhausted', 'expired']);
  });

  it('expires at the TTL, exactly like a row whose expires_at <= now', () => {
    const decoys = new DecoyRequests(5, 600_000);
    decoys.supersede('k', 'id-1', T0);
    decoys.issue('k', 'id-1', T0 + 600_000);
    expect(decoys.guess('id-1', T0 + 599_999)).toBe('invalid');
    expect(decoys.guess('id-1', T0 + 600_000)).toBe('expired');
  });

  it('a newer request for the same key closes the older stand-in', () => {
    const decoys = new DecoyRequests(5, 600_000);
    decoys.supersede('k', 'id-1', T0);
    decoys.issue('k', 'id-1', T0 + 600_000);
    decoys.supersede('k', 'real-row-2', T0 + 61_000);
    expect(decoys.guess('id-1', T0 + 62_000)).toBe('expired');
  });

  it('refuses to make a SUPERSEDED id a stand-in (a late delivery failure)', () => {
    const decoys = new DecoyRequests(5, 600_000);
    decoys.supersede('k', 'row-1', T0);
    decoys.supersede('k', 'row-2', T0 + 61_000);
    decoys.issue('k', 'row-1', T0 + 600_000);
    expect(decoys.guess('row-1', T0 + 62_000)).toBeNull();
  });

  it('carries guesses already spent on a real row', () => {
    const decoys = new DecoyRequests(5, 600_000);
    decoys.supersede('k', 'row-1', T0);
    decoys.issue('k', 'row-1', T0 + 600_000, 4);
    expect(decoys.guess('row-1', T0 + 1_000)).toBe('exhausted');
    expect(decoys.guess('row-1', T0 + 2_000)).toBe('expired');
  });

  it('an id that was never a stand-in is null', () => {
    expect(new DecoyRequests(5, 600_000).guess('never', T0)).toBeNull();
  });
});
