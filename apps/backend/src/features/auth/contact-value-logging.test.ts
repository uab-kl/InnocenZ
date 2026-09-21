import { Writable } from 'node:stream';
import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * NO EMAIL OR PHONE NUMBER IN THE LOG FROM A FAILED READ OR SEND.
 *
 * `query-error-redaction.test.ts` pins the PASSWORD writers. The same leak ran
 * through every other catch that logged a raw error: drizzle 0.45 prints a
 * failed statement's bound values in the message, `params` and stack, and for
 * the sign-in lookups those values ARE the email or the phone candidates. A
 * provider's refusal ("550 <owner@x.my>: Recipient address rejected") and a
 * unique violation's `detail` ("Key (phone_num)=(+60…)") quote them in plain
 * text too, which `error.message` passed straight to the log.
 *
 * Each case below first proves the instrument — the raw error DOES contain the
 * values — then drives the real catch and inspects every logger call (and, where
 * the error is rethrown, the thrown object) for them.
 */

const fake = vi.hoisted(() => {
  const state = { error: null as unknown };
  /** Any drizzle chain; awaiting it rejects with `state.error`. */
  function chain(): unknown {
    return new Proxy(function () {}, {
      get(_target, prop) {
        if (prop === 'then') {
          return (_resolve: unknown, reject: (reason: unknown) => void) => reject(state.error);
        }
        if (typeof prop === 'symbol') return undefined;
        return () => chain();
      },
    });
  }
  const db = {
    select: () => chain(),
    selectDistinctOn: () => chain(),
    insert: () => chain(),
    update: () => chain(),
    delete: () => chain(),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const env = { NODE_ENV: 'production' as string, OTP_DELIVERY_LOG_ONLY: undefined as string | undefined };
  const sendAccountChangeNoticeEmail = vi.fn();
  const whatsapp = { configured: true };
  return { state, db, logger, env, sendAccountChangeNoticeEmail, whatsapp };
});

vi.mock('@/db/index', () => ({ db: fake.db }));
vi.mock('@/db/index.js', () => ({ db: fake.db }));
vi.mock('@/util/logger', () => ({ logger: fake.logger }));
vi.mock('@/util/logger.js', () => ({ logger: fake.logger }));
vi.mock('@/env.js', () => ({ env: fake.env }));
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  emailConfigured: () => true,
  sendAccountCodeEmail: vi.fn(),
  sendAccountChangeNoticeEmail: fake.sendAccountChangeNoticeEmail,
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => fake.whatsapp.configured,
  sendWhatsAppOtp: vi.fn(),
}));
vi.mock('@/features/sms/sms.js', () => ({ sendSms: vi.fn() }));

import winston from 'winston';
import { DrizzleQueryError } from 'drizzle-orm';
import { PhoneVerificationRepositoryClass } from './phone-verification.repository';
import { OtpControllerClass } from './otp.controller';
import { maskContactText, redactQueryError, safeErrorFields } from './query-error-redaction';
import { UserRepositoryClass } from '@/features/user/user.repository';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository';
import { deliverCode, type CodeSenders } from '@/features/account-code/delivery';
import { accountNotices, fireNotice } from '@/features/account-code/notices';
import { ContactChangeControllerClass } from '@/features/account-code/contact-change.controller';
import {
  fakeContactChangeDeps,
  fakeReq,
  fakeRes,
  fakeUser,
} from '@/features/account-code/fakes.test-support';

const EMAIL = 'owner@atlas-agency.my';
const PHONE = '+60123456789';
/** Every spelling of the line that must not survive into a log. */
const FORBIDDEN = [EMAIL, 'owner@', '60123456789', '0123456789', '012-345 6789'];
const USER_ID = '88888888-8888-4888-8888-888888888888';

/** A failed statement whose bound values, message and pg detail all carry the contact. */
function queryError(): DrizzleQueryError {
  const cause = Object.assign(new Error(`invalid input syntax for type uuid: "${EMAIL}"`), {
    code: '22P02',
    detail: `Key (phone_num)=(${PHONE}) already exists.`,
  });
  return new DrizzleQueryError(
    'select "id" from "main"."user" where lower(btrim("email")) = $1 or regexp_replace("phone_num") in ($2, $3)',
    [EMAIL, '0123456789', '60123456789'],
    cause,
  );
}

function leaks(value: unknown): string[] {
  const text = typeof value === 'string' ? value : inspect(value, { depth: 10, showHidden: true });
  return FORBIDDEN.filter((needle) => text.includes(needle));
}

function logged(): unknown {
  return [fake.logger.info.mock.calls, fake.logger.warn.mock.calls, fake.logger.error.mock.calls];
}

