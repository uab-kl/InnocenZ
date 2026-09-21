import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import { floorToSecond } from '@/features/auth/session-cutoff.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import type { UserType } from '@/features/user/user.model.js';
import type { AccountCodeRepositoryClass } from './account-code.repository.js';
import { boundCodeMatches, generateAccountCode, hashBoundCode } from './code.js';
import {
  CODE_DELIVERY_FAILED_MESSAGE,
  type DeliverCodeInput,
  type DeliverCodeResult,
  channelColumn,
  plannedChannels,
} from './delivery.js';
import { fireNotice, type AccountNotices } from './notices.js';
import {
  PasswordChangeConfirmSchema,
  PasswordChangeResendSchema,
  PasswordChangeStartSchema,
} from './schemas.js';
import {
  type CodeRowStore,
  RESEND_AFTER_SEC,
  TOO_MANY_ATTEMPTS,
  type TokenIssuer,
  type UserReader,
  accountReadFailed,
  cooldownRemaining,
  phoneAnchor,
  proveIdentity,
  recordWrongCode,
  resendable,
  reissueTokens,
  send,
  sendRefusal,
  tooSoon,
} from './shared.js';

export const PASSWORD_CHANGE_CODE_TTL_SEC = 600;

export const CODE_EXPIRED = 'This code has expired — request a new one';
export const CODE_ALREADY_USED = 'This code was already used';
export const NO_PASSWORD = 'This account cannot change password here';
export const NOWHERE_TO_SEND =
  'Add a phone number or an email to your account before changing your password';
export const SAME_PASSWORD = 'New password must be different';
export const PASSWORD_UPDATED = 'Password updated';
const PURPOSE_LABEL = 'Password change';

export type PasswordChangeDeps = {
  users: Pick<UserReader, 'getUserById'>;
  codes: CodeRowStore;
  /** Spends the code and writes the password in ONE transaction. */
  accounts: Pick<AccountCodeRepositoryClass, 'completePasswordChange'>;
  deliver: (input: DeliverCodeInput) => Promise<DeliverCodeResult>;
  jwt: TokenIssuer;
  hashPassword: (password: string) => Promise<string>;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  notices: Pick<AccountNotices, 'passwordChanged'>;
  now: () => number;
};

/**
 * SIGNED-IN PASSWORD CHANGE — two steps and a code, every role, web and app.
 *
 *   1. start    { currentPassword }                → a code to the phone AND
 *                                                    the email already on file
 *      resend   { requestId }                      → the same, sent again
 *   2. confirm  { requestId, code, newPassword }   → written, tokens re-issued
 *
 * ⚠️ THE OLD ONE-STEP `POST /auth/password/change` IS GONE — deleted, not left
 * answering "please update the app" (owner, 21 Sep 2026: "no error page no show
 * this"). Both clients ship in this same change and neither calls it.
 *
 * WHAT PROVES IT IS YOU is the CURRENT PASSWORD *and* a code. The password
 * alone was the old contract; the owner asked for a code on top ("Current
 * password + a code"), which is what makes a stolen SESSION — an unlocked
 * screen, a lifted token — insufficient on its own, since the thief would also
 * have to read the owner's WhatsApp, SMS or email.
 *
 * THE CODE GOES TO EVERY CHANNEL THE PERSON CAN READ, with the same digits
 * (owner, 21 Sep 2026: "all … need send whatapps otp and the email, sms message
 * if got also need, and must be the same otp"): WhatsApp + SMS to the phone on
 * file, email to the email on file. Nothing here moves a contact, so there is
 * no "new" value and no old one — both destinations are simply what the account
 * already carries. An account with NEITHER is refused 422: there is nowhere to
 * send it, and a code nobody can read is a lock-out, not a security control.
 *
 * ⚠️ The flip side, written down so it is a choice and not a surprise: whoever
 * holds ANY ONE of those channels, plus the password, can complete this. It is
 * only as strong as the weakest contact on file — the same trade the logged-out
 * reset makes, and for the same reason (people lose channels).
 *
 * Every code is BOUND (see code.ts) to the user id and this purpose, so a code
 * minted for a contact change, or for another account, cannot be spent here.
 * A wrong code — and a wrong password — is ALWAYS 400, never 401: the web
 * client signs a person out on any 401, so one typo used to throw them to the
 * login page.
 *
 * On confirm the account's older sessions are cut (`sessions_valid_from`,
 * floored to the second) and a fresh token pair is returned keyed like the
 * bearer token, so the device that made the change stays signed in. The client
 * must store it before any other request.
 */
