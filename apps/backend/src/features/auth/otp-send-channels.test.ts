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

import type { DeliverCodeInput } from '@/features/account-code/delivery';
import { OtpSendSchema } from './otp.controller';
import { delivered, fakeUser, setup } from './otp-send.test-support';

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
 *
 * ⚠️ Since 29 Sep 2026 a reset is ANSWERED FIRST and its code minted and sent
 * afterwards (otp-send-timing.test.ts). The fakes collect that work instead of
 * running it, so every reset case below calls `settle()` before it looks at a
 * row or a delivery — without it a "nothing was sent" would pass vacuously.
 */

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
    // The ANSWER does not say where it went — see `otpSendAnswer`.
    expect(res.body).toEqual({
      success: true,
      message: 'OTP sent',
      data: { expiresInSec: 600, resendAfterSec: 60 },
    });
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
  it('NEVER mails a sign-up code to an email that already has an account', async () => {
    const ctx = setup({
      // No account on the phone; one on the email.
      byLoginMethod: (method) => (method === 'email' ? fakeUser() : null),
    });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'owner@atlas-agency.my',
    });

    expect(res.statusCode).toBe(200);
    const sent = delivered(ctx.deliver);
    // The phone being verified still gets its code; the registered inbox does not.
    expect(sent.phone).toBe('60123456789');
    expect(sent.email).toBeNull();
    expect([...ctx.rows.values()][0].channel).toBe('whatsapp,sms');
  });

  /**
   * THE 28 SEP AUDIT: this public route told a stranger which EMAILS have
   * accounts ("That email already has an account"). A taken address and a free
   * one must now be indistinguishable from the answer alone.
   */
  it('answers a registered email EXACTLY as it answers a free one', async () => {
    const taken = setup({ byLoginMethod: (method) => (method === 'email' ? fakeUser() : null) });
    const free = setup({ byLoginMethod: () => null });
    const body = { phoneNum: '+60123456789', purpose: 'signup', email: 'owner@atlas-agency.my' };

    const a = await taken.send(body);
    const b = await free.send(body);

    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toEqual(b.body);
    expect(JSON.stringify(a.body)).not.toMatch(/email|account/i);
  });

  it('forgot_password IGNORES the body email and mails the ACCOUNT’s address', async () => {
    const ctx = setup({ byLoginMethod: () => fakeUser() });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'forgot_password',
      // An address the caller typed. It must go NOWHERE.
      email: 'attacker@evil.example',
    });
    await ctx.settle();

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
    // Not even after the answer.
    await ctx.settle();

    expect(res.statusCode).toBe(200);
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });

  it('forgot_password: a registered number and an unknown one get the SAME body', async () => {
    const known = setup({ byLoginMethod: () => fakeUser() });
    const unknown = setup({ byLoginMethod: () => null });

    const a = await known.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    const b = await unknown.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    await known.settle();
    await unknown.settle();

    expect(known.deliver).toHaveBeenCalledTimes(1);
    expect(unknown.deliver).not.toHaveBeenCalled();
    expect(a.statusCode).toBe(b.statusCode);
    // It used to carry `sentTo` for a real account only — the account's own
    // masked email included, shown to whoever typed the phone number.
    expect(a.body).toEqual(b.body);
  });

  it('forgot_password: a quick second request for a real number is not a tell-tale 429', async () => {
    const ctx = setup({ byLoginMethod: () => fakeUser() });
    ctx.phoneVerificationRepository.findActivePending.mockResolvedValueOnce({
      id: 'row-live',
      createdAt: new Date(),
    } as never);

    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    const unknown = await setup({ byLoginMethod: () => null }).send({
      phoneNum: '+60123456789',
      purpose: 'forgot_password',
    });
    await ctx.settle();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual(unknown.body);
    // The window WAS consulted — so the two lines below are not vacuous.
    expect(ctx.phoneVerificationRepository.findActivePending).toHaveBeenCalledTimes(1);
    // The code already on its way stays the valid one — nothing new is minted.
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });

  it('signup: a quick second request still says how long to wait (the person is at the wizard)', async () => {
    const ctx = setup();
    ctx.phoneVerificationRepository.findActivePending.mockResolvedValueOnce({
      id: 'row-live',
      createdAt: new Date(),
    } as never);

    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup' });

    expect(res.statusCode).toBe(429);
    expect(res.body.message).toMatch(/^Wait \d+s before requesting another code$/);
  });
});

