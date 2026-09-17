import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import type { PhoneVerification } from '@/features/auth/phone-verification.model.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { floorToSecond } from '@/features/auth/session-cutoff.js';
import type { UserType } from '@/features/user/user.model.js';
import type { ContactKind } from './account-code.repository.js';
import {
  boundCodeMatches,
  generateAccountCode,
  hashBoundCode,
  identityProofHash,
  identityProofMatches,
} from './code.js';
import { CODE_DELIVERY_FAILED_MESSAGE, channelColumn, plannedChannels } from './delivery.js';
import { fireNotice } from './notices.js';
import { toWhatsAppDigits } from './phone.js';
import {
  ContactChangeConfirmSchema,
  ContactChangeResendSchema,
  ContactChangeStartSchema,
  ContactChangeVerifySchema,
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

export const IDENTITY_CODE_TTL_SEC = 300;
export const NEW_CONTACT_CODE_TTL_SEC = 600;
/** How long a verified identity may still be spent on resend-new / confirm. */
export const IDENTITY_WINDOW_MS = 15 * 60 * 1000;

export const CHANGE_EXPIRED = 'This change has expired — start again';
export const NEW_CODE_EXPIRED = 'This code has expired — request a new one';
export const CODE_ALREADY_USED = 'This code was already used';

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
  /** Live invitations addressed to an email — they cannot follow the account to a new one. */
  countPendingInvites(email: string): Promise<number>;
};