export class PasswordChangeControllerClass {
  constructor(private readonly deps: PasswordChangeDeps) {}

  async start(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = PasswordChangeStartSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      }

      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return accountReadFailed(res, 'PasswordChange.start', actor.id);

      /*
       * THE PASSWORD IS CHECKED FIRST — before the 422 below and before a
       * single code row exists. A wrong password must cost nothing: no row, no
       * WhatsApp message, no email. Otherwise anybody sitting at an unlocked
       * screen could spray the owner's phone with codes without knowing
       * anything at all.
       */
      const refusal = await proveIdentity({
        user,
        currentPassword: parsed.data.currentPassword,
        comparePassword: this.deps.comparePassword,
        now: this.deps.now(),
        label: '[PasswordChange]',
        noPassword: NO_PASSWORD,
      });
      if (refusal) return sendRefusal(res, refusal);

      if (!this.hasSomewhereToSend(user)) {
        logger.warn('[PasswordChange.start] no contact on file to send a code to', {
          userId: user.id,
        });
        return send(res, 422, NOWHERE_TO_SEND);
      }

      const now = this.deps.now();
      const previous = await this.deps.codes.findNewestByCreator(
        user.id,
        ['password_change'],
        ['pending'],
      );
      if (previous) {
        const remaining = cooldownRemaining(previous.createdAt, now);
        if (remaining > 0) return tooSoon(res, remaining);
      }

