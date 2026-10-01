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

import { RESET_VERIFY_FLOOR_MS } from './otp.controller';
import { delivered, fakeUser, setup, type SetupOptions } from './otp-send.test-support';

/**
 * THE LEGACY PHONE RESET, VERIFIED (security review, 30 Sep 2026).
 *
 * `/auth/otp/send` with `purpose: forgot_password` answers every number alike,
 * but mints a code only for a resettable account — so `/auth/otp/verify` used
 * to tell them apart: a guess at a real number answered "Invalid code", a guess
 * at any other "No active code for this number". A number that got no code is
 * now answered as though it had one nobody can guess.
 */

const PHONE = '+60123456789';
const reset = { phoneNum: PHONE, purpose: 'forgot_password' };

/** A context whose clock the test moves, with the reset floor on and its sleeps recorded. */
function clocked(options: SetupOptions = {}) {
  let clock = Date.parse('2026-09-30T10:00:00Z');
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const ctx = setup({
    ...options,
    controller: { now: () => clock, sleep, resetVerifyFloorMs: RESET_VERIFY_FLOOR_MS, ...options.controller },
  });
  return { ...ctx, sleep, advance: (ms: number) => (clock += ms) };
}

/** A code guaranteed to be wrong for whatever `ctx` delivered (or any code, when nothing was). */
function wrongCode(ctx: ReturnType<typeof setup>): string {
  const sent = delivered(ctx.deliver)?.code;
  return sent ? String((Number(sent) + 1) % 1_000_000).padStart(6, '0') : '000000';
}

async function guesses(ctx: ReturnType<typeof setup>, code: string, n: number) {
  const answers: Array<[number, string]> = [];
  for (let i = 0; i < n; i += 1) {
    const res = await ctx.verify({ ...reset, code });
    answers.push([res.statusCode, res.body.message]);
  }
  return answers;
}

describe('legacy reset verify — a number with no account answers like one with a code', () => {
  it('seven wrong guesses read the same for a real account and an unknown number', async () => {
    const real = clocked({ byLoginMethod: () => fakeUser() });
    const unknown = clocked({ byLoginMethod: () => null });
    for (const ctx of [real, unknown]) {
      await ctx.send(reset);
      await ctx.settle();
    }
    const code = wrongCode(real);

    const fromReal = await guesses(real, code, 7);
    const fromUnknown = await guesses(unknown, code, 7);

    // A real row's own sequence: five wrong codes, then the cap, then nothing left.
    expect(fromReal).toEqual([
      ...Array.from({ length: 5 }, () => [400, 'Invalid code']),
      [429, 'Too many attempts — request a new code'],
      [400, 'No active code for this number — request a new one'],
    ]);
    expect(fromUnknown).toEqual(fromReal);
  });

  it('before any code was asked for, both say there is none', async () => {
    const real = clocked({ byLoginMethod: () => fakeUser() });
    const unknown = clocked({ byLoginMethod: () => null });
    expect(await guesses(unknown, '123456', 1)).toEqual(await guesses(real, '123456', 1));
    expect((await guesses(unknown, '123456', 1))[0][1]).toBe(
      'No active code for this number — request a new one',
    );
  });

  it('after its lifetime a stand-in is gone, as a real code is', async () => {
    const unknown = clocked({ byLoginMethod: () => null });
    await unknown.send(reset);
    unknown.advance(10 * 60_000);
    expect((await guesses(unknown, '123456', 1))[0][1]).toBe(
      'No active code for this number — request a new one',
    );
  });

  it('a resend inside 60 s does not hand out a fresh budget; after it, one does', async () => {
    const unknown = clocked({ byLoginMethod: () => null });
    await unknown.send(reset);
    await guesses(unknown, '123456', 3);
    await unknown.send(reset); // inside the window: the same stand-in
    expect(await guesses(unknown, '123456', 3)).toEqual([
      [400, 'Invalid code'],
      [400, 'Invalid code'],
      [429, 'Too many attempts — request a new code'],
    ]);
    unknown.advance(61_000);
    await unknown.send(reset); // exhausted, so a fresh one — as a real number mints anew
    expect((await guesses(unknown, '123456', 1))[0]).toEqual([400, 'Invalid code']);
  });

  it('a real code that reached nobody answers like an unknown number, not "No active code"', async () => {
    const real = clocked({ byLoginMethod: () => fakeUser() });
    real.deliver.mockResolvedValueOnce({ sentTo: [], ok: false, waMessageId: null } as never);
    await real.send(reset);
    await real.settle();
    expect([...real.rows.values()][0].status).toBe('expired');
    expect((await guesses(real, '123456', 1))[0]).toEqual([400, 'Invalid code']);
  });

  it('every reset refusal waits out the floor; a sign-up verify is not held', async () => {
    const unknown = clocked({ byLoginMethod: () => null });
    await unknown.send(reset);
    await guesses(unknown, '123456', 1);
    expect(unknown.sleep).toHaveBeenCalledWith(RESET_VERIFY_FLOOR_MS);

    const signup = clocked({ byLoginMethod: () => null });
    await signup.send({ phoneNum: PHONE, purpose: 'signup' });
    signup.sleep.mockClear();
    await signup.verify({ phoneNum: PHONE, purpose: 'signup', code: wrongCode(signup) });
    expect(signup.sleep).not.toHaveBeenCalled();
  });
});
