import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('@/util/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  emailConfigured: () => false,
  sendAccountCodeEmail: vi.fn(),
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => false,
  sendWhatsAppOtp: vi.fn(),
}));

import type { PhoneVerification, PhoneVerificationPurpose } from './phone-verification.model';
import { boundCodeMatches } from '@/features/account-code/code';
import { toWhatsAppDigits } from '@/features/account-code/phone';
import { fakeCodeStore, fakeReq, fakeRes, NOW } from '@/features/account-code/fakes.test-support';
import {
  CODE_INVALID,
  CODE_TOO_MANY_ATTEMPTS,
  SIGNUP_EMAIL_CODE_EXPIRED,
  SIGNUP_EMAIL_CODE_REQUIRED,
  SIGNUP_EMAIL_CODE_SEND_FAILED,
  SIGNUP_EMAIL_CODE_SENT,
} from './account-answers';
import {
  SIGNUP_EMAIL_CODE_MAX_ATTEMPTS,
  SignupEmailCodesClass,
  signupEmailAnchor,
} from './signup-email-code';

/**
 * OWNER, 30 SEP 2026 — proof before a venue, agency or team-member account is
 * created. The code goes to whatever address is typed, with one answer for
 * every address; the sign-up routes spend it before looking any account up.
 */

const CODE = '482913';

function harness(options: { delivered?: boolean } = {}) {
  let clock = NOW;
  const base = fakeCodeStore();
  const codes = {
    ...base,
    // `UPDATE … RETURNING` hands back the row AS WRITTEN, not a live object: a
    // shared reference would show every in-flight try the final count. So the
    // copy is taken in the same step as the increment, never after an await.
    countFailedAttempt: vi.fn(async (id: string, max: number) => {
      const row = base.rows.get(id);
      if (!row || row.attempts >= max) return null;
      row.attempts += 1;
      return { ...row };
    }),
    findActivePending: vi.fn(async (phoneNum: string, purpose: PhoneVerificationPurpose) => {
      const open = [...base.rows.values()]
        .filter(
          (r) =>
            r.phoneNum === phoneNum &&
            r.purpose === purpose &&
            r.status === 'pending' &&
            r.expiresAt.getTime() > clock,
        )
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return open[0] ?? null;
    }),
  };
  const deliver = vi.fn(async () => ({ ok: options.delivered ?? true }));
  const service = new SignupEmailCodesClass({
    codes,
    deliver,
    now: () => clock,
    generateCode: () => CODE,
  });
  return {
    service,
    codes,
    deliver,
    tick: (ms: number) => {
      clock += ms;
    },
  };
}

async function send(t: ReturnType<typeof harness>, body: unknown) {
  const res = fakeRes();
  await t.service.send(fakeReq(body), res);
  return res;
}

function onlyRow(t: ReturnType<typeof harness>): PhoneVerification {
  const rows = [...t.codes.rows.values()];
  expect(rows).toHaveLength(1);
  return rows[0];
}

