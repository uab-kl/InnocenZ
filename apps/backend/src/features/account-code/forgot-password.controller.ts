import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import type { PhoneVerification } from '@/features/auth/phone-verification.model.js';
import { safeErrorFields } from '@/features/auth/query-error-redaction.js';
import { floorToSecond } from '@/features/auth/session-cutoff.js';
import type { UserType } from '@/features/user/user.model.js';
import { boundCodeMatches, generateAccountCode, hashBoundCode } from './code.js';
import { DecoyRequests } from './decoy-requests.js';
import { channelColumn, plannedChannels } from './delivery.js';
import { IdentifierCooldown } from './identifier-cooldown.js';
import { fireNotice } from './notices.js';
import { ForgotCompleteSchema, ForgotStartSchema } from './schemas.js';
import {
  type AccountCodeDeps,
  MAX_CODE_ATTEMPTS,
  RESEND_AFTER_SEC,
  TOO_MANY_ATTEMPTS,
  cooldownRemaining,
  phoneAnchor,
  recordWrongCode,
  send,
  tooSoon,
} from './shared.js';

export const RESET_CODE_TTL_SEC = 600;
export const FORGOT_NEUTRAL_MESSAGE =
  'If that account exists, we sent a code by WhatsApp, SMS and email.';
export const RESET_CODE_EXPIRED = 'This code has expired — request a new one';
export const PASSWORD_RESET_DONE = 'Password updated — sign in with your new password';
export const INVALID_CODE = 'Invalid code';

/**
 * The floor under every answer that follows the account lookup (start) or the
 * row lookup (complete). A real account costs more database round trips than
 * an unknown address, and a wrong code on a real row costs a write that a
 * stand-in does not; without a floor the DELAY would say which one it was.
 * Generous for a co-located database. A database slower than this per request
 * shows through again — recorded in the handover, not hidden.
 */
export const FORGOT_MIN_RESPONSE_MS = 500;

export type ForgotPasswordOptions = {
  cooldown?: IdentifierCooldown;
  decoys?: DecoyRequests;
  minResponseMs?: number;
  /** Injectable so tests do not really wait. */
  sleep?: (ms: number) => Promise<void>;
};

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * FORGOT PASSWORD, LOGGED OUT — one flow for every role, web and app.
 *
 *   POST /auth/password/forgot/start     { email } or { phoneNum }
 *   POST /auth/password/forgot/complete  { requestId, code, password }
 *
 * The account is found by the email OR the phone the person remembers, and the
 * code goes to EVERY contact on file at once — WhatsApp and SMS to the phone,
 * email to the email — so somebody who lost one channel can still use another.
 * (The flip side: whoever holds ANY one of those contacts can finish the reset.
 * It is only as strong as the weakest contact on file.)
 *
 * NEUTRAL BY DESIGN, across BOTH calls:
 *
 *  • `start` answers the same 200, message and data shape for an unknown
 *    address, an inactive account, and a code actually sent. The resend
 *    cooldown is measured on the TYPED identifier, never on the account (see
 *    IdentifierCooldown).
 *  • `complete` answers the same for the `requestId` of an unknown address as
 *    for a real one: the random id is kept as a stand-in (see DecoyRequests)
 *    that answers "Invalid code", counts to the attempt cap, and expires with
 *    the same TTL. A request id that `start` never handed out is "expired".
 *  • The TIME is neutral too. Delivery — real WhatsApp, SMS and SMTP calls,
 *    hundreds of milliseconds to seconds — runs in the background after the
 *    answer, and every answer after the lookup waits out
 *    FORGOT_MIN_RESPONSE_MS.
 *  • A delivery that reached no channel is NOT a 503 here, unlike the signed-in
 *    flows: a 503 only an existing account can trigger would be the oracle.
 *    The row is expired and the failure logged, and the id becomes a stand-in
 *    so that early "expired" does not give the account away either.
 *
 * `complete` never answers 401: a wrong code is 400 "Invalid code", because the
 * web client signs a person out on any 401.
 */