      return await this.issueCode(res, user, now);
    } catch (error) {
      logger.error('[PasswordChange.start] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * ANOTHER CODE FOR A CHANGE ALREADY STARTED — no password.
   *
   * The `requestId` is itself the proof: it is handed out only to a caller who
   * passed the password a moment ago, the row lives ten minutes, and resend can
   * do nothing `start` could not already do for that same session. Exactly as
   * `POST /auth/contact-change/resend` works.
   */
  async resend(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = PasswordChangeResendSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      }
      const now = this.deps.now();

      const open = await this.deps.codes.getById(parsed.data.requestId);
      /*
       * ⚠️ `resendable`, NOT `isOwnLiveRow` — and the difference is the point.
       * Confirm below still demands a LIVE row, because an expired code must
       * never be spendable. Resend deliberately accepts an EXPIRED one and
       * answers with a fresh code (owner, 21 Sep 2026: "is temporary otp will
       * resend after expired") — otherwise somebody who let it lapse has to
       * type their password again just to be sent another.
       */
      if (
        !open ||
        open.purpose !== 'password_change' ||
        open.createdBy !== actor.id ||
        !resendable(open, now)
      ) {
        return send(res, 400, CODE_EXPIRED);
      }

      const remaining = cooldownRemaining(open.createdAt, now);
      if (remaining > 0) return tooSoon(res, remaining);

      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return accountReadFailed(res, 'PasswordChange.resend', actor.id);
      if (!this.hasSomewhereToSend(user)) return send(res, 422, NOWHERE_TO_SEND);

      return await this.issueCode(res, user, now);
    } catch (error) {
      logger.error('[PasswordChange.resend] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async confirm(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = PasswordChangeConfirmSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      }
      const { requestId, code, newPassword } = parsed.data;
      const now = this.deps.now();

      const row = await this.deps.codes.getById(requestId);
      if (!this.isOwnLiveRow(row, actor.id, now)) return send(res, 400, CODE_EXPIRED);

      if (!boundCodeMatches(row.codeHash, code, actor.id, 'password_change')) {
        if (await recordWrongCode(this.deps.codes, row, actor.id)) {
          return send(res, 429, TOO_MANY_ATTEMPTS);
        }
        return send(res, 400, 'Invalid code');
      }

      // Nothing is spent yet (completePasswordChange below does that), so a
      // failed read leaves the row usable for a retry with the same code.
      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return accountReadFailed(res, 'PasswordChange.confirm', actor.id);
      if (!user.passwordHash) return send(res, 400, NO_PASSWORD);

      /*
       * "NEW PASSWORD MUST BE DIFFERENT", against the STORED HASH.
       *
       * The old one-step handler compared two plaintexts in the zod schema,
       * which this flow cannot do: confirm never sees the current password. So
       * the comparison moved to where the truth actually lives. Same sentence,
       * so neither client has to learn a new one.
       *
       * ⚠️ Checked AFTER the code, never before. Reversed, it would answer
       * "that is already your password" to anybody holding a session and a
       * guess — an oracle for the current password with no code at all.
       *
       * The row is left PENDING: mistyping the same password again is not a
       * wrong code, so it must not spend an attempt or force a fresh send.
       */
      if (await this.deps.comparePassword(newPassword, user.passwordHash)) {
        return send(res, 400, SAME_PASSWORD);
      }

      const passwordHash = await this.deps.hashPassword(newPassword);
      const outcome = await this.deps.accounts.completePasswordChange({
        requestId: row.id,
        userId: user.id,
        passwordHash,
        cutoff: floorToSecond(new Date(now)),
      });
      if (outcome === 'already_used') return send(res, 409, CODE_ALREADY_USED);

      // The password is WRITTEN from here. Nothing below may turn it into an
      // error response — the "Unauthorized after a correct code" bug was
      // exactly that.
      let tokens: { accessToken: string; refreshToken: string } | null = null;
      try {
        tokens = reissueTokens(this.deps.jwt, req);
      } catch (error) {
        logger.warn('[PasswordChange.confirm] could not re-issue tokens', {
          userId: user.id,
          ...safeErrorFields(error),
        });
      }

      fireNotice(() =>
        this.deps.notices.passwordChanged({ email: user.email, name: user.username }),
      );

      logger.info('[PasswordChange.confirm] password changed by code', { userId: user.id });
      return send(res, 200, PASSWORD_UPDATED, {
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
      });
    } catch (error) {
      // Never the raw error: a failed password write carries the new hash.
      logger.error('[PasswordChange.confirm] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * A live `password_change` row belonging to THIS account. The purpose and the
   * creator are both part of the test, so a contact-change row — or another
   * account's row — reads as expired rather than as something to guess at.
   */
  private isOwnLiveRow(
    row: Awaited<ReturnType<CodeRowStore['getById']>>,
    userId: string,
    now: number,
  ): row is NonNullable<typeof row> {
    return Boolean(
      row &&
        row.purpose === 'password_change' &&
        row.createdBy === userId &&
        row.status === 'pending' &&
        row.expiresAt.getTime() > now,
    );
  }

  /** Is there any channel at all to put the code on? */
  private hasSomewhereToSend(user: UserType): boolean {
    return plannedChannels({ phone: user.phoneNum, email: user.email }).length > 0;
  }

  /** The one send: the same code to the phone AND the email already on file. */
  private async issueCode(res: Response, user: UserType, now: number) {
    await this.deps.codes.expireOpenForCreator(user.id, ['password_change'], ['pending'], user.id);

    const code = generateAccountCode();
    const destinations = { phone: user.phoneNum, email: user.email };
    const row = await this.deps.codes.create({
      phoneNum: phoneAnchor(user),
      // Bound to the account AND the purpose — see code.ts.
      codeHash: hashBoundCode(code, user.id, 'password_change'),
      channel: channelColumn(plannedChannels(destinations)),
      purpose: 'password_change',
      status: 'pending',
      attempts: 0,
      expiresAt: new Date(now + PASSWORD_CHANGE_CODE_TTL_SEC * 1000),
      verifiedAt: null,
      waMessageId: null,
      createdBy: user.id,
      updatedBy: user.id,
    });
    if (!row) return send(res, 500, 'Could not send the code');

    const delivery = await this.deps.deliver({
      code,
      purpose: 'password_change',
      purposeLabel: PURPOSE_LABEL,
      validMinutes: PASSWORD_CHANGE_CODE_TTL_SEC / 60,
      ...destinations,
      name: user.username,
    });
    if (!delivery.ok) {
      await this.deps.codes.update(row.id, { status: 'expired', updatedBy: user.id });
      return send(res, 503, CODE_DELIVERY_FAILED_MESSAGE);
    }
    if (delivery.waMessageId) {
      await this.deps.codes.update(row.id, {
        waMessageId: delivery.waMessageId,
        updatedBy: user.id,
      });
    }

    return send(res, 200, 'Code sent', {
      requestId: row.id,
      sentTo: delivery.sentTo,
      expiresInSec: PASSWORD_CHANGE_CODE_TTL_SEC,
      resendAfterSec: RESEND_AFTER_SEC,
    });
  }
}
