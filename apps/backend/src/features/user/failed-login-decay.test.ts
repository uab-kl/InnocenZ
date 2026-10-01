import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * OLD WRONG GUESSES EXPIRE (owner, 30 Sep 2026 — migration 0170).
 *
 * `failed_login_attempts` used to be forever, so an account with old typos
 * locked before its fifth new guess while an address with no account needs
 * five — an early lock named the account. The count now restarts at 1 when the
 * previous wrong password is a day old (or unknown), in the SAME statement that
 * decides the lock, so the two never disagree.
 */

const h = vi.hoisted(() => ({ set: null as Record<string, unknown> | null }));

vi.mock('@/db/index', () => ({
  db: {
    update: () => ({
      set: (values: Record<string, unknown>) => {
        h.set = values;
        return { where: () => ({ returning: async () => [{ attempts: 1, lockedUntil: null }] }) };
      },
    }),
  },
}));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/util/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { FAILED_LOGIN_MEMORY_MINUTES } from '@/features/auth/unknown-login-lockout';
import { UserRepositoryClass } from './user.repository';

const render = (fragment: unknown) => new PgDialect().sqlToQuery(fragment as SQL);
const repo = () => new UserRepositoryClass({} as never, {} as never);

beforeEach(() => {
  h.set = null;
});

describe('recordFailedLoginAttempt — the count forgets after a day', () => {
  it('restarts at 1 when the last wrong password is unknown or older than the window; otherwise adds one', async () => {
    await repo().recordFailedLoginAttempt('user-1', 5, 15);
    const attempts = render(h.set?.failedLoginAttempts);

    expect(attempts.sql).toContain('"last_failed_login_at" IS NULL OR');
    expect(attempts.sql).toContain(`"last_failed_login_at" < now() - ($1 * interval '1 minute')`);
    expect(attempts.sql).toMatch(/THEN 1 ELSE "main"\."user"\."failed_login_attempts" \+ 1 END/);
    // One day unless the caller says otherwise — the in-memory counter's day too.
    expect(attempts.params).toEqual([FAILED_LOGIN_MEMORY_MINUTES]);
  });

  it('locks on the RESTARTED count, not the old one, and stamps the time of this wrong password', async () => {
    await repo().recordFailedLoginAttempt('user-1', 5, 15, 60);
    const lock = render(h.set?.lockedUntil);

    // The restart expression feeds the lock decision: window, max, lock minutes.
    expect(lock.sql).toContain('"last_failed_login_at"');
    expect(lock.sql).toContain('ELSE "main"."user"."locked_until" END');
    expect(lock.params).toEqual([60, 5, 15]);
    expect(render(h.set?.lastFailedLoginAt).sql).toBe('now()');
  });
});
