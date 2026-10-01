import { beforeEach, describe, expect, it, vi } from 'vitest';

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

import { logger } from '@/util/logger.js';
import type { DeliverCodeInput, DeliverCodeResult } from '@/features/account-code/delivery';
import { OTP_SIGNUP_ANSWER_FLOOR_MS } from './otp.controller';
import { NOW, delivered, fakeUser, setup, type SetupOptions } from './otp-send.test-support';

/**
 * WHAT THE *TIME* OF AN ANSWER MAY SAY — `POST /auth/otp/send` (29 Sep 2026,
 * the owner's item 5: "Close the password-reset timing gap. Even out response
 * time on sign-up codes.").
 *
 * The bodies were already neutral (otp-send-channels.test.ts). The clock was
 * not:
 *  • a reset for an unknown number was answered after one lookup, a real one
 *    only after the code row, the fan-out and another write — so the DELAY
 *    named the numbers that have accounts. A reset now answers first and sends
 *    afterwards.
 *  • a sign-up whose typed address was withheld (another account's, or a stub
 *    claim) skipped the slow email leg and answered sooner. Every sign-up answer
 *    now waits out OTP_SIGNUP_ANSWER_FLOOR_MS from the start of the request.
 */

const RESET = { phoneNum: '+60123456789', purpose: 'forgot_password' };
const SIGNUP = { phoneNum: '+60123456789', purpose: 'signup', email: 'new.signup@x.my' };

const account = () => setup({ byLoginMethod: () => fakeUser() });
const nobody = () => setup({ byLoginMethod: () => null });

