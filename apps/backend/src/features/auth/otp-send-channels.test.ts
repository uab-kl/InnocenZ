import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/db/index', () => ({ db: {} }));
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

import type { Request, Response } from 'express';
import type { UserType } from '@/features/user/user.model';
import type { DeliverCodeInput } from '@/features/account-code/delivery';
import { OtpControllerClass, OtpSendSchema } from './otp.controller';

/**
 * SIGN-UP PHONE VERIFICATION GAINS THE EMAIL CHANNEL (owner, 21 Sep 2026:
 * "all … need send whatapps otp and the email, sms message if got also need,
 * and must be the same otp").
 *
 * `POST /auth/otp/send` is PUBLIC and unauthenticated, so the tests below are
 * as much about WHOSE address the code goes to as about whether it goes:
 *
 *  • `signup` mails the address in the BODY — the person is standing in front
 *    of the wizard that typed it — but never one that already has an account.
 *  • `forgot_password` IGNORES the body's email and mails the ACCOUNT's, so
 *    nothing a caller types can make the server write to a stranger.
 */

const NOW = Date.parse('2026-09-21T10:00:00.000Z');

function fakeUser(overrides: Partial<UserType> = {}): UserType {
  return {
    id: 'user-1',
    email: 'owner@atlas-agency.my',
    phoneNum: '+60123456789',
    profileImage: null,
    username: 'Owner',
    memberCode: 'INNUSR0001',
    passwordHash: 'hash:old-password',
    status: 'active',
    preferredLocale: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    blockedReason: null,
    sessionsValidFrom: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  } as UserType;
}

type FakeRes = Response & { statusCode: number; body: { success: boolean; message: string; data: any } };

function fakeRes(): FakeRes {
  const res = {
    statusCode: 0,
    body: null as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      res.body = payload;
      return res;
    },
  };
  return res as unknown as FakeRes;
}

function setup(options: { byLoginMethod?: (method: 'email' | 'phone') => UserType | null } = {}) {
  const rows = new Map<string, Record<string, unknown>>();
  let seq = 0;
  const phoneVerificationRepository = {
    findActivePending: vi.fn(async () => null),
    expirePendingForPhone: vi.fn(async () => {}),
    create: vi.fn(async (data: Record<string, unknown>) => {
      seq += 1;
      const row = { id: `row-${seq}`, ...data };
      rows.set(row.id, row);
      return row;
    }),
    update: vi.fn(async (id: string, data: Record<string, unknown>) => {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, data);
      return row;
    }),
  };
  const userRepository = {
    getUserByLoginMethod: vi.fn(async (method: 'email' | 'phone') =>
      options.byLoginMethod ? options.byLoginMethod(method) : null,
    ),
  };
  /** Reports every destination it was handed as sent — see fakes.test-support. */
  const deliver = vi.fn(async (input: DeliverCodeInput) => {
    const sentTo: Array<{ channel: string; to: string; status: 'sent' }> = [];
    if (input.phone) {
      sentTo.push({ channel: 'whatsapp', to: `phone:${input.phone}`, status: 'sent' });
      sentTo.push({ channel: 'sms', to: `phone:${input.phone}`, status: 'sent' });
    }
    if (input.email) sentTo.push({ channel: 'email', to: `email:${input.email}`, status: 'sent' });
    return { sentTo, ok: sentTo.length > 0, waMessageId: null } as never;
  });

  const controller = new OtpControllerClass(
    phoneVerificationRepository as never,
    userRepository as never,
    deliver as never,
  );

  const send = async (body: unknown) => {
    const res = fakeRes();
    await controller.send({ body } as unknown as Request, res);
    return res;
  };

  return { controller, send, deliver, rows, phoneVerificationRepository, userRepository };
}

/** The destinations `deliver` was handed on call `n`. */
function delivered(deliver: ReturnType<typeof setup>['deliver'], n = 0) {
  return deliver.mock.calls[n]?.[0] as DeliverCodeInput;
}

describe('POST /auth/otp/send — the optional email channel', () => {
  it('sends the SAME code to WhatsApp/SMS and to the email in the body', async () => {
    const ctx = setup();
    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'new.signup@x.my',
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    const sent = delivered(ctx.deliver);
    // ONE code object — the phone and the email are two destinations of it,
    // not two codes. That is the owner's "must be the same otp".
    expect(sent.phone).toBe('60123456789');
    expect(sent.email).toBe('new.signup@x.my');
    expect(sent.purpose).toBe('signup');
    expect(sent.code).toMatch(/^\d{6}$/);

    // The row records what it will actually be tried on, not 'whatsapp'.
    const row = [...ctx.rows.values()][0];
    expect(row.channel).toBe('whatsapp,sms,email');
    expect(res.body.data.sentTo).toHaveLength(3);
  });

  it('WITHOUT an email it still sends on WhatsApp, exactly as before', async () => {
    const ctx = setup();
    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup' });

    expect(res.statusCode).toBe(200);
    const sent = delivered(ctx.deliver);
    expect(sent.phone).toBe('60123456789');
    expect(sent.email).toBeNull();
    expect([...ctx.rows.values()][0].channel).toBe('whatsapp,sms');
  });

  it('an EMPTY email string is absent, not invalid — the wizard sends every key', async () => {
    const ctx = setup();
    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup', email: '   ' });

    expect(res.statusCode).toBe(200);
    expect(delivered(ctx.deliver).email).toBeNull();
  });

  it('a malformed email is 400 and nothing is sent', async () => {
    const ctx = setup();
    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup', email: 'not-an-email' });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Enter a valid email address');
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });

  it('normalises the email to lowercase, so the code and the budget share one spelling', () => {
    const parsed = OtpSendSchema.parse({ phoneNum: '60123456789', email: '  Owner@X.MY ' });
    expect(parsed.email).toBe('owner@x.my');
  });

  it('now honours a delivery that reached NO channel — 503, and the row expired', async () => {
    const ctx = setup();
    ctx.deliver.mockResolvedValueOnce({ sentTo: [], ok: false, waMessageId: null } as never);

    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup' });

    expect(res.statusCode).toBe(503);
    // A code that reached nobody must not look like a code on its way.
    expect([...ctx.rows.values()][0].status).toBe('expired');
  });
});

/**
 * THE OPEN-RELAY BOUNDARY. This endpoint takes a phone number and now an email
 * from anybody, so these two tests are the ones that say the server cannot be
 * aimed at a stranger's inbox.
 */
describe('POST /auth/otp/send — whose address the code may reach', () => {
  it('REFUSES a sign-up code to an email that already has an account', async () => {
    const ctx = setup({
      // No account on the phone; one on the email.
      byLoginMethod: (method) => (method === 'email' ? fakeUser() : null),
    });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'owner@atlas-agency.my',
    });

    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe('That email already has an account');
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });

  it('forgot_password IGNORES the body email and mails the ACCOUNT’s address', async () => {
    const ctx = setup({ byLoginMethod: () => fakeUser() });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'forgot_password',
      // An address the caller typed. It must go NOWHERE.
      email: 'attacker@evil.example',
    });

    expect(res.statusCode).toBe(200);
    const sent = delivered(ctx.deliver);
    expect(sent.email).toBe('owner@atlas-agency.my');
    expect(sent.email).not.toBe('attacker@evil.example');
    expect(sent.name).toBe('Owner');
  });

  it('an unknown number still answers the neutral 200 and sends nothing at all', async () => {
    const ctx = setup({ byLoginMethod: () => null });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'forgot_password',
      email: 'attacker@evil.example',
    });

    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });
});