/**
 * A ROSTER STUB (active, NO password) — Fix First, 28 Sep 2026.
 *
 * It is claimed by the invited PR signing up with its phone, never by a reset.
 * So `signup` sends to a stub's number (it is not "taken") but to the PHONE
 * ALONE: a code that also went to a typed inbox would let anyone who knows the
 * number verify it from their own mailbox and take the account over. And
 * `forgot_password` answers a stub exactly like a number nobody registered.
 */
describe('POST /auth/otp/send — a never-activated roster stub', () => {
  const stub = () => fakeUser({ passwordHash: null });

  it('signup: sends to the stub’s phone, and to the phone ALONE even when an email is typed', async () => {
    const ctx = setup({ byLoginMethod: (method) => (method === 'phone' ? stub() : null) });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'someone.else@x.my',
    });

    expect(res.statusCode).toBe(200);
    const sent = delivered(ctx.deliver);
    expect(sent.phone).toBe('60123456789');
    expect(sent.email).toBeNull();
    // The receipt records that it proves the phone alone — registerUser reads this.
    expect([...ctx.rows.values()][0].channel).toBe('whatsapp,sms');
    expect(res.body.data).toEqual({ expiresInSec: 600, resendAfterSec: 60 });
  });

  it('signup: the stub’s OWN email is not "taken" — but it is still not mailed', async () => {
    const ctx = setup({ byLoginMethod: () => stub() });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'owner@atlas-agency.my',
    });

    expect(res.statusCode).toBe(200);
    expect(delivered(ctx.deliver).email).toBeNull();
  });

  it('signup: an email held by ANOTHER account is never mailed — and the answer does not say so', async () => {
    const ctx = setup({
      byLoginMethod: (method) => (method === 'phone' ? stub() : fakeUser({ id: 'user-2' })),
    });

    const res = await ctx.send({
      phoneNum: '+60123456789',
      purpose: 'signup',
      email: 'owner@other.my',
    });

    expect(res.statusCode).toBe(200);
    expect(delivered(ctx.deliver).email).toBeNull();
    expect(res.body.message).toBe('OTP sent');
  });

  it('signup: an ACTIVATED account’s phone answers exactly like a free one — its code on the phone ALONE', async () => {
    // Owner, 29 Sep 2026 ("General message, both"): this was a 409 naming the
    // number, to anybody who typed it.
    const takenCtx = setup({ byLoginMethod: (method) => (method === 'phone' ? fakeUser() : null) });
    const freeCtx = setup({ byLoginMethod: () => null });
    const body = { phoneNum: '+60123456789', purpose: 'signup', email: 'typed@mail.my' };

    const taken = await takenCtx.send(body);
    const free = await freeCtx.send(body);

    expect(taken.statusCode).toBe(200);
    expect(taken.body).toEqual(free.body);
    // Only whoever holds the phone can read it — never the inbox that was typed.
    expect(delivered(takenCtx.deliver).email).toBeNull();
    expect(delivered(freeCtx.deliver).email).toBe('typed@mail.my');
  });

  it('forgot_password: a stub answers exactly like an unknown number — neutral 200, nothing sent', async () => {
    const stubCtx = setup({ byLoginMethod: () => stub() });
    const unknownCtx = setup({ byLoginMethod: () => null });

    const s = await stubCtx.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    const u = await unknownCtx.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    await stubCtx.settle();

    expect(s.statusCode).toBe(200);
    expect(s.body).toEqual(u.body);
    expect(stubCtx.deliver).not.toHaveBeenCalled();
    expect(stubCtx.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });
});

/**
 * 29 Sep 2026 follow-up: "`/auth/otp/send` answers 503 when WhatsApp and SMS
 * both fail, with the email dropped".
 *
 * The email is not a later fallback — it goes out BESIDE WhatsApp and SMS, so a
 * mailable address already carries the code when the phone channels fail. The
 * addresses the route drops are dropped on purpose (another account's inbox, a
 * stub claim, anything typed on a reset). What leaked was the ANSWER: with the
 * phone channels down, a 503 marked exactly the requests where an address had
 * been withheld — i.e. which addresses and numbers have accounts.
 */
