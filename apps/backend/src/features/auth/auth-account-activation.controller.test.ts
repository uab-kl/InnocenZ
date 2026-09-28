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
import { AuthControllerClass } from './auth.controller';

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
};

function setup(options: Options = {}) {
  const userRepository = {
    getUserByLoginMethod: vi.fn(async (method: 'email' | 'phone') =>
      method === 'phone' ? (options.phoneOwner ?? null) : (options.emailOwner ?? null),
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
  };
  const agencyPrRepository = {
    filterExistingAgencyIds: vi.fn(async (ids: string[]) => ids),
    ensureLink: vi.fn(async () => {}),
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
  );
  return {
    controller,
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
    expect(ctx.phoneVerificationRepository.update).toHaveBeenCalledWith(RECEIPT_ID, {
      status: 'consumed',
      updatedBy: 'stub-1',
    });
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

  it('an IC held by ANOTHER account is still 409', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      idOwner: { userId: 'someone-else' },
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt(),
    });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
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
    expect(res.body.message).toMatch(/already registered/);
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
    expect(ctx.authRepository.createUserWithRole).not.toHaveBeenCalled();
  });

  it('never claims an ACTIVATED account — the ordinary 409, and no role read', async () => {
    const ctx = setup({ phoneOwner: account(), roles: { 'user-1': ['pr'] }, receipt: signupReceipt() });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
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
    expect(ctx.authRepository.claimUnactivatedAccount).not.toHaveBeenCalled();
  });

  it('a claim that lost the race (0 rows) is the taken-number 409 and writes nothing else', async () => {
    const ctx = setup({
      phoneOwner: stub(),
      roles: { 'stub-1': ['pr'] },
      receipt: signupReceipt(),
      claimResult: null,
    });
    const res = await call(ctx, 'registerUser', prSignUp());
    expect(res.statusCode).toBe(409);
    expect(ctx.userProfileRepository.update).not.toHaveBeenCalled();
    expect(ctx.phoneVerificationRepository.update).not.toHaveBeenCalled();
  });
});

describe('GET-style /auth/register/check — a stub’s number is available to claim', () => {
  it('a PR-only stub is not a phone conflict, nor is its own IC', async () => {
    const ctx = setup({ phoneOwner: stub(), idOwner: { userId: 'stub-1' }, roles: { 'stub-1': ['pr'] } });
    const res = await call(ctx, 'checkRegisterAvailability', { phoneNum: '0123456789', idNo: '900101145678' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ available: true });
  });

  it('an activated account, or a stub with another role, still conflicts', async () => {
    const activated = setup({ phoneOwner: account() });
    expect((await call(activated, 'checkRegisterAvailability', { phoneNum: '0123456789' })).statusCode).toBe(409);
    const orgStub = setup({ phoneOwner: stub(), roles: { 'stub-1': ['Owner'] } });
    expect((await call(orgStub, 'checkRegisterAvailability', { phoneNum: '0123456789' })).statusCode).toBe(409);
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
