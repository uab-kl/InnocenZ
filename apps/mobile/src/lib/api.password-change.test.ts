// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  confirmPasswordChange,
  resendPasswordChangeCode,
  sendPrOtp,
  startPasswordChange,
} from './api';

/**
 * THE WIRE SHAPE of the password change and of the sign-up code send, pinned
 * against the contract frozen on 21 Sep 2026.
 *
 * The owner's decision made a password change "current password + a code", and
 * put the SAME code on every channel the account can read. That is three
 * server-visible changes a typecheck cannot see, because every one of them is
 * the CONTENT of a JSON body or the text of a path:
 *
 *   • the one-step `POST /auth/password/change` is DELETED (owner: no error
 *     page, no "please update the app"), so a build still calling it collects a
 *     404 from the router — which is why the PATHS are pinned here;
 *   • `confirm` carries the NEW PASSWORD, and `start` must not: the password
 *     travels with the code, one step later than it used to;
 *   • `resend` carries NO password at all — the `requestId` is the proof.
 *
 * And for sign-up: `/auth/otp/send` gains an OPTIONAL email so the same code
 * arrives by mail too. The key must be ABSENT when there is none — an empty
 * string is a value the server's schema has to refuse, which would block the
 * whole send and with it the sign-up.
 *
 * ⚠️ `fetch` is mocked — no request leaves the test, and no code is ever sent.
 */

type Captured = { url: string; init: RequestInit };

const captured: Captured[] = [];

function mockFetchOnce(data: unknown, message = 'OK') {
  (global.fetch as jest.Mock).mockImplementationOnce(
    async (url: string, init: RequestInit) => {
      captured.push({ url, init });
      return {
        ok: true,
        status: 200,
        json: async () => ({ success: true, message, data }),
      } as unknown as Response;
    },
  );
}

/** The parsed JSON body of the n-th captured call. */
function body(index = 0): Record<string, unknown> {
  return JSON.parse(String(captured[index].init.body));
}

const TOKEN = 'access-token-under-test';
const REQUEST_ID = '00000000-0000-4000-8000-000000000000';
const SENT = {
  requestId: REQUEST_ID,
  sentTo: [
    { channel: 'whatsapp', to: '+60 ••••• 6789', status: 'sent' },
    { channel: 'email', to: 'n••••@example.com', status: 'sent' },
  ],
  expiresInSec: 600,
  resendAfterSec: 60,
};

beforeEach(() => {
  captured.length = 0;
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('startPasswordChange — the password proves it, the code is sent', () => {
  test('posts currentPassword to /auth/password/change/start, and nothing else', async () => {
    mockFetchOnce(SENT, 'Code sent');
    const res = await startPasswordChange(TOKEN, 'hunter2');

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toContain('/auth/password/change/start');
    expect(captured[0].init.method).toBe('POST');
    expect(body()).toEqual({ currentPassword: 'hunter2' });
    // The NEW password does not exist yet as far as this step is concerned.
    expect(body()).not.toHaveProperty('newPassword');
    // The server reads the caller off the token, never off the body.
    expect((captured[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(res.requestId).toBe(REQUEST_ID);
    expect(res.sentTo.map((d) => d.channel)).toEqual(['whatsapp', 'email']);
  });

  test('never the deleted one-step route', async () => {
    mockFetchOnce(SENT);
    await startPasswordChange(TOKEN, 'hunter2');
    // `/auth/password/change` with nothing after it is the route that is gone.
    expect(captured[0].url).not.toMatch(/\/auth\/password\/change(\?|$)/);
  });
});

describe('resendPasswordChangeCode — the requestId is the proof', () => {
  test('posts only the requestId, to /auth/password/change/resend', async () => {
    mockFetchOnce(SENT, 'Code sent');
    await resendPasswordChangeCode(TOKEN, { requestId: REQUEST_ID });

    expect(captured[0].url).toContain('/auth/password/change/resend');
    expect(body()).toEqual({ requestId: REQUEST_ID });
    expect(body()).not.toHaveProperty('currentPassword');
    expect(body()).not.toHaveProperty('newPassword');
  });

  test('answers a requestId of its own — the caller must replace the one it holds', async () => {
    const REISSUED = '11111111-1111-4111-8111-111111111111';
    mockFetchOnce({ ...SENT, requestId: REISSUED });
    const res = await resendPasswordChangeCode(TOKEN, { requestId: REQUEST_ID });
    expect(res.requestId).toBe(REISSUED);
    expect(res.requestId).not.toBe(REQUEST_ID);
  });
});

describe('confirmPasswordChange — the code and the new password together', () => {
  test('posts requestId, code and newPassword, and no current password', async () => {
    mockFetchOnce({ accessToken: 'fresh-access', refreshToken: 'fresh-refresh' });
    const res = await confirmPasswordChange(TOKEN, {
      requestId: REQUEST_ID,
      code: '123456',
      newPassword: 'a-brand-new-one',
    });

    expect(captured[0].url).toContain('/auth/password/change/confirm');
    expect(body()).toEqual({
      requestId: REQUEST_ID,
      code: '123456',
      newPassword: 'a-brand-new-one',
    });
    // Confirm has no current password — which is why 'New password must be
    // different' is decided against the stored HASH, and arrives here.
    expect(body()).not.toHaveProperty('currentPassword');
    // The fresh pair the screen must adopt before any other request.
    expect(res.accessToken).toBe('fresh-access');
  });

  test('a null pair still arrives as a 200 — changed, but sign in again', async () => {
    mockFetchOnce({ accessToken: null, refreshToken: null });
    const res = await confirmPasswordChange(TOKEN, {
      requestId: REQUEST_ID,
      code: '123456',
      newPassword: 'a-brand-new-one',
    });
    expect(res.accessToken).toBeNull();
  });
});

describe('sendPrOtp — the same code by email, when there is one', () => {
  test('sends WhatsApp only, with NO email key, when none is given', async () => {
    mockFetchOnce({ expiresInSec: 600, resendAfterSec: 60 });
    await sendPrOtp('+60123456789');

    expect(captured[0].url).toContain('/auth/otp/send');
    expect(body()).toEqual({
      phoneNum: '+60123456789',
      channel: 'whatsapp',
      purpose: 'signup',
    });
    expect(body()).not.toHaveProperty('email');
  });

  test('carries the email when one is passed', async () => {
    mockFetchOnce({ expiresInSec: 600, resendAfterSec: 60 });
    await sendPrOtp('+60123456789', 'signup', { email: 'vicky@example.com' });
    expect(body()).toEqual({
      phoneNum: '+60123456789',
      channel: 'whatsapp',
      purpose: 'signup',
      email: 'vicky@example.com',
    });
  });

  test.each([null, undefined, '', '   '])(
    'omits the key entirely for %p — an empty string is a value the schema refuses',
    async (email) => {
      mockFetchOnce({ expiresInSec: 600, resendAfterSec: 60 });
      await sendPrOtp('+60123456789', 'signup', { email });
      expect(body()).not.toHaveProperty('email');
    },
  );

  test('the access token, when given, is a HEADER and never body content', async () => {
    mockFetchOnce({ expiresInSec: 600, resendAfterSec: 60 });
    await sendPrOtp('+60123456789', 'forgot_password', {
      accessToken: TOKEN,
      email: 'vicky@example.com',
    });
    expect((captured[0].init.headers as Record<string, string>).Authorization).toBe(
      `Bearer ${TOKEN}`,
    );
    expect(body()).not.toHaveProperty('accessToken');
    expect(body().purpose).toBe('forgot_password');
  });
});