/**
 * CHANGE THE SIGN-IN EMAIL OR PHONE — signed in, every role, web and app.
 *
 *   1. start            { kind, value }                 → a code to the CURRENT contacts
 *   2. verify-identity  { requestId, kind, value, code } → a code to the NEW contact
 *      resend-new       { requestId, kind, value }       → another code to the new contact
 *   3. confirm          { requestId, newRequestId, kind, value, code } → written
 *
 * TWO PROOFS, because each answers a different question. The code to the
 * current contacts proves the person holding this session is the owner — a
 * borrowed, unlocked phone with the app open is not enough to move the account
 * to a stranger's email. The code to the new contact proves the owner typed it
 * correctly and controls it — or they would lock themselves out of their own
 * account. The old flow had only the second.
 *
 * Every code is BOUND (see code.ts) to the user, the kind and the exact value,
 * and the new-contact code also to the identity row it followed, so no code can
 * be spent on a different change. A wrong code is always 400, never 401.
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

      if (this.isCurrentValue(user, kind, value)) return send(res, 400, SAME_VALUE[kind]);
      if (await this.deps.accounts.isContactTaken(kind, value, user.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      const currentPhone = toWhatsAppDigits(user.phoneNum);
      const currentEmail = user.email?.trim() || null;
      if (!currentPhone && !currentEmail) {
        return send(res, 422, 'Your account has no phone or email we can send a code to');
      }

      const now = this.deps.now();
      const previous = await this.deps.codes.findNewestByCreator(
        user.id,
        ['contact_change_identity'],
        ['pending'],
      );
      if (previous) {
        const remaining = cooldownRemaining(previous.createdAt, now);
        if (remaining > 0) return tooSoon(res, remaining);
      }

      // A new change retires every earlier one, pending OR already verified —
      // an identity passed for yesterday's address must not approve today's.
      await this.deps.codes.expireOpenForCreator(user.id, CONTACT_PURPOSES, ['pending', 'verified'], user.id);

      const code = generateAccountCode();
      const destinations = { phone: user.phoneNum, email: currentEmail };
      const row = await this.deps.codes.create({
        phoneNum: phoneAnchor(user),
        codeHash: hashBoundCode(code, user.id, kind, value),
        channel: channelColumn(plannedChannels(destinations)),
        purpose: 'contact_change_identity',
        status: 'pending',
        attempts: 0,
        expiresAt: new Date(now + IDENTITY_CODE_TTL_SEC * 1000),
        verifiedAt: null,
        waMessageId: null,
        createdBy: user.id,
        updatedBy: user.id,
      });
      if (!row) return send(res, 500, 'Could not start the change');

      // To the CURRENT contacts — never to `value`. That is the whole point of
      // this step.
      const delivery = await this.deps.deliver({
        code,
        purpose: 'contact_change_identity',
        purposeLabel: LABEL[kind],
        validMinutes: IDENTITY_CODE_TTL_SEC / 60,
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

      let pendingInvitesToCurrentEmail = 0;
      if (kind === 'email' && currentEmail) {
        try {
          pendingInvitesToCurrentEmail = await this.deps.countPendingInvites(currentEmail);
        } catch (error) {
          // The lookup's bound value IS the current email.
          logger.warn('[ContactChange.start] could not count pending invites', safeErrorFields(error));
        }
      }

      return send(res, 200, 'Code sent', {
        requestId: row.id,
        sentTo: delivery.sentTo,
        expiresInSec: IDENTITY_CODE_TTL_SEC,
        resendAfterSec: RESEND_AFTER_SEC,
        pendingInvitesToCurrentEmail,
      });
    } catch (error) {
      logger.error('[ContactChange.start] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async verifyIdentity(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ContactChangeVerifySchema.safeParse(req.body ?? {});
      if (!parsed.success) return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      const { kind, requestId, code } = parsed.data;
      const normalised = normaliseContactValue(kind, parsed.data.value);
      if (!normalised.ok) return send(res, 400, normalised.message);
      const value = normalised.value;
      const now = this.deps.now();

      const row = await this.deps.codes.getById(requestId);
      if (
        !row ||
        row.purpose !== 'contact_change_identity' ||
        row.createdBy !== actor.id ||
        row.status !== 'pending' ||
        row.expiresAt.getTime() <= now
      ) {
        return send(res, 400, CHANGE_EXPIRED);
      }

      // A different value fails here exactly like a wrong code, and counts.
      if (!boundCodeMatches(row.codeHash, code, actor.id, kind, value)) {
        if (await recordWrongCode(this.deps.codes, row, actor.id)) {
          return send(res, 429, TOO_MANY_ATTEMPTS);
        }
        return send(res, 400, 'Invalid code');
      }

      // Read the account BEFORE the code is spent: if this read fails, the
      // identity row is still pending and the same correct code works on retry.
      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return this.accountReadFailed(res, 'verifyIdentity', actor.id);

      // Spent once, conditionally; the hash becomes the value-binding proof the
      // later steps check (see `identityProofHash`).
      const verified = await this.deps.codes.transition(row.id, 'pending', {
        status: 'verified',
        verifiedAt: new Date(now),
        codeHash: identityProofHash(actor.id, kind, value),
        updatedBy: actor.id,
      });
      if (!verified) return send(res, 409, CODE_ALREADY_USED);

      if (await this.deps.accounts.isContactTaken(kind, value, actor.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      return await this.issueNewContactCode(res, user, verified, kind, value, now);
    } catch (error) {
      logger.error('[ContactChange.verifyIdentity] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async resendNew(req: Request, res: Response) {
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

      const identity = await this.deps.codes.getById(requestId);
      if (!this.isUsableIdentity(identity, actor.id, kind, value, now)) {
        return send(res, 400, CHANGE_EXPIRED);
      }

      const newest = await this.deps.codes.findNewestByCreator(actor.id, ['contact_change_new'], ['pending']);
      if (newest) {
        const remaining = cooldownRemaining(newest.createdAt, now);
        if (remaining > 0) return tooSoon(res, remaining);
      }

      if (await this.deps.accounts.isContactTaken(kind, value, actor.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      const user = await this.deps.users.getUserById(actor.id);
      if (!user) return this.accountReadFailed(res, 'resendNew', actor.id);

      return await this.issueNewContactCode(res, user, identity, kind, value, now);
    } catch (error) {
      logger.error('[ContactChange.resendNew] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async confirm(req: Request, res: Response) {
    try {
      const actor = req.user;
      if (!actor) return send(res, 401, ApiError.UNAUTHORIZED);

      const parsed = ContactChangeConfirmSchema.safeParse(req.body ?? {});
      if (!parsed.success) return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      const { kind, requestId, newRequestId, code } = parsed.data;
      const normalised = normaliseContactValue(kind, parsed.data.value);
      if (!normalised.ok) return send(res, 400, normalised.message);
      const value = normalised.value;
      const now = this.deps.now();

      const identity = await this.deps.codes.getById(requestId);
      if (!this.isUsableIdentity(identity, actor.id, kind, value, now)) {
        return send(res, 400, CHANGE_EXPIRED);
      }

      const newRow = await this.deps.codes.getById(newRequestId);
      if (
        !newRow ||
        newRow.purpose !== 'contact_change_new' ||
        newRow.createdBy !== actor.id ||
        newRow.status !== 'pending' ||
        newRow.expiresAt.getTime() <= now ||
        newRow.phoneNum !== identity.phoneNum
      ) {
        return send(res, 400, NEW_CODE_EXPIRED);
      }

      if (!boundCodeMatches(newRow.codeHash, code, actor.id, kind, value, identity.id)) {
        if (await recordWrongCode(this.deps.codes, newRow, actor.id)) {
          return send(res, 429, TOO_MANY_ATTEMPTS);
        }
        return send(res, 400, 'Invalid code');
      }

      // Nothing is spent yet (applyContactChange below does that), so a failed
      // read leaves both rows usable for a retry with the same code.
      const before = await this.deps.users.getUserById(actor.id);
      if (!before) return this.accountReadFailed(res, 'confirm', actor.id);

      if (await this.deps.accounts.isContactTaken(kind, value, actor.id)) {
        return send(res, 409, TAKEN[kind]);
      }

      const result = await this.deps.accounts.applyContactChange({
        identityRowId: identity.id,
        newRowId: newRow.id,
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

      if (kind === 'email') {
        fireNotice(() =>
          this.deps.notices.emailChanged({ oldEmail: before.email, newEmail: value, name: before.username }),
        );
      } else {
        fireNotice(() =>
          this.deps.notices.phoneChanged({
            oldPhone: before.phoneNum,
            email: before.email,
            newPhone: value,
            name: before.username,
          }),
        );
      }

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

  /** Verified by THIS caller, for THIS kind and value, within the window. */
  private isUsableIdentity(
    row: PhoneVerification | null,
    userId: string,
    kind: ContactKind,
    value: string,
    now: number,
  ): row is PhoneVerification {
    return Boolean(
      row &&
        row.purpose === 'contact_change_identity' &&
        row.createdBy === userId &&
        row.status === 'verified' &&
        row.verifiedAt &&
        now - row.verifiedAt.getTime() <= IDENTITY_WINDOW_MS &&
        identityProofMatches(row.codeHash, userId, kind, value),
    );
  }

  /** Step 2's send, shared by verify-identity and resend-new. */
  private async issueNewContactCode(
    res: Response,
    user: UserType,
    identity: PhoneVerification,
    kind: ContactKind,
    value: string,
    now: number,
  ) {
    await this.deps.codes.expireOpenForCreator(user.id, ['contact_change_new'], ['pending'], user.id);

    const code = generateAccountCode();
    const destinations = kind === 'email' ? { phone: null, email: value } : { phone: value, email: null };
    const row = await this.deps.codes.create({
      // The SAME anchor as the identity row: confirm refuses a pair that
      // disagrees, so a phone changed mid-flow cannot mix two flows.
      phoneNum: identity.phoneNum,
      codeHash: hashBoundCode(code, user.id, kind, value, identity.id),
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
      newRequestId: row.id,
      sentTo: delivery.sentTo,
      expiresInSec: NEW_CONTACT_CODE_TTL_SEC,
      resendAfterSec: RESEND_AFTER_SEC,
    });
  }
}