/** Every destination handed over reported as sent — or, with `ok: false`, none reached. */
function outcome(input: DeliverCodeInput, ok: boolean, waMessageId: string | null = null): DeliverCodeResult {
  const status = ok ? 'sent' : 'failed';
  const sentTo: DeliverCodeResult['sentTo'] = [];
  if (input.phone) sentTo.push({ channel: 'whatsapp', to: 'phone', status }, { channel: 'sms', to: 'phone', status });
  if (input.email) sentTo.push({ channel: 'email', to: 'email', status });
  return { sentTo, ok, waMessageId };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /auth/otp/send — a reset is ANSWERED FIRST', () => {
  it('a registered number and an unknown one are answered alike — before any code row or delivery exists', async () => {
    const known = account();
    const unknown = nobody();

    const a = await known.send(RESET);
    const b = await unknown.send(RESET);

    expect(a.statusCode).toBe(200);
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toEqual(b.body);
    // Up to the answer both did exactly the same: one lookup, then the answer.
    expect(known.events).toEqual(['lookup:phone', 'answer']);
    expect(unknown.events).toEqual(known.events);
    // The registered number's code is still to come — it has touched neither
    // the store nor a provider.
    expect(known.afterAnswer).toHaveLength(1);
    expect(known.phoneVerificationRepository.findActivePending).not.toHaveBeenCalled();
    expect(known.phoneVerificationRepository.expirePendingForPhone).not.toHaveBeenCalled();
    expect(known.phoneVerificationRepository.create).not.toHaveBeenCalled();
    expect(known.deliver).not.toHaveBeenCalled();
    // An unknown number has nothing to come at all.
    expect(unknown.afterAnswer).toHaveLength(0);

    await known.settle();
    await unknown.settle();

    // Then — after the answer — the code is minted and sent to the ACCOUNT's contacts.
    expect(known.events).toEqual([
      'lookup:phone',
      'answer',
      'findActivePending',
      'expirePendingForPhone',
      'create',
      'deliver',
    ]);
    expect(delivered(known.deliver)).toMatchObject({
      phone: '60123456789',
      email: 'owner@atlas-agency.my',
      purpose: 'forgot_password',
      purposeLabel: 'Password reset',
    });
    expect(unknown.deliver).not.toHaveBeenCalled();
    expect(unknown.phoneVerificationRepository.create).not.toHaveBeenCalled();
  });

  it('the work after the answer writes the pending row and records WhatsApp’s message id', async () => {
    const ctx = account();
    ctx.deliver.mockImplementationOnce(async (input) => outcome(input, true, 'wamid.RESET'));

    await ctx.send(RESET);
    await ctx.settle();

    const rows = [...ctx.rows.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      purpose: 'forgot_password',
      status: 'pending',
      channel: 'whatsapp,sms,email',
      waMessageId: 'wamid.RESET',
    });
  });

  it('inside the 60 s window a second request sends no new code', async () => {
    const ctx = account();
    ctx.rows.set('row-live', {
      id: 'row-live',
      phoneNum: '60123456789',
      purpose: 'forgot_password',
      status: 'pending',
      createdAt: new Date(Date.now() - 10_000),
    });

    const res = await ctx.send(RESET);
    await ctx.settle();

    expect(res.statusCode).toBe(200);
    // The window WAS consulted, so the "nothing" below is not vacuous.
    expect(ctx.phoneVerificationRepository.findActivePending).toHaveBeenCalledTimes(1);
    expect(ctx.phoneVerificationRepository.expirePendingForPhone).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();
    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(ctx.rows.get('row-live')?.status).toBe('pending');
  });

  it('past the window a new code supersedes the old one', async () => {
    const ctx = account();
    ctx.rows.set('row-old', {
      id: 'row-old',
      phoneNum: '60123456789',
      purpose: 'forgot_password',
      status: 'pending',
      createdAt: new Date(Date.now() - 61_000),
    });

    await ctx.send(RESET);
    await ctx.settle();

    expect(ctx.rows.get('row-old')?.status).toBe('expired');
    expect(ctx.phoneVerificationRepository.create).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
  });

  /**
   * Answering first opens a gap the old in-request flow barely had: the second
   * tap can arrive after the first ANSWER but before the first ROW, where the
   * resend window cannot see it. The mints for one number are chained, so the
   * second looks only after the first has written — both tasks run AT ONCE here.
   */
  it('two requests back to back mint ONE code, even when the second comes before the first row exists', async () => {
    const ctx = account();

    await ctx.send(RESET);
    await ctx.send(RESET);
    expect(ctx.afterAnswer).toHaveLength(2);
    expect(ctx.phoneVerificationRepository.create).not.toHaveBeenCalled();

    await ctx.settle();

    expect(ctx.phoneVerificationRepository.findActivePending).toHaveBeenCalledTimes(2);
    expect(ctx.phoneVerificationRepository.create).toHaveBeenCalledTimes(1);
    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect([...ctx.rows.values()].filter((row) => row.status === 'pending')).toHaveLength(1);
  });

  it('a code that reached nobody is expired and logged — the answer was already the neutral one', async () => {
    const ctx = account();
    ctx.deliver.mockImplementationOnce(async (input) => outcome(input, false));

    const res = await ctx.send(RESET);
    await ctx.settle();

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual((await nobody().send(RESET)).body);
    expect([...ctx.rows.values()][0].status).toBe('expired');
    expect(logger.warn).toHaveBeenCalledWith(
      '[OtpController.send] no channel reached — answered as a send',
      { purpose: 'forgot_password' },
    );
  });

  it('a row that could not be written is logged, and nothing is sent', async () => {
    const ctx = account();
    ctx.phoneVerificationRepository.create.mockResolvedValueOnce(null);

    await ctx.send(RESET);
    await ctx.settle();

    expect(ctx.deliver).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      '[OtpController.send] reset code row not created — nothing sent',
      { purpose: 'forgot_password' },
    );
  });

  it('an error after the answer is logged, scrubbed — never thrown', async () => {
    const ctx = account();
    ctx.deliver.mockRejectedValueOnce(
      new Error('provider refused +60123456789 and owner@atlas-agency.my'),
    );

    const res = await ctx.send(RESET);
    await expect(ctx.settle()).resolves.toBeUndefined();

    expect(res.statusCode).toBe(200);
    expect(logger.error).toHaveBeenCalledTimes(1);
    // winston's overloads type a call as `[infoObject]`; the controller logs (message, fields).
    const [label, fields] = vi.mocked(logger.error).mock.calls[0] as unknown as [string, unknown];
    expect(label).toBe('[OtpController.send] reset code failed after the answer');
    // `safeErrorFields`: the reason survives, the contact values do not.
    expect(JSON.stringify(fields)).toContain('provider refused');
    expect(JSON.stringify(fields)).not.toMatch(/60123456789|owner@/);
  });
});

