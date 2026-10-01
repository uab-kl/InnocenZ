import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
vi.mock('@/util/logger.js', () => ({ logger }));

import { inspect } from 'node:util';
import { sendWhatsAppOtp, WHATSAPP_SEND_TIMEOUT_MS } from './whatsapp-client';

/**
 * The Graph API call is BOUNDED (30 Sep 2026). It was a bare `fetch`, so a hung
 * Meta held the code request — and the sign-up answer behind it — until Node's
 * own defaults gave up: 10 s to connect, then 300 s for headers.
 *
 * `fetch` is stubbed: nothing here reaches Meta.
 */

const UNREACHABLE = { ok: false, error: 'Could not reach WhatsApp Cloud API' };

/** A Graph API that never answers — it only ever rejects when the request is aborted. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }),
  );
}

beforeEach(() => {
  vi.stubEnv('META_WHATSAPP_TOKEN', 'test-token');
  vi.stubEnv('META_WHATSAPP_PHONE_NUMBER_ID', '1234567890');
  logger.error.mockClear();
  logger.warn.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sendWhatsAppOtp — the Graph API call carries its own timeout', () => {
  it('every send is made with a signal bounded by WHATSAPP_SEND_TIMEOUT_MS', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const fetch = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ messages: [{ id: 'wamid.1' }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await sendWhatsAppOtp('60123456789', '123456');

    expect(result).toEqual({ ok: true, messageId: 'wamid.1' });
    expect(timeout).toHaveBeenCalledWith(WHATSAPP_SEND_TIMEOUT_MS);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('a Graph API that never answers is cut off and answers like an unreachable host', async () => {
    // The real AbortSignal.timeout, shortened — the test must not wait 10 s.
    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
    vi.stubGlobal('fetch', hangingFetch());

    const result = await sendWhatsAppOtp('60123456789', '123456');

    expect(result).toEqual(UNREACHABLE);
    // The log says it was a TIMEOUT, even though the caller's shape does not.
    expect(inspect(logger.error.mock.calls, { depth: 6 })).toContain('TimeoutError');
  });

  it('a timeout and a network failure hand the caller the SAME shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );
    const networkDown = await sendWhatsAppOtp('60123456789', '123456');

    const realTimeout = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => realTimeout(5));
    vi.stubGlobal('fetch', hangingFetch());
    const timedOut = await sendWhatsAppOtp('60123456789', '123456');

    expect(networkDown).toEqual(UNREACHABLE);
    expect(timedOut).toEqual(networkDown);
  });

  it('a Graph refusal is unchanged — still the API\'s own message, not the timeout path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'Template name does not exist' } }), {
            status: 400,
          }),
      ),
    );

    const result = await sendWhatsAppOtp('60123456789', '123456');

    expect(result).toEqual({ ok: false, error: 'Template name does not exist' });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