describe('POST /auth/signup-email-code — one answer for every address', () => {
  it('mails a code to the address typed and answers the codeId', async () => {
    const t = harness();
    const res = await send(t, { email: '  Owner@Venue.MY ' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe(SIGNUP_EMAIL_CODE_SENT);
    const row = onlyRow(t);
    expect(res.body.data).toEqual({ codeId: row.id, expiresInSec: 600, resendAfterSec: 60 });
    expect(t.deliver).toHaveBeenCalledWith({ email: 'owner@venue.my', code: CODE, validMinutes: 10 });
  });

  it('never asks whether the address has an account — it has nothing to ask with', async () => {
    // The class is built from a code store and a mailer only; the two bodies
    // for two different addresses differ in nothing but the new row's id.
    const a = await send(harness(), { email: 'taken@venue.my' });
    const b = await send(harness(), { email: 'free@venue.my' });
    expect(a.statusCode).toBe(b.statusCode);
    expect(a.body.message).toBe(b.body.message);
  });

  it('stores a hash of the ADDRESS, never the address, and one bound to it', async () => {
    const t = harness();
    await send(t, { email: 'owner@venue.my' });
    const row = onlyRow(t);

    expect(row.phoneNum).toBe(signupEmailAnchor('owner@venue.my'));
    expect(row.phoneNum).not.toContain('venue');
    expect(toWhatsAppDigits(row.phoneNum)).toBeNull();
    expect(row).toMatchObject({ purpose: 'signup_email', channel: 'email', status: 'pending', attempts: 0 });
    expect(row.expiresAt.getTime()).toBe(NOW + 600_000);
    expect(boundCodeMatches(row.codeHash, CODE, 'signup_email', 'owner@venue.my')).toBe(true);
    expect(boundCodeMatches(row.codeHash, CODE, 'signup_email', 'other@venue.my')).toBe(false);
  });

  it('refuses a malformed address 400 and writes nothing', async () => {
    const t = harness();
    const res = await send(t, { email: 'not-an-address' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Enter a valid email address');
    expect(t.codes.create).not.toHaveBeenCalled();
    expect(t.deliver).not.toHaveBeenCalled();
  });

  it('a resend inside a minute is refused with the wait; after it, a second code — the first still works', async () => {
    const t = harness();
    await send(t, { email: 'owner@venue.my' });
    const first = onlyRow(t);

    t.tick(10_000);
    const early = await send(t, { email: 'OWNER@venue.my' });
    expect(early.statusCode).toBe(429);
    expect(early.body.message).toBe('Wait 50s before requesting another code');

    t.tick(51_000);
    const later = await send(t, { email: 'owner@venue.my' });
    expect(later.statusCode).toBe(200);
    expect(later.body.data.codeId).not.toBe(first.id);
    // Anybody may ask for a code for any address: a stranger's resend must not
    // void the one the real owner is typing (security review, 30 Sep 2026).
    expect(first.status).toBe('pending');
    await expect(
      t.service.redeem({ codeId: first.id, code: CODE, email: 'owner@venue.my', actor: 'system' }),
    ).resolves.toEqual({ ok: true });
  });

  it('a code that reached nobody is expired and answered 503 — the same for every address', async () => {
    const t = harness({ delivered: false });
    const res = await send(t, { email: 'owner@venue.my' });
    expect(res.statusCode).toBe(503);
    expect(res.body.message).toBe(SIGNUP_EMAIL_CODE_SEND_FAILED);
    expect(onlyRow(t).status).toBe('expired');
  });

  it('a row that could not be stored is a 503 and sends nothing', async () => {
    const t = harness();
    t.codes.create.mockResolvedValueOnce(null as never);
    const res = await send(t, { email: 'owner@venue.my' });
    expect(res.statusCode).toBe(503);
    expect(t.deliver).not.toHaveBeenCalled();
  });
});

describe('SignupEmailCodes.redeem — what /auth/register and /auth/register-member spend', () => {
  let t: ReturnType<typeof harness>;
  let codeId: string;

  beforeEach(async () => {
    t = harness();
    const res = await send(t, { email: 'owner@venue.my' });
    codeId = res.body.data.codeId;
  });

  const redeem = (overrides: Partial<{ codeId: string | null; code: string | null; email: string }> = {}) =>
    t.service.redeem({ codeId, code: CODE, email: 'owner@venue.my', actor: 'system', ...overrides });

  it('the right code for the right address is spent once — a second use is expired', async () => {
    await expect(redeem()).resolves.toEqual({ ok: true });
    expect(t.codes.rows.get(codeId)?.status).toBe('consumed');
    await expect(redeem()).resolves.toEqual({ ok: false, status: 400, message: SIGNUP_EMAIL_CODE_EXPIRED });
  });

  it('the address is compared the way it was sent — case and spacing do not matter', async () => {
    await expect(redeem({ email: '  OWNER@Venue.my ' })).resolves.toEqual({ ok: true });
  });

  it.each([
    ['no code id', { codeId: null }],
    ['no code', { code: '' }],
  ])('%s: "verify your email first"', async (_label, overrides) => {
    await expect(redeem(overrides)).resolves.toEqual({
      ok: false,
      status: 400,
      message: SIGNUP_EMAIL_CODE_REQUIRED,
    });
  });

  it('an unknown or malformed id is "expired" — nothing to count against', async () => {
    await expect(redeem({ codeId: 'not-a-uuid' })).resolves.toMatchObject({ message: SIGNUP_EMAIL_CODE_EXPIRED });
    await expect(redeem({ codeId: '99999999-9999-4999-8999-999999999999' })).resolves.toMatchObject({
      message: SIGNUP_EMAIL_CODE_EXPIRED,
    });
  });

  it('a code past its ten minutes is expired', async () => {
    t.tick(600_001);
    await expect(redeem()).resolves.toMatchObject({ status: 400, message: SIGNUP_EMAIL_CODE_EXPIRED });
  });

  it('a PHONE code is never spendable here, whatever its digits', async () => {
    const phoneRow = await t.codes.create({
      phoneNum: '60123456789',
      codeHash: t.codes.rows.get(codeId)?.codeHash ?? '',
      purpose: 'signup',
      status: 'pending',
      expiresAt: new Date(NOW + 600_000),
      createdBy: 'system',
      updatedBy: 'system',
    } as never);
    await expect(redeem({ codeId: phoneRow?.id })).resolves.toMatchObject({ message: SIGNUP_EMAIL_CODE_EXPIRED });
  });

  it('a code sent to one inbox is wrong for any other — and counts as a wrong guess', async () => {
    await expect(redeem({ email: 'someone-else@venue.my' })).resolves.toEqual({
      ok: false,
      status: 400,
      message: CODE_INVALID,
    });
    expect(t.codes.rows.get(codeId)?.attempts).toBe(1);
  });

  it(`${SIGNUP_EMAIL_CODE_MAX_ATTEMPTS} wrong codes kill it — the right one no longer works`, async () => {
    for (let i = 1; i < SIGNUP_EMAIL_CODE_MAX_ATTEMPTS; i += 1) {
      await expect(redeem({ code: '000000' })).resolves.toMatchObject({ status: 400, message: CODE_INVALID });
    }
    await expect(redeem({ code: '000000' })).resolves.toEqual({
      ok: false,
      status: 429,
      message: CODE_TOO_MANY_ATTEMPTS,
    });
    expect(t.codes.rows.get(codeId)?.status).toBe('expired');
    await expect(redeem()).resolves.toMatchObject({ message: SIGNUP_EMAIL_CODE_EXPIRED });
  });

  it('two sign-ups racing with one code: only one spends it', async () => {
    const [a, b] = await Promise.all([redeem(), redeem()]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
  });

  it('sixty tries sent at once get five comparisons between them — the right code last is refused', async () => {
    // Security review, 30 Sep 2026: counting only a miss, AFTER comparing, let
    // all sixty read "under the cap" and compare; the right code got through.
    const tries = [
      ...Array.from({ length: 59 }, () => redeem({ code: '000000' })),
      redeem(),
    ];
    const answers = await Promise.all(tries);

    expect(answers.filter((a) => a.ok)).toHaveLength(0);
    expect(answers.filter((a) => !a.ok && a.message === CODE_INVALID)).toHaveLength(
      SIGNUP_EMAIL_CODE_MAX_ATTEMPTS - 1,
    );
    expect(t.codes.rows.get(codeId)?.attempts).toBe(SIGNUP_EMAIL_CODE_MAX_ATTEMPTS);
    expect(t.codes.rows.get(codeId)?.status).toBe('expired');
  });

  it('the right code on the last allowed try still works', async () => {
    for (let i = 1; i < SIGNUP_EMAIL_CODE_MAX_ATTEMPTS; i += 1) {
      await redeem({ code: '000000' });
    }
    await expect(redeem()).resolves.toEqual({ ok: true });
  });
});
