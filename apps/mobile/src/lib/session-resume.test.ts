// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import { ApiError, type Me } from './api';
import { isExpired, resumeSession, type ResumeDeps } from './session-resume';
import type { Renewal, SessionTokens } from './token-refresh';

/**
 * OPENING THE APP ON A SAVED SESSION.
 *
 * The rule under test: only a refused REFRESH signs the PR out. Boot used to
 * clear the token on any failure of `/auth/me`, network errors included, so
 * opening the app with no reception cost a sign-in.
 */

const NOW = 1_800_000_000_000;
const ME = { id: 'user-1', username: 'vicky' } as unknown as Me;

function deps(over: Partial<ResumeDeps> = {}): ResumeDeps & {
  fetchMe: jest.Mock;
  renew: jest.Mock;
} {
  return {
    fetchMe: jest.fn(async () => ME),
    renew: jest.fn(async (): Promise<Renewal> => ({ kind: 'retry', accessToken: 'A2' })),
    held: () => ({ accessToken: 'A1', refreshToken: 'R1', expiredAt: null }),
    now: () => NOW,
    ...over,
  } as ResumeDeps & { fetchMe: jest.Mock; renew: jest.Mock };
}

const FRESH: SessionTokens = { accessToken: 'A1', refreshToken: 'R1', expiredAt: NOW + 10 * 60_000 };
const EXPIRED: SessionTokens = { ...FRESH, expiredAt: NOW - 60_000 };

describe('a saved session that is still good', () => {
  test('signs straight in with the saved token — no refresh spent', async () => {
    const d = deps();

    expect(await resumeSession(FRESH, d)).toEqual({ kind: 'signedIn', me: ME });
    expect(d.fetchMe).toHaveBeenCalledWith('A1');
    expect(d.renew).not.toHaveBeenCalled();
  });

  test('an unknown expiry is not treated as expired', async () => {
    const d = deps();

    await resumeSession({ ...FRESH, expiredAt: null }, d);

    expect(d.renew).not.toHaveBeenCalled();
  });
});

describe('a saved token known to be expired', () => {
  test('is renewed FIRST, and /auth/me is asked with the new token', async () => {
    const d = deps();

    expect(await resumeSession(EXPIRED, d)).toEqual({ kind: 'signedIn', me: ME });
    expect(d.renew).toHaveBeenCalledWith('A1');
    expect(d.fetchMe).toHaveBeenCalledWith('A2');
  });

  test('a refused refresh is the one answer that signs her out', async () => {
    const d = deps({ renew: jest.fn(async (): Promise<Renewal> => ({ kind: 'dead' })) });

    expect(await resumeSession(EXPIRED, d)).toEqual({ kind: 'signedOut' });
    expect(d.fetchMe).not.toHaveBeenCalled();
  });

  test('a refresh that cannot be made right now keeps her signed in, offline', async () => {
    const d = deps({ renew: jest.fn(async (): Promise<Renewal> => ({ kind: 'unavailable' })) });

    expect(await resumeSession(EXPIRED, d)).toEqual({ kind: 'offline' });
  });
});

describe('when /auth/me fails', () => {
  test('no network is NOT a sign-out — the session is still held, so: offline', async () => {
    const d = deps({
      fetchMe: jest.fn(async () => {
        throw new ApiError('Cannot reach the InnocenZ backend at http://x/api/v1. Is it running?', 0);
      }),
    });

    expect(await resumeSession(FRESH, d)).toEqual({ kind: 'offline' });
  });

  test('a refusal whose refresh was refused too (session no longer held) is a sign-out', async () => {
    const d = deps({
      fetchMe: jest.fn(async () => {
        throw new ApiError('Unauthorized', 401);
      }),
      // What `TokenProvider.dead` leaves behind.
      held: () => null,
    });

    expect(await resumeSession(FRESH, d)).toEqual({ kind: 'signedOut' });
  });

  test('a refusal whose refresh could not be made (session still held) stays offline', async () => {
    const d = deps({
      fetchMe: jest.fn(async () => {
        throw new ApiError('Unauthorized', 401);
      }),
    });

    expect(await resumeSession(FRESH, d)).toEqual({ kind: 'offline' });
  });
});

describe('isExpired', () => {
  test.each([
    ['unknown', null, false],
    ['ten minutes left', NOW + 10 * 60_000, false],
    ['inside the 30 s margin', NOW + 20_000, true],
    ['already past', NOW - 1, true],
  ])('%s', (_case, expiredAt, expected) => {
    expect(isExpired(expiredAt as number | null, NOW)).toBe(expected);
  });
});
