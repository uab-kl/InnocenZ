import type { Request, Response } from 'express';
import { logger } from '@/util/logger.js';
import { Error as ApiError } from '@/error/index.js';
import type { UserType } from '@/features/user/user.model.js';
import type { PhoneVerification, NewPhoneVerification } from '@/features/auth/phone-verification.model.js';
import type { PhoneVerificationRepositoryClass } from '@/features/auth/phone-verification.repository.js';
import type { JwtControllerClass } from '@/features/jwt/jwt.controller.js';
import type { AccountCodeRepositoryClass } from './account-code.repository.js';
import type { DeliverCodeInput, DeliverCodeResult } from './delivery.js';
import type { AccountNotices } from './notices.js';

/** The limits every account code shares. */
export const MAX_CODE_ATTEMPTS = 5;
export const RESEND_AFTER_SEC = 60;

/** The standard envelope. */
export function send(
  res: Response,
  status: number,
  message: string,
  data: unknown = null,
): Response {
  return res.status(status).json({ success: status < 400, message, data });
}

export function tooSoon(res: Response, retryAfterSec: number): Response {
  const wait = Math.max(1, Math.ceil(retryAfterSec));
  res.setHeader('Retry-After', String(wait));
  return send(res, 429, `Wait ${wait}s before requesting another code`, {
    retryAfterSec: wait,
  });
}

/** Seconds still to wait before a row created at `createdAt` may be resent, or 0. */
export function cooldownRemaining(createdAt: Date, nowMs: number): number {
  const ageSec = (nowMs - createdAt.getTime()) / 1000;
  return ageSec < RESEND_AFTER_SEC ? Math.ceil(RESEND_AFTER_SEC - ageSec) : 0;
}

export type CodeRowStore = Pick<
  PhoneVerificationRepositoryClass,
  | 'create'
  | 'getById'
  | 'update'
  | 'countFailedAttempt'
  | 'transition'
  | 'findNewestByCreator'
  | 'expireOpenForCreator'
>;

export type UserReader = {
  getUserByLoginMethod(method: 'email' | 'phone', value: string): Promise<UserType | null>;
  getUserById(id: string): Promise<UserType | null>;
};

export type AccountWriter = Pick<
  AccountCodeRepositoryClass,
  'completePasswordReset' | 'isContactTaken' | 'applyContactChange'
>;

export type TokenIssuer = Pick<
  JwtControllerClass,
  'generateAccessToken' | 'generateRefreshToken' | 'verifyToken'
>;

export type AccountCodeDeps = {
  users: UserReader;
  codes: CodeRowStore;
  accounts: AccountWriter;
  deliver: (input: DeliverCodeInput) => Promise<DeliverCodeResult>;
  notices: AccountNotices;
  hashPassword: (password: string) => Promise<string>;
  now: () => number;
};

export type NewCodeRow = Omit<NewPhoneVerification, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Count one wrong code. Returns true when that attempt EXHAUSTED the budget —
 * the row is then expired and the caller answers 429. The increment is atomic
 * and capped in SQL (`countFailedAttempt`), so concurrent wrong guesses cannot
 * all read the same count and slip past the cap.
 */
export async function recordWrongCode(
  codes: CodeRowStore,
  row: PhoneVerification,
  actor: string,
): Promise<boolean> {
  const counted = await codes.countFailedAttempt(row.id, MAX_CODE_ATTEMPTS);
  if (!counted || counted.attempts >= MAX_CODE_ATTEMPTS) {
    await codes.update(row.id, { status: 'expired', updatedBy: actor });
    return true;
  }
  return false;
}

export const TOO_MANY_ATTEMPTS = 'Too many attempts — request a new code';

