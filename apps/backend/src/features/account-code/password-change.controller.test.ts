import { describe, expect, it, vi } from 'vitest';

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
import type { UserType } from '@/features/user/user.model';
import { isTokenBeforeCutoff } from '@/features/auth/session-cutoff';
import { hashBoundCode } from './code';
import {
  CODE_ALREADY_USED,
  CODE_EXPIRED,
  NO_PASSWORD,
  NOWHERE_TO_SEND,
  PASSWORD_CHANGE_CODE_TTL_SEC,
  PASSWORD_UPDATED,
  PasswordChangeControllerClass,
  SAME_PASSWORD,
} from './password-change.controller';
import { WRONG_PASSWORD } from './shared';
import {
  NOW,
  deliveredCode,
  fakeCodeStore,
  fakeComparePassword,
  fakeDeliver,
  fakeNotices,
  fakePasswordChangeDeps,
  fakeReq,
  fakeRes,
  fakeUser,
} from './fakes.test-support';

/**
 * THE SIGNED-IN PASSWORD CHANGE — two steps and a code (owner, 21 Sep 2026,
 * asked directly what it should become: "Current password + a code").
 *
 *   start   { currentPassword }                → a code to the phone AND the
 *                                                email already on file
 *   resend  { requestId }                      → another, no password
 *   confirm { requestId, code, newPassword }   → written, tokens re-issued
 *
 * The two proofs are the CURRENT PASSWORD and the CODE. The old one-step
 * `POST /auth/password/change` is gone, and its tests with it — a test that
 * still walks a retired endpoint is a description of a product that no longer
 * exists.
 */

type LoginMethod = 'email' | 'phone';

/** The password `fakeUser().passwordHash` ('hash:old-password') belongs to. */
const PASSWORD = 'old-password';
const NEW_PASSWORD = 'brand-new-password';
const EMAIL_ON_FILE = 'owner@atlas-agency.my';
const PHONE_ON_FILE = '+60123456789';

