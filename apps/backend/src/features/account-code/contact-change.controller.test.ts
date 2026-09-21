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

import type { UserType } from '@/features/user/user.model';
import { hashBoundCode } from './code';
import {
  CODE_ALREADY_USED,
  CODE_EXPIRED,
  ContactChangeControllerClass,
  NEW_CONTACT_CODE_TTL_SEC,
  NO_PASSWORD,
  WRONG_PASSWORD,
} from './contact-change.controller';
import {
  NOW,
  deliveredCode,
  fakeCodeStore,
  fakeComparePassword,
  fakeContactChangeDeps,
  fakeDeliver,
  fakeNotices,
  fakeReq,
  fakeRes,
  fakeUser,
  firedNotices,
} from './fakes.test-support';

/**
 * CHANGING THE SIGN-IN EMAIL OR PHONE — the one-code flow (owner, 21 Sep 2026).
 *
 *   start   { kind, value, currentPassword } → a code to the NEW contact only
 *   resend  { kind, value, requestId }       → another, no password
 *   confirm { kind, value, requestId, code } → written, tokens re-issued
 *
 * The two proofs are the CURRENT PASSWORD and the CODE TO THE NEW CONTACT.
 * ⚠️ Nothing — no code, no notice — ever reaches the old phone or old email, so
 * several tests below are written as "was this NOT sent / NOT called".
 *
 * The identity step (`verify-identity`, `resend-new`) and its two old-contact
 * notices are gone; their tests are deleted rather than adapted, because a test
 * that still walks a retired step is a description of a product that no longer
 * exists.
 */

type LoginMethod = 'email' | 'phone';

/** The password `fakeUser().passwordHash` ('hash:old-password') belongs to. */
const PASSWORD = 'old-password';
const OLD_EMAIL = 'owner@atlas-agency.my';
const OLD_PHONE = '+60123456789';

