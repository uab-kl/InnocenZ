// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  ApiError,
  deleteOwnAccount,
  fetchMe,
  fetchMyVoucherPdfBlob,
  refreshAccessToken,
  sendPrOtp,
  uploadUserProfileImage,
} from './api';
import { registerTokenProvider, type SessionTokens } from './token-refresh';

/**
 * A REFUSED SESSION, END TO END THROUGH THE REAL CLIENT.
 *
 * The access token lives 15 minutes. When the server refuses it, the request is
 * renewed and sent again ONCE, with one `/auth/refresh` shared by everything
 * refused together — and nothing else is ever retried: not a wrong password
 * (also a 401), not a request that carried no session, not a second refusal.
 *
 * ⚠️ `fetch` is mocked — no request leaves the test.
 */

type Call = { method: string; path: string; auth: string | null; body: unknown };
type Reply = { status: number; body?: unknown };
type Route = (call: Call) => Reply | Promise<Reply>;

const calls: Call[] = [];
let routes: Record<string, Route>;

function response(reply: Reply): Response {
  const make = (): Response =>
    ({
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body ?? null,
      blob: async () => ({ size: 3, type: 'application/pdf' }),
      clone: () => make(),
    }) as unknown as Response;
  return make();
}

function installFetch() {
  global.fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
    const path = String(url).replace(/^.*\/api\/v1/, '').replace(/\?.*$/, '');
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = {
      method: init.method ?? 'GET',
      path,
      auth: headers.Authorization ?? null,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body ?? null,
    };
    calls.push(call);
    const route = routes[`${call.method} ${path}`];
    if (!route) throw new Error(`unrouted ${call.method} ${path}`);
    return response(await route(call));
  }) as unknown as typeof fetch;
}

const ok = (data: unknown): Reply => ({ status: 200, body: { success: true, message: 'OK', data } });
const UNAUTHORIZED: Reply = { status: 401, body: { message: 'Unauthorized' } };
const ME = { id: 'user-1', username: 'vicky' };

/** /auth/me that accepts only `good` — what the server does once A1 has expired. */
const meAcceptsOnly =
  (good: string): Route =>
  (call) =>
    call.auth === `Bearer ${good}` ? ok(ME) : UNAUTHORIZED;

const renewsTo =
  (accessToken: string, expiredAt: number | null = 1_900_000): Route =>
  () =>
    ok({ accessToken, expiredAt });

const count = (method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).length;

let held: SessionTokens | null;
const renewed = jest.fn((next: SessionTokens) => {
  held = next;
});
const dead = jest.fn(() => {
  held = null;
});
let unregister: () => void;

beforeEach(() => {
  calls.length = 0;
  routes = {};
  held = { accessToken: 'A1', refreshToken: 'R1', expiredAt: null };
  renewed.mockClear();
  dead.mockClear();
  unregister = registerTokenProvider({ current: () => held, renewed, dead });
  installFetch();
});

afterEach(() => {
  unregister();
});

describe('a refused session is renewed once, and the request sent again', () => {
  test('401 Unauthorized → /auth/refresh with the refresh token → the same call with the new Bearer', async () => {
    routes['GET /auth/me'] = meAcceptsOnly('A2');
    routes['POST /auth/refresh'] = renewsTo('A2', 1_900_000);

    await expect(fetchMe('A1')).resolves.toEqual(ME);

    expect(calls.map((c) => `${c.method} ${c.path} ${c.auth ?? '-'}`)).toEqual([
      'GET /auth/me Bearer A1',
      'POST /auth/refresh -',
      'GET /auth/me Bearer A2',
    ]);
    expect(calls[1].body).toEqual({ refreshToken: 'R1' });
    // The new token reaches the session — and through it, React and storage.
    expect(renewed).toHaveBeenCalledWith({ accessToken: 'A2', refreshToken: 'R1', expiredAt: 1_900_000 });
  });

  test('five calls refused together share ONE refresh', async () => {
    routes['GET /auth/me'] = meAcceptsOnly('A2');
    routes['POST /auth/refresh'] = renewsTo('A2');

    const results = await Promise.all(Array.from({ length: 5 }, () => fetchMe('A1')));

    expect(results).toHaveLength(5);
    expect(count('POST', '/auth/refresh')).toBe(1);
  });

  test('a call still carrying the previous token rides on the renewed one — no second refresh', async () => {
    routes['GET /auth/me'] = meAcceptsOnly('A2');
    routes['POST /auth/refresh'] = renewsTo('A2');
    await fetchMe('A1');

    // A screen whose closure still holds A1, a render behind.
    await expect(fetchMe('A1')).resolves.toEqual(ME);

    expect(count('POST', '/auth/refresh')).toBe(1);
  });

  test('the retry happens ONCE — a second refusal is thrown, not chased', async () => {
    routes['GET /auth/me'] = () => UNAUTHORIZED;
    routes['POST /auth/refresh'] = renewsTo('A2');

    await expect(fetchMe('A1')).rejects.toMatchObject({ status: 401, message: 'Unauthorized' });

    expect(count('GET', '/auth/me')).toBe(2);
    expect(count('POST', '/auth/refresh')).toBe(1);
  });
});