export class ForgotPasswordControllerClass {
  private readonly cooldown: IdentifierCooldown;
  private readonly decoys: DecoyRequests;
  private readonly minResponseMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly deps: AccountCodeDeps,
    options: ForgotPasswordOptions = {},
  ) {
    this.cooldown = options.cooldown ?? new IdentifierCooldown(RESEND_AFTER_SEC);
    this.decoys = options.decoys ?? new DecoyRequests(MAX_CODE_ATTEMPTS, RESET_CODE_TTL_SEC * 1000);
    this.minResponseMs = options.minResponseMs ?? FORGOT_MIN_RESPONSE_MS;
    this.sleep = options.sleep ?? realSleep;
  }

  async start(req: Request, res: Response) {
    const startedAt = this.deps.now();
    try {
      const parsed = ForgotStartSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Enter your email or your phone number');
      }
      const { kind, value } = parsed.data;
      const now = startedAt;
      const key = `${kind}:${value}`;

      const wait = this.cooldown.hit(key, now);
      if (wait > 0) return tooSoon(res, wait);

      const neutral = async (requestId: string) => {
        await this.padFrom(startedAt);
        return send(res, 200, FORGOT_NEUTRAL_MESSAGE, {
          requestId,
          expiresInSec: RESET_CODE_TTL_SEC,
          resendAfterSec: RESEND_AFTER_SEC,
        });
      };
      // An id with no code behind it, remembered so `complete` answers for it
      // exactly as it would for a real one.
      const standIn = () => {
        const id = crypto.randomUUID();
        this.decoys.supersede(key, id, now);
        this.decoys.issue(key, id, now + RESET_CODE_TTL_SEC * 1000);
        return neutral(id);
      };

      const user = await this.deps.users.getUserByLoginMethod(kind, value);
      if (!user || user.status.toLowerCase() !== 'active') {
        return await standIn();
      }

      // The same account reached by its OTHER identifier inside the window.
      // Knowing both already implies knowing the account, so this discloses
      // nothing new — and it stops two codes racing to the same phone.
      const previous = await this.deps.codes.findNewestByCreator(user.id, ['reset_password'], ['pending']);
      if (previous) {
        const remaining = cooldownRemaining(previous.createdAt, now);
        if (remaining > 0) {
          await this.padFrom(startedAt);
          return tooSoon(res, remaining);
        }
      }

      await this.deps.codes.expireOpenForCreator(user.id, ['reset_password'], ['pending'], user.id);

      const code = generateAccountCode();
      const row = await this.deps.codes.create({
        phoneNum: phoneAnchor(user),
        codeHash: hashBoundCode(code, user.id),
        channel: channelColumn(plannedChannels({ phone: user.phoneNum, email: user.email })),
        purpose: 'reset_password',
        status: 'pending',
        attempts: 0,
        expiresAt: new Date(now + RESET_CODE_TTL_SEC * 1000),
        verifiedAt: null,
        waMessageId: null,
        createdBy: user.id,
        updatedBy: user.id,
      });
      if (!row) {
        logger.error('[ForgotPassword.start] could not create the code row', { userId: user.id });
        return await standIn();
      }

      this.decoys.supersede(key, row.id, now);
      // AFTER the answer, not before it: see the class comment on TIME.
      this.inBackground('[ForgotPassword.start] delivery', () =>
        this.deliverResetCode(user, row, code, key),
      );
      return await neutral(row.id);
    } catch (error) {
      logger.error('[ForgotPassword.start] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  async complete(req: Request, res: Response) {
    const startedAt = this.deps.now();
    try {
      const parsed = ForgotCompleteSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return send(res, 400, parsed.error.issues[0]?.message ?? 'Validation failed');
      }
      const { requestId, code, password } = parsed.data;
      const now = startedAt;

      const row = await this.deps.codes.getById(requestId);
      if (
        !row ||
        row.purpose !== 'reset_password' ||
        row.status !== 'pending' ||
        row.expiresAt.getTime() <= now
      ) {
        // No usable row. A stand-in answers as a live row would; anything
        // else — a spent, superseded or lapsed row, or an id never handed
        // out — is expired.
        const standIn = this.decoys.guess(requestId, now);
        await this.padFrom(startedAt);
        if (standIn === 'invalid') return send(res, 400, INVALID_CODE);
        if (standIn === 'exhausted') return send(res, 429, TOO_MANY_ATTEMPTS);
        return send(res, 400, RESET_CODE_EXPIRED);
      }
      const userId = row.createdBy;

      if (row.attempts >= MAX_CODE_ATTEMPTS) {
        await this.deps.codes.update(row.id, { status: 'expired', updatedBy: userId });
        await this.padFrom(startedAt);
        return send(res, 429, TOO_MANY_ATTEMPTS);
      }

      if (!boundCodeMatches(row.codeHash, code, userId)) {
        const exhausted = await recordWrongCode(this.deps.codes, row, userId);
        await this.padFrom(startedAt);
        return exhausted ? send(res, 429, TOO_MANY_ATTEMPTS) : send(res, 400, INVALID_CODE);
      }

      // Past this point the caller holds the code: nothing below needs padding.
      const user = await this.deps.users.getUserById(userId);
      if (!user || user.status.toLowerCase() !== 'active') {
        await this.deps.codes.update(row.id, { status: 'expired', updatedBy: userId });
        return send(res, 400, RESET_CODE_EXPIRED);
      }

      const passwordHash = await this.deps.hashPassword(password);
      const cutoff = floorToSecond(new Date(now));
      const outcome = await this.deps.accounts.completePasswordReset({
        requestId: row.id,
        userId,
        passwordHash,
        cutoff,
      });
      if (outcome === 'already_used') {
        return send(res, 409, 'This code was already used');
      }

      logger.info('[ForgotPassword.complete] password reset by code', { userId });
      fireNotice(() =>
        this.deps.notices.passwordChanged({ email: user.email, name: user.username }),
      );
      return send(res, 200, PASSWORD_RESET_DONE, null);
    } catch (error) {
      logger.error('[ForgotPassword.complete] Error:', safeErrorFields(error));
      return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
    }
  }

  /** Resolves once every background delivery started so far has settled (tests; shutdown). */
  async settled(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight]);
    }
  }

  private async deliverResetCode(
    user: UserType,
    row: PhoneVerification,
    code: string,
    key: string,
  ): Promise<void> {
    const delivery = await this.deps.deliver({
      code,
      purpose: 'reset_password',
      purposeLabel: 'Password reset',
      validMinutes: RESET_CODE_TTL_SEC / 60,
      phone: user.phoneNum,
      email: user.email,
      name: user.username,
    });

    if (!delivery.ok) {
      const expired = await this.deps.codes.update(row.id, { status: 'expired', updatedBy: user.id });
      // Answer for this id like an unknown address from here on — the early
      // "expired" would otherwise say an account exists. Carries the guesses
      // already spent on the row, so the cap arrives on the same guess.
      if (expired) {
        this.decoys.issue(key, row.id, row.expiresAt.getTime(), expired.attempts);
      }
      logger.error('[ForgotPassword.start] the code reached no channel — row expired', {
        userId: user.id,
        statuses: delivery.sentTo.map((d) => `${d.channel}:${d.status}`),
      });
      return;
    }
    if (delivery.waMessageId) {
      await this.deps.codes.update(row.id, {
        waMessageId: delivery.waMessageId,
        updatedBy: user.id,
      });
    }
  }

  private inBackground(label: string, work: () => Promise<void>): void {
    const task = (async () => {
      try {
        await work();
      } catch (error) {
        logger.error(`${label} failed`, safeErrorFields(error));
      }
    })();
    this.inFlight.add(task);
    void task.finally(() => {
      this.inFlight.delete(task);
    });
  }

  private async padFrom(startedAt: number): Promise<void> {
    const remaining = this.minResponseMs - (this.deps.now() - startedAt);
    if (remaining > 0) await this.sleep(remaining);
  }
}