function setup(
  options: {
    user?: UserType;
    bearer?: { loginMethod: LoginMethod; loginCriteria: string };
    taken?: boolean;
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
  const comparePassword = fakeComparePassword(options.passwordOk ?? true);
  const countPendingInvites = vi.fn(async () => 2);
  let now = NOW;

  const users = {
    getUserByLoginMethod: vi.fn(async () => user),
    getUserById: vi.fn(async (id: string) => (user.id === id ? user : null)),
  };
  const accounts = {
    completePasswordReset: vi.fn(),
    isContactTaken: vi.fn(async () => Boolean(options.taken)),
    applyContactChange: vi.fn(
      async (input: { rowId: string; userId: string; kind: LoginMethod; value: string; cutoff: Date }) => {
        const row = codes.rows.get(input.rowId);
        // The real transaction spends the row conditionally on `pending`.
        if (!row || row.status !== 'pending') return { status: 'already_used' as const };
        row.status = 'consumed';
        user = {
          ...user,
          ...(input.kind === 'email' ? { email: input.value } : { phoneNum: input.value }),
          sessionsValidFrom: input.cutoff,
        };
        return { status: 'ok' as const, user };
      },
    ),
  };
  const jwt = {
    verifyToken: vi.fn((token: string) => {
      if (token !== 'bearer-token') throw new Error('bad token');
      return { ...bearer, type: 'access' };
    }),
    generateAccessToken: vi.fn(
      (info: { loginMethod: string; loginCriteria: string }) => `access:${info.loginMethod}:${info.loginCriteria}`,
    ),
    generateRefreshToken: vi.fn(
      (info: { loginMethod: string; loginCriteria: string }) => `refresh:${info.loginMethod}:${info.loginCriteria}`,
    ),
  };

  const controller = new ContactChangeControllerClass(
    fakeContactChangeDeps({
      users,
      codes,
      accounts: accounts as never,
      deliver,
      notices,
      comparePassword,
      now: () => now,
      jwt: jwt as never,
      countPendingInvites,
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
    countPendingInvites,
    call,
    callAnonymous,
    currentUser: () => user,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** start → the live request id and the code that was sent to the NEW contact. */
async function startChange(ctx: ReturnType<typeof setup>, kind: LoginMethod, value: string) {
  const started = await ctx.call('start', { kind, value, currentPassword: PASSWORD });
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

describe('POST /auth/contact-change/start — the current password is the first gate', () => {
  it('refuses an EMPTY current password with the shared sentence, and issues nothing', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: '' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Current password is required');
    expect(ctx.comparePassword).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('refuses a body with NO currentPassword key at all — 400, never 401, nothing issued', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my' });

    expect(res.statusCode).toBe(400);
    /*
     * THE SAME SENTENCE AS THE EMPTY-STRING CASE ABOVE, and that is the point.
     * `z.string().min(1, …)` alone raises `invalid_type` for an ABSENT key and
     * answers zod's own "Invalid input: expected string, received undefined" —
     * a sentence no client translates, shown to somebody who simply left the
     * box empty. Fixed 21 Sep 2026 by giving `z.string()` an `error` of its
     * own; this assertion is what stops it coming back.
     */
    expect(res.body.message).toBe('Current password is required');
    expect(res.body.success).toBe(false);
    nothingIssued(ctx);
  });

  it('a WRONG password is 400 with the exact sentence — never 401, which signs the web out', async () => {
    const ctx = setup({ passwordOk: false });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: 'guess' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(WRONG_PASSWORD);
    expect(res.body.message).toBe('Current password is incorrect');
    expect(ctx.comparePassword).toHaveBeenCalledWith('guess', 'hash:old-password');
    nothingIssued(ctx);
  });

  it('an account with NO password hash is told to set one — and the compare is never reached', async () => {
    const ctx = setup({ user: fakeUser({ passwordHash: null }) });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(NO_PASSWORD);
    expect(res.body.message).toBe('Set a password before you change your sign-in email or phone');
    expect(ctx.comparePassword).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('⚠️ a FAILED account read is still 500 — not the no-password 400', async () => {
    const ctx = setup();
    ctx.users.getUserById.mockResolvedValueOnce(null);
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).not.toBe(NO_PASSWORD);
    nothingIssued(ctx);
  });

  it('honours the login lockout (429) and writes no code row', async () => {
    const ctx = setup({ user: fakeUser({ lockedUntil: new Date(NOW + 5 * 60_000) }) });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe('Too many failed attempts. Try again in 5 minutes.');
    expect(ctx.comparePassword).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('says "1 minute" in the last minute of a lockout, and lets a lapsed one through', async () => {
    const locked = setup({ user: fakeUser({ lockedUntil: new Date(NOW + 60_000) }) });
    const res = await locked.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });
    expect(res.statusCode).toBe(429);
    expect(res.body.message).toBe('Too many failed attempts. Try again in 1 minute.');

    const lapsed = setup({ user: fakeUser({ lockedUntil: new Date(NOW - 1) }) });
    const after = await lapsed.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });
    expect(after.statusCode).toBe(200);
  });

  it('401 only when the request carries no authenticated user', async () => {
    const ctx = setup();
    const res = await ctx.callAnonymous('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });
    expect(res.statusCode).toBe(401);
    nothingIssued(ctx);
  });
});

/**
 * ⚠️ THE ANTI-ENUMERATION ORDER — the most valuable property in this file.
 *
 * "That is already your email" and "…already used by another account" are an
 * account-enumeration oracle: they answer, for any address typed, whether it
 * belongs to somebody. Before 21 Sep a session alone reached them. The password
 * is what turns them from free into earned, and that is true ONLY while it is
 * checked FIRST. A wrong password on a taken value must answer the password
 * refusal, and the lookup must not even run.
 */
describe('POST /auth/contact-change/start — the password is checked BEFORE the oracles', () => {
  it('a wrong password on a value ANOTHER account holds answers the password refusal, not 409', async () => {
    const ctx = setup({ taken: true, passwordOk: false });
    const res = await ctx.call('start', { kind: 'email', value: 'taken@x.my', currentPassword: 'guess' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(WRONG_PASSWORD);
    expect(res.statusCode).not.toBe(409);
    // The oracle was never consulted, so not even a timing difference remains.
    expect(ctx.accounts.isContactTaken).not.toHaveBeenCalled();
    nothingIssued(ctx);
  });

  it('a wrong password on the caller’s OWN current email answers the password refusal, not 400 "already yours"', async () => {
    const ctx = setup({ passwordOk: false });
    const res = await ctx.call('start', { kind: 'email', value: OLD_EMAIL, currentPassword: 'guess' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(WRONG_PASSWORD);
    expect(res.body.message).not.toBe('That is already your email');
    nothingIssued(ctx);
  });

  it('a lockout also outranks both oracles', async () => {
    const ctx = setup({ taken: true, user: fakeUser({ lockedUntil: new Date(NOW + 120_000) }) });
    const res = await ctx.call('start', { kind: 'email', value: 'taken@x.my', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(429);
    expect(ctx.accounts.isContactTaken).not.toHaveBeenCalled();
  });

  it('with the RIGHT password the oracles answer as before (400 same value, 409 taken)', async () => {
    const same = setup();
    const own = await same.call('start', { kind: 'email', value: ' OWNER@atlas-agency.my ', currentPassword: PASSWORD });
    expect(own.statusCode).toBe(400);
    expect(own.body.message).toBe('That is already your email');

    const ownPhone = await same.call('start', { kind: 'phone', value: '012-345 6789', currentPassword: PASSWORD });
    expect(ownPhone.statusCode).toBe(400);
    expect(ownPhone.body.message).toBe('That is already your phone number');
    nothingIssued(same);

    const taken = setup({ taken: true });
    const byEmail = await taken.call('start', { kind: 'email', value: 'taken@x.my', currentPassword: PASSWORD });
    expect(byEmail.statusCode).toBe(409);
    expect(byEmail.body.message).toBe('That email is already used by another account');
    const byPhone = await taken.call('start', { kind: 'phone', value: '+60199999999', currentPassword: PASSWORD });
    expect(byPhone.statusCode).toBe(409);
    expect(byPhone.body.message).toBe('That phone number is already used by another account');
    nothingIssued(taken);
  });
});

describe('POST /auth/contact-change/start — the code goes to the NEW contact ONLY', () => {
  it('email: delivered to the new address, with the old email and old phone nowhere in the send', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'email', value: 'New@Example.MY', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Code sent');
    expect(ctx.comparePassword).toHaveBeenCalledWith(PASSWORD, 'hash:old-password');
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ phone: null, email: 'new@example.my', purpose: 'contact_change_new' }),
    );

    // ⚠️ The whole point of the 21 Sep decision, asserted as absence.
    const sent = JSON.stringify(ctx.deliver.mock.calls[0][0]);
    expect(sent).not.toContain(OLD_EMAIL);
    expect(sent).not.toContain('60123456789');

    expect(res.body.data).toMatchObject({
      requestId: expect.any(String),
      expiresInSec: 600,
      resendAfterSec: 60,
      pendingInvitesToCurrentEmail: 2,
    });
    expect(res.body.data.sentTo.map((d: { channel: string }) => d.channel)).toEqual(['email']);

    const row = ctx.codes.rows.get(res.body.data.requestId)!;
    expect(row).toMatchObject({
      purpose: 'contact_change_new',
      status: 'pending',
      channel: 'email',
      createdBy: 'user-1',
      updatedBy: 'user-1',
      // Anchored to the ACCOUNT's phone, not to the value being changed to.
      phoneNum: '60123456789',
    });
    expect(row.codeHash).toBe(hashBoundCode(deliveredCode(ctx.deliver), 'user-1', 'email', 'new@example.my'));
    expect(row.expiresAt.getTime()).toBe(NOW + NEW_CONTACT_CODE_TTL_SEC * 1000);
  });

  it('phone: WhatsApp + SMS to the new number only, and no invite count is even asked for', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'phone', value: '0198765432', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+60198765432', email: null, purpose: 'contact_change_new' }),
    );
    const sent = JSON.stringify(ctx.deliver.mock.calls[0][0]);
    expect(sent).not.toContain(OLD_EMAIL);
    expect(sent).not.toContain('60123456789');

    expect(res.body.data.sentTo.map((d: { channel: string }) => d.channel)).toEqual(['whatsapp', 'sms']);
    expect(res.body.data.pendingInvitesToCurrentEmail).toBe(0);
    expect(ctx.countPendingInvites).not.toHaveBeenCalled();
    expect(ctx.codes.rows.get(res.body.data.requestId)!.channel).toBe('whatsapp,sms');
  });

  it('429 with retryAfterSec inside the 60 s cooldown', async () => {
    const ctx = setup();
    await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });
    ctx.advance(20_000);
    const again = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });

    expect(again.statusCode).toBe(429);
    expect(again.body.data).toEqual({ retryAfterSec: 40 });
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('503 and an expired row when the code reached no channel', async () => {
    const ctx = setup({ deliverOk: false });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });

    expect(res.statusCode).toBe(503);
    expect(res.body.message).toBe('Could not send the code — try again later');
    expect([...ctx.codes.rows.values()][0].status).toBe('expired');
  });
});

describe('POST /auth/contact-change/resend', () => {
  it('needs NO password, answers a NEW requestId, and expires the older row', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    ctx.comparePassword.mockClear();
    ctx.advance(61_000);

    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });

    expect(res.statusCode).toBe(200);
    // ⚠️ A NEW id: the client must replace the one it holds.
    const fresh = res.body.data.requestId as string;
    expect(fresh).not.toBe(requestId);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('expired');
    expect(ctx.codes.rows.get(fresh)!.status).toBe('pending');
    expect(ctx.comparePassword).not.toHaveBeenCalled();

    expect(res.body.data).toMatchObject({
      expiresInSec: 600,
      resendAfterSec: 60,
      pendingInvitesToCurrentEmail: 0,
    });
    expect(ctx.deliver).toHaveBeenCalledTimes(2);
    expect(ctx.deliver).toHaveBeenLastCalledWith(expect.objectContaining({ phone: null, email: 'new@x.my' }));

    // The second code is bound the same way, so it confirms on the NEW row.
    expect(ctx.codes.rows.get(fresh)!.codeHash).toBe(
      hashBoundCode(deliveredCode(ctx.deliver, 1), 'user-1', 'email', 'new@x.my'),
    );
  });

  it('honours the 60 s cooldown', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });

    expect(res.statusCode).toBe(429);
    expect(res.body.data).toEqual({ retryAfterSec: 60 });
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('an EXPIRED row is CODE_EXPIRED', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    ctx.advance(NEW_CONTACT_CODE_TTL_SEC * 1000 + 1_000);

    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
    expect(res.body.message).toBe('This code has expired — request a new one');
  });

  it('a FOREIGN row — created by another account — is CODE_EXPIRED, and sends nothing', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    ctx.codes.rows.get(requestId)!.createdBy = 'someone-else';
    ctx.advance(61_000);

    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('a CONSUMED row is CODE_EXPIRED — a spent change cannot be resent', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    expect((await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code })).statusCode).toBe(200);
    ctx.advance(61_000);

    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
  });

  it('an unknown request id is CODE_EXPIRED, not 404 or 500', async () => {
    const ctx = setup();
    await startChange(ctx, 'email', 'new@x.my');
    const res = await ctx.call('resend', {
      kind: 'email',
      value: 'new@x.my',
      requestId: '11111111-2222-4333-8444-555555555555',
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
  });

  it('401 without an authenticated user', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    const res = await ctx.callAnonymous('resend', { kind: 'email', value: 'new@x.my', requestId });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /auth/contact-change/confirm', () => {
  it('writes the email, re-issues tokens keyed on it — and fires NO NOTICE at all', async () => {
    const ctx = setup({ bearer: { loginMethod: 'email', loginCriteria: OLD_EMAIL } });
    const { requestId, code } = await startChange(ctx, 'email', 'New@X.my');

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Email updated');
    expect(res.body.data).toEqual({
      accessToken: 'access:email:new@x.my',
      refreshToken: 'refresh:email:new@x.my',
      email: 'new@x.my',
      phoneNum: OLD_PHONE,
    });

    const applied = ctx.accounts.applyContactChange.mock.calls[0][0];
    expect(applied).toMatchObject({ rowId: requestId, userId: 'user-1', kind: 'email', value: 'new@x.my' });
    expect(applied).not.toHaveProperty('identityRowId');
    expect(applied.cutoff.getTime() % 1000).toBe(0);
    expect(applied.cutoff.getTime()).toBe(Math.floor(NOW / 1000) * 1000);

    // ⚠️ THE 21 SEP DECISION: the old email and old phone are told NOTHING.
    expect(firedNotices(ctx.notices)).toBe(0);
    expect(ctx.notices.passwordChanged).not.toHaveBeenCalled();
    // And no second delivery went anywhere either.
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('an email change by a PHONE-signed-in caller keeps the phone-keyed token', async () => {
    const ctx = setup({ bearer: { loginMethod: 'phone', loginCriteria: OLD_PHONE } });
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBe('access:phone:+60123456789');
    expect(res.body.data.refreshToken).toBe('refresh:phone:+60123456789');
  });

  it('a phone change writes the stored form and re-keys the token — still no notice', async () => {
    const ctx = setup({ bearer: { loginMethod: 'phone', loginCriteria: OLD_PHONE } });
    const { requestId, code } = await startChange(ctx, 'phone', '0198765432');

    const res = await ctx.call('confirm', { kind: 'phone', value: '+60 19-876 5432', requestId, code });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Phone number updated');
    expect(res.body.data.accessToken).toBe('access:phone:+60198765432');
    expect(res.body.data.phoneNum).toBe('+60198765432');
    expect(firedNotices(ctx.notices)).toBe(0);
  });

  it('a wrong code is 400 and counts; the change is not applied', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const wrong = code === '000000' ? '111111' : '000000';

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code: wrong });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid code');
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(1);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });

  it('the FIFTH wrong code is 429 and the row is spent', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const wrong = code === '000000' ? '111111' : '000000';
    const body = { kind: 'email', value: 'new@x.my', requestId, code: wrong };

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const res = await ctx.call('confirm', body);
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Invalid code');
    }
    const fifth = await ctx.call('confirm', body);
    expect(fifth.statusCode).toBe(429);
    expect(fifth.body.message).toBe('Too many attempts — request a new code');
    expect(ctx.codes.rows.get(requestId)!.status).toBe('expired');

    // And the RIGHT code no longer works on that row.
    const after = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(after.statusCode).toBe(400);
    expect(after.body.message).toBe(CODE_EXPIRED);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });

  it('the right code for a DIFFERENT value is refused — the code is bound to the value', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const res = await ctx.call('confirm', { kind: 'email', value: 'other@x.my', requestId, code });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid code');
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });

  it('refuses a row whose phone anchor moved under it', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    ctx.codes.rows.get(requestId)!.phoneNum = '60111111111';

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CODE_EXPIRED);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });

  it('409 when the value was taken just before confirm', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    ctx.accounts.isContactTaken.mockResolvedValueOnce(true);

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email is already used by another account');
  });

  it('409 when the transaction itself finds the value taken', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    ctx.accounts.applyContactChange.mockResolvedValueOnce({ status: 'taken' } as never);

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email is already used by another account');
  });

  it('reports a race lost inside the transaction as 409 "already used"', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    ctx.accounts.applyContactChange.mockResolvedValueOnce({ status: 'already_used' } as never);

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(CODE_ALREADY_USED);
  });

  it('a second confirm with the same code is refused', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const body = { kind: 'email', value: 'new@x.my', requestId, code };

    expect((await ctx.call('confirm', body)).statusCode).toBe(200);
    const again = await ctx.call('confirm', body);
    expect(again.statusCode).toBe(400);
    expect(again.body.message).toBe(CODE_EXPIRED);
    expect(ctx.accounts.applyContactChange).toHaveBeenCalledTimes(1);
  });

  it('still answers 200 when the tokens cannot be re-issued — the contact IS changed', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    ctx.jwt.verifyToken.mockImplementationOnce(() => {
      throw new Error('bad token');
    });

    const res = await ctx.call('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ accessToken: null, refreshToken: null, email: 'new@x.my' });
    expect(ctx.currentUser().email).toBe('new@x.my');
  });

  it('401 without an authenticated user', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const res = await ctx.callAnonymous('confirm', { kind: 'email', value: 'new@x.my', requestId, code });
    expect(res.statusCode).toBe(401);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });
});