function loggerWasCalled(): boolean {
  return fake.logger.warn.mock.calls.length + fake.logger.error.mock.calls.length > 0;
}

/** A real winston logger with util/logger.ts's two formats, writing to memory. */
function captureLogger(kind: 'dev' | 'prod') {
  const lines: string[] = [];
  const { combine, timestamp, json, printf } = winston.format;
  const format =
    kind === 'prod'
      ? combine(timestamp(), json())
      : combine(
          timestamp(),
          printf(({ level, message, timestamp: ts, ...meta }) => {
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${ts} ${level}: ${message}${extra}`;
          }),
        );
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  const logger = winston.createLogger({
    level: 'debug',
    format,
    transports: [new winston.transports.Stream({ stream })],
  });
  return { logger, lines };
}

beforeEach(() => {
  vi.clearAllMocks();
  fake.env.NODE_ENV = 'production';
  fake.env.OTP_DELIVERY_LOG_ONLY = undefined;
  fake.whatsapp.configured = true;
  fake.state.error = queryError();
});

describe('the instrument', () => {
  it('a raw query error carries the email and every phone spelling', () => {
    expect(leaks(queryError())).toEqual(expect.arrayContaining([EMAIL, '0123456789', '60123456789']));
  });

  it('inspecting logger calls that received the raw error DOES see the values', () => {
    fake.logger.error('[X] Error:', queryError());
    expect(leaks(logged()).length).toBeGreaterThan(0);
  });

  it.each(['dev', 'prod'] as const)(
    '%s winston format prints the pg detail of a raw error (what redactQueryError must mask)',
    (kind) => {
      const { logger, lines } = captureLogger(kind);
      const error = queryError();
      error.params = [];
      error.message = 'Failed query: select 1';
      logger.error('[X] Error:', error);
      expect(lines.join('\n')).toContain('60123456789');
    },
  );
});

describe('maskContactText', () => {
  it('masks emails and phone numbers in every written form, keeping a recognisable tail', () => {
    const text = `to ${EMAIL} / +60123456789 / 012-345 6789 / 60123456789 / (0198887777)`;
    const masked = maskContactText(text);
    expect(leaks(masked)).toEqual([]);
    expect(masked).not.toContain('0198887777');
    expect(masked).toContain('o••••@atlas-agency.my');
    expect(masked).toContain('••••• 6789');
    expect(masked).toContain('••••• 7777');
  });

  /*
   * The spellings the first version let through (review, 17 Sep 2026):
   * `register-member` stores `phoneNum` as typed, so any of these can reach
   * `user.phone_num` and then a unique violation's `detail`. Exact outputs, so
   * a spelling that slips through fails on its own line.
   */
  it.each([
    ['Key (phone_num)=((012) 345-6789) already exists.', 'Key (phone_num)=(••••• 6789) already exists.'],
    ['Key (phone_num)=(012.345.6789) already exists.', 'Key (phone_num)=(••••• 6789) already exists.'],
    ['Key (phone_num)=(+60 12  345 6789) already exists.', 'Key (phone_num)=(••••• 6789) already exists.'],
    ['Key (phone_num)=(91234567) already exists.', 'Key (phone_num)=(••••• 4567) already exists.'],
    ['to 3456789', 'to ••••• 6789'],
    ['0123456789abc', '••••• 6789abc'],
    ['phone_0123456789', 'phone_••••• 6789'],
    ['012–345–6789', '••••• 6789'],
    ['+60-12-345-6789', '••••• 6789'],
    ['0123-45-6789', '••••• 6789'],
    ['012.345.678.9', '••••• 6789'],
    ['Recipient 0123456789: not on WhatsApp', 'Recipient ••••• 6789: not on WhatsApp'],
    ['sent 0123456789 10:30 today', 'sent ••••• 6789 10:30 today'],
  ])('masks %j', (input, expected) => {
    expect(maskContactText(input)).toBe(expected);
  });

  it('leaves ids, dates, codes, package paths and statement text alone', () => {
    const text =
      'Failed query: select $1 where "id" = 12345678-1234-4234-8234-123456789012 at 2026-09-17 10:00:00 ' +
      'code 23505 member INNPR0001 voucher PV-000001 port 5432 ' +
      'at node_modules/.pnpm/drizzle-orm@0.45.1_pg@8.16.0/node_modules/drizzle-orm/pg-core/session.js:73:19';
    expect(maskContactText(text)).toBe(text);
  });

  it.each([
    'Key (id)=(12345678-1234-4234-8234-123456789012) is still referenced from table "agency_pr".',
    'Key (agency_id, user_id)=(5f3c9a2e-1b2c-4d3e-8f90-0123456789ab, 88888888-8888-4888-8888-888888888888)',
    'Failing row contains (2026-09-17 10:00:00.123456+08, 2026-09-17T10:00:00.123Z).',
    'connect ETIMEDOUT 203.0.113.45:5432 then 192.168.100.200.',
    'at file:///app/dist/main.js:1:2345678',
    'shift 10:30 to 23:45:00',
    'o••••@atlas123456789.my',
  ])('keeps a uuid, date, time, IPv4, stack position and an already-masked address: %j', (text) => {
    expect(maskContactText(text)).toBe(text);
  });

  it('is idempotent: masking masked text changes nothing', () => {
    const once = maskContactText(
      `to ${EMAIL} / owner@atlas123456789.my / (012) 345-6789 / +60 12  345 6789 / (0198887777) at 2026-09-17`,
    );
    expect(maskContactText(once)).toBe(once);
    expect(leaks(once)).toEqual([]);
  });

  it('a bare run of 7+ digits is masked even when it is not a phone — over-masking a log is not a leak', () => {
    // Deliberate: `0123456789` stored without a `+` is exactly this shape.
    expect(maskContactText('epoch 1726000000')).toBe('epoch ••••• 0000');
    // Six digits is below the floor — a voucher number or a code shape stays.
    expect(maskContactText('PV-000001')).toBe('PV-000001');
  });

  /*
   * ⚠️ LINEAR TIME. The unbounded `[…]+@` re-scanned a run with no `@` from every
   * start: 20,000 characters took ~190 ms and 40,000 took seconds, on the event
   * loop, reachable through `GET /pr/<long id>`. Run 17 Sep 2026 against that
   * version: 6 of these 8 shapes FAILED at 4.9-7.1 s each (the dotted local part
   * and spaced digits were already fast). Linear code does each shape in well
   * under 100 ms; the 1,000 ms bar leaves room for a slow CI machine.
   */
  it.each([
    ['local-part characters, no @', () => 'a'.repeat(100_000)],
    ['local-part characters, @ at the end', () => `${'a'.repeat(100_000)}@`],
    ['dotted local part before one address', () => `${'a.'.repeat(50_000)}@x.my`],
    ['a domain with no letter-led last label', () => `a@${'1.'.repeat(50_000)}`],
    ['digits', () => '1'.repeat(100_000)],
    ['digits then a colon', () => `${'1'.repeat(100_000)}:`],
    ['spaced digits', () => '1 '.repeat(50_000)],
    ['hex', () => 'ab12'.repeat(25_000)],
  ])('maskContactText is linear: %s (100,000 chars)', (_shape, make) => {
    const text = make();
    const started = performance.now();
    maskContactText(text);
    expect(performance.now() - started).toBeLessThan(1_000);
  });

  /*
   * The whole path the review timed: the value is quoted in the pg cause's
   * message AND stack, and masked on each. A URL caps an id near 15,000
   * characters, which the old code masked in about a second — too close to the
   * bar to prove anything. A request BODY has no such cap. Measured 17 Sep 2026:
   * the old code took 8.7 s at 60,000 characters (this test failed at 9.2 s);
   * the linear code takes ~0.1 s at 15,000 and ~0.2 s at 60,000. 40,000 keeps
   * the old code in seconds and this one far under the bar.
   */
  it('safeErrorFields on a 22P02 quoting a 40,000-character value is linear too', () => {
    const id = 'a'.repeat(40_000);
    const cause = Object.assign(new Error(`invalid input syntax for type uuid: "${id}"`), { code: '22P02' });
    const error = new DrizzleQueryError('select "id" from "main"."user" where "id" = $1', [id], cause);
    const started = performance.now();
    const fields = safeErrorFields(error);
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(fields.pgCode).toBe('22P02');
  });
});

describe('redactQueryError / safeErrorFields — the plain-text copies', () => {
  it.each(['dev', 'prod'] as const)(
    '%s: a rethrown, redacted error logged RAW upstream prints no contact value',
    (kind) => {
      const { logger, lines } = captureLogger(kind);
      logger.error('[UpstreamController] Error:', redactQueryError(queryError()));
      expect(leaks(lines.join('\n'))).toEqual([]);
    },
  );

  it('safeErrorFields masks the cause message and never carries detail', () => {
    const fields = safeErrorFields(queryError());
    expect(leaks(fields)).toEqual([]);
    expect(fields.pgCode).toBe('22P02');
    expect(fields.cause).toContain('o••••@atlas-agency.my');
  });

  it('safeErrorFields masks a provider message on a plain error', () => {
    const fields = safeErrorFields(new Error(`550 5.1.1 <${EMAIL}>: Recipient address rejected`));
    expect(leaks(fields)).toEqual([]);
    expect(fields.error).toContain('Recipient address rejected');
  });
});

describe('PhoneVerificationRepository catches', () => {
  const repo = () => new PhoneVerificationRepositoryClass();
  it.each([
    ['create', () => repo().create({ phoneNum: '60123456789' } as never)],
    ['findActivePending', () => repo().findActivePending('60123456789', 'forgot_password')],
    ['getById', () => repo().getById(USER_ID)],
    ['update', () => repo().update(USER_ID, { phoneNum: '60123456789' })],
    ['countFailedAttempt', () => repo().countFailedAttempt(USER_ID, 5)],
    ['findNewestByCreator', () => repo().findNewestByCreator(USER_ID, ['reset_password'])],
    ['expirePendingForPhone', () => repo().expirePendingForPhone('60123456789', 'forgot_password', USER_ID)],
  ])('%s logs no contact value', async (_name, run) => {
    await run();
    expect(loggerWasCalled()).toBe(true);
    expect(leaks(logged())).toEqual([]);
  });
});

describe('UserRepository catches', () => {
  const repo = () => new UserRepositoryClass({} as never, {} as never);

  it.each([
    ['getUserByLoginMethod(email)', () => repo().getUserByLoginMethod('email', EMAIL)],
    ['getUserByLoginMethod(phone)', () => repo().getUserByLoginMethod('phone', PHONE)],
    [
      'getUsersPaginated',
      () => repo().getUsersPaginated({ filter: { email: EMAIL, phoneNum: PHONE }, page: 1, pageSize: 10 }),
    ],
    ['getUserById', () => repo().getUserById(USER_ID)],
    ['getUsersByIds', () => repo().getUsersByIds([USER_ID])],
    ['updateUser', () => repo().updateUser({ email: EMAIL, phoneNum: PHONE }, USER_ID)],
  ])('%s logs no contact value', async (_name, run) => {
    await run();
    expect(loggerWasCalled()).toBe(true);
    expect(leaks(logged())).toEqual([]);
  });

  it.each([
    ['isLoginValueTaken', () => repo().isLoginValueTaken('phone', PHONE)],
    ['recordFailedLoginAttempt', () => repo().recordFailedLoginAttempt(USER_ID, 5, 15)],
    ['createUser', () => repo().createUser({ email: EMAIL, phoneNum: PHONE } as never)],
  ])('%s logs no contact value and rethrows a scrubbed error', async (_name, run) => {
    const thrown = await run().then(
      () => null,
      (error: unknown) => error,
    );
    expect(thrown).toBe(fake.state.error);
    expect(loggerWasCalled()).toBe(true);
    expect(leaks(logged())).toEqual([]);
    expect(leaks(thrown)).toEqual([]);
  });
});

describe('PrRepository.writeStubSignInContact', () => {
  it('logs no contact value, and the error it rethrows for the controller carries none', async () => {
    const thrown = await new PrRepositoryClass()
      .writeStubSignInContact(USER_ID, { email: EMAIL, phoneNum: PHONE }, 'agency-owner')
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(thrown).toBe(fake.state.error);
    expect(fake.logger.error).toHaveBeenCalled();
    expect(leaks(logged())).toEqual([]);
    expect(leaks(thrown)).toEqual([]);
  });
});

describe('account-code catches', () => {
  it('deliverCode: provider refusals quoting the recipient are masked on every channel', async () => {
    const senders: CodeSenders = {
      whatsappConfigured: () => true,
      sendWhatsApp: vi.fn(async () => ({ ok: false as const, error: `Recipient ${PHONE} is not on WhatsApp` })),
      sendSms: vi.fn(async () => {
        throw new Error('Invalid destination 012-345 6789');
      }),
      emailConfigured: () => true,
      sendEmail: vi.fn(async () => {
        throw new Error(`550 5.1.1 <${EMAIL}>: Recipient address rejected`);
      }),
    };
    const result = await deliverCode(
      {
        code: '000000',
        purpose: 'reset_password',
        purposeLabel: 'Password reset',
        validMinutes: 10,
        phone: PHONE,
        email: EMAIL,
      },
      senders,
    );
    expect(result.sentTo.map((d) => d.status)).toEqual(['failed', 'failed', 'failed']);
    // WhatsApp refusal, SMS throw, email throw, and the "reached no channel" line.
    expect(fake.logger.warn.mock.calls.length + fake.logger.error.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(leaks(logged())).toEqual([]);
  });

  it('deliverCode under OTP_DELIVERY_LOG_ONLY: the dev log masks the destination', async () => {
    fake.env.NODE_ENV = 'development';
    fake.env.OTP_DELIVERY_LOG_ONLY = 'true';
    const senders = {
      whatsappConfigured: () => true,
      sendWhatsApp: vi.fn(),
      sendSms: vi.fn(),
      emailConfigured: () => true,
      sendEmail: vi.fn(),
    } as unknown as CodeSenders;
    await deliverCode(
      { code: '000000', purpose: 'reset_password', purposeLabel: 'Password reset', validMinutes: 10, phone: PHONE, email: EMAIL },
      senders,
    );
    expect(fake.logger.warn).toHaveBeenCalledTimes(3);
    expect(leaks(logged())).toEqual([]);
  });

  /**
   * ⚠️ Repointed 21 Sep 2026: this used to drive `accountNotices.emailChanged`.
   * That notice — and `phoneChanged` — were removed with the identity code, so
   * nothing reaches the old email or old phone any more. `passwordChanged` is
   * the ONE notice left, and it is now the one that proves the catch.
   */
  it('a notice whose SMTP send throws with the address logs it masked', async () => {
    fake.sendAccountChangeNoticeEmail.mockRejectedValueOnce(
      new Error(`550 <${EMAIL}>: mailbox unavailable`),
    );
    await accountNotices.passwordChanged({ email: EMAIL, name: 'Owner' });
    expect(fake.sendAccountChangeNoticeEmail).toHaveBeenCalled();
    expect(fake.logger.warn).toHaveBeenCalled();
    expect(leaks(logged())).toEqual([]);
  });

  it('fireNotice: a rejected or throwing notice logs no contact value', async () => {
    fireNotice(async () => {
      throw new Error(`could not reach ${PHONE}`);
    });
    fireNotice(() => {
      throw new Error(`could not reach ${EMAIL}`);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.logger.warn).toHaveBeenCalledTimes(2);
    expect(leaks(logged())).toEqual([]);
  });

  it('contact-change start: a failed pending-invite count (bound value = the email) logs it masked', async () => {
    const user = fakeUser({ id: USER_ID, email: EMAIL, phoneNum: PHONE });
    const controller = new ContactChangeControllerClass(
      fakeContactChangeDeps({
        users: {
          getUserByLoginMethod: vi.fn(async () => user),
          getUserById: vi.fn(async () => user),
        },
        countPendingInvites: vi.fn(async () => {
          throw queryError();
        }),
      }),
    );
    const res = fakeRes();
    // The current password is the first gate since 21 Sep 2026; the faked
    // comparator accepts it, so the invite count is still reached.
    await controller.start(
      fakeReq({ kind: 'email', value: 'new@atlas-agency.my', currentPassword: 'old-password' }, user),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(fake.logger.warn).toHaveBeenCalled();
    expect(leaks(fake.logger.warn.mock.calls)).toEqual([]);
  });
});

/*
 * The third dev-only code line. `delivery.ts` and `sms.ts` masked their
 * destination; `OtpController.send` still logged the full number beside the
 * code. The code stays (it is the point of a local-dev line) — the number goes.
 */
describe('OtpController.send — WhatsApp not configured (local dev)', () => {
  it('logs the code with the number masked', async () => {
    fake.whatsapp.configured = false;
    const phoneVerifications = {
      findActivePending: vi.fn(async () => null),
      expirePendingForPhone: vi.fn(async () => undefined),
      create: vi.fn(async () => ({ id: USER_ID })),
      update: vi.fn(async () => null),
    };
    const users = { getUserByLoginMethod: vi.fn(async () => null) };
    const controller = new OtpControllerClass(phoneVerifications as never, users as never);
    const res = fakeRes();
    await controller.send(fakeReq({ phoneNum: PHONE, purpose: 'signup' }), res);

    expect(process.env.NODE_ENV).not.toBe('production');
    expect(res.statusCode).toBe(200);
    // The instrument: exactly this dev line ran, and it carries a code.
    const devLines = fake.logger.warn.mock.calls.filter(([message]) =>
      String(message).includes('OTP logged for local dev only'),
    );
    expect(devLines).toHaveLength(1);
    const [, meta] = devLines[0] as [string, { phoneNum: string; code: string }];
    expect(meta.code).toMatch(/^\d{6}$/);
    expect(meta.phoneNum).toBe('+60 ••••• 6789');
    expect(leaks(logged())).toEqual([]);
  });
});
