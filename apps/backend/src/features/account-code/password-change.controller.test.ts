import { describe, expect, it, vi } from 'vitest';

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

import { inspect } from 'node:util';
import { DrizzleQueryError } from 'drizzle-orm';
import { logger } from '@/util/logger.js';
import { isTokenBeforeCutoff } from '@/features/auth/session-cutoff';
import { NOW, fakeNotices, fakeReq, fakeRes, fakeUser } from './fakes.test-support';
import { PasswordChangeControllerClass } from './password-change.controller';

function setup(bearer: { loginMethod: 'email' | 'phone'; loginCriteria: string }) {
  const user = fakeUser();
  const updateUserPassword = vi.fn(
    async (_id: string, _hash: string, options: { cutoff?: Date } = {}) => options.cutoff ?? new Date(NOW),
  );
  const jwt = {
    verifyToken: vi.fn(() => ({ ...bearer, type: 'access' })),
    generateAccessToken: vi.fn((info: { loginMethod: string; loginCriteria: string }) => `access:${info.loginMethod}:${info.loginCriteria}`),
    generateRefreshToken: vi.fn((info: { loginMethod: string; loginCriteria: string }) => `refresh:${info.loginMethod}:${info.loginCriteria}`),
  };
  const notices = fakeNotices();
  const controller = new PasswordChangeControllerClass({
    users: { getUserById: vi.fn(async () => user) },
    passwords: { updateUserPassword } as never,
    jwt: jwt as never,
    hashPassword: async (pw: string) => `hash:${pw}`,
    comparePassword: async (pw: string, hash: string) => hash === `hash:${pw}`,
    notices,
    now: () => NOW,
  });
  const change = async (body: unknown) => {
    const res = fakeRes();
    await controller.change(fakeReq(body, user, 'bearer-token'), res);
    return res;
  };
  return { change, updateUserPassword, jwt, notices, user };
}

describe('POST /auth/password/change', () => {
  it('re-issues the token pair with the BEARER’s loginMethod and loginCriteria', async () => {
    const ctx = setup({ loginMethod: 'phone', loginCriteria: '+60123456789' });
    const res = await ctx.change({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe('Password updated');
    expect(res.body.data).toEqual({
      accessToken: 'access:phone:+60123456789',
      refreshToken: 'refresh:phone:+60123456789',
    });
    expect(ctx.notices.passwordChanged).toHaveBeenCalledWith({ email: 'owner@atlas-agency.my', name: 'Owner' });
  });

  it('stamps a cutoff FLOORED to the second, which the re-issued token survives', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    await ctx.change({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(ctx.updateUserPassword).toHaveBeenCalledTimes(1);
    const [userId, hash, options] = ctx.updateUserPassword.mock.calls[0];
    expect(userId).toBe('user-1');
    expect(hash).toBe('hash:new-password');
    expect(options).toMatchObject({ updatedBy: 'user-1' });
    const cutoff = options!.cutoff!;
    expect(cutoff.getTime() % 1000).toBe(0);
    expect(cutoff.getTime()).toBe(Math.floor(NOW / 1000) * 1000);

    // A token minted in the same second (iat has no milliseconds) is kept; one
    // from the second before is cut.
    const sameSecondIat = new Date(Math.floor(NOW / 1000) * 1000);
    expect(isTokenBeforeCutoff(sameSecondIat, cutoff)).toBe(false);
    expect(isTokenBeforeCutoff(new Date(cutoff.getTime() - 1000), cutoff)).toBe(true);
  });

  it('a wrong current password is 400, never 401, and writes nothing', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    const res = await ctx.change({ currentPassword: 'guess', newPassword: 'new-password' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('Current password is incorrect');
    expect(ctx.updateUserPassword).not.toHaveBeenCalled();
    expect(ctx.jwt.generateAccessToken).not.toHaveBeenCalled();
  });

  it('refuses a new password equal to the current one', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    const res = await ctx.change({ currentPassword: 'old-password', newPassword: 'old-password' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe('New password must be different');
    expect(ctx.updateUserPassword).not.toHaveBeenCalled();
  });

  it('enforces 6-72 characters', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    expect((await ctx.change({ currentPassword: 'old-password', newPassword: '12345' })).statusCode).toBe(400);
    expect((await ctx.change({ currentPassword: 'old-password', newPassword: 'x'.repeat(73) })).statusCode).toBe(400);
    expect(ctx.updateUserPassword).not.toHaveBeenCalled();
  });

  it('still answers 200 when the tokens cannot be re-issued — the password IS changed', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    ctx.jwt.verifyToken.mockImplementationOnce(() => {
      throw new Error('bad token');
    });
    const res = await ctx.change({ currentPassword: 'old-password', newPassword: 'new-password' });
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toEqual({ accessToken: null, refreshToken: null });
  });

  it('a failed write is 500 and is logged WITHOUT the hash drizzle puts in the error', async () => {
    const ctx = setup({ loginMethod: 'email', loginCriteria: 'owner@atlas-agency.my' });
    const fakeHash = '$2b$10$FAKEHASHVALUEFAKEHASHVALUEFAKEHASHVALUE';
    ctx.updateUserPassword.mockRejectedValueOnce(
      new DrizzleQueryError(
        'update "user" set "password_hash" = $1 where "id" = $2',
        [fakeHash, 'user-1'],
        Object.assign(new Error('connection reset'), { code: '08006' }),
      ),
    );
    vi.mocked(logger.error).mockClear();

    const res = await ctx.change({ currentPassword: 'old-password', newPassword: 'new-password' });

    expect(res.statusCode).toBe(500);
    expect(logger.error).toHaveBeenCalled();
    const logged = inspect(vi.mocked(logger.error).mock.calls, { depth: 8, showHidden: true });
    expect(logged).not.toContain('FAKEHASHVALUE');
    expect(logged).toContain('08006');
  });
});
