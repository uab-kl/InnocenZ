import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ NODE_ENV: 'development' as string, FRONTEND_URL: 'https://app.innocenz.test' }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const password = vi.hoisted(() => ({ matches: false, compares: 0 }));
const orgStatus = vi.hoisted(() => ({ block: null as string | null }));

vi.mock('@/env.js', () => ({ env }));
vi.mock('@/env', () => ({ env }));
vi.mock('@/util/logger.js', () => ({ logger }));
vi.mock('@/util/logger', () => ({ logger }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  sendPasswordResetEmail: vi.fn(),
  emailConfigured: () => false,
  sendAccountCodeEmail: vi.fn(),
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => false,
  sendWhatsAppOtp: vi.fn(),
}));
vi.mock('@/util/password.js', () => ({
  hashPassword: async (value: string) => `hash:${value}`,
  comparePassword: async () => {
    password.compares += 1;
    return password.matches;
  },
}));
vi.mock('@/features/auth/org-status.js', () => ({
  suspendedOrgBlock: vi.fn(async () => orgStatus.block),
  orgStatusDeniesSignIn: vi.fn(() => false),
}));

import type { Request, Response } from 'express';
import type { UserType } from '@/features/user/user.model';
import { AuthControllerClass, LOGIN_REFUSAL_FLOOR_MS } from './auth.controller';
import { FAILED_LOGIN_MEMORY_MINUTES } from './unknown-login-lockout';
import {
  LOGIN_WRONG_EMAIL_OR_PASSWORD,
  LOGIN_WRONG_PHONE_OR_PASSWORD,
  lockedOutMessage,
} from './account-answers';

/**
 * OWNER, 29 SEP 2026 — "General message, both". Sign-in must not tell whoever
 * is typing whether an email or a phone number has an account: an unknown
 * identifier, an account with no password and a wrong password get ONE answer —
 * the same words, the same bcrypt work, the same floor, the same lockout — and
 * what is wrong with an ACCOUNT (inactive, a suspended organisation) is said
 * only to somebody who has proved its password.
 */

const USER_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function account(overrides: Partial<UserType> = {}): UserType {
  return {
    id: USER_ID,
    email: 'owner@venue.test',
    phoneNum: '+60123456789',
    profileImage: null,
    username: 'Owner',
    memberCode: 'INNUSR0001',
    passwordHash: 'hash:secret',
    status: 'active',
    preferredLocale: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    blockedReason: null,
    sessionsValidFrom: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  } as UserType;
}

function setup(user: UserType | null) {
  const userRepository = {
    getUserByLoginMethod: vi.fn(async () => user),
    updateUser: vi.fn(),
    recordFailedLoginAttempt: vi.fn(async () => ({ attempts: 1, lockedUntil: null })),
  };
  const jwtController = {
    generateAccessToken: vi.fn(() => 'access-token'),
    generateRefreshToken: vi.fn(() => 'refresh-token'),
    verifyToken: vi.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 900 })),
  };
  const sleep = vi.fn(async () => {});
  const controller = new AuthControllerClass(
    {} as never,
    jwtController as never,
    userRepository as never,
    {} as never,
    {} as never,
    { getByUserId: vi.fn(async () => null) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    // A clock that never moves: every refusal owes the whole floor.
    { sleep, now: () => 1_000_000 },
  );
  return { controller, userRepository, sleep };
}

type FakeRes = Response & { statusCode: number; body: { success: boolean; message: string } };

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

async function signIn(ctx: ReturnType<typeof setup>, body: Record<string, unknown>) {
  const res = fakeRes();
  await ctx.controller.login({ body, headers: {} } as unknown as Request, res);
  return res;
}

const byEmail = { email: 'owner@venue.test', password: 'guess' };
const byPhone = { phoneNum: '0123456789', password: 'guess' };

beforeEach(() => {
  password.matches = false;
  password.compares = 0;
  orgStatus.block = null;
});

describe('POST /auth/login — one answer for every wrong guess', () => {
  it('an unknown email and a wrong password get the identical 401', async () => {
    const unknown = await signIn(setup(null), byEmail);
    const wrong = await signIn(setup(account()), byEmail);

    expect(unknown.statusCode).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    expect(unknown.body).toEqual({ success: false, message: LOGIN_WRONG_EMAIL_OR_PASSWORD });
  });

  it('a phone sign-in says phone number — and is identical for an unknown number', async () => {
    const unknown = await signIn(setup(null), byPhone);
    const wrong = await signIn(setup(account()), byPhone);
    expect(unknown.body).toEqual({ success: false, message: LOGIN_WRONG_PHONE_OR_PASSWORD });
    expect(wrong.body).toEqual(unknown.body);
  });

  it('an account with NO password (a roster stub) is refused the same way, whatever the compare says', async () => {
    password.matches = true;
    const res = await signIn(setup(account({ passwordHash: null })), byEmail);
    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe(LOGIN_WRONG_EMAIL_OR_PASSWORD);
  });

  it('every refusal costs exactly one bcrypt compare, account or not', async () => {
    await signIn(setup(null), byEmail);
    expect(password.compares).toBe(1);
    await signIn(setup(account()), byEmail);
    expect(password.compares).toBe(2);
    await signIn(setup(account({ passwordHash: null })), byEmail);
    expect(password.compares).toBe(3);
  });

  it('every pre-password refusal waits out the floor; a successful sign-in does not', async () => {
    const unknown = setup(null);
    await signIn(unknown, byEmail);
    expect(unknown.sleep).toHaveBeenCalledWith(LOGIN_REFUSAL_FLOOR_MS);

    const wrong = setup(account());
    await signIn(wrong, byEmail);
    expect(wrong.sleep).toHaveBeenCalledWith(LOGIN_REFUSAL_FLOOR_MS);

    password.matches = true;
    const right = setup(account());
    const res = await signIn(right, byEmail);
    expect(res.statusCode).toBe(200);
    expect(right.sleep).not.toHaveBeenCalled();
  });
});

