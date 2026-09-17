import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  emailConfigured: () => false,
  sendAccountCodeEmail: vi.fn(),
  sendAccountChangeNoticeEmail: vi.fn(),
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => false,
  sendWhatsAppOtp: vi.fn(),
}));

import { inspect } from 'node:util';
import { DrizzleQueryError } from 'drizzle-orm';
import { logger } from '@/util/logger.js';
import { hashBoundCode } from './code';
import {
  FORGOT_MIN_RESPONSE_MS,
  FORGOT_NEUTRAL_MESSAGE,
  ForgotPasswordControllerClass,
  INVALID_CODE,
  PASSWORD_RESET_DONE,
  RESET_CODE_EXPIRED,
} from './forgot-password.controller';
import {
  NOW,
  deliveredCode,
  fakeCodeStore,
  fakeDeliver,
  fakeNotices,
  fakeReq,
  fakeRes,
  fakeUser,
} from './fakes.test-support';
import { IdentifierCooldown } from './identifier-cooldown';
import { TOO_MANY_ATTEMPTS } from './shared';

function setup(options: { user?: ReturnType<typeof fakeUser> | null; deliverOk?: boolean } = {}) {
  const user = options.user === undefined ? fakeUser() : options.user;
  const codes = fakeCodeStore();
  const deliver = fakeDeliver(options.deliverOk ?? true);
  const notices = fakeNotices();
  const sleep = vi.fn(async (_ms: number) => {});
  let now = NOW;
  const users = {
    getUserByLoginMethod: vi.fn(async () => user),
    getUserById: vi.fn(async (id: string) => (user && user.id === id ? user : null)),
  };
  const accounts = {
    completePasswordReset: vi.fn(async (input: { requestId: string }) => {
      const row = codes.rows.get(input.requestId);
      if (!row || row.status !== 'pending') return 'already_used' as const;
      row.status = 'consumed';
      return 'ok' as const;
    }),
    isContactTaken: vi.fn(async () => false),
    applyContactChange: vi.fn(),
  };
  const controller = new ForgotPasswordControllerClass(
    {
      users,
      codes,
      accounts: accounts as never,
      deliver,
      notices,
      hashPassword: async (pw: string) => `hash:${pw}`,
      now: () => now,
    },
    { cooldown: new IdentifierCooldown(60), sleep },
  );
  return {
    controller,
    user,
    users,
    codes,
    deliver,
    notices,
    accounts,
    sleep,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

async function start(ctx: ReturnType<typeof setup>, body: unknown) {
  const res = fakeRes();
  await ctx.controller.start(fakeReq(body), res);
  return res;
}

async function complete(ctx: ReturnType<typeof setup>, body: unknown) {
  const res = fakeRes();
  await ctx.controller.complete(fakeReq(body), res);
  return res;
}

describe('POST /auth/password/forgot/start', () => {
  it('sends ONE code to the phone and the email on file, bound to the account', async () => {
    const ctx = setup();
    const res = await start(ctx, { email: 'Owner@Atlas-Agency.my' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(FORGOT_NEUTRAL_MESSAGE);
    expect(res.body.data).toEqual({
      requestId: expect.any(String),
      expiresInSec: 600,
      resendAfterSec: 60,
    });
    expect(ctx.users.getUserByLoginMethod).toHaveBeenCalledWith('email', 'owner@atlas-agency.my');

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    const call = ctx.deliver.mock.calls[0][0] as Record<string, unknown>;
    expect(call).toMatchObject({
      purpose: 'reset_password',
      phone: '+60123456789',
      email: 'owner@atlas-agency.my',
      validMinutes: 10,
    });

    const row = ctx.codes.rows.get(res.body.data.requestId)!;
    expect(row).toMatchObject({
      purpose: 'reset_password',
      status: 'pending',
      createdBy: 'user-1',
      phoneNum: '60123456789',
      channel: 'whatsapp,sms,email',
    });
    expect(row.codeHash).toBe(hashBoundCode(deliveredCode(ctx.deliver), 'user-1'));
    expect(row.expiresAt.getTime()).toBe(NOW + 600_000);
  });

  it('answers the SAME neutral 200 for an unknown account, and sends nothing', async () => {
    const ctx = setup({ user: null });
    const res = await start(ctx, { phoneNum: '012-345 6789' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(FORGOT_NEUTRAL_MESSAGE);
    expect(Object.keys(res.body.data).sort()).toEqual(['expiresInSec', 'requestId', 'resendAfterSec']);
    expect(res.body.data.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(ctx.users.getUserByLoginMethod).toHaveBeenCalledWith('phone', '60123456789');
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.codes.create).not.toHaveBeenCalled();
  });

  it('answers the same neutral 200 for an INACTIVE account', async () => {
    const ctx = setup({ user: fakeUser({ status: 'inactive' }) });
    const res = await start(ctx, { email: 'owner@atlas-agency.my' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(FORGOT_NEUTRAL_MESSAGE);
    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('applies the 60 s cooldown to known and unknown identifiers alike', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    await start(known, { email: 'owner@atlas-agency.my' });
    await start(unknown, { email: 'nobody@x.my' });

    const knownAgain = await start(known, { email: 'OWNER@atlas-agency.my' });
    const unknownAgain = await start(unknown, { email: 'nobody@x.my' });
    expect(knownAgain.statusCode).toBe(429);
    expect(unknownAgain.statusCode).toBe(429);
    expect(knownAgain.body.data).toEqual({ retryAfterSec: 60 });
    expect(unknownAgain.body.data).toEqual({ retryAfterSec: 60 });
  });

  it('a second request after the cooldown expires the first code', async () => {
    const ctx = setup();
    const first = await start(ctx, { email: 'owner@atlas-agency.my' });
    ctx.advance(61_000);
    const second = await start(ctx, { email: 'owner@atlas-agency.my' });
    expect(second.statusCode).toBe(200);
    expect(ctx.codes.rows.get(first.body.data.requestId)!.status).toBe('expired');
    expect(ctx.codes.rows.get(second.body.data.requestId)!.status).toBe('pending');
  });

  it('stays neutral when the code reached no channel, and expires the row', async () => {
    const ctx = setup({ deliverOk: false });
    const res = await start(ctx, { email: 'owner@atlas-agency.my' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(FORGOT_NEUTRAL_MESSAGE);
    await ctx.controller.settled();
    expect(ctx.codes.rows.get(res.body.data.requestId)!.status).toBe('expired');
  });

  it('answers WITHOUT waiting for delivery — slow WhatsApp/SMTP cannot time an account', async () => {
    const ctx = setup();
    let release!: () => void;
    ctx.deliver.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ sentTo: [], ok: true, waMessageId: null });
        }),
    );
    const res = await start(ctx, { email: 'owner@atlas-agency.my' });
    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    release();
    await ctx.controller.settled();
  });

  it('pads known and unknown answers to the same floor', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    await start(known, { email: 'owner@atlas-agency.my' });
    await start(unknown, { email: 'nobody@x.my' });
    // The fake clock does not move, so each waits out the whole floor.
    expect(known.sleep.mock.calls).toEqual([[FORGOT_MIN_RESPONSE_MS]]);
    expect(unknown.sleep.mock.calls).toEqual([[FORGOT_MIN_RESPONSE_MS]]);
  });

  it('requires exactly one of email and phone', async () => {
    const ctx = setup();
    expect((await start(ctx, {})).statusCode).toBe(400);
    expect((await start(ctx, { email: 'a@b.my', phoneNum: '0123456789' })).statusCode).toBe(400);
    expect((await start(ctx, { phoneNum: '123' })).statusCode).toBe(400);
  });
});

describe('POST /auth/password/forgot/complete', () => {
  async function started(user = fakeUser()) {
    const ctx = setup({ user });
    const res = await start(ctx, { email: 'owner@atlas-agency.my' });
    return { ctx, requestId: res.body.data.requestId as string, code: deliveredCode(ctx.deliver) };
  }

  it('writes the password in the SAME call that spends the code, with a second-floored cutoff, and clears the lockout there', async () => {
    const { ctx, requestId, code } = await started(
      fakeUser({ failedLoginAttempts: 5, lockedUntil: new Date(NOW + 600_000) }),
    );
    const res = await complete(ctx, { requestId, code, password: 'new-password' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(PASSWORD_RESET_DONE);
    expect(res.body.data).toBeNull();
    expect(ctx.accounts.completePasswordReset).toHaveBeenCalledWith({
      requestId,
      userId: 'user-1',
      passwordHash: 'hash:new-password',
      cutoff: new Date(Math.floor(NOW / 1000) * 1000),
    });
    expect(ctx.notices.passwordChanged).toHaveBeenCalledWith({
      email: 'owner@atlas-agency.my',
      name: 'Owner',
    });
  });

  it('a wrong code is 400 "Invalid code" — NEVER 401 — and counts', async () => {
    const { ctx, requestId, code } = await started();
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await complete(ctx, { requestId, code: wrong, password: 'new-password' });

    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(401);
    expect(res.body.message).toBe('Invalid code');
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(1);
    expect(ctx.accounts.completePasswordReset).not.toHaveBeenCalled();
  });

  it('the 5th wrong code is 429 and expires the row, so even the right code is then refused', async () => {
    const { ctx, requestId, code } = await started();
    const wrong = code === '000000' ? '111111' : '000000';
    const statuses: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      statuses.push((await complete(ctx, { requestId, code: wrong, password: 'new-password' })).statusCode);
    }
    expect(statuses).toEqual([400, 400, 400, 400, 429]);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('expired');

    const right = await complete(ctx, { requestId, code, password: 'new-password' });
    expect(right.statusCode).toBe(400);
    expect(right.body.message).toBe(RESET_CODE_EXPIRED);
    expect(ctx.accounts.completePasswordReset).not.toHaveBeenCalled();
  });

  it('an expired code is 400 with the expired message', async () => {
    const { ctx, requestId, code } = await started();
    ctx.advance(601_000);
    const res = await complete(ctx, { requestId, code, password: 'new-password' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(RESET_CODE_EXPIRED);
  });

  it('a request id start never handed out is the expired 400', async () => {
    const ctx = setup();
    const res = await complete(ctx, {
      requestId: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607',
      code: '123456',
      password: 'new-password',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(RESET_CODE_EXPIRED);
  });

  it('a code already spent by a racing request is 409', async () => {
    const { ctx, requestId, code } = await started();
    ctx.accounts.completePasswordReset.mockResolvedValueOnce('already_used');
    const res = await complete(ctx, { requestId, code, password: 'new-password' });
    expect(res.statusCode).toBe(409);
  });

  it('enforces 6-72 characters', async () => {
    const { ctx, requestId, code } = await started();
    expect((await complete(ctx, { requestId, code, password: '12345' })).statusCode).toBe(400);
    expect((await complete(ctx, { requestId, code, password: 'x'.repeat(73) })).statusCode).toBe(400);
  });

  it('a failed password write is logged WITHOUT the hash drizzle puts in the error', async () => {
    const { ctx, requestId, code } = await started();
    const fakeHash = '$2b$10$FAKEHASHVALUEFAKEHASHVALUEFAKEHASHVALUE';
    ctx.accounts.completePasswordReset.mockRejectedValueOnce(
      new DrizzleQueryError('update "user" set "password_hash" = $1 where "id" = $2', [fakeHash, 'user-1'], Object.assign(new Error('connection reset'), { code: '08006' })),
    );
    vi.mocked(logger.error).mockClear();

    const res = await complete(ctx, { requestId, code, password: 'new-password' });

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
    const logged = inspect(vi.mocked(logger.error).mock.calls, { depth: 8, showHidden: true });
    expect(logged).not.toContain('FAKEHASHVALUE');
    expect(logged).toContain('08006');
  });
});

/**
 * The enumeration oracle this guards: start is neutral, so an attacker takes
 * its requestId to complete with any six digits. Every answer for the id of a
 * REAL account must equal the answer for the id of an UNKNOWN one — status and
 * message, guess by guess, until the id is dead.
 */
describe('forgot/complete is neutral between a known and an unknown account', () => {
  const WRONG_SEQUENCE: Array<[number, string]> = [
    [400, INVALID_CODE],
    [400, INVALID_CODE],
    [400, INVALID_CODE],
    [400, INVALID_CODE],
    [429, TOO_MANY_ATTEMPTS],
    [400, RESET_CODE_EXPIRED],
  ];

  function wrongCodeFor(ctx: ReturnType<typeof setup>): string {
    const calls = ctx.deliver.mock.calls.length;
    const real = calls > 0 ? deliveredCode(ctx.deliver, calls - 1) : '';
    return real === '000000' ? '111111' : '000000';
  }

  async function guesses(ctx: ReturnType<typeof setup>, requestId: string, count: number, code: string) {
    const out: Array<[number, string]> = [];
    for (let i = 0; i < count; i += 1) {
      const res = await complete(ctx, { requestId, code, password: 'new-password' });
      out.push([res.statusCode, res.body.message]);
    }
    return out;
  }

  it('answers identically, guess by guess, for the start ids of a known and an unknown account', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    const k = await start(known, { email: 'owner@atlas-agency.my' });
    const u = await start(unknown, { email: 'owner@atlas-agency.my' });
    await known.controller.settled();

    const knownTrace = await guesses(known, k.body.data.requestId, 6, wrongCodeFor(known));
    const unknownTrace = await guesses(unknown, u.body.data.requestId, 6, wrongCodeFor(known));

    expect(knownTrace).toEqual(WRONG_SEQUENCE);
    expect(unknownTrace).toEqual(knownTrace);
  });

  it('an unknown account\'s id also accepts no code at all — even a guess that happens to be "right"', async () => {
    const unknown = setup({ user: null });
    const u = await start(unknown, { email: 'nobody@x.my' });
    for (const code of ['123456', '000000', '999999']) {
      const res = await complete(unknown, { requestId: u.body.data.requestId, code, password: 'new-password' });
      expect(res.statusCode).toBe(400);
    }
    expect(unknown.accounts.completePasswordReset).not.toHaveBeenCalled();
  });

  it('both expire at the same TTL', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    const k = await start(known, { email: 'owner@atlas-agency.my' });
    const u = await start(unknown, { email: 'owner@atlas-agency.my' });
    known.advance(601_000);
    unknown.advance(601_000);

    const knownTrace = await guesses(known, k.body.data.requestId, 1, wrongCodeFor(known));
    const unknownTrace = await guesses(unknown, u.body.data.requestId, 1, '000000');
    expect(knownTrace).toEqual([[400, RESET_CODE_EXPIRED]]);
    expect(unknownTrace).toEqual(knownTrace);
  });

  it('both are superseded by a newer start for the same identifier', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    const k1 = await start(known, { email: 'owner@atlas-agency.my' });
    const u1 = await start(unknown, { email: 'owner@atlas-agency.my' });
    known.advance(61_000);
    unknown.advance(61_000);
    const k2 = await start(known, { email: 'owner@atlas-agency.my' });
    const u2 = await start(unknown, { email: 'owner@atlas-agency.my' });

    const wrong = wrongCodeFor(known);
    expect(await guesses(unknown, u1.body.data.requestId, 1, wrong)).toEqual(
      await guesses(known, k1.body.data.requestId, 1, wrong),
    );
    expect(await guesses(unknown, u1.body.data.requestId, 1, wrong)).toEqual([[400, RESET_CODE_EXPIRED]]);
    expect(await guesses(unknown, u2.body.data.requestId, 1, wrong)).toEqual(
      await guesses(known, k2.body.data.requestId, 1, wrong),
    );
  });

  it('a real account whose code reached NO channel still answers like an unknown one', async () => {
    const failed = setup({ deliverOk: false });
    const unknown = setup({ user: null });
    const f = await start(failed, { email: 'owner@atlas-agency.my' });
    const u = await start(unknown, { email: 'owner@atlas-agency.my' });
    await failed.controller.settled();
    expect(failed.codes.rows.get(f.body.data.requestId)!.status).toBe('expired');

    const failedTrace = await guesses(failed, f.body.data.requestId, 6, '000000');
    const unknownTrace = await guesses(unknown, u.body.data.requestId, 6, '000000');
    expect(failedTrace).toEqual(WRONG_SEQUENCE);
    expect(unknownTrace).toEqual(failedTrace);
  });

  it('guesses spent before a delivery failure still count toward the same cap', async () => {
    const ctx = setup();
    let fail!: () => void;
    ctx.deliver.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fail = () => resolve({ sentTo: [], ok: false, waMessageId: null });
        }),
    );
    const res = await start(ctx, { email: 'owner@atlas-agency.my' });
    const requestId = res.body.data.requestId as string;

    const before = await guesses(ctx, requestId, 1, '000000');
    fail();
    await ctx.controller.settled();
    const after = await guesses(ctx, requestId, 5, '000000');

    expect([...before, ...after]).toEqual(WRONG_SEQUENCE);
  });

  it('pads a wrong code on a real row and on a stand-in to the same floor', async () => {
    const known = setup();
    const unknown = setup({ user: null });
    const k = await start(known, { email: 'owner@atlas-agency.my' });
    const u = await start(unknown, { email: 'owner@atlas-agency.my' });
    known.sleep.mockClear();
    unknown.sleep.mockClear();

    await guesses(known, k.body.data.requestId, 1, wrongCodeFor(known));
    await guesses(unknown, u.body.data.requestId, 1, '000000');
    expect(known.sleep.mock.calls).toEqual([[FORGOT_MIN_RESPONSE_MS]]);
    expect(unknown.sleep.mock.calls).toEqual([[FORGOT_MIN_RESPONSE_MS]]);
  });
});
