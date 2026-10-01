import { describe, expect, it, vi } from 'vitest';

// The rules are pure. Any path that reached the database from here would be a
// bug, so the pool is stubbed out rather than trusted to stay unused.
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db/index.js', () => ({ db: {} }));

import { REPEAT_WINDOW_MS } from '@/features/notification/repeat-delivery';
import { voidNote } from '@/features/subscription-invoice/invoice-void';
import {
  applyRefusal,
  canonicalRace,
  chooseShiftToKeep,
  GAP_INVOICE_VOID_REASON,
  groupRepeatNotices,
  isBeforeLaneCalendar,
  isFictionalSeedAnchor,
  laneCalendarStart,
  type LaneRow,
  type NoticeRow,
  parseCleanupArgs,
  preCalendarInvoiceAction,
  raceRewrite,
  resolveCategoryKeys,
  safeActor,
  SEED_INVOICE_VOID_REASON,
} from './cleanup-test-data-29sep-rules';

const at = (iso: string) => new Date(iso);

/** Owner, 29 Sep 2026: "Add Void" — categories 3/3b VOID instead of DELETE. */
describe('preCalendarInvoiceAction — categories 3 / 3b', () => {
  it('voids an unpaid invoice nothing points at', () => {
    expect(preCalendarInvoiceAction({ status: 'unpaid', payments: 0, creditRefs: 0 })).toBe('void');
  });

  it('leaves a paid one, or one any payment attempt or credit points at', () => {
    expect(preCalendarInvoiceAction({ status: 'paid', payments: 0, creditRefs: 0 })).toBe('leave');
    expect(preCalendarInvoiceAction({ status: 'unpaid', payments: 1, creditRefs: 0 })).toBe('leave');
    expect(preCalendarInvoiceAction({ status: 'unpaid', payments: 0, creditRefs: 1 })).toBe('leave');
  });

  it('a second run finds them already void — nothing left to do, so the category reconciles to zero', () => {
    expect(preCalendarInvoiceAction({ status: 'void', payments: 0, creditRefs: 0 })).toBe('already-void');
  });

  it('keeps the reason on the bill after whatever it already said', () => {
    expect(voidNote(null, SEED_INVOICE_VOID_REASON)).toBe(`Voided: ${SEED_INVOICE_VOID_REASON}`);
    expect(voidNote('Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00)', GAP_INVOICE_VOID_REASON)).toBe(
      `Pro-rated: 2 of 7 days from 2026-08-07 (full period 125.00) · Voided: ${GAP_INVOICE_VOID_REASON}`,
    );
    expect(SEED_INVOICE_VOID_REASON).toMatch(/before the organisation existed/);
  });
});

describe('parseCleanupArgs', () => {
  it('defaults to a dry run over the default set', () => {
    expect(parseCleanupArgs([])).toEqual({
      ok: true,
      args: { apply: false, only: null, keepShift: null, help: false, ackTestDb: false },
    });
  });

  it('reads --apply, --only (keys and numbers) and --keep-shift', () => {
    const parsed = parseCleanupArgs(['--apply', '--only=seed-anchors,3', '--only=9', '--keep-shift=A91C04F4']);
    expect(parsed).toEqual({
      ok: true,
      args: { apply: true, only: ['seed-anchors', '3', '9'], keepShift: 'a91c04f4', help: false, ackTestDb: false },
    });
  });

  it('reads the test-database acknowledgement flag', () => {
    const parsed = parseCleanupArgs(['--apply', '--i-know-this-is-a-test-db']);
    expect(parsed.ok && parsed.args.ackTestDb).toBe(true);
  });

  it('refuses an unknown flag instead of widening the run', () => {
    expect(parseCleanupArgs(['--apply', '--onyl=1'])).toEqual({
      ok: false,
      error: 'unknown flag --onyl=1 (see --help)',
    });
  });

  it('refuses an empty --only and a keep-shift that is not an id', () => {
    expect(parseCleanupArgs(['--only=']).ok).toBe(false);
    expect(parseCleanupArgs(['--keep-shift=abc']).ok).toBe(false);
  });
});