/** The bearer token this request authenticated with. */
export function bearerToken(req: Request): string | null {
  const header = req.header('Authorization') ?? '';
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * A fresh access + refresh pair for the caller, keyed the SAME WAY as the token
 * they came in with.
 *
 * ⚠️ A token here carries only `{ loginMethod, loginCriteria }` and every
 * request resolves the account from it. So after a change that stamps
 * `sessions_valid_from`, or that rewrites the very value the token is keyed on
 * (an email-signed-in person changing their email), the old token is dead — and
 * the client must STORE these before its next request. `change` names the value
 * that just moved: when it is the one the token is keyed on, the new token uses
 * the new value; otherwise the old criteria still resolve and are kept.
 */
export function reissueTokens(
  jwt: TokenIssuer,
  req: Request,
  change?: { kind: 'email' | 'phone'; value: string },
): { accessToken: string; refreshToken: string } | null {
  const token = bearerToken(req);
  if (!token) return null;
  const payload = jwt.verifyToken(token);
  const loginMethod = payload.loginMethod;
  if (loginMethod !== 'email' && loginMethod !== 'phone') return null;
  const loginCriteria =
    change && change.kind === loginMethod ? change.value : payload.loginCriteria;
  const info = { loginMethod, loginCriteria };
  return {
    accessToken: jwt.generateAccessToken(info),
    refreshToken: jwt.generateRefreshToken(info),
  };
}

/** Digits of the phone on file, or '' — the `phone_num` anchor of an account row. */
export function phoneAnchor(user: Pick<UserType, 'phoneNum'>): string {
  return (user.phoneNum ?? '').replace(/\D/g, '');
}

/** ONE spelling, so every signed-in flow refuses a bad password identically. */
export const WRONG_PASSWORD = 'Current password is incorrect';

export type IdentityRefusal = {
  status: number;
  message: string;
  /** Set on the LOCKOUT 429 only — seconds until the account unlocks. */
  retryAfterSec?: number;
};

/**
 * Answer an identity refusal. A 429 carries its wait BOTH as `Retry-After` and
 * as `data.retryAfterSec`, exactly as `tooSoon` does for the resend cooldown —
 * the web client reads the field first and falls back to the header, and
 * without either the lockout sheet has no countdown to show and simply says
 * "try again later" with no idea when.
 */
export function sendRefusal(res: Response, refusal: IdentityRefusal): Response {
  if (refusal.retryAfterSec === undefined) return send(res, refusal.status, refusal.message);
  const wait = Math.max(1, Math.ceil(refusal.retryAfterSec));
  res.setHeader('Retry-After', String(wait));
  return send(res, refusal.status, refusal.message, { retryAfterSec: wait });
}

/**
 * THE CURRENT PASSWORD, and the login lockout that guards it.
 *
 * Answers the refusal, or null when the password is right. Shared by BOTH
 * signed-in credential flows — the contact change and, since 21 Sep 2026, the
 * password change — because a second copy of this ordering is a second place
 * for it to drift. Three deliberate choices:
 *
 *  • The lockout is honoured BEFORE the compare, exactly as login does it
 *    (auth.controller.ts) — otherwise these endpoints, the ones that move the
 *    sign-in identity, are an unlocked side door for guessing at an account
 *    login has already locked.
 *  • A wrong password does NOT feed that counter. Login's counter exists to
 *    stop guessing at the door; a signed-in person mistyping their own
 *    password in a settings sheet must not be locked out of signing in. The
 *    brake here is a per-user limiter, 10 an hour per account
 *    (`contactChangePasswordUserLimiter`, `passwordChangeUserLimiter`).
 *  • A failed account READ is never this 400 — the caller answers 500 for it
 *    (see `accountReadFailed`). Telling somebody their account "cannot change
 *    password here" because a query blipped is the bug that convention exists
 *    to prevent.
 *
 * ⚠️ 400 for a wrong password, never 401: the web client signs a person out on
 * any 401, so one typo used to throw them to the login page.
 */
export async function proveIdentity(input: {
  user: UserType;
  currentPassword: string;
  comparePassword: (password: string, hash: string) => Promise<boolean>;
  /** Milliseconds, from the caller's injected clock. */
  now: number;
  /** Log prefix, e.g. '[ContactChange]'. */
  label: string;
  /** What an account carrying NO password hash is told — flow-specific. */
  noPassword: string;
}): Promise<IdentityRefusal | null> {
  const { user, currentPassword, comparePassword, now, label, noPassword } = input;
  const lockedUntil = user.lockedUntil?.getTime() ?? 0;
  if (lockedUntil > now) {
    const minutes = Math.ceil((lockedUntil - now) / 60_000);
    logger.warn(`${label} attempt on a locked account`, { userId: user.id });
    return {
      status: 429,
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      // Seconds, not the rounded-up minutes in the sentence: the countdown must
      // not say "1 minute" for 61 seconds and then refuse again at zero.
      retryAfterSec: Math.ceil((lockedUntil - now) / 1000),
    };
  }
  if (!user.passwordHash) return { status: 400, message: noPassword };
  if (!(await comparePassword(currentPassword, user.passwordHash))) {
    logger.warn(`${label} wrong current password`, { userId: user.id });
    return { status: 400, message: WRONG_PASSWORD };
  }
  return null;
}

/**
 * The account re-read came back empty although authenticateJWT resolved this
 * very account moments ago — `getUserById` returns null when its query FAILS.
 * That is a server fault, so 500 — never 401, which the web client answers by
 * signing the person out, and never after a correct code has been spent.
 */
export function accountReadFailed(res: Response, step: string, userId: string): Response {
  logger.error(`[${step}] could not re-read the signed-in account`, { userId });
  return send(res, 500, ApiError.INTERNAL_SERVER_ERROR);
}

/**
 * How long after a code was ISSUED a Resend can still stand on it, whether or
 * not it has expired in the meantime. One hour.
 */
export const RESEND_WINDOW_MS = 60 * 60 * 1000;

/**
 * MAY THIS ROW EARN A FRESH CODE? — owner, 21 Sep 2026: "is temporary otp will
 * resend after expired".
 *
 * Both flows used to require a `pending` row that had not expired, so somebody
 * who put the phone down for a quarter of an hour came back, tapped Resend, and
 * was told to start the whole thing again — which on the contact change and the
 * password change means typing their password a second time. Expiring is the
 * NORMAL end of a code, not a fault.
 *
 * So `expired` now qualifies as well as `pending`. What does NOT:
 *
 *  • `consumed` / `verified` — the code was spent and the thing it authorised
 *    has happened. A resend there would mint a code for a finished request.
 *  • a row older than `RESEND_WINDOW_MS` — otherwise whoever still holds a
 *    `requestId` could keep asking for codes for ever, and the 60-second
 *    cooldown (which reads `created_at`) stopped braking an hour ago.
 */
export function resendable(row: PhoneVerification, nowMs: number): boolean {
  const open = row.status === 'pending' || row.status === 'expired';
  return open && nowMs - row.createdAt.getTime() <= RESEND_WINDOW_MS;
}
