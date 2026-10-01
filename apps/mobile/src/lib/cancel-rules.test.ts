// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  cancellationBandsForAgency,
  cancellationRuleGroups,
  NO_CANCELLATION_FEE,
  shiftAgencyName,
} from './cancel-rules';
import { DEFAULT_CANCELLATION_BANDS } from './demo-shifts';

/**
 * "CANCELLATION RULES NAME NO AGENCY" (28 Sep 2026 audit, seen live).
 *
 * The shape on `innocenz-test` (29 Sep, read-only): Atlas is the only agency
 * with rules (24 h / 2 h / 25% / 50%); a PR on Atlas + UAB Emhub was shown
 * Atlas's bands, unnamed, for BOTH agencies' shifts, and a PR whose only agency
 * wrote no rules was shown the defaults — while the server, which reads the
 * booking agency's own rule, seals no fee for either.
 */

const ATLAS = 'c30fcd15-atlas';
const EMHUB = '665ee433-emhub';

const ATLAS_RULES = [
  {
    agencyId: ATLAS,
    ruleType: 'cancellation' as const,
    enabled: true,
    freeCancelHours: 24,
    shortNoticeHours: 2,
    shortNoticePct: 25,
    lateCancelPct: 50,
  },
  {
    agencyId: ATLAS,
    ruleType: 'late_per_week' as const,
    enabled: true,
    freeCancelHours: null,
    shortNoticeHours: null,
    shortNoticePct: null,
    lateCancelPct: null,
  },
];

const MEMBERSHIPS = [
  { agencyId: ATLAS, agencyName: 'Atlas' },
  { agencyId: EMHUB, agencyName: 'UAB Emhub' },
];

describe('cancellationBandsForAgency — the bands of the agency that BOOKED the shift', () => {
  test('an Atlas shift is charged by Atlas\'s rule', () => {
    expect(cancellationBandsForAgency(ATLAS_RULES, ATLAS)).toEqual({
      enabled: true,
      freeCancelHours: 24,
      shortNoticeHours: 2,
      shortNoticePct: 25,
      lateCancelPct: 50,
    });
  });

  test('THE BUG: an Emhub shift is NOT priced with Atlas\'s bands — no rule, no fee, as the server seals', () => {
    expect(cancellationBandsForAgency(ATLAS_RULES, EMHUB)).toEqual(NO_CANCELLATION_FEE);
    expect(NO_CANCELLATION_FEE.enabled).toBe(false);
  });

  test('an agency that wrote no rules at all charges nothing — not the defaults', () => {
    expect(cancellationBandsForAgency([], EMHUB)).toEqual(NO_CANCELLATION_FEE);
  });

  test('an agency whose rule is switched off charges nothing', () => {
    const off = [{ ...ATLAS_RULES[0], enabled: false }];
    expect(cancellationBandsForAgency(off, ATLAS).enabled).toBe(false);
  });

  test('rules not loaded yet (or the fetch failed): the defaults, as before', () => {
    expect(cancellationBandsForAgency(null, ATLAS)).toEqual(DEFAULT_CANCELLATION_BANDS);
  });

  test('a shift carrying no agency (an older backend): the one set the endpoint sent, as before', () => {
    expect(cancellationBandsForAgency(ATLAS_RULES, null).freeCancelHours).toBe(24);
    expect(cancellationBandsForAgency([], undefined)).toEqual(DEFAULT_CANCELLATION_BANDS);
  });
});

describe('cancellationRuleGroups — one set per agency, each under its NAME', () => {
  test('a PR on two rosters sees both, named, each with its own bands', () => {
    const groups = cancellationRuleGroups(ATLAS_RULES, MEMBERSHIPS);
    expect(groups.map((g) => g.agencyName)).toEqual(['Atlas', 'UAB Emhub']);
    expect(groups[0].bands.enabled).toBe(true);
    expect(groups[1].bands).toEqual(NO_CANCELLATION_FEE);
  });

  test('a PR on one roster sees her agency named', () => {
    const groups = cancellationRuleGroups([], [MEMBERSHIPS[1]]);
    expect(groups).toEqual([{ agencyId: EMHUB, agencyName: 'UAB Emhub', bands: NO_CANCELLATION_FEE }]);
  });

  test('a membership listed twice is shown once', () => {
    expect(cancellationRuleGroups(ATLAS_RULES, [MEMBERSHIPS[0], MEMBERSHIPS[0]])).toHaveLength(1);
  });

  test('memberships not loaded: the agencies the rows name, unlabelled', () => {
    const groups = cancellationRuleGroups(ATLAS_RULES, []);
    expect(groups).toEqual([
      { agencyId: ATLAS, agencyName: null, bands: cancellationBandsForAgency(ATLAS_RULES, ATLAS) },
    ]);
  });

  test('rules not loaded: the defaults, unlabelled — what the panel always showed', () => {
    expect(cancellationRuleGroups(null, MEMBERSHIPS)).toEqual([
      { agencyId: null, agencyName: null, bands: DEFAULT_CANCELLATION_BANDS },
    ]);
  });
});

describe('shiftAgencyName', () => {
  test('the shift\'s own agency name first', () => {
    expect(shiftAgencyName({ agencyId: ATLAS, agencyName: 'Atlas KL' }, MEMBERSHIPS)).toBe('Atlas KL');
  });

  test('else the membership with that id', () => {
    expect(shiftAgencyName({ agencyId: EMHUB, agencyName: null }, MEMBERSHIPS)).toBe('UAB Emhub');
  });

  test('never a guess: no id, no name', () => {
    expect(shiftAgencyName({}, MEMBERSHIPS)).toBeNull();
    expect(shiftAgencyName({ agencyId: 'unknown' }, MEMBERSHIPS)).toBeNull();
  });
});