describe('resolveCategoryKeys', () => {
  const catalogue = [
    { key: 'demo-requests', num: '1', defaultOn: true },
    { key: 'gap-invoices', num: '3b', defaultOn: false },
    { key: 'race-case', num: '9', defaultOn: true },
  ];

  it('runs the default set without --only, leaving opt-in categories out', () => {
    expect(resolveCategoryKeys(null, catalogue)).toEqual({ ok: true, keys: ['demo-requests', 'race-case'] });
  });

  it('runs an opt-in category only when named, in catalogue order', () => {
    expect(resolveCategoryKeys(['9', 'gap-invoices'], catalogue)).toEqual({
      ok: true,
      keys: ['gap-invoices', 'race-case'],
    });
  });

  it('names the valid keys when one is unknown', () => {
    const result = resolveCategoryKeys(['nope'], catalogue);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('1=demo-requests');
  });
});

describe('safeActor', () => {
  it('prints account ids and job stamps as they are', () => {
    expect(safeActor('96cb6034-47b9-4bd9-8ad6-17a555d40b9a')).toBe('96cb6034-47b9-4bd9-8ad6-17a555d40b9a');
    expect(safeActor('weekly-payout-job')).toBe('weekly-payout-job');
    expect(safeActor('seed-sample')).toBe('seed-sample');
    expect(safeActor('system')).toBe('system');
  });

  it('never prints an e-mail or a typed name', () => {
    expect(safeActor('owner@example.my')).toBe('(person)');
    expect(safeActor('Victoria Tan')).toBe('(person)');
    expect(safeActor(null)).toBe('—');
  });
});

describe('race spellings', () => {
  it('maps every case and spacing variant onto the spelling the app prints', () => {
    expect(canonicalRace('chinese')).toBe('Chinese');
    expect(canonicalRace('  Indian ')).toBe('Indian');
    expect(canonicalRace('MALAY')).toBe('Malay');
  });

  it('rewrites only a variant, never the canonical spelling or free text', () => {
    expect(raceRewrite('chinese')).toBe('Chinese');
    expect(raceRewrite('Chinese')).toBeNull();
    expect(raceRewrite('Eurasian')).toBeNull();
    expect(raceRewrite(null)).toBeNull();
    expect(raceRewrite('')).toBeNull();
  });
});

describe('isFictionalSeedAnchor', () => {
  const orgCreatedAt = at('2026-07-17T08:20:13Z');

  it('flags a seeded anchor that predates its organisation', () => {
    expect(
      isFictionalSeedAnchor({ createdBy: 'seed-sample', billingStartsAt: at('2026-07-01T00:00:00Z'), orgCreatedAt }),
    ).toBe(true);
  });

  it('leaves real rows, later anchors and withdrawn anchors alone', () => {
    expect(
      isFictionalSeedAnchor({ createdBy: 'admin-reinstate', billingStartsAt: at('2026-07-01T00:00:00Z'), orgCreatedAt }),
    ).toBe(false);
    expect(
      isFictionalSeedAnchor({ createdBy: 'seed-sample', billingStartsAt: at('2026-07-18T00:00:00Z'), orgCreatedAt }),
    ).toBe(false);
    expect(isFictionalSeedAnchor({ createdBy: 'seed-sample', billingStartsAt: null, orgCreatedAt })).toBe(false);
  });
});