function setup(
  options: {
    user?: UserType;
    bearer?: { loginMethod: LoginMethod; loginCriteria: string };
    deliverOk?: boolean;
    /** What `comparePassword` answers — false is "wrong current password". */
    passwordOk?: boolean;
  } = {},
) {
  let user = options.user ?? fakeUser();
  const bearer = options.bearer ?? { loginMethod: 'email' as const, loginCriteria: user.email! };
  const codes = fakeCodeStore();
  const deliver = fakeDeliver(options.deliverOk ?? true);
  const notices = fakeNotices();
  /*
   * ONE comparator for both questions this flow asks it — "is this the current
   * password" at start, and "is the NEW password the same as the current one"
   * at confirm. Answering by the stored hash rather than by a flag is what lets
   * a single fake serve both without a test having to sequence mock returns.
   */
  const comparePassword =
    options.passwordOk === false
      ? fakeComparePassword(false)
      : vi.fn(async (password: string, hash: string) => hash === `hash:${password}`);

  const users = {
    getUserById: vi.fn(async (id: string) => (user.id === id ? user : null)),
  };
  const accounts = {
    completePasswordChange: vi.fn(
      async (input: { requestId: string; userId: string; passwordHash: string; cutoff: Date }) => {
        const row = codes.rows.get(input.requestId);
        // The real transaction spends the row conditionally on `pending`.
        if (!row || row.status !== 'pending') return 'already_used' as const;
        row.status = 'consumed';
        user = { ...user, passwordHash: input.passwordHash, sessionsValidFrom: input.cutoff };
        return 'ok' as const;
      },
    ),
  };
  const jwt = {
    verifyToken: vi.fn((token: string) => {
      if (token !== 'bearer-token') throw new Error('bad token');
      return { ...bearer, type: 'access' };
    }),
    generateAccessToken: vi.fn(
      (info: { loginMethod: string; loginCriteria: string }) =>
        `access:${info.loginMethod}:${info.loginCriteria}`,
    ),
    generateRefreshToken: vi.fn(
      (info: { loginMethod: string; loginCriteria: string }) =>
        `refresh:${info.loginMethod}:${info.loginCriteria}`,
    ),
  };
  let now = NOW;

  const controller = new PasswordChangeControllerClass(
    fakePasswordChangeDeps({
      users,
      codes,
      accounts,
      deliver,
      notices,
      comparePassword,
      now: () => now,
      jwt: jwt as never,
    }),
  );

  const call = async (method: 'start' | 'resend' | 'confirm', body: unknown) => {
    const res = fakeRes();
    await controller[method](fakeReq(body, user, 'bearer-token'), res);
    return res;
  };

  /** The same call with NO authenticated user on the request. */
  const callAnonymous = async (method: 'start' | 'resend' | 'confirm', body: unknown) => {
    const res = fakeRes();
    await controller[method](fakeReq(body, undefined, 'bearer-token'), res);
    return res;
  };

  return {
    controller,
    codes,
    deliver,
    notices,
    accounts,
    jwt,
    users,
    comparePassword,
    call,
    callAnonymous,
    currentUser: () => user,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** start → the live request id and the code that went out. */
async function startChange(ctx: ReturnType<typeof setup>) {
  const started = await ctx.call('start', { currentPassword: PASSWORD });
  expect(started.statusCode).toBe(200);
  return {
    started,
    requestId: started.body.data.requestId as string,
    code: deliveredCode(ctx.deliver, 0),
  };
}

/** Nothing was sent and no code row exists — the shape of every refusal at start. */
function nothingIssued(ctx: ReturnType<typeof setup>) {
  expect(ctx.deliver).not.toHaveBeenCalled();
  expect(ctx.codes.create).not.toHaveBeenCalled();
  expect(ctx.codes.rows.size).toBe(0);
}

describe('POST /auth/password/change/start — the current password is the first gate', () => {
  it('refuses an EMPTY current password with the shared sentence, and issues nothing', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { currentPassword: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Current password is required');
    expect(ctx.comparePassword).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('refuses a body with NO currentPassword key at all — 400, never 401, nothing issued', async () => {
    const ctx = setup();
    const res = await ctx.call('start', {});

    // The SAME sentence as the empty-string case: `z.string()` carries an
    // `error` of its own so an absent key never shows zod's untranslated
    // "expected string, received undefined". See schemas.ts.
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Current password is required');
    expect(res.body.success).toBe(false);
    nothingIssued(ctx);
  });

  it('a WRONG password is 400 with the exact sentence, and issues NO code row', async () => {
    const ctx = setup({ passwordOk: false });
    const res = await ctx.call('start', { currentPassword: 'guess' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(WRONG_PASSWORD);
    /*
     * ⚠️ NOT 401. The web client signs a person out on any 401, so one typo in
     * a settings sheet used to throw them to the login page.
     */
    expect(res.statusCode).not.toBe(401);
    // A wrong password must cost nothing: no row, no WhatsApp, no email.
    nothingIssued(ctx);
  });

  it('the password is checked BEFORE the account is judged for anywhere to send', async () => {
    // No phone and no email — the 422 case below — but the password is wrong,
    // so the password's refusal is what comes back. Otherwise a wrong password
    // would learn something about the account it has not paid for.
    const ctx = setup({
      user: fakeUser({ email: null, phoneNum: null }),
      passwordOk: false,
    });
    const res = await ctx.call('start', { currentPassword: 'guess' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(WRONG_PASSWORD);
    nothingIssued(ctx);
  });

  it('honours the login LOCKOUT with 429 before it compares anything', async () => {
    const ctx = setup({
      user: fakeUser({ lockedUntil: new Date(NOW + 5 * 60_000) }),
    });
    const res = await ctx.call('start', { currentPassword: PASSWORD });

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe('Too many failed attempts. Try again in 5 minutes.');
    /*
     * The COUNTDOWN, in seconds — the web reads `data.retryAfterSec` first and
     * the Retry-After header second, and with neither the lockout sheet can
     * only say "try again later" without saying when.
     */
    expect(res.body.data.retryAfterSec).toBe(300);
    expect(ctx.comparePassword).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('an account with NO password hash is refused 400 with its own sentence', async () => {
    const ctx = setup({ user: fakeUser({ passwordHash: null }) });
    const res = await ctx.call('start', { currentPassword: PASSWORD });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(NO_PASSWORD);
    nothingIssued(ctx);
  });

  it('a failed account re-read is 500, NEVER 401 — a query blip must not sign anybody out', async () => {
    const ctx = setup();
    ctx.users.getUserById.mockResolvedValueOnce(null);
    const res = await ctx.call('start', { currentPassword: PASSWORD });

    expect(res.statusCode).toBe(500);
    nothingIssued(ctx);
  });

  it('401 only when there is no session at all', async () => {
    const ctx = setup();
    const res = await ctx.callAnonymous('start', { currentPassword: PASSWORD });
    expect(res.statusCode).toBe(401);
    nothingIssued(ctx);
  });
});

describe('POST /auth/password/change/start — ONE code, every channel on file', () => {
  it('sends the SAME code to the phone AND the email already on file', async () => {
    const ctx = setup();
    const { started } = await startChange(ctx);

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    const sent = ctx.deliver.mock.calls[0][0] as {
      phone?: string | null;
      email?: string | null;
      purpose: string;
      code: string;
    };
    // BOTH destinations, one code. The owner's rule: "must be the same otp".
    expect(sent.phone).toBe(PHONE_ON_FILE);
    expect(sent.email).toBe(EMAIL_ON_FILE);
    expect(sent.purpose).toBe('password_change');

    expect(started.body.data).toMatchObject({
      expiresInSec: PASSWORD_CHANGE_CODE_TTL_SEC,
      resendAfterSec: 60,
    });
    // Reported per channel, so the screen can say exactly where to look.
    expect(started.body.data.sentTo).toEqual([
      { channel: 'whatsapp', to: `phone:${PHONE_ON_FILE}`, status: 'sent' },
      { channel: 'sms', to: `phone:${PHONE_ON_FILE}`, status: 'sent' },
      { channel: 'email', to: `email:${EMAIL_ON_FILE}`, status: 'sent' },
    ]);
  });

  it('writes a row bound to the account AND this purpose, with every channel in `channel`', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    const row = ctx.codes.rows.get(requestId)!;

    expect(row.purpose).toBe('password_change');
    expect(row.status).toBe('pending');
    expect(row.createdBy).toBe('user-1');
    expect(row.channel).toBe('whatsapp,sms,email');
    expect(row.expiresAt.getTime()).toBe(NOW + PASSWORD_CHANGE_CODE_TTL_SEC * 1000);

    // The hash covers the code, the USER and the PURPOSE — so a contact-change
    // code, or another account's, can never be spent here.
    expect(row.codeHash).toBe(hashBoundCode(code, 'user-1', 'password_change'));
    expect(row.codeHash).not.toBe(hashBoundCode(code, 'user-1', 'email'));
    expect(row.codeHash).not.toBe(hashBoundCode(code, 'user-2', 'password_change'));
  });

  it('an account with only a PHONE still gets the code; only an EMAIL likewise', async () => {
    const phoneOnly = setup({ user: fakeUser({ email: null }) });
    await startChange(phoneOnly);
    expect((phoneOnly.deliver.mock.calls[0][0] as { email?: string | null }).email).toBeNull();
    expect(phoneOnly.codes.rows.get([...phoneOnly.codes.rows.keys()][0])!.channel).toBe(
      'whatsapp,sms',
    );

    const emailOnly = setup({ user: fakeUser({ phoneNum: null }) });
    await startChange(emailOnly);
    expect((emailOnly.deliver.mock.calls[0][0] as { phone?: string | null }).phone).toBeNull();
    expect(emailOnly.codes.rows.get([...emailOnly.codes.rows.keys()][0])!.channel).toBe('email');
  });

  it('422 when there is NEITHER a phone nor an email — there is nowhere to send it', async () => {
    const ctx = setup({ user: fakeUser({ email: null, phoneNum: null }) });
    const res = await ctx.call('start', { currentPassword: PASSWORD });

    expect(res.statusCode).toBe(422);
    expect(res.body.message).toBe(NOWHERE_TO_SEND);
    nothingIssued(ctx);
  });

  it('a delivery that reached NO channel is 503 and expires the row it just wrote', async () => {
    const ctx = setup({ deliverOk: false });
    const res = await ctx.call('start', { currentPassword: PASSWORD });

    expect(res.statusCode).toBe(503);
    const row = [...ctx.codes.rows.values()][0];
    // A code that reached nobody must not look like a code on its way.
    expect(row.status).toBe('expired');
  });

  it('refuses a second code inside the cooldown, with Retry-After', async () => {
    const ctx = setup();
    await startChange(ctx);
    ctx.advance(10_000);

    const again = await ctx.call('start', { currentPassword: PASSWORD });
    expect(again.statusCode).toBe(429);
    expect(again.body.data.retryAfterSec).toBe(50);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('a fresh start RETIRES the earlier pending row, so only one code is live', async () => {
    const ctx = setup();
    const first = await startChange(ctx);
    ctx.advance(61_000);

    const second = await ctx.call('start', { currentPassword: PASSWORD });
    expect(second.statusCode).toBe(200);
    expect(ctx.codes.rows.get(first.requestId)!.status).toBe('expired');

    // The retired code no longer works, even though it has not timed out.
    const spent = await ctx.call('confirm', {
      requestId: first.requestId,
      code: first.code,
      newPassword: NEW_PASSWORD,
    });
    expect(spent.statusCode).toBe(400);
    expect(spent.body.message).toBe(CODE_EXPIRED);
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();
  });
});

describe('POST /auth/password/change/resend — the requestId is the proof, not the password', () => {
  it('sends another code with NO password in the body', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx);
    ctx.advance(61_000);

    const res = await ctx.call('resend', { requestId });

    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).toHaveBeenCalledTimes(2);
    // Only start compares a password; resend must never ask for one again.
    expect(ctx.comparePassword).toHaveBeenCalledTimes(1);
    const resent = ctx.deliver.mock.calls[1][0] as { phone?: string | null; email?: string | null };
    expect(resent.phone).toBe(PHONE_ON_FILE);
    expect(resent.email).toBe(EMAIL_ON_FILE);
  });

  it('honours the same 60s cooldown', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx);
    ctx.advance(10_000);

    const res = await ctx.call('resend', { requestId });
    expect(res.statusCode).toBe(429);
    expect(res.body.data.retryAfterSec).toBe(50);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('refuses an id that is not a live password_change row of THIS account', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx);
    ctx.advance(61_000);

    // Someone else's row.
    ctx.codes.rows.get(requestId)!.createdBy = 'user-2';
    expect((await ctx.call('resend', { requestId })).statusCode).toBe(400);

    // A row of another PURPOSE — a contact-change code cannot be resent here.
    ctx.codes.rows.get(requestId)!.createdBy = 'user-1';
    ctx.codes.rows.get(requestId)!.purpose = 'contact_change_new';
    const wrongPurpose = await ctx.call('resend', { requestId });
    expect(wrongPurpose.statusCode).toBe(400);
    expect(wrongPurpose.body.message).toBe(CODE_EXPIRED);

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('a malformed requestId is 400 with the expired sentence, never a 500', async () => {
    const ctx = setup();
    const res = await ctx.call('resend', { requestId: 'not-a-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
  });
});

describe('POST /auth/password/change/confirm — the code, then the write', () => {
  it('writes the password, spends the row and re-issues the BEARER’s token pair', async () => {
    const ctx = setup({ bearer: { loginMethod: 'phone', loginCriteria: PHONE_ON_FILE } });
    const { requestId, code } = await startChange(ctx);

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(PASSWORD_UPDATED);
    expect(res.body.data).toEqual({
      accessToken: `access:phone:${PHONE_ON_FILE}`,
      refreshToken: `refresh:phone:${PHONE_ON_FILE}`,
    });
    expect(ctx.accounts.completePasswordChange).toHaveBeenCalledTimes(1);
    const [written] = ctx.accounts.completePasswordChange.mock.calls[0];
    expect(written).toMatchObject({
      requestId,
      userId: 'user-1',
      passwordHash: `hash:${NEW_PASSWORD}`,
    });
    expect(ctx.codes.rows.get(requestId)!.status).toBe('consumed');
    expect(ctx.notices.passwordChanged).toHaveBeenCalledWith({
      email: EMAIL_ON_FILE,
      name: 'Owner',
    });
  });

  it('stamps a cutoff FLOORED to the second, which the re-issued token survives', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });

    const cutoff = ctx.accounts.completePasswordChange.mock.calls[0][0].cutoff;
    expect(cutoff.getTime() % 1000).toBe(0);
    expect(cutoff.getTime()).toBe(Math.floor(NOW / 1000) * 1000);

    // A token minted in the same second (iat has no milliseconds) is kept; one
    // from the second before is cut.
    const sameSecondIat = new Date(Math.floor(NOW / 1000) * 1000);
    expect(isTokenBeforeCutoff(sameSecondIat, cutoff)).toBe(false);
    expect(isTokenBeforeCutoff(new Date(cutoff.getTime() - 1000), cutoff)).toBe(true);
  });

  it('a WRONG code is 400 and writes nothing; the FIFTH expires the row and answers 429', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await ctx.call('confirm', { requestId, code: wrong, newPassword: NEW_PASSWORD });
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Invalid code');
      // ⚠️ Never 401 — the web client signs a person out on any 401.
      expect(res.statusCode).not.toBe(401);
    }

    const fifth = await ctx.call('confirm', { requestId, code: wrong, newPassword: NEW_PASSWORD });
    expect(fifth.statusCode).toBe(429);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('expired');
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();

    // And the RIGHT code no longer works on a row that ran out of attempts.
    const late = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(late.statusCode).toBe(400);
    expect(late.body.message).toBe(CODE_EXPIRED);
  });

  it('refuses a new password EQUAL to the current one, comparing against the stored HASH', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);

    /*
     * The old one-step handler compared two plaintexts in the schema. Confirm
     * carries no current password, so the rule moved to the hash — same
     * sentence, so neither client has to learn a new one.
     */
    const res = await ctx.call('confirm', { requestId, code, newPassword: PASSWORD });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(SAME_PASSWORD);
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();
    // The row stays PENDING: mistyping is not a wrong code, so the same code
    // still works for a genuinely different password.
    expect(ctx.codes.rows.get(requestId)!.status).toBe('pending');
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(0);

    const retry = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(retry.statusCode).toBe(200);
  });

  it('checks the CODE before the new-password comparison — no oracle without a code', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    const wrong = code === '000000' ? '111111' : '000000';

    // Submitting the CURRENT password as the new one, with a WRONG code, must
    // answer "Invalid code" — never "that is already your password", which
    // would confirm the current password to anybody holding a session.
    const res = await ctx.call('confirm', { requestId, code: wrong, newPassword: PASSWORD });
    expect(res.body.message).toBe('Invalid code');
    expect(res.body.message).not.toBe(SAME_PASSWORD);
  });

  it('enforces 6-72 characters on the new password', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);

    expect(
      (await ctx.call('confirm', { requestId, code, newPassword: '12345' })).statusCode,
    ).toBe(400);
    expect(
      (await ctx.call('confirm', { requestId, code, newPassword: 'x'.repeat(73) })).statusCode,
    ).toBe(400);
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();
    // A body the schema rejected never touched the row's attempt budget.
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(0);
  });

  it('a code already spent answers 409, not a second write', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    ctx.codes.rows.get(requestId)!.status = 'pending';
    // The repository's spend is conditional on `pending`; force the race.
    ctx.accounts.completePasswordChange.mockResolvedValueOnce('already_used');

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(CODE_ALREADY_USED);
  });

  it('still answers 200 when the tokens cannot be re-issued — the password IS changed', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    ctx.jwt.verifyToken.mockImplementationOnce(() => {
      throw new Error('bad token');
    });

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ accessToken: null, refreshToken: null });
    expect(ctx.accounts.completePasswordChange).toHaveBeenCalledTimes(1);
  });

  it('a failed account re-read after a CORRECT code is 500, and leaves the code usable', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    ctx.users.getUserById.mockResolvedValueOnce(null);

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(500);
    // Nothing was spent, so the same code still finishes the job.
    expect(ctx.codes.rows.get(requestId)!.status).toBe('pending');
    expect((await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD })).statusCode).toBe(200);
  });

  it('refuses a code whose row belongs to another account or another purpose', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    ctx.codes.rows.get(requestId)!.purpose = 'contact_change_new';

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();
  });

  it('refuses an EXPIRED row', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    ctx.advance(PASSWORD_CHANGE_CODE_TTL_SEC * 1000 + 1);

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
  });

  it('401 only when there is no session at all', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    const res = await ctx.callAnonymous('confirm', { requestId, code, newPassword: NEW_PASSWORD });
    expect(res.statusCode).toBe(401);
    expect(ctx.accounts.completePasswordChange).not.toHaveBeenCalled();
  });

  it('a failed write is 500 and is logged WITHOUT the hash drizzle puts in the error', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx);
    const fakeHash = '$2b$10$FAKEHASHVALUEFAKEHASHVALUEFAKEHASHVALUE';
    ctx.accounts.completePasswordChange.mockRejectedValueOnce(
      new DrizzleQueryError(
        'update "user" set "password_hash" = $1 where "id" = $2',
        [fakeHash, 'user-1'],
        Object.assign(new Error('connection reset'), { code: '08006' }),
      ),
    );
    vi.mocked(logger.error).mockClear();

    const res = await ctx.call('confirm', { requestId, code, newPassword: NEW_PASSWORD });

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
    const logged = inspect(vi.mocked(logger.error).mock.calls, { depth: 8, showHidden: true });
    expect(logged).not.toContain('FAKEHASHVALUE');
    expect(logged).toContain('08006');
  });
});
