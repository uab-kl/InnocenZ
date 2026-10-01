import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  NODE_ENV: 'development' as string,
  FRONTEND_URL: 'https://app.innocenz.test',
  R2_PUBLIC_URL: undefined as string | undefined,
  OTP_DELIVERY_LOG_ONLY: undefined as string | undefined,
}));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const mail = vi.hoisted(() => ({ sendPasswordResetEmail: vi.fn() }));

vi.mock('@/env.js', () => ({ env }));
vi.mock('@/env', () => ({ env }));
vi.mock('@/util/logger.js', () => ({ logger }));
vi.mock('@/util/logger', () => ({ logger }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/db/index', () => ({ db: {} }));
vi.mock('@/db', () => ({ db: {} }));
vi.mock('@/features/mailing/mailing.repository.js', () => ({
  sendPasswordResetEmail: mail.sendPasswordResetEmail,
  emailConfigured: () => false,
  sendAccountCodeEmail: vi.fn(),
}));
vi.mock('@/features/whatsapp/whatsapp-client.js', () => ({
  whatsappSendConfigured: () => false,
  sendWhatsAppOtp: vi.fn(),
}));
vi.mock('@/util/password.js', () => ({
  hashPassword: async (password: string) => `hash:${password}`,
  comparePassword: async () => true,
}));
// Storage and org side effects are not what these tests are about.
vi.mock('@/util/profile-image.js', () => ({ saveProfileImageFile: vi.fn() }));
vi.mock('@/util/user-folder.js', () => ({ refreshUserFolder: vi.fn(async () => {}) }));
vi.mock('@/util/org-logo.js', () => ({ saveOrgLogoFromBase64: vi.fn() }));
vi.mock('@/util/user-profile-image.js', () => ({
  withUserProfile: (user: Record<string, unknown>, profile: unknown) => ({ ...user, profile }),
}));
vi.mock('@/features/auth/org-status.js', () => ({
  suspendedOrgBlock: vi.fn(async () => null),
  orgStatusDeniesSignIn: vi.fn(() => false),
}));
vi.mock('@/features/outlet-workspace/default-rate-card.js', () => ({ createDefaultRateCard: vi.fn() }));
vi.mock('@/features/shift-template/starter-templates.js', () => ({ createStarterTemplates: vi.fn() }));
vi.mock('@/features/subscription/enroll-plan.js', () => ({
  enrolOrgOnPlan: vi.fn(),
  resolveEnrollablePlan: vi.fn(async () => ({ ok: true })),
}));

import { inspect } from 'node:util';
import type { Request, Response } from 'express';
import type { UserType } from '@/features/user/user.model';
import { resolveEnrollablePlan } from '@/features/subscription/enroll-plan.js';
import { AuthControllerClass } from './auth.controller';
import {
  SIGNUP_EMAIL_CODE_EXPIRED,
  SIGNUP_EMAIL_HAS_ACCOUNT,
  SIGNUP_NOT_COMPLETED,
  SIGNUP_PHONE_HAS_ACCOUNT,
} from './account-answers';
import type { SignupEmailProof } from './signup-email-code';

/**
 * FIX FIRST, 28 Sep 2026 — an account with NO PASSWORD (a roster stub `POST /pr`
 * creates) is never activated by a reset, and is claimed only by the PR's own
 * sign-up with a phone-only OTP receipt for its number. Plus: an admin creating
 * an admin may omit the phone (the screen used to invent '+admin-…'), and the
 * reset link is never logged in production.
 */

const NOW = Date.now();
const RECEIPT_ID = '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607';

function account(overrides: Partial<UserType> = {}): UserType {
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
    createdAt: new Date(NOW - 86_400_000),
    updatedAt: new Date(NOW - 86_400_000),
    createdBy: 'system',
    updatedBy: 'system',
    ...overrides,
  } as UserType;
}

/** A roster stub an agency created: active, no password, the agency's spelling of the phone. */
const stub = () =>
  account({
    id: 'stub-1',
    passwordHash: null,
    phoneNum: '0123456789',
    email: 'agency-typed@atlas-agency.my',
    username: 'vicky',
    createdBy: 'agency-owner-1',
  });

function signupReceipt(channel = 'whatsapp,sms') {
  return {
    id: RECEIPT_ID,
    phoneNum: '60123456789',
    codeHash: 'x',
    channel,
    purpose: 'signup',
    status: 'verified',
    attempts: 0,
    expiresAt: new Date(NOW + 600_000),
    verifiedAt: new Date(NOW),
    waMessageId: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    createdBy: 'system',
    updatedBy: 'system',
  };
}

type Options = {
  phoneOwner?: UserType | null;
  emailOwner?: UserType | null;
  byId?: UserType | null;
  idOwner?: { userId: string } | null;
  roles?: Record<string, string[]>;
  roleRows?: Record<string, { id: string; roleName: string }>;
  receipt?: ReturnType<typeof signupReceipt> | null;
  claimResult?: UserType | null;
  resetToken?: { userId: string; token: string; expiresAt: Date } | null;
  /** Keep the after-answer work unstarted (see `held`). */
  holdAfterAnswer?: boolean;
  /** What spending an outlet / agency sign-up's emailed code answers (default: proved). */
  emailProof?: SignupEmailProof;
  /** The typed number is on file TWICE: the sign-in lookup refuses to pick (null). */
  phoneOnTwoAccounts?: boolean;
};

function setup(options: Options = {}) {
  const userRepository = {
    getUserByLoginMethod: vi.fn(async (method: 'email' | 'phone') =>
      method === 'phone'
        ? options.phoneOnTwoAccounts
          ? null
          : (options.phoneOwner ?? null)
        : (options.emailOwner ?? null),
    ),
    // Any match counts — two included (the fail-closed question).
    isLoginValueTaken: vi.fn(async (method: 'email' | 'phone') =>
      method === 'phone'
        ? Boolean(options.phoneOwner || options.phoneOnTwoAccounts)
        : Boolean(options.emailOwner),
    ),
    getUserById: vi.fn(async () => options.byId ?? null),
    updateUser: vi.fn(),
  };
  const authRepository = {
    getRolesForUserIds: vi.fn(async (ids: string[]) =>
      (options.roles?.[ids[0]] ?? []).map((roleName) => ({
        userId: ids[0],
        roleId: `role-${roleName}`,
        roleName,
        portalId: null,
        portalCode: null,
      })),
    ),
    claimUnactivatedAccount: vi.fn(async (input: Record<string, unknown>) =>
      options.claimResult !== undefined
        ? options.claimResult
        : ({ ...stub(), ...input, id: input.userId, passwordHash: input.passwordHash } as UserType),
    ),
    createUserWithRole: vi.fn(async (data: Record<string, unknown>) => ({ ...account({ id: 'new-user' }), ...data })),
    createResetPasswordToken: vi.fn(async () => {}),
    getPasswordResetToken: vi.fn(async () => options.resetToken ?? null),
    deletePasswordResetToken: vi.fn(async () => {}),
    updateUserPassword: vi.fn(async () => new Date(NOW)),
  };
  const userProfileRepository = {
    findByNormalizedIdNo: vi.fn(async () => options.idOwner ?? null),
    update: vi.fn(async (userId: string, patch: Record<string, unknown>) => ({ userId, ...patch })),
    getByUserId: vi.fn(async () => null),
  };
  const roleRepository = {
    getRoleById: vi.fn(async (id: string) => options.roleRows?.[id] ?? null),
    findByNameAndPortalCode: vi.fn(async (roleName: string) => ({ id: `role-${roleName}`, roleName })),
  };
  const phoneVerificationRepository = {
    getById: vi.fn(async () => options.receipt ?? null),
    update: vi.fn(async () => ({})),
    // `verified → consumed` in one statement, as the SQL does: the first wins.
    transition: vi.fn(async (id: string, from: string, data: Record<string, unknown>) => {
      const receipt = options.receipt;
      if (!receipt || receipt.id !== id || receipt.status !== from) return null;
      Object.assign(receipt, data);
      return receipt;
    }),
  };
  const agencyPrRepository = {
    filterExistingAgencyIds: vi.fn(async (ids: string[]) => ids),
    ensureLink: vi.fn(async () => {}),
  };
  /**
   * Work handed over after an answer (the emailed reset link). Started at once,
   * as production does, but kept so `call` can await it — or, with
   * `holdAfterAnswer`, kept UNSTARTED so a test can look between the answer
   * and the work.
   */
  const afterAnswer: Array<Promise<void>> = [];
  const held: Array<() => Promise<void>> = [];
  const signupEmailCodes = {
    redeem: vi.fn(async (): Promise<SignupEmailProof> => options.emailProof ?? { ok: true }),
  };
  const controller = new AuthControllerClass(
    authRepository as never,
    {} as never,
    userRepository as never,
    userProfileRepository as never,
    roleRepository as never,
    {} as never,
    phoneVerificationRepository as never,
    agencyPrRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      runAfterAnswer: (task) => {
        if (options.holdAfterAnswer) held.push(task);
        else afterAnswer.push(task());
      },
      signupEmailCodes,
    },
  );
  return {
    controller,
    afterAnswer,
    held,
    signupEmailCodes,
    userRepository,
    authRepository,
    userProfileRepository,
    roleRepository,
    phoneVerificationRepository,
    agencyPrRepository,
  };
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

function req(body: unknown, userId?: string): Request {
  return { body, user: userId ? { id: userId } : undefined } as unknown as Request;
}

async function call(
  ctx: ReturnType<typeof setup>,
  method: 'registerUser' | 'forgotPassword' | 'resetPassword' | 'resetPasswordWithOtp' | 'checkRegisterAvailability',
  body: unknown,
  userId?: string,
) {
  const res = fakeRes();
  await ctx.controller[method](req(body, userId), res);
  // The work production runs after the answer — awaited, so a test sees it.
  await Promise.all(ctx.afterAnswer.splice(0));
  return res;
}

/** A complete public PR sign-up body for the stub's number. */
function prSignUp(overrides: Record<string, unknown> = {}) {
  return {
    accountType: 'pr',
    phoneNum: '+60 12-345 6789',
    username: 'Vicky',
    password: 'secret1',
    email: 'vicky@mail.my',
    verificationId: RECEIPT_ID,
    fullName: 'Victoria Tan Mei Lin',
    nationality: 'Malaysian',
    idType: 'NRIC',
    idNo: '900101-14-5678',
    dob: '1990-01-01',
    addressLine1: '20 Jalan Ria',
    city: 'Kuala Lumpur',
    postcode: '50450',
    state: 'Kuala Lumpur',
    country: 'Malaysia',
    languages: ['English'],
    ...overrides,
  };
}

beforeEach(() => {
  env.NODE_ENV = 'development';
  vi.clearAllMocks();
  mail.sendPasswordResetEmail.mockReset();
});

describe('POST /auth/register — a PR claims the roster stub for her verified number', () => {
  it('claims the stub instead of refusing "already registered": her password, username, email and the proven phone', async () => {
    const ctx = setup({ phoneOwner: stub(), roles: { 'stub-1': ['pr'] }, receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());

    expect(res.statusCode).toBe(201);
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
    expect(ctx.authRepository.claimUnactivatedAccount).toHaveBeenCalledWith({
      userId: 'stub-1',
      passwordHash: 'hash:secret1',
      username: 'Vicky',
      email: 'vicky@mail.my',
      // The number she proved, stored canonically — not the agency's '0123…'.
      phoneNum: '+60123456789',
      // The person acting on her own account.
      actor: 'stub-1',
    });
    // The rest of sign-up lands on the claimed account.
    expect(ctx.userProfileRepository.update).toHaveBeenCalledWith(
      'stub-1',
      expect.objectContaining({ fullName: 'Victoria Tan Mei Lin', updatedBy: 'stub-1' }),
    );
    // Spent once, before the lookups, from `verified` only.
    expect(ctx.phoneVerificationRepository.transition).toHaveBeenCalledTimes(1);
    expect(ctx.phoneVerificationRepository.transition).toHaveBeenCalledWith(
      RECEIPT_ID,
      'verified',
      expect.objectContaining({ status: 'consumed' }),
    );
  });

  it('drops the email the AGENCY typed when she leaves hers blank', async () => {
    const ctx = setup({ phoneOwner: stub(), roles: { 'stub-1': ['pr'] }, receipt: signupReceipt() });
    // The app sends no key at all for a blank email (`email.trim() || undefined`).
    const res = await call(ctx, 'registerUser', prSignUp({ email: undefined }));
    expect(res.statusCode).toBe(201);
    expect(ctx.authRepository.claimUnactivatedAccount).toHaveBeenCalledWith(
      expect.objectContaining({ email: null }),
    );
  });

  it("the stub's OWN email and IC are not conflicts", async () => {
    const own = stub();
    const ctx = setup({
      phoneOwner: own,
      emailOwner: own,
      idOwner: { userId: 'stub-1' },
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt(),
    });
    const res = await call(ctx, 'registerUser', prSignUp({ email: 'agency-typed@atlas-agency.my' }));
    expect(res.statusCode).toBe(201);
    expect(ctx.authRepository.claimUnactivatedAccount).toHaveBeenCalled();
  });

  it('an IC held by ANOTHER account is still 409 — in the general sentence, which names no field', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      idOwner: { userId: 'someone-else' },
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt(),
    });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
  });

  it('REFUSES a claim on a receipt whose code also went to an email — that proves the inbox, not the phone', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt('whatsapp,sms,email'),
    });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    // The phone was NOT proved, so it is not named either.
    expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('never claims an ACTIVATED account — 409 naming the phone she just proved, and no role read', async () => {
    const ctx = setup({ phoneOwner: account(), roles: { 'user-1': ['pr'] }, receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_PHONE_HAS_ACCOUNT);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
    expect(ctx.authRepository.getRolesForUserIds).not.toHaveBeenCalledWith(['user-1']);
  });

  it('never claims a password-less account holding an organisation role', async () => {
    const ctx = setup({ phoneOwner: stub(), roles: { 'stub-1': ['pr', 'Owner'] }, receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
  });

  it('never claims for an ADMIN caller — only a public PR sign-up proves the phone', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      roles: { 'stub-1': ['pr'], 'admin-1': ['admin'] },
      receipt: signupReceipt(),
    });
    const res = await call(ctx, 'registerUser', prSignUp(), 'admin-1');
    expect(res.statusCode).toBe(409);
    // An admin is still told WHICH field — they can see every account anyway.
    expect(res.body.message).toMatch(/phone number .* is already registered/);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
  });

  it('a claim that lost the race (0 rows) is the taken-number 409 — it spends the receipt and writes nothing else', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt(),
      claimResult: null,
    });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_PHONE_HAS_ACCOUNT);
    expect(ctx.userProfileRepository.update).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.update).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.transition).toHaveBeenCalledTimes(1);
  });
});

