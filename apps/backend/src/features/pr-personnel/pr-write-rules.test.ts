import { describe, expect, it } from 'vitest';
import { identityPatchForAdd, penaltyRuleAgencyIds } from './pr-write-rules';

/**
 * 28 Sep 2026 audit, backend: `POST /pr` overwrote a person's legal name and IC,
 * and the PR's penalty rules came from the OLDEST agency she works for.
 */

describe('identityPatchForAdd — POST /pr and an account that already exists', () => {
  const vicky = { fullName: 'Victoria Tan Mei Lin', idNo: '900101-14-5678' };

  it('a stub created by this request takes what the agency typed', () => {
    expect(
      identityPatchForAdd({
        createdStub: true,
        stored: null,
        typed: { name: ' Vicky Tan ', icNo: '900101145678' },
      }),
    ).toEqual({ fullName: 'Vicky Tan', idNo: '900101145678' });
  });

  it('an EXISTING account keeps its legal name and IC — agency B cannot respell them', () => {
    expect(
      identityPatchForAdd({
        createdStub: false,
        stored: vicky,
        typed: { name: 'Vicky', icNo: '111111-11-1111' },
      }),
    ).toEqual({});
  });

  it('a blank IC typed by the agency never CLEARS the one on file (the old null-wipe)', () => {
    const patch = identityPatchForAdd({
      createdStub: false,
      stored: vicky,
      typed: { name: 'Vicky', icNo: null },
    });
    expect(patch).not.toHaveProperty('idNo');
    expect(patch).toEqual({});
  });

  it('fills only what the account has left BLANK', () => {
    expect(
      identityPatchForAdd({
        createdStub: false,
        stored: { fullName: 'Victoria Tan Mei Lin', idNo: null },
        typed: { name: 'Vicky', icNo: '900101-14-5678' },
      }),
    ).toEqual({ idNo: '900101-14-5678' });
    expect(
      identityPatchForAdd({
        createdStub: false,
        stored: { fullName: '   ', idNo: '900101-14-5678' },
        typed: { name: 'Victoria Tan', icNo: '' },
      }),
    ).toEqual({ fullName: 'Victoria Tan' });
  });

  it('an existing account with no profile row yet is treated as all-blank', () => {
    expect(
      identityPatchForAdd({ createdStub: false, stored: null, typed: { name: 'Aina', icNo: '' } }),
    ).toEqual({ fullName: 'Aina' });
  });
});

describe('penaltyRuleAgencyIds — GET /pr/mine/penalty-rules', () => {
  const ATLAS = '11111111-1111-4111-8111-111111111111';
  const DELTA = '22222222-2222-4222-8222-222222222222';
  const ROGUE = '33333333-3333-4333-8333-333333333333';

  it('with no agency named: EVERY agency she works for, oldest first — never just the oldest', () => {
    expect(penaltyRuleAgencyIds([ATLAS, DELTA], null)).toEqual([ATLAS, DELTA]);
    expect(penaltyRuleAgencyIds([ATLAS, DELTA], '')).toEqual([ATLAS, DELTA]);
  });

  it('names one of hers: only that agency — the one behind the shift being cancelled', () => {
    expect(penaltyRuleAgencyIds([ATLAS, DELTA], DELTA)).toEqual([DELTA]);
  });

  it('names an agency she is not approved at: refused, never another schedule', () => {
    expect(penaltyRuleAgencyIds([ATLAS, DELTA], ROGUE)).toBeNull();
    expect(penaltyRuleAgencyIds([], ATLAS)).toBeNull();
  });

  it('no approved agency at all: nothing to be charged by', () => {
    expect(penaltyRuleAgencyIds([], null)).toEqual([]);
  });
});