describe('POST /auth/otp/send — when WhatsApp and SMS both fail', () => {
  /** WhatsApp and SMS refuse; the email channel, when handed an address, works. */
  const phoneChannelsDown = async (input: DeliverCodeInput) => {
    const sentTo = [
      { channel: 'whatsapp', to: 'phone', status: 'failed' },
      { channel: 'sms', to: 'phone', status: 'failed' },
      ...(input.email ? [{ channel: 'email', to: 'email', status: 'sent' }] : []),
    ];
    return { sentTo, ok: Boolean(input.email), waMessageId: null } as never;
  };
  const withPhoneDown = (ctx: ReturnType<typeof setup>) => {
    ctx.deliver.mockImplementation(phoneChannelsDown);
    return ctx;
  };
  const body = { phoneNum: '+60123456789', purpose: 'signup', email: 'owner@atlas-agency.my' };

  it('a mailable sign-up address still carries the code — the email IS the fallback', async () => {
    const ctx = withPhoneDown(setup());

    const res = await ctx.send(body);

    expect(res.statusCode).toBe(200);
    expect(delivered(ctx.deliver).email).toBe('owner@atlas-agency.my');
    expect([...ctx.rows.values()][0].status).toBe('pending');
  });

  it('an address held by ANOTHER account is still never mailed — and the answer is the free address’s', async () => {
    const taken = withPhoneDown(setup({ byLoginMethod: (m) => (m === 'email' ? fakeUser() : null) }));
    const free = withPhoneDown(setup({ byLoginMethod: () => null }));

    const a = await taken.send(body);
    const b = await free.send(body);

    expect(delivered(taken.deliver).email).toBeNull();
    // It used to be 503 here and 200 there: the oracle, back through an outage.
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toEqual(b.body);
    // Still pending, like the free twin's — so the 60 s resend wait answers alike.
    expect([...taken.rows.values()][0].status).toBe('pending');
  });

  it('a stub claim with a typed address answers as the free number does — the code went to the phone alone', async () => {
    const stubbed = withPhoneDown(
      setup({ byLoginMethod: (m) => (m === 'phone' ? fakeUser({ passwordHash: null }) : null) }),
    );
    const free = withPhoneDown(setup({ byLoginMethod: () => null }));

    const a = await stubbed.send({ ...body, email: 'someone.else@x.my' });
    const b = await free.send({ ...body, email: 'someone.else@x.my' });

    expect(delivered(stubbed.deliver).email).toBeNull();
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toEqual(b.body);
  });

  it('forgot_password: a registered number with no email on file answers like an unknown number', async () => {
    const known = withPhoneDown(setup({ byLoginMethod: () => fakeUser({ email: null }) }));
    const unknown = setup({ byLoginMethod: () => null });

    const a = await known.send({ phoneNum: '+60123456789', purpose: 'forgot_password', email: 'attacker@evil.example' });
    const b = await unknown.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    await known.settle();

    // The typed address is still NOT a fallback for a reset — that would hand
    // the code for somebody else's account to whoever typed their number.
    expect(delivered(known.deliver).email).toBeNull();
    expect(a.statusCode).toBe(200);
    expect(a.body).toEqual(b.body);
    // Nothing reached anyone, so nothing is left waiting to be verified.
    expect([...known.rows.values()][0].status).toBe('expired');
  });

  it('forgot_password: the ACCOUNT’s own email carries the reset when the phone channels fail', async () => {
    const ctx = withPhoneDown(setup({ byLoginMethod: () => fakeUser() }));

    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'forgot_password' });
    await ctx.settle();

    expect(res.statusCode).toBe(200);
    expect(delivered(ctx.deliver).email).toBe('owner@atlas-agency.my');
    expect([...ctx.rows.values()][0].status).toBe('pending');
  });

  it('with NO address to hide, a send that reached nobody is still the honest 503', async () => {
    const ctx = withPhoneDown(setup());

    const res = await ctx.send({ phoneNum: '+60123456789', purpose: 'signup' });

    expect(res.statusCode).toBe(503);
    expect([...ctx.rows.values()][0].status).toBe('expired');
  });
});