describe('laneCalendarStart', () => {
  // An agency lane shaped like c30fcd15 on the live DB: a seeded row from 7 Jul,
  // then the org's own first plan from 3 Aug (weekly, Sun–Sat).
  const seeded: LaneRow = {
    startedAt: at('2026-07-07T00:00:00Z'),
    endedAt: at('2026-08-03T08:02:39Z'),
    billingStartsAt: at('2026-07-07T00:00:00Z'),
    billingCycle: 'weekly',
    fictionalAnchor: true,
  };
  const real: LaneRow = {
    startedAt: at('2026-08-03T10:00:13Z'),
    endedAt: null,
    billingStartsAt: at('2026-08-03T10:00:13Z'),
    billingCycle: 'weekly',
    fictionalAnchor: false,
  };

  it('starts the calendar at the first REAL anchor once the seeded one is withdrawn', () => {
    expect(laneCalendarStart([seeded, real]).firstPeriodStart).toBe('2026-08-02');
  });

  it('would start at the seeded anchor while it stands — the week of 5 Jul', () => {
    expect(laneCalendarStart([{ ...seeded, fictionalAnchor: false }, real]).firstPeriodStart).toBe('2026-07-05');
  });

  it('has no calendar at all when the only anchor was fictional (monthly outlet lane)', () => {
    const outlet: LaneRow = {
      startedAt: at('2026-07-01T00:00:00Z'),
      endedAt: null,
      billingStartsAt: at('2026-07-01T00:00:00Z'),
      billingCycle: 'monthly',
      fictionalAnchor: true,
    };
    expect(laneCalendarStart([outlet])).toEqual({ anchor: null, firstPeriodStart: null });
    expect(laneCalendarStart([{ ...outlet, fictionalAnchor: false }]).firstPeriodStart).toBe('2026-07-01');
  });

  it('ignores a row that ended on the KL day it started, as the invoice job does', () => {
    const artefact: LaneRow = {
      startedAt: at('2026-08-03T08:00:17Z'),
      endedAt: at('2026-08-03T08:01:48Z'),
      billingStartsAt: at('2026-08-03T08:00:17Z'),
      billingCycle: 'weekly',
      fictionalAnchor: false,
    };
    const later: LaneRow = {
      startedAt: at('2026-08-12T07:03:18Z'),
      endedAt: null,
      billingStartsAt: at('2026-08-12T07:03:18Z'),
      billingCycle: 'weekly',
      fictionalAnchor: false,
    };
    expect(laneCalendarStart([artefact, later]).firstPeriodStart).toBe('2026-08-09');
  });
});

describe('isBeforeLaneCalendar', () => {
  it('treats every period as outside a lane with no calendar', () => {
    expect(isBeforeLaneCalendar('2026-09-01', null)).toBe(true);
  });

  it('is strict: the first period itself is inside', () => {
    expect(isBeforeLaneCalendar('2026-07-26', '2026-08-02')).toBe(true);
    expect(isBeforeLaneCalendar('2026-08-02', '2026-08-02')).toBe(false);
  });
});

describe('chooseShiftToKeep', () => {
  const early = { id: '2ed03fd8-069a-448f-bde8-5f3ef0723d71', substantive: 0 };
  const late = { id: 'a91c04f4-6acf-4ce4-8b3f-01c93dc6a197', substantive: 0 };

  it('cannot choose between two bare shifts without --keep-shift', () => {
    expect(chooseShiftToKeep(early, late, null).kind).toBe('tie');
  });

  it('keeps the shift --keep-shift names and drops the other', () => {
    expect(chooseShiftToKeep(early, late, 'a91c04f4')).toMatchObject({
      kind: 'keep',
      keep: late.id,
      drop: early.id,
    });
  });

  it('keeps the only shift with work attached', () => {
    expect(chooseShiftToKeep({ ...early, substantive: 2 }, late, null)).toMatchObject({
      kind: 'keep',
      keep: early.id,
      drop: late.id,
    });
  });

  it('refuses to delete a shift that carries work, whoever asks', () => {
    expect(chooseShiftToKeep({ ...early, substantive: 1 }, late, 'a91c04f4').kind).toBe('refuse');
    expect(chooseShiftToKeep({ ...early, substantive: 1 }, { ...late, substantive: 3 }, null).kind).toBe('refuse');
  });

  it('refuses a --keep-shift that names neither of the pair', () => {
    expect(chooseShiftToKeep(early, late, 'ffffffff').kind).toBe('refuse');
  });
});

