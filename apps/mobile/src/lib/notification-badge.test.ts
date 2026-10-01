// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  badgeLabel,
  realRowCoversVoucher,
  unreadBadgeCount,
} from './notification-badge';

/**
 * THE BELL'S NUMBER — stuck at 50 on the live app (28 Sep 2026 audit).
 *
 * `innocenz-test` held 64 unread notifications for one PR and 56 for another,
 * and the bell loads the newest 50. Counting the unread rows of that page is
 * what pinned the badge to 50; the server's own count is what it shows now.
 */

/** The newest 50 of 64, all unread — the live shape. */
const PAGE = Array.from({ length: 50 }, (_, i) => ({ id: `n${i}`, readAt: null }));

describe('unreadBadgeCount', () => {
  test('THE BUG: 64 unread on the server, 50 on the page — the badge says 64', () => {
    expect(
      unreadBadgeCount({ serverUnread: 64, rows: PAGE, locallyRead: [], derivedUnread: 0 }),
    ).toBe(64);
  });

  test('a row tapped here comes off at once, before the server recounts', () => {
    expect(
      unreadBadgeCount({ serverUnread: 64, rows: PAGE, locallyRead: ['n0', 'n1'], derivedUnread: 0 }),
    ).toBe(62);
  });

  test('once the recount lands (row now read on the server) it is not subtracted twice', () => {
    const rows = PAGE.map((r, i) => (i < 2 ? { ...r, readAt: '2026-09-29T02:00:00Z' } : r));
    expect(
      unreadBadgeCount({ serverUnread: 62, rows, locallyRead: ['n0', 'n1'], derivedUnread: 0 }),
    ).toBe(62);
  });

  test('the page is a floor: a count read before a new row arrived cannot hide it', () => {
    expect(
      unreadBadgeCount({ serverUnread: 3, rows: PAGE.slice(0, 5), locallyRead: [], derivedUnread: 0 }),
    ).toBe(5);
  });

  test('no count yet (or it failed): the page, as the badge always showed', () => {
    expect(
      unreadBadgeCount({ serverUnread: null, rows: PAGE.slice(0, 7), locallyRead: ['n0'], derivedUnread: 0 }),
    ).toBe(6);
  });

  test('the awaiting-PV stand-in adds to either figure', () => {
    expect(unreadBadgeCount({ serverUnread: 64, rows: PAGE, locallyRead: [], derivedUnread: 1 })).toBe(65);
    expect(unreadBadgeCount({ serverUnread: null, rows: [], locallyRead: [], derivedUnread: 1 })).toBe(1);
  });

  test('all read: nothing', () => {
    expect(unreadBadgeCount({ serverUnread: 0, rows: [], locallyRead: [], derivedUnread: 0 })).toBe(0);
  });
});

describe('badgeLabel', () => {
  test.each<[number, string | null]>([
    [0, null],
    [-1, null],
    [1, '1'],
    [50, '50'],
    [64, '64'],
    [99, '99'],
    [100, '99+'],
    [Number.NaN, null],
  ])('%s → %s', (count, expected) => {
    expect(badgeLabel(count)).toBe(expected);
  });
});

describe('realRowCoversVoucher — the stand-in yields only to a real row for THE SAME voucher', () => {
  const issued = (voucherId?: string) => ({
    kind: 'payment_voucher_issued',
    payload: voucherId ? { voucherId } : { weekStart: '2026-09-20' },
  });

  test('a real notice for this voucher replaces the stand-in', () => {
    expect(realRowCoversVoucher([issued('pv-9')], 'pv-9')).toBe(true);
  });

  test('last month\'s notice does NOT silence this week\'s nudge', () => {
    expect(realRowCoversVoucher([issued('pv-6')], 'pv-9')).toBe(false);
  });

  test('an issued row naming no voucher cannot be told apart — it still covers', () => {
    expect(realRowCoversVoucher([issued()], 'pv-9')).toBe(true);
  });

  test('other kinds never cover it', () => {
    expect(
      realRowCoversVoucher([{ kind: 'payment_voucher_paid', payload: { voucherId: 'pv-9' } }], 'pv-9'),
    ).toBe(false);
  });
});
