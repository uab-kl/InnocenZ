import type { Request, Response } from 'express';
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