describe('only a refused REFRESH ends the session', () => {
  test('refresh answers 401: the session is over, and the original refusal is what the caller sees', async () => {
    routes['GET /auth/me'] = () => UNAUTHORIZED;
    routes['POST /auth/refresh'] = () => ({
      status: 401,
      body: { success: false, message: 'Please sign in again.', data: null },
    });

    const error = await fetchMe('A1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, message: 'Unauthorized' });
    expect(dead).toHaveBeenCalledTimes(1);
    expect(count('GET', '/auth/me')).toBe(1);
  });

  test.each<[string, Route]>([
    ['no connection', () => Promise.reject(new TypeError('Network request failed'))],
    ['the shared login limiter (429)', () => ({ status: 429, body: { message: 'Too many sign-in attempts.' } })],
    ['a server error (500)', () => ({ status: 500, body: { message: 'Internal Server Error' } })],
  ])('%s at /auth/refresh keeps the session', async (_case, refreshRoute) => {
    routes['GET /auth/me'] = () => UNAUTHORIZED;
    routes['POST /auth/refresh'] = refreshRoute;

    await expect(fetchMe('A1')).rejects.toMatchObject({ status: 401 });

    expect(dead).not.toHaveBeenCalled();
    expect(renewed).not.toHaveBeenCalled();
    expect(held).toEqual({ accessToken: 'A1', refreshToken: 'R1', expiredAt: null });
  });
});

describe('what is never renewed', () => {
  test('401 "Incorrect password" is an answer about the password — no refresh, no retry', async () => {
    routes['POST /user/user-1/delete'] = () => ({ status: 401, body: { message: 'Incorrect password' } });

    await expect(deleteOwnAccount('A1', 'user-1', 'typo')).rejects.toMatchObject({
      status: 401,
      message: 'Incorrect password',
    });

    expect(count('POST', '/auth/refresh')).toBe(0);
    expect(dead).not.toHaveBeenCalled();
  });

  test('a request sent WITHOUT a session is never renewed', async () => {
    routes['POST /auth/otp/send'] = () => UNAUTHORIZED;

    await expect(sendPrOtp('+60123456789')).rejects.toMatchObject({ status: 401 });

    expect(count('POST', '/auth/refresh')).toBe(0);
  });

  test('another account’s token is never swapped for this session’s', async () => {
    routes['GET /auth/me'] = () => UNAUTHORIZED;

    await expect(fetchMe('SOMEONE-ELSES')).rejects.toMatchObject({ status: 401 });

    expect(calls.map((c) => c.path)).toEqual(['/auth/me']);
  });
});

describe('the calls that bypass requestEnvelope get the same single renewal', () => {
  test('a multipart upload is sent again with the new Bearer and the SAME form', async () => {
    routes['POST /user/user-1/profile-image'] = (call) =>
      call.auth === 'Bearer A2' ? ok(ME) : UNAUTHORIZED;
    routes['POST /auth/refresh'] = renewsTo('A2');
    const photo = { uri: 'file:///avatar.jpg', name: 'avatar.jpg', type: 'image/jpeg' };

    await expect(uploadUserProfileImage('A1', 'user-1', photo as unknown as Blob)).resolves.toEqual(ME);

    const uploads = calls.filter((c) => c.path === '/user/user-1/profile-image');
    expect(uploads.map((c) => c.auth)).toEqual(['Bearer A1', 'Bearer A2']);
    expect(uploads[1].body).toBe(uploads[0].body);
  });

  test('a PDF download is fetched again after the renewal', async () => {
    routes['GET /payment-voucher/mine/pv-1/export.pdf'] = (call) =>
      call.auth === 'Bearer A2' ? { status: 200 } : UNAUTHORIZED;
    routes['POST /auth/refresh'] = renewsTo('A2');

    await expect(fetchMyVoucherPdfBlob('A1', 'pv-1')).resolves.toMatchObject({ size: 3 });
    expect(count('POST', '/auth/refresh')).toBe(1);
  });
});

describe('refreshAccessToken — every answer sorted, never thrown', () => {
  test.each<[string, Route, unknown]>([
    ['200 with a token', renewsTo('A2', 1_900_000), { kind: 'renewed', accessToken: 'A2', expiredAt: 1_900_000 }],
    ['200 without an expiry', renewsTo('A2', null), { kind: 'renewed', accessToken: 'A2', expiredAt: null }],
    ['200 without a token', () => ok({}), { kind: 'unavailable' }],
    ['401 "Please sign in again."', () => ({ status: 401, body: { message: 'Please sign in again.' } }), { kind: 'dead' }],
    ['404 — a server with no refresh route', () => ({ status: 404 }), { kind: 'dead' }],
    ['429 from the shared limiter', () => ({ status: 429 }), { kind: 'unavailable' }],
    ['503', () => ({ status: 503 }), { kind: 'unavailable' }],
    ['no connection', () => Promise.reject(new TypeError('Network request failed')), { kind: 'unavailable' }],
  ])('%s', async (_case, route, expected) => {
    routes['POST /auth/refresh'] = route;

    await expect(refreshAccessToken('R1')).resolves.toEqual(expected);
  });

  test('sends the refresh token in the body and no Authorization header', async () => {
    routes['POST /auth/refresh'] = renewsTo('A2');

    await refreshAccessToken('R1');

    expect(calls[0].body).toEqual({ refreshToken: 'R1' });
    expect(calls[0].auth).toBeNull();
  });
});
