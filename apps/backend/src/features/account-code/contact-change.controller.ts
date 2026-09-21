import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { floorToSecond } from '@/features/auth/session-cutoff.js';
import type { UserType } from '@/features/user/user.model.js';
import type { ContactKind } from './account-code.repository.js';
import { boundCodeMatches, generateAccountCode, hashBoundCode } from './code.js';
import { CODE_DELIVERY_FAILED_MESSAGE, channelColumn, plannedChannels } from './delivery.js';
import { toWhatsAppDigits } from './phone.js';
import {
  ContactChangeConfirmSchema,
  ContactChangeResendSchema,
  ContactChangeStartSchema,
  normaliseContactValue,
} from './schemas.js';
import {
  type AccountCodeDeps,
  RESEND_AFTER_SEC,
  TOO_MANY_ATTEMPTS,
  type TokenIssuer,
  cooldownRemaining,
  phoneAnchor,
  recordWrongCode,
  reissueTokens,
  send,
  tooSoon,
} from './shared.js';

export const NEW_CONTACT_CODE_TTL_SEC = 600;

export const CODE_EXPIRED = 'This code has expired — request a new one';
export const CODE_ALREADY_USED = 'This code was already used';
export const WRONG_PASSWORD = 'Current password is incorrect';
export const NO_PASSWORD = 'Set a password before you change your sign-in email or phone';

/**
 * Rows this flow retires when a change starts. `contact_change_identity` is
 * RETIRED — nothing issues it any more (see phone-verification.model.ts) — but
 * it stays in this list so a row left pending or verified by the two-code build
 * can never be spent afterwards.
 */
const CONTACT_PURPOSES = ['contact_change_identity', 'contact_change_new'] as const;

/**
 * The account re-read came back empty although authenticateJWT resolved this
 * very account moments ago — `getUserById` returns null when its query FAILS.
 * That is a server fault, so 500 — never 401, which the web client answers by
 * signing the person out, and never after a correct code has been spent.
 */
const ACCOUNT_READ_FAILED = ApiError.INTERNAL_SERVER_ERROR;

const SAME_VALUE: Record<ContactKind, string> = {
  email: 'That is already your email',
  phone: 'That is already your phone number',
};
const TAKEN: Record<ContactKind, string> = {
  email: 'That email is already used by another account',
  phone: 'That phone number is already used by another account',
};
const UPDATED: Record<ContactKind, string> = {
  email: 'Email updated',
  phone: 'Phone number updated',
};
const LABEL: Record<ContactKind, string> = {
  email: 'Change email',
  phone: 'Change phone',
};

export type ContactChangeDeps = AccountCodeDeps & {
  jwt: TokenIssuer;
  /** The same proof `POST /auth/password/change` uses. */
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  /** Live invitations addressed to an email — they cannot follow the account to a new one. */
  countPendingInvites(email: string): Promise<number>;
};

/**
 * CHANGE THE SIGN-IN EMAIL OR PHONE — signed in, every role, web and app.
 *
 *   1. start    { kind, value, currentPassword } → a code to the NEW contact
 *      resend   { kind, value, requestId }       → another code to the NEW contact
 *   2. confirm  { kind, value, requestId, code } → written
 *
 * ⚠️ NOTHING IS EVER SENT TO THE OLD PHONE OR OLD EMAIL — owner's decision,
 * 21 Sep 2026: "this no need send whatapps otp, sms otp and the email otp to
 * the old email or phone". Not a code, and not a notice afterwards either. The
 * two-code build that ran until today put code #1 on the contacts already on
 * file; that step and its `contact_change_identity` rows are retired.
 *
 * THE TWO PROOFS ARE NOW: the CURRENT PASSWORD, which says the person holding
 * this session is the owner and not somebody who sat down at an unlocked
 * screen; and the CODE TO THE NEW CONTACT, which says they typed it correctly
 * and can receive on it — without that, a typo locks them out of their own
 * account.
 *
 * ⚠️ WHAT THAT COSTS, written down so it is never rediscovered as a surprise:
 * a leaked password alone now moves the sign-in identity, where before it also
 * needed the real owner's phone. The compensating controls are the lockout
 * check and the per-user attempt limiter (see `proveIdentity` and
 * `contactChangePasswordUserLimiter`), the session cutoff at confirm, and the
 * re-issued tokens.
 *
 * Every code is BOUND (see code.ts) to the user, the kind and the exact value,
 * so no code can be spent on a different change. A wrong code — and a wrong
 * password — is always 400, never 401: the web client signs a person out on any
 * 401, so one typo used to throw them to the login page.
 *
 * On confirm the account's older sessions are cut and a fresh token pair is
 * returned; the client must store it before any other request.
 */
