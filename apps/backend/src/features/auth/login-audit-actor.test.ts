import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ NODE_ENV: 'development' as string, FRONTEND_URL: 'https://app.innocenz.test' }));
const logger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }));
const password = vi.hoisted(() => ({ matches: true }));
const audit = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  rolesByUser: {} as Record<string, string[]>,
}));

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
  comparePassword: async () => password.matches,
}));
vi.mock('@/features/auth/org-status.js', () => ({
  suspendedOrgBlock: vi.fn(async () => null),
  orgStatusDeniesSignIn: vi.fn(() => false),
}));
/*
 * The audit writer reads its repositories from the composition root. Faked so
 * the row it would INSERT can be read back — the same insert every REST write
 * reaches through `platformAuditMiddleware`.
 */
const compositionRoot = vi.hoisted(() => ({
  auditLogRepository: {
    createAuditLog: async (row: Record<string, unknown>) => {
      audit.rows.push(row);
      return row;
    },
  },
  userRoleRepository: {
    getUserRoles: async (userId: string) =>
      (audit.rolesByUser[userId] ?? []).map((roleName) => ({ roleName })),
  },
  agencyMemberRepository: { listByUser: async () => [] },
  outletMemberRepository: { listByUser: async () => [] },
  authRepository: { getUserDataByToken: async () => null },
}));
vi.mock('@/composition-root', () => compositionRoot);
vi.mock('@/composition-root.js', () => compositionRoot);

import type { Request, Response } from 'express';
import type { UserType } from '@/features/user/user.model';
import { logRestMutation } from '@/features/audit-log/audit-log.wrapper';
import { AuthControllerClass } from './auth.controller';

/**
 * 2,018 AUDIT ROWS READ "unknown" AND NO LOGIN WAS ATTRIBUTED (28 Sep audit).
 *
 * The "unknown" half is history: those are `POST /graphql` calls the audit
 * middleware logged while it was also mounted app-wide (the newest is 14 Sep;
 * main.ts records the unmount). The login half was still happening today —
 * `POST /auth/login` carries no bearer token, being the request that mints
 * one, so the audit resolved nobody and every sign-in landed with no user and
 * no portal. These pin the fix end to end: the controller names the account
 * once every gate has passed, and the REAL audit writer then files it.
 */

const ADMIN = 'aaaaaaaa-0000-4000-8000-000000000001';

function account(overrides: Partial<UserType> = {}): UserType {
  return {
    id: ADMIN,
    email: 'admin@innocenz.test',
    phoneNum: '+60123456789',
    profileImage: null,
    username: 'Admin',
    memberCode: 'INNADM0001',
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
  const jwtController = {
    generateAccessToken: vi.fn(() => 'access-token'),
    generateRefreshToken: vi.fn(() => 'refresh-token'),
    verifyToken: vi.fn((token: string) => ({
      type: token === 'refresh-token' ? 'refresh' : 'access',
      loginMethod: 'email',
      loginCriteria: 'admin@innocenz.test',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
    })),
  };
  const userRepository = {
    getUserByLoginMethod: vi.fn(async () => user),
    updateUser: vi.fn(),
    recordFailedLoginAttempt: vi.fn(async () => ({ attempts: 1 })),
  };
  const adminMfaRepository = { getByUserId: vi.fn(async () => null) };
  const controller = new AuthControllerClass(
    {} as never,
    jwtController as never,
    userRepository as never,
    {} as never,
    {} as never,
    adminMfaRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    // What is filed, not when it is answered — login-general-answer.test.ts owns the floor.
    { loginRefusalFloorMs: 0 },
  );
  return { controller };
}

type FakeRes = Response & { statusCode: number; body: unknown };

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

function fakeReq(path: string, body: Record<string, unknown>): Request {
  return {
    body,
    method: 'POST',
    originalUrl: path,
    headers: {},
    header: () => undefined,
    ip: '127.0.0.1',
    socket: {},
  } as unknown as Request;
}

/** What `platformAuditMiddleware` does once the response has gone out. */
async function auditOf(req: Request, res: FakeRes) {
  await logRestMutation(req, res.statusCode, req.body, res.body);
  return audit.rows[audit.rows.length - 1];
}

describe('a sign-in is filed under the account that signed in', () => {
  beforeEach(() => {
    audit.rows.length = 0;
    audit.rolesByUser = { [ADMIN]: ['admin'] };
    password.matches = true;
  });

  it('a successful login carries the user, their role and their portal', async () => {
    const { controller } = setup(account());
    const req = fakeReq('/api/v1/auth/login', { email: 'admin@innocenz.test', password: 'secret' });
    const res = fakeRes();

    await controller.login(req, res);

    expect(res.statusCode).toBe(200);
    expect(req.user?.id).toBe(ADMIN);
    const row = await auditOf(req, res);
    expect(row).toMatchObject({
      userId: ADMIN,
      role: 'admin',
      portal: 'admin',
      action: 'CREATE',
      entity: 'Auth',
    });
  });

  it('a WRONG password stays anonymous — typing it proves nothing about who you are', async () => {
    password.matches = false;
    const { controller } = setup(account());
    const req = fakeReq('/api/v1/auth/login', { email: 'admin@innocenz.test', password: 'guess' });
    const res = fakeRes();

    await controller.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
    const row = await auditOf(req, res);
    expect(row).toMatchObject({ userId: null, role: null, portal: null, action: 'CREATE_FAILED' });
  });

  it('an unknown account stays anonymous too', async () => {
    const { controller } = setup(null);
    const req = fakeReq('/api/v1/auth/login', { email: 'nobody@innocenz.test', password: 'x' });
    const res = fakeRes();

    await controller.login(req, res);

    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });

  it('a session renewal is filed under its account as well', async () => {
    const { controller } = setup(account());
    const req = fakeReq('/api/v1/auth/refresh', { refreshToken: 'refresh-token' });
    const res = fakeRes();

    await controller.refresh(req, res);

    expect(res.statusCode).toBe(200);
    const row = await auditOf(req, res);
    expect(row).toMatchObject({ userId: ADMIN, portal: 'admin', entity: 'Auth' });
  });

  it('a refused renewal (an ACCESS token offered as refresh) names nobody', async () => {
    const { controller } = setup(account());
    const req = fakeReq('/api/v1/auth/refresh', { refreshToken: 'access-token' });
    const res = fakeRes();

    await controller.refresh(req, res);

    expect(res.statusCode).toBe(401);
    expect(req.user).toBeUndefined();
  });

  it('a PR signing in lands on the PR tab, not "Others"', async () => {
    const pr = account({ id: 'bbbbbbbb-0000-4000-8000-000000000002', username: 'Vicky' });
    audit.rolesByUser = { [pr.id]: ['pr'] };
    const { controller } = setup(pr);
    const req = fakeReq('/api/v1/auth/login', { email: 'vicky@innocenz.test', password: 'secret' });
    const res = fakeRes();

    await controller.login(req, res);

    const row = await auditOf(req, res);
    expect(row).toMatchObject({ userId: pr.id, role: 'pr', portal: 'pr' });
  });
});
