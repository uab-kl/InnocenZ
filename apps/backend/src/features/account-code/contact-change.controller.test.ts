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

import { hashBoundCode, identityProofHash } from './code';
import {
  CHANGE_EXPIRED,
  CODE_ALREADY_USED,
  ContactChangeControllerClass,
  NEW_CODE_EXPIRED,
} from './contact-change.controller';
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

type LoginMethod = 'email' | 'phone';

function setup(options: {
  user?: ReturnType<typeof fakeUser>;
  bearer?: { loginMethod: LoginMethod; loginCriteria: string };
  taken?: boolean;
  deliverOk?: boolean;
} = {}) {
  let user = options.user ?? fakeUser();
  const bearer = options.bearer ?? { loginMethod: 'email' as const, loginCriteria: user.email! };
  const codes = fakeCodeStore();
  const deliver = fakeDeliver(options.deliverOk ?? true);
  const notices = fakeNotices();
  let now = NOW;
  const users = {
    getUserByLoginMethod: vi.fn(async () => user),
    getUserById: vi.fn(async (id: string) => (user.id === id ? user : null)),
  };
  const accounts = {
    completePasswordReset: vi.fn(),
    isContactTaken: vi.fn(async () => Boolean(options.taken)),
    applyContactChange: vi.fn(
      async (input: { identityRowId: string; newRowId: string; kind: LoginMethod; value: string; cutoff: Date }) => {
        const newRow = codes.rows.get(input.newRowId)!;
        const identity = codes.rows.get(input.identityRowId)!;
        if (newRow.status !== 'pending' || identity.status !== 'verified') {
          return { status: 'already_used' as const };
        }
        newRow.status = 'consumed';
        identity.status = 'consumed';
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
    generateAccessToken: vi.fn((info: { loginMethod: string; loginCriteria: string }) => `access:${info.loginMethod}:${info.loginCriteria}`),
    generateRefreshToken: vi.fn((info: { loginMethod: string; loginCriteria: string }) => `refresh:${info.loginMethod}:${info.loginCriteria}`),
  };
  const controller = new ContactChangeControllerClass({
    users,
    codes,
    accounts: accounts as never,
    deliver,
    notices,
    hashPassword: async (pw: string) => `hash:${pw}`,
    now: () => now,
    jwt: jwt as never,
    countPendingInvites: vi.fn(async () => 2),
  });

  const call = async (method: 'start' | 'verifyIdentity' | 'resendNew' | 'confirm', body: unknown) => {
    const res = fakeRes();
    await controller[method](fakeReq(body, user, 'bearer-token'), res);
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
    call,
    currentUser: () => user,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

/** Walk start → verify-identity for a change, returning both codes' ids. */
async function throughIdentity(ctx: ReturnType<typeof setup>, kind: LoginMethod, value: string) {
  const started = await ctx.call('start', { kind, value });
  expect(started.statusCode).toBe(200);
  const requestId = started.body.data.requestId as string;
  const identityCode = deliveredCode(ctx.deliver, 0);
  const verified = await ctx.call('verifyIdentity', { requestId, kind, value, code: identityCode });
  expect(verified.statusCode).toBe(200);
  return {
    requestId,
    newRequestId: verified.body.data.newRequestId as string,
    newCode: deliveredCode(ctx.deliver, 1),
    started,
    verified,
  };
}

describe('POST /auth/contact-change/start', () => {
  it('sends the identity code to the CURRENT contacts — never to the new value', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'email', value: 'New@Example.MY' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Code sent');
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    const delivery = ctx.deliver.mock.calls[0][0] as { phone?: string; email?: string; purpose: string };
    expect(delivery.purpose).toBe('contact_change_identity');
    expect(delivery.email).toBe('owner@atlas-agency.my');
    expect(delivery.phone).toBe('+60123456789');
    expect(JSON.stringify(delivery)).not.toContain('new@example.my');

    expect(res.body.data).toMatchObject({
      requestId: expect.any(String),
      expiresInSec: 300,
      resendAfterSec: 60,
      pendingInvitesToCurrentEmail: 2,
    });
    expect(res.body.data.sentTo.map((d: { channel: string }) => d.channel)).toEqual(['whatsapp', 'sms', 'email']);

    const row = ctx.codes.rows.get(res.body.data.requestId)!;
    expect(row.codeHash).toBe(
      hashBoundCode(deliveredCode(ctx.deliver), 'user-1', 'email', 'new@example.my'),
    );
    expect(row).toMatchObject({ purpose: 'contact_change_identity', createdBy: 'user-1', phoneNum: '60123456789' });
  });

  it('400 when the value is already the caller’s email (any case)', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'email', value: ' OWNER@atlas-agency.my ' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('That is already your email');
    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('400 when the value is already the caller’s phone, in another written form', async () => {
    const ctx = setup();
    const res = await ctx.call('start', { kind: 'phone', value: '012-345 6789' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('That is already your phone number');
  });

  it('409 when another account already uses it', async () => {
    const ctx = setup({ taken: true });
    const email = await ctx.call('start', { kind: 'email', value: 'taken@x.my' });
    expect(email.statusCode).toBe(409);
    expect(email.body.message).toBe('That email is already used by another account');
    const phone = await ctx.call('start', { kind: 'phone', value: '+60199999999' });
    expect(phone.statusCode).toBe(409);
    expect(phone.body.message).toBe('That phone number is already used by another account');
    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('422 when the account has no usable phone or email', async () => {
    const ctx = setup({ user: fakeUser({ email: null, phoneNum: null }) });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    expect(res.statusCode).toBe(422);
  });

  it('429 with retryAfterSec inside the resend cooldown', async () => {
    const ctx = setup();
    await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    ctx.advance(20_000);
    const again = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    expect(again.statusCode).toBe(429);
    expect(again.body.data).toEqual({ retryAfterSec: 40 });
  });

  it('503 and an expired row when the code reached no channel', async () => {
    const ctx = setup({ deliverOk: false });
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    expect(res.statusCode).toBe(503);
    expect(res.body.message).toBe('Could not send the code — try again later');
    expect([...ctx.codes.rows.values()][0].status).toBe('expired');
  });
});

describe('POST /auth/contact-change/verify-identity', () => {
  it('sends the second code to the NEW contact only, bound to the identity row', async () => {
    const ctx = setup();
    const { requestId, newRequestId, verified } = await throughIdentity(ctx, 'phone', '0198765432');

    const second = ctx.deliver.mock.calls[1][0] as { phone?: string | null; email?: string | null; purpose: string };
    expect(second.purpose).toBe('contact_change_new');
    expect(second.phone).toBe('+60198765432');
    expect(second.email).toBeNull();
    expect(verified.body.data).toMatchObject({ newRequestId, expiresInSec: 600, resendAfterSec: 60 });

    const identity = ctx.codes.rows.get(requestId)!;
    expect(identity.status).toBe('verified');
    expect(identity.codeHash).toBe(identityProofHash('user-1', 'phone', '+60198765432'));
    const newRow = ctx.codes.rows.get(newRequestId)!;
    expect(newRow.codeHash).toBe(
      hashBoundCode(deliveredCode(ctx.deliver, 1), 'user-1', 'phone', '+60198765432', requestId),
    );
    expect(newRow.phoneNum).toBe(identity.phoneNum);
  });

  it('a wrong code is 400, never 401, and counts', async () => {
    const ctx = setup();
    const started = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    const code = deliveredCode(ctx.deliver);
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await ctx.call('verifyIdentity', {
      requestId: started.body.data.requestId,
      kind: 'email',
      value: 'new@x.my',
      code: wrong,
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid code');
    expect(ctx.codes.rows.get(started.body.data.requestId)!.attempts).toBe(1);
  });

  it('the RIGHT code for a DIFFERENT value is refused like a wrong code', async () => {
    const ctx = setup();
    const started = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    const res = await ctx.call('verifyIdentity', {
      requestId: started.body.data.requestId,
      kind: 'email',
      value: 'attacker@x.my',
      code: deliveredCode(ctx.deliver),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid code');
  });

  it('409 when the value was taken between start and verify', async () => {
    const ctx = setup();
    const started = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    ctx.accounts.isContactTaken.mockResolvedValueOnce(true);
    const res = await ctx.call('verifyIdentity', {
      requestId: started.body.data.requestId,
      kind: 'email',
      value: 'new@x.my',
      code: deliveredCode(ctx.deliver),
    });
    expect(res.statusCode).toBe(409);
  });

  it('an expired identity row is 400 "start again"', async () => {
    const ctx = setup();
    const started = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    ctx.advance(301_000);
    const res = await ctx.call('verifyIdentity', {
      requestId: started.body.data.requestId,
      kind: 'email',
      value: 'new@x.my',
      code: deliveredCode(ctx.deliver),
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CHANGE_EXPIRED);
  });
});

describe('POST /auth/contact-change/confirm', () => {
  it('email change by an EMAIL-signed-in caller: new tokens keyed on the NEW email', async () => {
    const ctx = setup({ bearer: { loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' } });
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'New@X.my');

    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Email updated');
    expect(res.body.data).toEqual({
      accessToken: 'access:email:new@x.my',
      refreshToken: 'refresh:email:new@x.my',
      email: 'new@x.my',
      phoneNum: '+60123456789',
    });
    const applied = ctx.accounts.applyContactChange.mock.calls[0][0];
    expect(applied).toMatchObject({ identityRowId: requestId, newRowId: newRequestId, userId: 'user-1', kind: 'email', value: 'new@x.my' });
    expect(applied.cutoff.getTime() % 1000).toBe(0);
    expect(ctx.notices.emailChanged).toHaveBeenCalledWith({
      oldEmail: 'owner@atlas-agency.my',
      newEmail: 'new@x.my',
      name: 'Owner',
    });
  });

  it('email change by a PHONE-signed-in caller keeps the phone-keyed token', async () => {
    const ctx = setup({ bearer: { loginMethod: 'phone', loginCriteria: '+60123456789' } });
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.accessToken).toBe('access:phone:+60123456789');
    expect(res.body.data.refreshToken).toBe('refresh:phone:+60123456789');
  });

  it('phone change by a PHONE-signed-in caller: tokens keyed on the new stored phone, old contacts notified', async () => {
    const ctx = setup({ bearer: { loginMethod: 'phone', loginCriteria: '+60123456789' } });
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'phone', '0198765432');
    const res = await ctx.call('confirm', {
      requestId,
      newRequestId,
      kind: 'phone',
      value: '+60 19-876 5432',
      code: newCode,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Phone number updated');
    expect(res.body.data.accessToken).toBe('access:phone:+60198765432');
    expect(res.body.data.phoneNum).toBe('+60198765432');
    expect(ctx.notices.phoneChanged).toHaveBeenCalledWith({
      oldPhone: '+60123456789',
      email: 'owner@atlas-agency.my',
      newPhone: '+60198765432',
      name: 'Owner',
    });
  });

  it('a wrong code is 400, and the change is not applied', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    const wrong = newCode === '000000' ? '111111' : '000000';
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: wrong });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Invalid code');
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();
  });

  it('the right new code for a different value is refused — the identity proof names the value', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'other@x.my', code: newCode });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CHANGE_EXPIRED);
  });

  it('409 when the value was taken just before confirm', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.accounts.isContactTaken.mockResolvedValueOnce(true);
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(409);
  });

  it('409 when the transaction finds the unique index taken', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.accounts.applyContactChange.mockResolvedValueOnce({ status: 'taken' } as never);
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email is already used by another account');
  });

  it('a second confirm with the same code is refused', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    const body = { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode };
    expect((await ctx.call('confirm', body)).statusCode).toBe(200);
    const again = await ctx.call('confirm', body);
    expect(again.statusCode).toBe(400);
  });

  it('refuses an identity verified more than 15 minutes ago', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.advance(15 * 60_000 + 1_000);
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CHANGE_EXPIRED);
  });

  it('refuses a new-contact row whose phone anchor differs from the identity row', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.codes.rows.get(newRequestId)!.phoneNum = '60111111111';
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(NEW_CODE_EXPIRED);
  });

  it('reports a race lost inside the transaction as 409 "already used"', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.accounts.applyContactChange.mockResolvedValueOnce({ status: 'already_used' } as never);
    const res = await ctx.call('confirm', { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode });
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(CODE_ALREADY_USED);
  });
});

describe('POST /auth/contact-change/resend-new', () => {
  it('honours the 60 s cooldown, then issues a fresh code and expires the older one', async () => {
    const ctx = setup();
    const { requestId, newRequestId } = await throughIdentity(ctx, 'email', 'new@x.my');

    const tooSoon = await ctx.call('resendNew', { requestId, kind: 'email', value: 'new@x.my' });
    expect(tooSoon.statusCode).toBe(429);

    ctx.advance(61_000);
    // The fake store stamps createdAt at NOW; move the first row back so the
    // cooldown is measured the way the database would.
    ctx.codes.rows.get(newRequestId)!.createdAt = new Date(NOW - 61_000);
    const res = await ctx.call('resendNew', { requestId, kind: 'email', value: 'new@x.my' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data.newRequestId).not.toBe(newRequestId);
    expect(ctx.codes.rows.get(newRequestId)!.status).toBe('expired');
    const third = ctx.deliver.mock.calls[2][0] as { email?: string | null; phone?: string | null };
    expect(third.email).toBe('new@x.my');
    expect(third.phone).toBeNull();
  });

  it('refuses an identity approved for a different value', async () => {
    const ctx = setup();
    const { requestId } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.advance(61_000);
    const res = await ctx.call('resendNew', { requestId, kind: 'email', value: 'attacker@x.my' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe(CHANGE_EXPIRED);
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
    const res = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    expect(res.statusCode).toBe(500);
    expect(ctx.deliver).not.toHaveBeenCalled();
  });

  it('verify-identity: 500 BEFORE the code is spent, so the same correct code works on retry', async () => {
    const ctx = setup();
    const started = await ctx.call('start', { kind: 'email', value: 'new@x.my' });
    const requestId = started.body.data.requestId as string;
    const body = { requestId, kind: 'email', value: 'new@x.my', code: deliveredCode(ctx.deliver) };

    ctx.users.getUserById.mockResolvedValueOnce(null);
    const failed = await ctx.call('verifyIdentity', body);
    expect(failed.statusCode).toBe(500);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('pending');
    expect(ctx.codes.rows.get(requestId)!.attempts).toBe(0);

    const retried = await ctx.call('verifyIdentity', body);
    expect(retried.statusCode).toBe(200);
    expect(ctx.codes.rows.get(requestId)!.status).toBe('verified');
  });

  it('resend-new: 500', async () => {
    const ctx = setup();
    const { requestId, newRequestId } = await throughIdentity(ctx, 'email', 'new@x.my');
    ctx.advance(61_000);
    ctx.codes.rows.get(newRequestId)!.createdAt = new Date(NOW - 61_000);
    ctx.users.getUserById.mockResolvedValueOnce(null);
    const res = await ctx.call('resendNew', { requestId, kind: 'email', value: 'new@x.my' });
    expect(res.statusCode).toBe(500);
  });

  it('confirm: 500 with nothing applied, and the same code then confirms', async () => {
    const ctx = setup();
    const { requestId, newRequestId, newCode } = await throughIdentity(ctx, 'email', 'new@x.my');
    const body = { requestId, newRequestId, kind: 'email', value: 'new@x.my', code: newCode };

    ctx.users.getUserById.mockResolvedValueOnce(null);
    const failed = await ctx.call('confirm', body);
    expect(failed.statusCode).toBe(500);
    expect(ctx.accounts.applyContactChange).not.toHaveBeenCalled();

    const retried = await ctx.call('confirm', body);
    expect(retried.statusCode).toBe(200);
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});
