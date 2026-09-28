// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

import { SessionProvider, useSession } from './session';
import type { SessionTokens } from './token-refresh';

/**
 * THE SESSION AS THE PR MEETS IT — the real provider over the real client, with
 * only the network and the device's storage faked.
 *
 * The bug: the phone forgot the sign-in at every launch, and a session that did
 * survive died 15 minutes in, because the refresh token was thrown away. What is
 * pinned: the pair is kept and saved, an expired token is renewed rather than
 * sent, a phone with no signal stays signed in (offline, not signed out), and
 * only a refresh the server refuses signs her out.
 *
 * ⚠️ `fetch` is mocked — no request leaves the test.
 */

jest.mock('./saved-session', () => {
  let stored: unknown = null;
  return {
    savedSession: {
      load: jest.fn(async () => stored),
      save: jest.fn(async (session: unknown) => {
        stored = session;
      }),
      clear: jest.fn(async () => {
        stored = null;
      }),
    },
    mockSeed: (session: unknown) => {
      stored = session;
    },
  };
});

const saved = jest.requireMock('./saved-session') as {
  savedSession: { load: jest.Mock; save: jest.Mock; clear: jest.Mock };
  mockSeed: (session: SessionTokens | null) => void;
};

type Call = { method: string; path: string; auth: string | null };
type Reply = { status: number; body?: unknown };
type Route = (call: Call) => Reply | Promise<Reply>;

const calls: Call[] = [];
let routes: Record<string, Route>;

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, message: 'OK', data } });
const UNAUTHORIZED: Reply = { status: 401, body: { message: 'Unauthorized' } };
const NO_SIGNAL: Route = () => Promise.reject(new TypeError('Network request failed'));
const ME = { id: 'user-1', username: 'vicky', profile: {}, roles: [] };

function installFetch() {
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^.*\/api\/v1/, '').replace(/\?.*$/, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = { method: init.method ?? 'GET', path, auth: headers.Authorization ?? null };
    calls.push(call);
    const route = routes[`${call.method} ${path}`];
    if (!route) throw new Error(`unrouted ${call.method} ${path}`);
    const reply = await route(call);
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body ?? null,
    } as unknown as Response;
  }) as unknown as typeof fetch;
}

type Session = ReturnType<typeof useSession>;
const latest: { current: Session | null } = { current: null };

function Probe() {
  latest.current = useSession();
  return null;
}

/** The provider, mounted and finished booting. (RNTL 14: `render` and `act` are async.) */
async function boot() {
  await render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await waitFor(() => expect(latest.current?.booting).toBe(false));
  return () => latest.current as Session;
}

const soon = () => Date.now() + 10 * 60_000;

beforeEach(() => {
  calls.length = 0;
  routes = { 'GET /agency/pr-links': () => ok([]) };
  latest.current = null;
  saved.mockSeed(null);
  saved.savedSession.load.mockClear();
  saved.savedSession.save.mockClear();
  saved.savedSession.clear.mockClear();
  installFetch();
});

