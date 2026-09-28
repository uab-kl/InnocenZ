import { describe, expect, it } from 'vitest';
import {
  migrationsThatWillRun,
  migrationsThatWouldBeSkipped,
  nextSafeWhen,
} from './migration-order';

const OCT_23 = Date.UTC(2026, 9, 23, 23, 43, 20);
const SEP_28 = Date.UTC(2026, 8, 28, 4, 0, 0);

/** The shared DB on 28 Sep 2026: applied rows run to a stamp in the future. */
const journal = [
  { tag: '0165_user_sessions_valid_from', when: OCT_23 - 1000 },
  { tag: '0166_notification_kind_subscription_autopay_failed', when: OCT_23 },
];
const ledger = [OCT_23 - 1000, OCT_23];

describe('migrationsThatWouldBeSkipped', () => {
  it('flags a new migration stamped today, below the future-stamped ledger', () => {
    const next = [...journal, { tag: '0167_new', when: SEP_28 }];
    expect(migrationsThatWouldBeSkipped(next, ledger).map((e) => e.tag)).toEqual(['0167_new']);
  });

  it('passes a new migration stamped after the newest ledger row', () => {
    const next = [...journal, { tag: '0167_new', when: OCT_23 + 1000 }];
    expect(migrationsThatWouldBeSkipped(next, ledger)).toEqual([]);
    expect(migrationsThatWillRun(next, ledger).map((e) => e.tag)).toEqual(['0167_new']);
  });

  it('does not call an applied migration pending because its FILE changed', () => {
    // Identity is the stamp: nothing about the file is consulted.
    expect(migrationsThatWouldBeSkipped(journal, ledger)).toEqual([]);
  });

  it('ignores a migration known to have been applied under another stamp', () => {
    const next = [{ tag: '0077_overtime_approval_and_bank', when: 1784500000077 }, ...journal];
    expect(migrationsThatWouldBeSkipped(next, ledger)).toEqual([]);
  });

  it('skips nothing on a database that was never migrated', () => {
    expect(migrationsThatWouldBeSkipped(journal, [])).toEqual([]);
    expect(migrationsThatWillRun(journal, [])).toHaveLength(2);
  });
});

describe('nextSafeWhen', () => {
  it('lands after the future-stamped ledger while it is still ahead of the clock', () => {
    expect(nextSafeWhen(journal, ledger, SEP_28)).toBe(OCT_23 + 1000);
  });

  it('uses the clock once the clock has passed the ledger', () => {
    const later = Date.UTC(2026, 10, 1, 0, 0, 0, 500);
    expect(nextSafeWhen(journal, ledger, later)).toBe(Date.UTC(2026, 10, 1, 0, 0, 1));
  });
});
