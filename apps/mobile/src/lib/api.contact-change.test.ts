// No runner import: apps/mobile runs JEST (jest-expo preset), which provides
// describe/expect/test/jest as globals.
import {
  confirmContactChange,
  resendContactChangeNewCode,
  startContactChange,
} from './api';

/**
 * THE WIRE SHAPE of the contact-change calls, pinned against the backend
 * contract frozen on 21 Sep 2026 (auth.routes.ts + contact-change.controller.ts).
 *
 * The owner's decision removed the identity code: nothing reaches the old phone
 * or old email any more, and the CURRENT PASSWORD is what proves the caller.
 * That made three server-visible changes this file exists to catch, because a
 * typecheck cannot see any of them — they are all the CONTENT of a JSON body or
 * the text of a path:
 *
 *   • `start` must POST `currentPassword`. Without it the server answers 400
 *     'Current password is required' and no code is ever sent.
 *   • `confirm` must NOT post `newRequestId`. There is no second code row now;
 *     the one `requestId` is the whole flow.
 *   • `resend` must hit `/auth/contact-change/resend`. `/resend-new` is DELETED
 *     (owner, 21 Sep 2026: no error page, no "please update the app" sentence),
 *     so calling it now 404s at the router with nothing this client can
 *     translate — which is why the PATH is what this file pins.
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
  sentTo: [{ channel: 'email', to: 'n••••@example.com', status: 'sent' }],
  expiresInSec: 600,
  resendAfterSec: 60,
  pendingInvitesToCurrentEmail: 0,
};

beforeEach(() => {
  captured.length = 0;
  global.fetch = jest.fn() as unknown as typeof fetch;
});

describe('startContactChange — the password replaced the identity code', () => {
  test('posts kind, value AND currentPassword to /auth/contact-change/start', async () => {
    mockFetchOnce(SENT, 'Code sent');
    const res = await startContactChange(TOKEN, 'email', 'new@example.com', 'hunter2');

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toContain('/auth/contact-change/start');
    expect(captured[0].init.method).toBe('POST');
    expect(body()).toEqual({
      kind: 'email',
      value: 'new@example.com',
      currentPassword: 'hunter2',
    });
    // The server reads the caller off the token, never off the body.
    expect(
      (captured[0].init.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${TOKEN}`);
    expect(res.requestId).toBe(REQUEST_ID);
  });

  test('a phone change sends the +digits value with the same password field', async () => {
    mockFetchOnce({ ...SENT, sentTo: [] });
    await startContactChange(TOKEN, 'phone', '+60123456789', 'hunter2');
    expect(body()).toEqual({
      kind: 'phone',
      value: '+60123456789',
      currentPassword: 'hunter2',
    });
  });
});

describe('resendContactChangeNewCode — the live route, and the new requestId', () => {
  test('posts to /auth/contact-change/resend, never the retired /resend-new', async () => {
    mockFetchOnce(SENT, 'Code sent');
    await resendContactChangeNewCode(TOKEN, {
      requestId: REQUEST_ID,
      kind: 'phone',
      value: '+60123456789',
    });
    expect(captured[0].url).toContain('/auth/contact-change/resend');
    expect(captured[0].url).not.toContain('resend-new');
    expect(captured[0].url).not.toContain('verify-identity');
  });

  test('carries NO password — the requestId is the proof', async () => {
    mockFetchOnce(SENT);
    await resendContactChangeNewCode(TOKEN, {
      requestId: REQUEST_ID,
      kind: 'email',
      value: 'new@example.com',
    });
    expect(body()).toEqual({
      requestId: REQUEST_ID,
      kind: 'email',
      value: 'new@example.com',
    });
    expect(body()).not.toHaveProperty('currentPassword');
  });

  test('answers a requestId of its own — the caller must replace the one it holds', async () => {
    const REISSUED = '11111111-1111-4111-8111-111111111111';
    mockFetchOnce({ ...SENT, requestId: REISSUED });
    const res = await resendContactChangeNewCode(TOKEN, {
      requestId: REQUEST_ID,
      kind: 'email',
      value: 'new@example.com',
    });
    expect(res.requestId).toBe(REISSUED);
    expect(res.requestId).not.toBe(REQUEST_ID);
  });
});

describe('confirmContactChange — one code row, so no newRequestId', () => {
  test('posts requestId, kind, value and code, and nothing else', async () => {
    mockFetchOnce({
      accessToken: 'fresh-access',
      refreshToken: 'fresh-refresh',
      email: 'new@example.com',
      phoneNum: '+60123456789',
    });
    const res = await confirmContactChange(TOKEN, {
      requestId: REQUEST_ID,
      kind: 'email',
      value: 'new@example.com',
      code: '123456',
    });

    expect(captured[0].url).toContain('/auth/contact-change/confirm');
    expect(body()).toEqual({
      requestId: REQUEST_ID,
      kind: 'email',
      value: 'new@example.com',
      code: '123456',
    });
    // The retired second-code row. Sending it would be dead weight on the wire
    // and a lie about which flow this client speaks.
    expect(body()).not.toHaveProperty('newRequestId');
    // The fresh pair the screen must adopt before any other request.
    expect(res.accessToken).toBe('fresh-access');
  });
});