describe('POST /auth/register — a REFUSED PR sign-up spends its phone code too (owner, 30 Sep 2026)', () => {
  it.each([
    ['its email is taken', { emailOwner: account({ id: 'other-1' }) }],
    ['its ID number is taken', { idOwner: { userId: 'other-1' } }],
    ['its phone has an account', { phoneOwner: account() }],
  ])('when %s, the receipt is consumed with the 409 — the next try needs a new code', async (_label, options) => {
    const ctx = setup({ ...options, receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(ctx.phoneVerificationRepository.transition).toHaveBeenCalledWith(
      RECEIPT_ID,
      'verified',
      expect.objectContaining({ status: 'consumed' }),
    );
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('a refusal BEFORE the lookups (no password) leaves the receipt usable', async () => {
    const ctx = setup({ receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp({ password: '' }));
    expect(res.statusCode).toBe(400);
    expect(ctx.phoneVerificationRepository.transition).not.toHaveBeenCalled();
  });

  it('two sign-ups on ONE receipt: only the first reaches the lookups (security review, 30 Sep 2026)', async () => {
    const ctx = setup({ emailOwner: account({ id: 'other-1' }), receipt: signupReceipt() });
    // Both read the receipt as `verified` — sent together, before either spent it.
    ctx.phoneVerificationRepository.getById.mockImplementation(async () => signupReceipt());
    ctx.phoneVerificationRepository.transition
      .mockImplementationOnce(async () => ({ ...signupReceipt(), status: 'consumed' }) as never)
      .mockImplementationOnce(async () => null);

    const first = await call(ctx, 'registerUser', prSignUp());
    const lookupsAfterFirst = ctx.userRepository.getUserByLoginMethod.mock.calls.length;
    const second = await call(ctx, 'registerUser', prSignUp({ email: 'another@mail.my' }));

    expect(first.statusCode).toBe(409);
    expect(second.statusCode).toBe(400);
    expect(second.body.message).toBe('Phone verification is missing or expired — verify again');
    // The second never asked whether its address had an account.
    expect(ctx.userRepository.getUserByLoginMethod.mock.calls.length).toBe(lookupsAfterFirst);
  });

  it('a PR sign-up never asks for an emailed code', async () => {
    const ctx = setup({ receipt: signupReceipt() });
    await call(ctx, 'registerUser', prSignUp());
    expect(ctx.signupEmailCodes.redeem).not.toHaveBeenCalled();
  });
});

describe('POST /auth/register — a public collision names no field it has not proved (owner, 29-30 Sep 2026)', () => {
  /** A complete public OUTLET sign-up, carrying the code emailed to its address. */
  function outletSignUp(overrides: Record<string, unknown> = {}) {
    return {
      accountType: 'outlet',
      phoneNum: '+60 12-999 0000',
      username: 'Venue Owner',
      password: 'secret1',
      email: 'owner@venue.my',
      emailCodeId: '11111111-2222-4333-8444-555555555555',
      emailCode: '123456',
      companyName: 'Velvet Lounge Sdn Bhd',
      companyRegistrationNew: '202601000001',
      businessLicense: 'LIC-001',
      personInCharge: 'Venue Owner',
      idType: 'NRIC',
      idNo: '800101-14-5678',
      gender: 'female',
      packageId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      ackPersonalInfo: true,
      ackDeclarationOfTruth: true,
      ackInformationSharing: true,
      acceptTerms: true,
      ...overrides,
    };
  }

  it.each([
    ['its phone', { phoneOwner: account({ id: 'other-1' }) }],
    ['its ID number', { idOwner: { userId: 'other-1' } }],
  ])('an outlet sign-up whose %s is taken gets the one sentence — and the same body', async (_label, options) => {
    const res = await call(setup(options), 'registerUser', outletSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, message: SIGNUP_NOT_COMPLETED, data: null });
  });

  it('a taken EMAIL is named — its code has just proved the address belongs to whoever is typing', async () => {
    const res = await call(
      setup({ emailOwner: account({ id: 'other-1' }) }),
      'registerUser',
      outletSignUp(),
    );
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ success: false, message: SIGNUP_EMAIL_HAS_ACCOUNT, data: null });
  });

  it('spends the emailed code for the address typed, after the lookup-free checks and before any lookup', async () => {
    const ctx = setup({ emailProof: { ok: false, status: 400, message: SIGNUP_EMAIL_CODE_EXPIRED } });
    const res = await call(ctx, 'registerUser', outletSignUp());

    expect(ctx.signupEmailCodes.redeem).toHaveBeenCalledWith({
      codeId: '11111111-2222-4333-8444-555555555555',
      code: '123456',
      email: 'owner@venue.my',
      actor: expect.any(String),
    });
    // The redeemer's own answer, verbatim — and nothing was looked up or made.
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ success: false, message: SIGNUP_EMAIL_CODE_EXPIRED, data: null });
    expect(ctx.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
    expect(ctx.userProfileRepository.findByNormalizedIdNo).not.toHaveBeenCalled();
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('an IC that contradicts the gender ticked is refused before the code is spent or anything is made', async () => {
    // Security review, 30 Sep 2026: this ran AFTER createUserWithRole, leaving a
    // half-built account and — with the emailed code — a spent code behind it.
    const ctx = setup();
    const res = await call(ctx, 'registerUser', outletSignUp({ gender: 'male' }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/^The IC number says \w+ but male was selected/);
    expect(ctx.signupEmailCodes.redeem).not.toHaveBeenCalled();
    expect(ctx.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('a public outlet sign-up with no email is refused before a code is spent', async () => {
    const ctx = setup();
    const res = await call(ctx, 'registerUser', outletSignUp({ email: undefined }));
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Email is required');
    expect(ctx.signupEmailCodes.redeem).not.toHaveBeenCalled();
    expect(ctx.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
  });

  it('an ADMIN creating an outlet account needs no emailed code', async () => {
    const ctx = setup({ roles: { 'admin-1': ['admin'] } });
    await call(ctx, 'registerUser', outletSignUp({ emailCodeId: undefined, emailCode: undefined }), 'admin-1');
    expect(ctx.signupEmailCodes.redeem).not.toHaveBeenCalled();
    // It went on to the lookups — past the block a public sign-up stops at.
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalled();
  });

  it.each([
    ['a made-up package', { packageId: '00000000-0000-4000-8000-000000000000' }],
    ['no account type', { accountType: undefined }],
  ])('%s is refused 400 BEFORE anything is looked up — a taken email cannot turn it into 409', async (_label, overrides) => {
    // Security review, 30 Sep 2026: these ran AFTER the "is it taken" test,
    // so a request made invalid on purpose read 409-vs-400 and created nothing.
    if ('packageId' in overrides) {
      vi.mocked(resolveEnrollablePlan).mockResolvedValueOnce({
        ok: false,
        message: 'Choose a subscription package',
      } as never);
    }
    const ctx = setup({ emailOwner: account({ id: 'other-1' }) });
    const res = await call(ctx, 'registerUser', outletSignUp(overrides));

    expect(res.statusCode).toBe(400);
    expect(ctx.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
    expect(ctx.userProfileRepository.findByNormalizedIdNo).not.toHaveBeenCalled();
    // Nor is the typist's code burnt by a request that was never going to work.
    expect(ctx.signupEmailCodes.redeem).not.toHaveBeenCalled();
  });

  it('a number already on TWO accounts is TAKEN — the sign-in lookup refusing to pick is not "free"', async () => {
    const ctx = setup({ phoneOnTwoAccounts: true });
    const res = await call(ctx, 'registerUser', outletSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it.each([
    ['the phone lookup', (ctx: ReturnType<typeof setup>) => ctx.userRepository.getUserByLoginMethod.mockRejectedValue(new Error('connection reset'))],
    ['the ID-number lookup', (ctx: ReturnType<typeof setup>) => ctx.userProfileRepository.findByNormalizedIdNo.mockRejectedValue(new Error('connection reset'))],
    ['the taken check', (ctx: ReturnType<typeof setup>) => ctx.userRepository.isLoginValueTaken.mockRejectedValue(new Error('connection reset'))],
  ])('a failed read in %s is a 500 that creates nothing — never "free"', async (_label, breakIt) => {
    const ctx = setup();
    breakIt(ctx);
    const res = await call(ctx, 'registerUser', outletSignUp());
    expect(res.statusCode).toBe(500);
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('asks every lookup to FAIL CLOSED', async () => {
    const ctx = setup();
    await call(ctx, 'registerUser', outletSignUp());
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalledWith('phone', expect.any(String), { rethrow: true });
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalledWith('email', 'owner@venue.my', { rethrow: true });
    expect(ctx.userRepository.isLoginValueTaken).toHaveBeenCalledWith('email', 'owner@venue.my');
    expect(ctx.userRepository.isLoginValueTaken).toHaveBeenCalledWith('phone', expect.any(String));
  });

  it('runs every lookup before answering, so which one hit is not in the timing', async () => {
    const ctx = setup({ emailOwner: account({ id: 'other-1' }) });
    await call(ctx, 'registerUser', outletSignUp());
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalledWith('phone', expect.any(String), expect.anything());
    expect(ctx.userRepository.getUserByLoginMethod).toHaveBeenCalledWith('email', 'owner@venue.my', expect.anything());
    expect(ctx.userProfileRepository.findByNormalizedIdNo).toHaveBeenCalled();
  });

  it('a PR with a PROVED phone whose EMAIL is taken is not told it is the email', async () => {
    const ctx = setup({ emailOwner: account({ id: 'other-1' }), receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(res.body.message).toBe(SIGNUP_NOT_COMPLETED);
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
    // …and the receipt is spent, so the same proof cannot try the next address.
    expect(ctx.phoneVerificationRepository.transition).toHaveBeenCalledWith(
      RECEIPT_ID,
      'verified',
      expect.objectContaining({ status: 'consumed' }),
    );
  });
});

describe('/auth/register/check — no longer says whether a number or an ID has an account', () => {
  it.each([
    ['no account', {}],
    ['an activated account', { phoneOwner: account() }],
    ['a PR-only roster stub', { phoneOwner: stub(), roles: { 'stub-1': ['pr'] } }],
    ['a stub with an organisation role', { phoneOwner: stub(), roles: { 'stub-1': ['Owner'] } }],
    ['an ID held by someone', { idOwner: { userId: 'someone-else' } }],
  ])('%s: the same 200, and nothing is looked up', async (_label, options) => {
    const ctx = setup(options);
    const res = await call(ctx, 'checkRegisterAvailability', { phoneNum: '0123456789', idNo: '900101145678' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'OK', data: null });
    expect(ctx.userRepository.getUserByLoginMethod).not.toHaveBeenCalled();
    expect(ctx.userProfileRepository.findByNormalizedIdNo).not.toHaveBeenCalled();
  });

  it('still refuses a body that is not a sign-up at all', async () => {
    const res = await call(setup(), 'checkRegisterAvailability', { phoneNum: '12' });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /auth/register — the phone may be omitted ONLY by an admin creating an admin', () => {
  const adminBody = {
    email: 'new.admin@innocenz.my',
    username: 'New Admin',
    password: 'secret1',
    roleId: 'role-admin',
  };

  it('an admin creating an ADMIN with no phone stores NO phone — nothing invented', async () => {
    const ctx = setup({
      roles: { 'admin-1': ['admin'] },
      roleRows: { 'role-admin': { id: 'role-admin', roleName: 'admin' } },
    });
    const res = await call(ctx, 'registerUser', adminBody, 'admin-1');
    expect(res.statusCode).toBe(201);
    expect(ctx.authRepository.createUserWithRole).toHaveBeenCalledWith(
      expect.objectContaining({ phoneNum: null, email: 'new.admin@innocenz.my' }),
      'role-admin',
    );
  });

  it('an admin creating a NON-admin must still send a phone', async () => {
    const ctx = setup({
      roles: { 'admin-1': ['admin'] },
      roleRows: { 'role-pr': { id: 'role-pr', roleName: 'pr' } },
    });
    const res = await call(ctx, 'registerUser', { ...adminBody, roleId: 'role-pr' }, 'admin-1');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Phone number is required');
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('a PUBLIC caller naming the admin role gets no exemption', async () => {
    const ctx = setup({ roleRows: { 'role-admin': { id: 'role-admin', roleName: 'admin' } } });
    const res = await call(ctx, 'registerUser', adminBody);
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Phone number is required');
    expect(ctx.roleRepository.getRoleById).not.toHaveBeenCalled();
  });

  it('a public PR or org sign-up with a blank phone is refused, never stored as ""', async () => {
    const ctx = setup();
    for (const phoneNum of [undefined, '', '   ']) {
      const res = await call(ctx, 'registerUser', prSignUp({ phoneNum }));
      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe('Phone number is required');
    }
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });
});

describe('POST /auth/forgot-password (emailed link) — never activates, never leaks the link', () => {
  it('a password-less account gets the unknown-address answer: no token, no mail', async () => {
    const stubCtx = setup({ emailOwner: stub() });
    const unknownCtx = setup({ emailOwner: null });
    const s = await call(stubCtx, 'forgotPassword', { email: 'agency-typed@atlas-agency.my' });
    const u = await call(unknownCtx, 'forgotPassword', { email: 'agency-typed@atlas-agency.my' });

    expect(s.statusCode).toBe(200);
    expect(s.body).toEqual(u.body);
    expect(stubCtx.authRepository.createResetPasswordToken).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('answers FIRST — the token and the mail come after, so the delay cannot say who has an account', async () => {
    // Security review, 30 Sep 2026: a real account was answered only after its
    // token write and mail send (~1 s), an unknown address straight away.
    const ctx = setup({ emailOwner: account(), holdAfterAnswer: true });
    const res = await call(ctx, 'forgotPassword', { email: 'owner@atlas-agency.my' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual((await call(setup({ emailOwner: null }), 'forgotPassword', {
      email: 'nobody@atlas-agency.my',
    })).body);
    expect(ctx.authRepository.createResetPasswordToken).not.toHaveBeenCalled();
    expect(mail.sendPasswordResetEmail).not.toHaveBeenCalled();

    await Promise.all(ctx.held.splice(0).map((task) => task()));
    expect(ctx.authRepository.createResetPasswordToken).toHaveBeenCalledTimes(1);
    expect(mail.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
  });

  it('PRODUCTION with mail unconfigured: logs WHO, never the link or its token', async () => {
    env.NODE_ENV = 'production';
    mail.sendPasswordResetEmail.mockResolvedValueOnce(null);
    const ctx = setup({ emailOwner: account() });
    const res = await call(ctx, 'forgotPassword', { email: 'owner@atlas-agency.my' });

    expect(res.statusCode).toBe(200);
    const token = (ctx.authRepository.createResetPasswordToken.mock.calls[0] as unknown[])[1] as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const logged = inspect(
      [...logger.info.mock.calls, ...logger.warn.mock.calls, ...logger.error.mock.calls],
      { depth: 8 },
    );
    expect(logged).not.toContain(token);
    expect(logged).not.toContain('reset-password?token');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('NOT delivered'),
      { userId: 'user-1' },
    );
  });

  it('OUTSIDE production the link is still logged, so a developer can finish the flow', async () => {
    mail.sendPasswordResetEmail.mockResolvedValueOnce(null);
    const ctx = setup({ emailOwner: account() });
    await call(ctx, 'forgotPassword', { email: 'owner@atlas-agency.my' });
    const token = (ctx.authRepository.createResetPasswordToken.mock.calls[0] as unknown[])[1] as string;
    expect(inspect(logger.warn.mock.calls, { depth: 8 })).toContain(token);
  });

  it('a mail failure is logged without the recipient address the SMTP refusal quotes', async () => {
    env.NODE_ENV = 'production';
    mail.sendPasswordResetEmail.mockRejectedValueOnce(
      new Error('550 <owner@atlas-agency.my>: Recipient address rejected'),
    );
    const ctx = setup({ emailOwner: account() });
    const res = await call(ctx, 'forgotPassword', { email: 'owner@atlas-agency.my' });
    expect(res.statusCode).toBe(200);
    const logged = inspect(logger.error.mock.calls, { depth: 8 });
    expect(logged).toContain('550');
    expect(logged).not.toContain('owner@atlas-agency.my');
  });
});

describe('POST /auth/reset-password (the link) — re-reads the account before writing', () => {
  const token = 'a'.repeat(64);
  const liveToken = { userId: 'stub-1', token, expiresAt: new Date(NOW + 600_000) };

  it('refuses a password-less account as an invalid link, and spends the token', async () => {
    const ctx = setup({ resetToken: liveToken, byId: stub() });
    const res = await call(ctx, 'resetPassword', { token, password: 'new-password' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Reset link is invalid or has expired.');
    expect(ctx.authRepository.updateUserPassword).not.toHaveBeenCalled();
    expect(ctx.authRepository.deletePasswordResetToken).toHaveBeenCalledWith(token);
  });

  it('refuses an account disabled since the link was sent', async () => {
    const ctx = setup({ resetToken: liveToken, byId: account({ id: 'stub-1', status: 'inactive' }) });
    const res = await call(ctx, 'resetPassword', { token, password: 'new-password' });
    expect(res.statusCode).toBe(400);
    expect(ctx.authRepository.updateUserPassword).not.toHaveBeenCalled();
  });

  it('a failed account read refuses WITHOUT spending the token', async () => {
    const ctx = setup({ resetToken: liveToken, byId: null });
    const res = await call(ctx, 'resetPassword', { token, password: 'new-password' });
    expect(res.statusCode).toBe(400);
    expect(ctx.authRepository.updateUserPassword).not.toHaveBeenCalled();
    expect(ctx.authRepository.deletePasswordResetToken).not.toHaveBeenCalled();
  });

  it('still resets an active account that has a password', async () => {
    const ctx = setup({ resetToken: liveToken, byId: account({ id: 'stub-1' }) });
    const res = await call(ctx, 'resetPassword', { token, password: 'new-password' });
    expect(res.statusCode).toBe(200);
    expect(ctx.authRepository.updateUserPassword).toHaveBeenCalledWith('stub-1', 'hash:new-password', {
      updatedBy: 'stub-1',
      clearLockout: true,
    });
  });
});

describe('POST /auth/reset-password-otp (PR app, WhatsApp) — not a way to activate either', () => {
  const receipt = { ...signupReceipt(), purpose: 'forgot_password' };

  it('a password-less account is answered exactly as a number with no account', async () => {
    const stubCtx = setup({ phoneOwner: stub(), receipt, roles: { 'stub-1': ['pr'] } });
    const unknownCtx = setup({ phoneOwner: null, receipt });
    const body = { phoneNum: '60123456789', verificationId: RECEIPT_ID, password: 'new-password' };
    const s = await call(stubCtx, 'resetPasswordWithOtp', body);
    const u = await call(unknownCtx, 'resetPasswordWithOtp', body);

    expect(s.statusCode).toBe(400);
    expect(s.body).toEqual(u.body);
    expect(stubCtx.authRepository.updateUserPassword).not.toHaveBeenCalled();
    expect(stubCtx.phoneVerificationRepository.update).not.toHaveBeenCalled();
  });
});