describe('POST /auth/login — the account’s own state, told only to whoever has its password', () => {
  it('an INACTIVE account: a wrong password gets the general 401, the right one is told', async () => {
    const wrong = await signIn(setup(account({ status: 'inactive' })), byEmail);
    expect(wrong.body.message).toBe(LOGIN_WRONG_EMAIL_OR_PASSWORD);

    password.matches = true;
    const right = await signIn(setup(account({ status: 'inactive' })), byEmail);
    expect(right.statusCode).toBe(401);
    expect(right.body.message).toBe('This account is inactive.');
  });

  it('a SUSPENDED organisation: the same — never before the password is right', async () => {
    orgStatus.block = 'Your agency has been suspended. Contact InnocenZ.';
    const wrong = await signIn(setup(account()), byEmail);
    expect(wrong.body.message).toBe(LOGIN_WRONG_EMAIL_OR_PASSWORD);

    password.matches = true;
    const right = await signIn(setup(account()), byEmail);
    expect(right.statusCode).toBe(401);
    expect(right.body.message).toBe(orgStatus.block);
  });

  it('a wrong guess at an inactive account still counts toward its lockout', async () => {
    const ctx = setup(account({ status: 'inactive' }));
    await signIn(ctx, byEmail);
    expect(ctx.userRepository.recordFailedLoginAttempt).toHaveBeenCalledTimes(1);
  });

  it('counts with the same one-day memory the no-account counter uses (migration 0170)', async () => {
    const ctx = setup(account());
    await signIn(ctx, byEmail);
    expect(ctx.userRepository.recordFailedLoginAttempt).toHaveBeenCalledWith(
      USER_ID,
      5,
      15,
      FAILED_LOGIN_MEMORY_MINUTES,
    );
  });
});

describe('POST /auth/login — an identifier with no account locks like a real one', () => {
  it('the sixth guess is the same 429 either way', async () => {
    const unknown = setup(null);
    for (let i = 0; i < 5; i += 1) {
      const res = await signIn(unknown, byEmail);
      expect(res.statusCode).toBe(401);
    }
    const sixthUnknown = await signIn(unknown, byEmail);

    const locked = setup(
      account({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 15 * 60_000) }),
    );
    const sixthReal = await signIn(locked, byEmail);

    expect(sixthUnknown.statusCode).toBe(429);
    expect(sixthUnknown.body).toEqual(sixthReal.body);
    expect(sixthUnknown.body).toEqual({ success: false, message: lockedOutMessage(15) });
  });

  it('a locked identifier is refused without a compare, as a locked account is', async () => {
    const unknown = setup(null);
    for (let i = 0; i < 5; i += 1) await signIn(unknown, byEmail);
    const before = password.compares;
    await signIn(unknown, byEmail);
    expect(password.compares).toBe(before);
  });

  it('a FAILED read is a 500 — never a wrong-password strike against whoever was typing', async () => {
    const ctx = setup(null);
    ctx.userRepository.getUserByLoginMethod.mockRejectedValue(new Error('connection reset'));
    for (let i = 0; i < 5; i += 1) {
      expect((await signIn(ctx, byEmail)).statusCode).toBe(500);
    }
    // The database is back: had the blips counted, this would be a 429.
    ctx.userRepository.getUserByLoginMethod.mockResolvedValue(null);
    expect((await signIn(ctx, byEmail)).statusCode).toBe(401);
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalledWith('email', byEmail.email, {
      rethrow: true,
    });
  });

  it('never says more than 15 minutes, whatever clock stamped the lock', async () => {
    const res = await signIn(
      setup(account({ failedLoginAttempts: 5, lockedUntil: new Date(Date.now() + 20 * 60_000) })),
      byEmail,
    );
    expect(res.body).toEqual({ success: false, message: lockedOutMessage(15) });
  });

  it('counts the same address however it is capitalised, and a number however it is spelled', async () => {
    const byMail = setup(null);
    for (let i = 0; i < 5; i += 1) {
      await signIn(byMail, { email: i % 2 ? 'OWNER@Venue.test' : 'owner@venue.test', password: 'x' });
    }
    expect((await signIn(byMail, byEmail)).statusCode).toBe(429);

    const byNumber = setup(null);
    for (const phoneNum of ['0123456789', '+60123456789', '60 12-345 6789', '0060123456789', '60123456789']) {
      await signIn(byNumber, { phoneNum, password: 'x' });
    }
    expect((await signIn(byNumber, byPhone)).statusCode).toBe(429);
  });
});
