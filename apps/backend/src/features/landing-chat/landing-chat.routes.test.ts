import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

vi.mock('@/env', () => ({
  env: {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: undefined,
    LANDING_CHAT_DAILY_LIMIT: 1000,
    FRONTEND_URL: 'http://localhost:3000',
    CORS_ALLOWED_ORIGINS: '',
  },
}));

const answer = vi.fn();
vi.mock('./landing-chat.service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./landing-chat.service')>()),
  answerLandingChat: (...args: unknown[]) => answer(...args),
}));

import router from './landing-chat.routes';

/**
 * A question the browser drops (a newer one asked, Start over) must stop
 * spending the free Gemini quota (review, 3 Oct 2026). Pinned against a REAL
 * Express server, because the signal comes from the response's 'close' event —
 * which also fires after every normal reply, so the second test matters as
 * much as the first.
 */
let server: http.Server;
let port = 0;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use('/landing-chat', router);
  server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(
  () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    }),
);

const followUp = {
  question: 'and how do I sign it?',
  locale: 'en',
  role: 'pr',
  history: [{ from: 'visitor', text: 'how do I get paid?' }],
};

describe('POST /landing-chat — the visitor leaving', () => {
  it('cancels the answer when the browser drops the request', async () => {
    let seen: AbortSignal | undefined;
    answer.mockImplementation(
      (_input: unknown, signal: AbortSignal) =>
        new Promise((resolve) => {
          seen = signal;
          signal.addEventListener('abort', () => resolve({ ok: false, reason: 'upstream' }), { once: true });
        }),
    );
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: '/landing-chat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    req.on('error', () => {
      // the socket is destroyed on purpose below
    });
    req.end(JSON.stringify(followUp));
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(seen?.aborted).toBe(false);
    req.destroy();
    await vi.waitFor(() => expect(seen?.aborted).toBe(true));
  });

  it('never cancels a question that was answered normally', async () => {
    let seen: AbortSignal | undefined;
    answer.mockImplementation(async (_input: unknown, signal: AbortSignal) => {
      seen = signal;
      return { ok: true, reply: { text: 'Tap **Sign**.' }, model: 'gemini-flash-lite-latest' };
    });
    const res = await fetch(`http://127.0.0.1:${port}/landing-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(followUp),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, data: { reply: { text: 'Tap **Sign**.' } } });
    await new Promise((r) => setTimeout(r, 50));
    expect(seen?.aborted).toBe(false);
  });
});