/**
 * The same, with the runner production uses. Nothing collects the work here, so
 * these prove the DEFAULT does not await it — and that a failure inside it ends
 * in the log, not in an unhandled rejection (which vitest would fail the run on).
 */
describe('POST /auth/otp/send — a reset, with production’s fire-and-forget runner', () => {
  const production = () =>
    setup({ byLoginMethod: () => fakeUser(), controller: { runAfterAnswer: undefined } });

  it('answers without waiting for a delivery that has not finished', async () => {
    let release = () => {};
    const provider = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ctx = production();
    ctx.deliver.mockImplementationOnce(async (input) => {
      await provider;
      return outcome(input, true, 'wamid.LATE');
    });

    const res = await ctx.send(RESET);

    // The request is over while the provider is still holding the send.
    expect(res.statusCode).toBe(200);
    expect(ctx.events.slice(0, 2)).toEqual(['lookup:phone', 'answer']);
    await vi.waitFor(() => expect(ctx.deliver).toHaveBeenCalledTimes(1));
    expect([...ctx.rows.values()][0].waMessageId).toBeNull();

    release();
    await vi.waitFor(() => expect([...ctx.rows.values()][0].waMessageId).toBe('wamid.LATE'));
  });

  it('a failure after the answer ends in the log, not in an unhandled rejection', async () => {
    const ctx = production();
    ctx.deliver.mockRejectedValueOnce(new Error('socket hang up'));

    const res = await ctx.send(RESET);

    expect(res.statusCode).toBe(200);
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        '[OtpController.send] reset code failed after the answer',
        expect.objectContaining({ error: 'Error: socket hang up' }),
      ),
    );
  });
});

/** A controller on a fake clock that `sleep` advances — so an answer is stamped with when it left. */
function onTheClock(options: SetupOptions = {}) {
  let clock = NOW;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const ctx = setup({
    ...options,
    controller: {
      now: () => clock,
      sleep,
      signupAnswerFloorMs: OTP_SIGNUP_ANSWER_FLOOR_MS,
      ...options.controller,
    },
  });
  /** A send that takes `ms` of the clock and reaches every destination (or, `ok: false`, none). */
  const takes =
    (ms: number, ok = true) =>
    async (input: DeliverCodeInput): Promise<DeliverCodeResult> => {
      clock += ms;
      return outcome(input, ok);
    };
  return { ...ctx, sleep, takes };
}

const emailHeldElsewhere = (method: 'email' | 'phone') => (method === 'email' ? fakeUser() : null);
const phoneRegistered = (method: 'email' | 'phone') => (method === 'phone' ? fakeUser() : null);