describe('opening the app on a saved session', () => {
  test('no signal is NOT a sign-out: the session stays saved and the app says it is offline', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: soon() });
    routes['GET /auth/me'] = NO_SIGNAL;

    const session = await boot();

    expect(session().offline).toBe(true);
    expect(session().me).toBeNull();
    expect(session().token).toBe('A1');
    expect(saved.savedSession.clear).not.toHaveBeenCalled();

    // The connection comes back and she taps Retry.
    routes['GET /auth/me'] = () => ok(ME);
    await act(async () => {
      await session().resume();
    });

    expect(session().me).toEqual(ME);
    expect(session().offline).toBe(false);
  });

  test('a token known to be expired is renewed FIRST, and the renewed pair is saved', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: Date.now() - 60_000 });
    routes['POST /auth/refresh'] = () => ok({ accessToken: 'A2', expiredAt: 1_900_000 });
    routes['GET /auth/me'] = (call) => (call.auth === 'Bearer A2' ? ok(ME) : UNAUTHORIZED);

    const session = await boot();

    expect(session().me).toEqual(ME);
    expect(session().token).toBe('A2');
    // No request was spent on the token already known to be dead.
    expect(calls.filter((c) => c.path === '/auth/me').map((c) => c.auth)).toEqual(['Bearer A2']);
    expect(saved.savedSession.save).toHaveBeenCalledWith(
      { accessToken: 'A2', refreshToken: 'R1', expiredAt: 1_900_000 },
      'refresh',
    );
  });

  test('a refresh the server REFUSES signs her out and forgets the saved session', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: soon() });
    routes['GET /auth/me'] = () => UNAUTHORIZED;
    routes['POST /auth/refresh'] = () => ({ status: 401, body: { message: 'Please sign in again.' } });

    const session = await boot();

    expect(session().me).toBeNull();
    expect(session().token).toBeNull();
    expect(session().offline).toBe(false);
    expect(saved.savedSession.clear).toHaveBeenCalled();
  });

  test('the limiter’s 429 on the refresh is not a sign-out either', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: soon() });
    routes['GET /auth/me'] = () => UNAUTHORIZED;
    routes['POST /auth/refresh'] = () => ({ status: 429, body: { message: 'Too many sign-in attempts.' } });

    const session = await boot();

    expect(session().offline).toBe(true);
    expect(saved.savedSession.clear).not.toHaveBeenCalled();
  });

  test('nothing saved: straight to the sign-in screen, nothing asked of the server', async () => {
    const session = await boot();

    expect(session().me).toBeNull();
    expect(session().offline).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe('signing in, and a pair re-issued after a credential change', () => {
  test('signIn keeps the refresh token and the expiry, and saves them for the next launch', async () => {
    routes['POST /auth/login'] = () => ok({ accessToken: 'A1', refreshToken: 'R1', expiredAt: 1_800_000 });
    routes['GET /auth/me'] = () => ok(ME);
    const session = await boot();

    await act(async () => {
      await session().signIn('+60123456789', 'correct-password');
    });

    expect(session().me).toEqual(ME);
    expect(session().token).toBe('A1');
    expect(saved.savedSession.save).toHaveBeenCalledWith(
      { accessToken: 'A1', refreshToken: 'R1', expiredAt: 1_800_000 },
      'signIn',
    );
  });

  test('adoptToken keeps the re-issued REFRESH token, not only the access token', async () => {
    routes['POST /auth/login'] = () => ok({ accessToken: 'A1', refreshToken: 'R1', expiredAt: 1_800_000 });
    routes['GET /auth/me'] = () => ok(ME);
    const session = await boot();
    await act(async () => {
      await session().signIn('+60123456789', 'correct-password');
    });

    await act(async () => {
      session().adoptToken('A9', 'R9');
    });

    expect(session().token).toBe('A9');
    expect(saved.savedSession.save).toHaveBeenLastCalledWith(
      { accessToken: 'A9', refreshToken: 'R9', expiredAt: null },
      'signIn',
    );
  });
});

describe('during use', () => {
  test('a call refused after 15 minutes is renewed, and the new token reaches React and storage', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: soon() });
    routes['GET /auth/me'] = () => ok(ME);
    const session = await boot();
    // The access token expires on the server.
    routes['GET /auth/me'] = (call) => (call.auth === 'Bearer A2' ? ok(ME) : UNAUTHORIZED);
    routes['POST /auth/refresh'] = () => ok({ accessToken: 'A2', expiredAt: 1_900_000 });

    await act(async () => {
      await session().refreshMe();
    });

    expect(session().token).toBe('A2');
    expect(session().me).toEqual(ME);
    expect(saved.savedSession.save).toHaveBeenCalledWith(
      { accessToken: 'A2', refreshToken: 'R1', expiredAt: 1_900_000 },
      'refresh',
    );
  });

  test('sign-out forgets the saved session', async () => {
    saved.mockSeed({ accessToken: 'A1', refreshToken: 'R1', expiredAt: soon() });
    routes['GET /auth/me'] = () => ok(ME);
    const session = await boot();

    await act(async () => {
      session().signOut();
    });

    expect(session().me).toBeNull();
    expect(session().token).toBeNull();
    expect(saved.savedSession.clear).toHaveBeenCalled();
  });
});
