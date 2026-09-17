import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import { floorToSecond } from '@/features/auth/session-cutoff.js';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { fireNotice, type AccountNotices } from './notices.js';
import { ChangePasswordBodySchema } from './schemas.js';
import { type TokenIssuer, type UserReader, reissueTokens, send } from './shared.js';

export type PasswordChangeDeps = {
  users: Pick<UserReader, 'getUserById'>;
  passwords: Pick<AuthRepositoryClass, 'updateUserPassword'>;
  jwt: TokenIssuer;
  hashPassword: (password: string) => Promise<string>;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  notices: Pick<AccountNotices, 'passwordChanged'>;
  now: () => number;
};

/**
 * SIGNED-IN PASSWORD CHANGE — POST /auth/password/change, every role.
 *
 * The proof is the current password, not a code: the person is signed in and
 * knows it. What changed from the old handler:
 *
 *  • It cuts every OTHER session (`sessions_valid_from`, floored to the second)
 *    and RETURNS A FRESH TOKEN PAIR keyed like the bearer token, so the device
 *    that made the change stays signed in. It used to answer `data: null`, and
 *    the caller's own token then sat one second short of a cutoff it could not
 *    see coming.
 *  • 6-72 characters (bcrypt ignores everything past 72 bytes), and the new
 *    password must differ from the current one.
 *  • A wrong current password is 400, never 401 — the web client signs a person
 *    out on any 401, so one typo used to throw them to the login page.
 *  • A best-effort "your password was changed" email to the address on file.
 */
export class PasswordChangeControllerClass {
  constructor(private readonly deps: PasswordChangeDeps) {}

  async change(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ChangePasswordBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      }

      const user = await this.deps.users.getUserById(actor.id);
      if (!user?.passwordHash) {
        return send(res, 400, 'This account cannot change password here');
      }

      const matches = await this.deps.comparePassword(parsed.data.currentPassword, user.passwordHash);
      if (!matches) {
        return send(res, 400, 'Current password is incorrect');
      }

      const passwordHash = await this.deps.hashPassword(parsed.data.newPassword);
      await this.deps.passwords.updateUserPassword(user.id, passwordHash, {
        updatedBy: user.id,
        cutoff: floorToSecond(new Date(this.deps.now())),
      });

      // Written. From here nothing may turn this into an error response.
      let tokens: { accessToken: string; refreshToken: string } | null = null;
      try {
        tokens = reissueTokens(this.deps.jwt, req);
      } catch (error) {
        logger.warn('[PasswordChange] could not re-issue tokens', {
          userId: user.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }

      fireNotice(() => this.deps.notices.passwordChanged({ email: user.email, name: user.username }));

      return send(res, 200, 'Password updated', {
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
      });
    } catch (error) {
      // Never the raw error: a failed password write carries the new hash.
      logger.error('[PasswordChange] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }
}