/**
 * `getUserById` answers null when its QUERY fails. authenticateJWT has already
 * resolved this account, so that null is a server fault: 500, never the 401
 * that signs a web user out — and never after spending a correct code.
 */
describe('a failed account re-read is 500, never 401', () => {
  it('start: 500, nothing sent', async () => {
    const ctx = setup();
    ctx.users.getUserById.mockResolvedValueOnce(null);
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my', currentPassword: PASSWORD });
    expect(res.statusCode).toBe(500);
    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('resend: 500, and the live row is left alone', async () => {
    const ctx = setup();
    const { requestId } = await startChange(ctx, 'email', 'new@x.my');
    ctx.advance(61_000);
    ctx.users.getUserById.mockResolvedValueOnce(null);

    const res = await ctx.call('resend', { kind: 'email', value: 'new@x.my', requestId });
    expect(res.statusCode).toBe(500);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('pending');
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  it('confirm: 500 with nothing applied, and the same code then confirms', async () => {
    const ctx = setup();
    const { requestId, code } = await startChange(ctx, 'email', 'new@x.my');
    const body = { kind: 'email', value: 'new@x.my', requestId, code };

    ctx.users.getUserById.mockResolvedValueOnce(null);
    const failed = await ctx.call('confirm', body);
    expect(failed.statusCode).toBe(500);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
    expect(ctx.codes.rows.get(requestId)!.status).toBe('pending');
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(0);

    const retried = await ctx.call('confirm', body);
    expect(retried.statusCode).toBe(200);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