describe('groupRepeatNotices', () => {
  const base: NoticeRow = {
    id: 'n1',
    userId: 'u1',
    kind: 'subscription_tier_weekly',
    title: 'Weekly statement',
    body: 'Last week: 3 PVs',
    payload: { weekStart: '2026-09-06', pvCount: 3 },
    createdAt: at('2026-09-12T18:00:00.100Z'),
    readAt: null,
  };

  it('keeps the first copy and drops a later identical one inside the window', () => {
    const copy = { ...base, id: 'n2', createdAt: at('2026-09-12T18:00:00.500Z') };
    const [group] = groupRepeatNotices([copy, base], REPEAT_WINDOW_MS);
    expect(group?.keep.id).toBe('n1');
    expect(group?.drop.map((row) => row.id)).toEqual(['n2']);
  });

  it('compares payloads structurally — jsonb hands keys back in its own order', () => {
    const copy = {
      ...base,
      id: 'n2',
      payload: { pvCount: 3, weekStart: '2026-09-06' },
      createdAt: at('2026-09-12T18:00:00.500Z'),
    };
    expect(groupRepeatNotices([base, copy], REPEAT_WINDOW_MS)).toHaveLength(1);
  });

  it('still pairs an original and its copy with another notice between them', () => {
    const other = { ...base, id: 'x', kind: 'pv_day_review_pending', title: 'Held', createdAt: at('2026-09-12T18:00:00.300Z') };
    const copy = { ...base, id: 'n2', createdAt: at('2026-09-12T18:00:00.500Z') };
    const groups = groupRepeatNotices([base, other, copy], REPEAT_WINDOW_MS);
    expect(groups.map((g) => [g.keep.id, g.drop.map((r) => r.id)])).toEqual([['n1', ['n2']]]);
  });

  it('never merges different content, other users, or repeats outside the window', () => {
    const otherBody = { ...base, id: 'b', body: 'Last week: 4 PVs', createdAt: at('2026-09-12T18:00:01Z') };
    const otherUser = { ...base, id: 'c', userId: 'u2', createdAt: at('2026-09-12T18:00:01Z') };
    const muchLater = { ...base, id: 'd', createdAt: at('2026-09-12T18:10:00Z') };
    expect(groupRepeatNotices([base, otherBody, otherUser, muchLater], REPEAT_WINDOW_MS)).toEqual([]);
  });

  it('leaves a copy the person has read while the original is unread', () => {
    const readCopy = { ...base, id: 'n2', createdAt: at('2026-09-12T18:00:00.500Z'), readAt: at('2026-09-13T01:00:00Z') };
    const [group] = groupRepeatNotices([base, readCopy], REPEAT_WINDOW_MS);
    expect(group?.drop).toEqual([]);
    expect(group?.leftRead.map((row) => row.id)).toEqual(['n2']);
  });
});

describe('applyRefusal — --apply needs the acknowledgement AND a test database (security review, 29 Sep)', () => {
  it('lets a dry run through with neither', () => {
    expect(applyRefusal({ apply: false, ackTestDb: false, databaseName: 'innocenz-prod' })).toBeNull();
  });

  it('refuses --apply without the flag, even on the test database', () => {
    expect(applyRefusal({ apply: true, ackTestDb: false, databaseName: 'innocenz-test' })).toMatch(
      /pass --i-know-this-is-a-test-db/,
    );
  });

  it('refuses the flag pasted against a database that is not a test one', () => {
    expect(applyRefusal({ apply: true, ackTestDb: true, databaseName: 'innocenz' })).toMatch(/not a test database/);
    expect(applyRefusal({ apply: true, ackTestDb: true, databaseName: undefined })).toMatch(/(unset)/);
  });

  it('allows --apply with the flag on the test database', () => {
    expect(applyRefusal({ apply: true, ackTestDb: true, databaseName: 'innocenz-test' })).toBeNull();
  });
});
