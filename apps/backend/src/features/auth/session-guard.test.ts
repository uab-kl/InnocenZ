import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import type { UserType } from '@/features/user/user.model';
import { resolveApiSessionUser } from './session-guard';

/**
 * ONE session rule set for authenticateJWT, optionalAuthenticateJWT and the
 * GraphQL context. The last two used to check the signature only.
 */
const cutoff = new Date('2026-09-17T10:00:00.000Z');

function user(overrides: Partial<UserType> = {}): UserType {
  return { id: 'user-1', status: 'active', sessionsValidFrom: cutoff, ...overrides } as UserType;
}

function deps(session: { user: UserType; issuedAt: Date | null; isRefresh: boolean } | null, orgBlock: string | null = null) {
  return {
    sessions: { getSessionByToken: vi.fn(async () => session) },
    orgBlock: vi.fn(async () => orgBlock),
  };
}

describe('resolveApiSessionUser', () => {
  it('returns the user for a live access token', async () => {
    const d = deps({ user: user(), issuedAt: new Date('2026-09-17T10:00:05.000Z'), isRefresh: false });
    expect((await resolveApiSessionUser('t', d))?.id).toBe('user-1');
  });

  it('accepts a token from the same second as the cutoff', async () => {
    const d = deps({ user: user({ sessionsValidFrom: new Date('2026-09-17T10:00:00.800Z') }), issuedAt: cutoff, isRefresh: false });
    expect(await resolveApiSessionUser('t', d)).not.toBeNull();
  });

  it('refuses a REFRESH token', async () => {
    const d = deps({ user: user(), issuedAt: new Date('2026-09-17T10:00:05.000Z'), isRefresh: true });
    expect(await resolveApiSessionUser('t', d)).toBeNull();
  });

  it('refuses a token issued the second BEFORE a password or contact change', async () => {
    const d = deps({ user: user(), issuedAt: new Date('2026-09-17T09:59:59.000Z'), isRefresh: false });
    expect(await resolveApiSessionUser('t', d)).toBeNull();
  });

  it('refuses an inactive account', async () => {
    const d = deps({ user: user({ status: 'inactive' }), issuedAt: null, isRefresh: false });
    expect(await resolveApiSessionUser('t', d)).toBeNull();
  });

  it('refuses an account whose every organisation is blocked', async () => {
    const d = deps({ user: user(), issuedAt: null, isRefresh: false }, 'Your agency "X" is inactive.');
    expect(await resolveApiSessionUser('t', d)).toBeNull();
  });

  it('is null — never a throw — for no token, an unknown token, or a failing lookup', async () => {
    expect(await resolveApiSessionUser(undefined, deps(null))).toBeNull();
    expect(await resolveApiSessionUser('t', deps(null))).toBeNull();
    const failing = {
      sessions: {
        getSessionByToken: vi.fn(async () => {
          throw new Error('db down');
        }),
      },
    };
    expect(await resolveApiSessionUser('t', failing)).toBeNull();
  });
});