describe('POST /auth/otp/send — every sign-up answer waits out the floor', () => {
  type Clocked = ReturnType<typeof onTheClock>;
  const cases: Array<{
    name: string;
    status: number;
    options?: SetupOptions;
    body?: Record<string, string>;
    arrange?: (ctx: Clocked) => void;
  }> = [
    {
      name: '200, a free address (the email leg included)',
      status: 200,
      arrange: (ctx) => ctx.deliver.mockImplementationOnce(ctx.takes(1_400)),
    },
    {
      name: '200, an address held by another account (withheld — no email leg)',
      status: 200,
      options: { byLoginMethod: emailHeldElsewhere },
      arrange: (ctx) => ctx.deliver.mockImplementationOnce(ctx.takes(300)),
    },
    {
      name: '200, withheld and the phone channels down',
      status: 200,
      options: { byLoginMethod: emailHeldElsewhere },
      arrange: (ctx) => ctx.deliver.mockImplementationOnce(ctx.takes(300, false)),
    },
    {
      // No longer a 409 (owner, 29 Sep 2026) — its code goes to the phone alone.
      name: '200, a number that already has an account',
      status: 200,
      options: { byLoginMethod: phoneRegistered },
      arrange: (ctx) => ctx.deliver.mockImplementationOnce(ctx.takes(300)),
    },
    {
      name: '429, inside the resend window',
      status: 429,
      arrange: (ctx) =>
        ctx.phoneVerificationRepository.findActivePending.mockResolvedValueOnce({
          id: 'row-live',
          createdAt: new Date(NOW - 10_000),
        }),
    },
    {
      name: '503, nothing reached anyone and no address to hide',
      status: 503,
      body: { phoneNum: '+60123456789', purpose: 'signup' },
      arrange: (ctx) => ctx.deliver.mockImplementationOnce(ctx.takes(300, false)),
    },
    {
      name: '500, the row could not be written',
      status: 500,
      arrange: (ctx) => ctx.phoneVerificationRepository.create.mockResolvedValueOnce(null),
    },
    {
      name: '500, a lookup threw',
      status: 500,
      arrange: (ctx) =>
        ctx.userRepository.getUserByLoginMethod.mockRejectedValueOnce(new Error('connection reset')),
    },
  ];

  it.each(cases)('$name', async ({ status, options, body, arrange }) => {
    const ctx = onTheClock(options);
    arrange?.(ctx);

    const res = await ctx.send(body ?? SIGNUP);

    expect(res.statusCode).toBe(status);
    expect(res.answeredAt).toBe(NOW + OTP_SIGNUP_ANSWER_FLOOR_MS);
  });

  it('a withheld address and a free one leave at the same moment, with the same words', async () => {
    const free = onTheClock();
    const withheld = onTheClock({ byLoginMethod: emailHeldElsewhere });
    // The email leg is the slow one: 1.4 s with it, 0.3 s without.
    free.deliver.mockImplementationOnce(free.takes(1_400));
    withheld.deliver.mockImplementationOnce(withheld.takes(300));

    const a = await free.send(SIGNUP);
    const b = await withheld.send(SIGNUP);

    // The instrument: the two sends really did differ by the email leg.
    expect(delivered(free.deliver).email).toBe('new.signup@x.my');
    expect(delivered(withheld.deliver).email).toBeNull();
    expect(a.answeredAt).toBe(b.answeredAt);
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body).toEqual(b.body);
  });

  it('pads by what is LEFT of the floor, measured from the start of the request', async () => {
    const ctx = onTheClock();
    ctx.deliver.mockImplementationOnce(ctx.takes(1_000));

    await ctx.send(SIGNUP);

    expect(ctx.sleep).toHaveBeenCalledTimes(1);
    expect(ctx.sleep).toHaveBeenCalledWith(OTP_SIGNUP_ANSWER_FLOOR_MS - 1_000);
  });

  it('is a floor, not a ceiling — a send slower than it is answered when it ends', async () => {
    const ctx = onTheClock();
    ctx.deliver.mockImplementationOnce(ctx.takes(OTP_SIGNUP_ANSWER_FLOOR_MS + 700));

    const res = await ctx.send(SIGNUP);

    expect(ctx.sleep).not.toHaveBeenCalled();
    expect(res.answeredAt).toBe(NOW + OTP_SIGNUP_ANSWER_FLOOR_MS + 700);
  });

  it('a malformed request (400) is not padded — it is decided by the body alone', async () => {
    const ctx = onTheClock();

    const res = await ctx.send({ ...SIGNUP, email: 'not-an-email' });

    expect(res.statusCode).toBe(400);
    expect(ctx.sleep).not.toHaveBeenCalled();
    expect(res.answeredAt).toBe(NOW);
  });

  it('a reset is never padded — it answers straight after its lookup', async () => {
    const ctx = onTheClock({ byLoginMethod: () => fakeUser() });

    const res = await ctx.send(RESET);

    expect(res.statusCode).toBe(200);
    expect(res.answeredAt).toBe(NOW);
    expect(ctx.sleep).not.toHaveBeenCalled();
  });

  it('with no override the controller pads to OTP_SIGNUP_ANSWER_FLOOR_MS, which clears the measured SMTP send', async () => {
    // The floor from the constant, not from the test's override.
    const ctx = onTheClock({ controller: { signupAnswerFloorMs: undefined } });

    await ctx.send(SIGNUP);

    expect(ctx.sleep).toHaveBeenCalledWith(OTP_SIGNUP_ANSWER_FLOOR_MS);
    // The slowest leg — a nodemailer send through Brevo — measured ~1.1-1.5 s.
    expect(OTP_SIGNUP_ANSWER_FLOOR_MS).toBeGreaterThan(1_500);
  });
});
