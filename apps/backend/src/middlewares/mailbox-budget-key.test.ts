import { describe, expect, it, vi } from 'vitest';

vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { ipBudgetKey, mailboxBudgetKey } from './rate-limit';

/**
 * Security review, 30 Sep 2026: the per-address mail budget was keyed on the
 * literal address, so `name+1@…`, `name+2@…` and Gmail's dotted spellings were
 * each a fresh budget aimed at one inbox. One mailbox, one key.
 */
describe('mailboxBudgetKey — one budget per inbox', () => {
  it.each([
    ['owner+signup@venue.my', 'email:owner@venue.my'],
    ['owner+a+b@venue.my', 'email:owner@venue.my'],
    ['o.w.n.e.r@gmail.com', 'email:owner@gmail.com'],
    ['o.w.n.e.r+x@googlemail.com', 'email:owner@gmail.com'],
  ])('%s shares %s', (typed, key) => {
    expect(mailboxBudgetKey(typed)).toBe(key);
  });

  it('keeps dots outside Gmail — they are different mailboxes elsewhere', () => {
    expect(mailboxBudgetKey('first.last@venue.my')).toBe('email:first.last@venue.my');
  });

  it('leaves a leading "+" and a malformed value alone, and nothing is no key', () => {
    expect(mailboxBudgetKey('+tag@venue.my')).toBe('email:+tag@venue.my');
    expect(mailboxBudgetKey('no-at-sign')).toBe('email:no-at-sign');
    expect(mailboxBudgetKey(null)).toBeNull();
    expect(mailboxBudgetKey('')).toBeNull();
  });
});

/**
 * Security review, 30 Sep 2026: every per-host limit keyed an IPv6 caller on
 * its full address, and a subscriber holds a whole /64 — a fresh budget per
 * request. One network, one key; IPv4 unchanged.
 */
describe('ipBudgetKey — one budget per IPv6 /64', () => {
  it.each([
    ['2001:db8:abcd:12:1::7', '2001:db8:abcd:12::/64'],
    ['2001:db8:abcd:12:ffff:ffff:ffff:fffe', '2001:db8:abcd:12::/64'],
    ['2001:0DB8:ABCD:0012:0000:0000:0000:0001', '2001:db8:abcd:12::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['64:ff9b::1.2.3.4', '64:ff9b:0:0::/64'],
    ['0:0:0:0:0:ffff:1.2.3.4', '0:0:0:0::/64'],
  ])('%s counts as %s', (ip, key) => {
    expect(ipBudgetKey(ip)).toBe(key);
  });

  it('two addresses in one /64 share a key; the next /64 does not', () => {
    expect(ipBudgetKey('2001:db8:1:2::a')).toBe(ipBudgetKey('2001:db8:1:2:dead:beef::1'));
    expect(ipBudgetKey('2001:db8:1:3::a')).not.toBe(ipBudgetKey('2001:db8:1:2::a'));
  });

  it('IPv4 — bare or mapped into IPv6 — stays one address', () => {
    expect(ipBudgetKey('203.0.113.9')).toBe('203.0.113.9');
    expect(ipBudgetKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipBudgetKey('::FFFF:203.0.113.9')).toBe('203.0.113.9');
  });

  it('a value that does not parse is used as it came — never folded into someone else', () => {
    for (const odd of ['unknown', '1::2::3', 'zzzz::1', '1:2:3', '1:2:3:4:5:6:7:8:9']) {
      expect(ipBudgetKey(odd)).toBe(odd);
    }
  });
});