export class ContactChangeControllerClass {
  constructor(private readonly deps: ContactChangeDeps) {}

  async start(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ContactChangeStartSchema.safeParse(req.body ?? {});
      if (!parsed.success) return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      const { kind } = parsed.data;
      const normalised = normaliseContactValue(kind, parsed.data.value);
      if (!normalised.ok) return send(res, 400, normalised.message);
      const value = normalised.value;

      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return this.accountReadFailed(res, 'start', actor.id);

      /*
       * THE PASSWORD IS CHECKED FIRST — before "that is already your email" and
       * before the 409 that says an address belongs to somebody else. Those two
       * answers are an account-enumeration oracle, and a session is all that
       * stood in front of them once step 1 went; the password is what turns
       * them from free into earned.
       */
      const refusal = await this.proveIdentity(user, parsed.data.currentPassword);
      if (refusal) return send(res, refusal.status, refusal.message);

      if (this.isCurrentValue(user, kind, value)) return send(res, 400, SAME_VALUE[kind]);
      if (await this.deps.accounts.isContactTaken(kind, value, user.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      const now = this.deps.now();
      const previous = await this.deps.codes.findNewestByCreator(
        user.id,
        ['contact_change_new'],
        ['pending'],
      );
      if (previous) {
        const remaining = cooldownRemaining(previous.createdAt, now);
        if (remaining > 0) return tooSoon(res, remaining);
      }

      // A new change retires every earlier one, including any identity row the
      // two-code build left behind.
      await this.deps.codes.expireOpenForCreator(user.id, CONTACT_PURPOSES, ['pending', 'verified'], user.id);

      let pendingInvitesToCurrentEmail = 0;
      const currentEmail = user.email?.trim();
      if (kind === 'email' && currentEmail) {
        try {
          pendingInvitesToCurrentEmail = await this.deps.countPendingInvites(currentEmail);
        } catch (error) {
          // The lookup's bound value IS the current email.
          logger.warn('[ContactChange.start] could not count pending invites', safeErrorFields(error));
        }
      }

      return await this.issueCode(res, user, kind, value, now, { pendingInvitesToCurrentEmail });
    } catch (error) {
      logger.error('[ContactChange.start] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * ANOTHER CODE FOR A CHANGE ALREADY STARTED — no password.
   *
   * The `requestId` is itself the proof: it is handed out only to a caller who
   * passed the password a moment ago, the row lives ten minutes, and resend can
   * do nothing `start` could not already do for that same session. Asking for
   * the password again would mean the client keeping it in memory behind the
   * code sheet for the whole flow, which is worse.
   */
  async resend(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ContactChangeResendSchema.safeParse(req.body ?? {});
      if (!parsed.success) return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      const { kind, requestId } = parsed.data;
      const normalised = normaliseContactValue(kind, parsed.data.value);
      if (!normalised.ok) return send(res, 400, normalised.message);
      const value = normalised.value;
      const now = this.deps.now();

      const open = await this.deps.codes.getById(requestId);
      if (
        !open ||
        open.purpose !== 'contact_change_new' ||
        open.createdBy !== actor.id ||
        open.status !== 'pending' ||
        open.expiresAt.getTime() <= now
      ) {
        return send(res, 400, CODE_EXPIRED);
      }

      const remaining = cooldownRemaining(open.createdAt, now);
      if (remaining > 0) return tooSoon(res, remaining);

      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return this.accountReadFailed(res, 'resend', actor.id);

      if (this.isCurrentValue(user, kind, value)) return send(res, 400, SAME_VALUE[kind]);
      if (await this.deps.accounts.isContactTaken(kind, value, actor.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      return await this.issueCode(res, user, kind, value, now);
    } catch (error) {
      logger.error('[ContactChange.resend] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async confirm(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ContactChangeConfirmSchema.safeParse(req.body ?? {});
      if (!parsed.success) return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      const { kind, requestId, code } = parsed.data;
      const normalised = normaliseContactValue(kind, parsed.data.value);
      if (!normalised.ok) return send(res, 400, normalised.message);
      const value = normalised.value;
      const now = this.deps.now();

      const row = await this.deps.codes.getById(requestId);
      if (
        !row ||
        row.purpose !== 'contact_change_new' ||
        row.createdBy !== actor.id ||
        row.status !== 'pending' ||
        row.expiresAt.getTime() <= now
      ) {
        return send(res, 400, CODE_EXPIRED);
      }

      if (!boundCodeMatches(row.codeHash, code, actor.id, kind, value)) {
        if (await recordWrongCode(this.deps.codes, row, actor.id)) {
          return send(res, 429, TOO_MANY_ATTEMPTS);
        }
        return send(res, 400, 'Invalid code');
      }

      // Nothing is spent yet (applyContactChange below does that), so a failed
      // read leaves the row usable for a retry with the same code.
      const before = await this.deps.users.getUserById(actor.id);
      if (!before) return this.accountReadFailed(res, 'confirm', actor.id);

      /*
       * The row was anchored to the account's own phone when the code went out.
       * A disagreement means that number moved meanwhile — another device
       * finishing a change of its own — and this code belongs to the account as
       * it WAS.
       */
      if (row.phoneNum !== phoneAnchor(before)) return send(res, 400, CODE_EXPIRED);

      if (await this.deps.accounts.isContactTaken(kind, value, actor.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      const result = await this.deps.accounts.applyContactChange({
        rowId: row.id,
        userId: actor.id,
        kind,
        value,
        cutoff: floorToSecond(new Date(now)),
      });
      if (result.status === 'already_used') return send(res, 409, CODE_ALREADY_USED);
      if (result.status === 'taken') return send(res, 409, TAKEN[kind]);

      // The change is COMMITTED from here. Nothing below may turn it into an
      // error response — the "Unauthorized after a correct code" bug was
      // exactly that.
      let tokens: { accessToken: string; refreshToken: string } | null = null;
      try {
        tokens = reissueTokens(this.deps.jwt, req, { kind, value });
      } catch (error) {
        logger.warn('[ContactChange.confirm] could not re-issue tokens', {
          userId: actor.id,
          ...safeErrorFields(error),
        });
      }

      /*
       * ⚠️ NO NOTICE. The two-code build told the old email / old phone that the
       * account had moved; the owner removed that on 21 Sep 2026 along with the
       * identity code. Nothing reaches the old contact at all.
       */

      logger.info('[ContactChange.confirm] contact changed', { userId: actor.id, kind });
      return send(res, 200, UPDATED[kind], {
        accessToken: tokens?.accessToken ?? null,
        refreshToken: tokens?.refreshToken ?? null,
        email: result.user.email,
        phoneNum: result.user.phoneNum,
      });
    } catch (error) {
      logger.error('[ContactChange.confirm] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * THE CURRENT PASSWORD, and the login lockout that guards it.
   *
   * Answers the refusal, or null when the password is right. Three deliberate
   * choices:
   *
   *  • The lockout is honoured BEFORE the compare, exactly as login does it
   *    (auth.controller.ts) — otherwise this endpoint, the one that moves the
   *    sign-in identity, is an unlocked side door for guessing at an account
   *    login has already locked.
   *  • A wrong password does NOT feed that counter. Login's counter exists to
   *    stop guessing at the door; a signed-in person mistyping their own
   *    password in a settings sheet must not be locked out of signing in. The
   *    brake here is `contactChangePasswordUserLimiter`, 10 an hour per account.
   *  • A failed account READ is 500, never this 400. Copying the password
   *    change's `!user?.passwordHash` would tell somebody their account "cannot
   *    change password here" because a query blipped.
   */
  private async proveIdentity(
    user: UserType,
    currentPassword: string,
  ): Promise<{ status: number; message: string } | null> {
    const lockedUntil = user.lockedUntil?.getTime() ?? 0;
    const now = this.deps.now();
    if (lockedUntil > now) {
      const minutes = Math.ceil((lockedUntil - now) / 60_000);
      logger.warn('[ContactChange] attempt on a locked account', { userId: user.id });
      return {
        status: 429,
        message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      };
    }
    if (!user.passwordHash) return { status: 400, message: NO_PASSWORD };
    if (!(await this.deps.comparePassword(currentPassword, user.passwordHash))) {
      logger.warn('[ContactChange] wrong current password', { userId: user.id });
      return { status: 400, message: WRONG_PASSWORD };
    }
    return null;
  }

  /** See ACCOUNT_READ_FAILED. 401 stays reserved for a request with no `req.user`. */
  private accountReadFailed(res: Response, step: string, userId: string) {
    logger.error(`[ContactChange.${step}] could not re-read the signed-in account`, { userId });
    return send(res, 500, ACCOUNT_READ_FAILED);
  }

  private isCurrentValue(user: UserType, kind: ContactKind, value: string): boolean {
    if (kind === 'email') {
      return (user.email ?? '').trim().toLowerCase() === value;
    }
    const current = toWhatsAppDigits(user.phoneNum);
    return Boolean(current) && current === toWhatsAppDigits(value);
  }

  /** The one send: a code to the NEW contact, and nowhere else. */
  private async issueCode(
    res: Response,
    user: UserType,
    kind: ContactKind,
    value: string,
    now: number,
    extra: { pendingInvitesToCurrentEmail?: number } = {},
  ) {
    await this.deps.codes.expireOpenForCreator(user.id, ['contact_change_new'], ['pending'], user.id);

    const code = generateAccountCode();
    const destinations = kind === 'email' ? { phone: null, email: value } : { phone: value, email: null };
    const row = await this.deps.codes.create({
      // Anchored to the ACCOUNT's own phone, not to the value being changed to:
      // confirm re-reads it and refuses a code whose account has moved since.
      phoneNum: phoneAnchor(user),
      codeHash: hashBoundCode(code, user.id, kind, value),
      channel: channelColumn(plannedChannels(destinations)),
      purpose: 'contact_change_new',
      status: 'pending',
      attempts: 0,
      expiresAt: new Date(now + NEW_CONTACT_CODE_TTL_SEC * 1000),
      verifiedAt: null,
      waMessageId: null,
      createdBy: user.id,
      updatedBy: user.id,
    });
    if (!row) return send(res, 500, 'Could not send the code');

    // To the NEW contact only.
    const delivery = await this.deps.deliver({
      code,
      purpose: 'contact_change_new',
      purposeLabel: LABEL[kind],
      validMinutes: NEW_CONTACT_CODE_TTL_SEC / 60,
      ...destinations,
      name: user.username,
    });
    if (!delivery.ok) {
      await this.deps.codes.update(row.id, { status: 'expired', updatedBy: user.id });
      return send(res, 503, CODE_DELIVERY_FAILED_MESSAGE);
    }
    if (delivery.waMessageId) {
      await this.deps.codes.update(row.id, { waMessageId: delivery.waMessageId, updatedBy: user.id });
    }

    return send(res, 200, 'Code sent', {
      requestId: row.id,
      sentTo: delivery.sentTo,
      expiresInSec: NEW_CONTACT_CODE_TTL_SEC,
      resendAfterSec: RESEND_AFTER_SEC,
      pendingInvitesToCurrentEmail: extra.pendingInvitesToCurrentEmail ?? 0,
    });
  }
}
