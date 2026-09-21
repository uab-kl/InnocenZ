/**
 * Fixed-window rate limiting for the public auth surface.
 *
 * WHY NOT `express-rate-limit`: it was attempted twice and both installs left
 * this shared checkout with `express` itself removed from `node_modules` — pnpm
 * cannot write here while the dev servers hold file locks. The library's real
 * advantage is its pluggable store (Redis) for multi-instance deployments; its
 * DEFAULT store is an in-memory map exactly like this one, so on a single
 * process the dependency would buy no correctness. If this API is ever scaled
 * past one instance, BOTH this and `express-rate-limit`'s default become
 * per-instance and the effective limits multiply by the instance count — that
 * is the point to move the counter into Redis, not before.
 *
 * ⚠️ The counter lives in memory, so a restart clears every window. That is a
 * real weakness against a patient attacker and a convenience while testing —
 * restarting the backend is how you un-block yourself after probing a limit.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { logger } from '@/util/logger.js';

type Bucket = { count: number; resetAt: number };

/**
 * Hard cap on distinct keys held at once. The keys include caller-supplied
 * values (an email address), so an attacker choosing a fresh address every
 * request would otherwise grow this map without bound — the limiter would
 * become the memory-exhaustion vector it exists to prevent.
 */
const MAX_TRACKED_KEYS = 20_000;

class FixedWindowCounter {
  private readonly hits = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  /**
   * Counts one hit. Returns `null` when the caller may proceed, or the number
   * of seconds until the window resets when they may not.
   */
  hit(key: string, now: number): number | null {
    const existing = this.hits.get(key);

    if (!existing || existing.resetAt <= now) {
      this.evictIfCrowded(now);
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      return null;
    }

    existing.count += 1;
    if (existing.count > this.max) {
      return Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    }
    return null;
  }

  /**
   * Drops expired buckets, then — if the map is STILL at the cap — the buckets
   * closest to expiring. Evicting rather than refusing new keys is deliberate:
   * refusing them would let an attacker fill the map and thereby exempt
   * everyone, turning the limiter off exactly when it is needed.
   */
  private evictIfCrowded(now: number): void {
    if (this.hits.size < MAX_TRACKED_KEYS) return;

    for (const [key, bucket] of this.hits) {
      if (bucket.resetAt <= now) this.hits.delete(key);
    }
    if (this.hits.size < MAX_TRACKED_KEYS) return;

    const soonestFirst = [...this.hits.entries()].sort(
      (a, b) => a[1].resetAt - b[1].resetAt,
    );
    const dropCount = Math.ceil(MAX_TRACKED_KEYS / 10);
    for (let i = 0; i < dropCount && i < soonestFirst.length; i += 1) {
      this.hits.delete(soonestFirst[i][0]);
    }
    logger.warn('[rate-limit] key table full — evicted oldest buckets', {
      dropped: dropCount,
    });
  }
}

/**
 * The caller's address. `req.ip` honours `trust proxy`, which main.ts sets from
 * the TRUST_PROXY env var.
 *
 * ⚠️ Behind a reverse proxy with TRUST_PROXY unset, EVERY request carries the
 * proxy's address, so an IP rule would throttle the whole platform as one
 * caller. That is why every limiter below also keys on the thing being
 * protected (the email, the phone number) — those stay correct either way.
 */
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

/** Lowercased + trimmed, or `Foo@x.com` and `foo@x.com` get separate budgets. */
function normalizedBodyField(req: Request, field: string): string | null {
  const raw = (req.body as Record<string, unknown> | undefined)?.[field];
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase();
  return value ? value : null;
}

export type RateLimitRule = {
  /** Appears in logs and namespaces the keys, so two rules never collide. */
  name: string;
  windowMs: number;
  max: number;
  /**
   * Every key this request counts against. ALL are incremented and ANY one
   * over its limit blocks — so an IP rule and an email rule compose without
   * either weakening the other.
   */
  keys: (req: Request) => Array<string | null>;
  message: string;
};

export function rateLimit(rule: RateLimitRule): RequestHandler {
  const counter = new FixedWindowCounter(rule.windowMs, rule.max);

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    let longestWait: number | null = null;

    for (const key of rule.keys(req)) {
      if (!key) continue;
      const retryAfter = counter.hit(`${rule.name}:${key}`, now);
      // Deliberately no early break: every key must be counted, or a caller
      // already over one limit would ride free on the others.
      if (
        retryAfter !== null &&
        (longestWait === null || retryAfter > longestWait)
      ) {
        longestWait = retryAfter;
      }
    }

    if (longestWait === null) return next();

    logger.warn('[rate-limit] blocked', {
      rule: rule.name,
      path: req.originalUrl,
      ip: clientIp(req),
      retryAfterSeconds: longestWait,
    });
    res.setHeader('Retry-After', String(longestWait));
    return res.status(429).json({
      success: false,
      message: rule.message,
      data: null,
    });
  };
}

/**
 * Password reset requests. Two budgets, because the two abuses are different
 * shapes: many addresses from one host is reconnaissance, and one address from
 * many hosts is mailbox flooding. An IP-only rule misses the second entirely.
 *
 * ⚠️ Both run BEFORE the controller looks the account up, so a throttled caller
 * still learns nothing about whether the address is registered — the endpoint's
 * neutral answer would be worthless if the limiter leaked what it hides.
 */
export const forgotPasswordLimiter = rateLimit({
  name: 'forgot-password',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many password reset requests. Please try again later.',
});

export const forgotPasswordPerEmailLimiter = rateLimit({
  name: 'forgot-password-email',
  windowMs: 60 * 60 * 1000,
  max: 3,
  keys: (req) => {
    const email = normalizedBodyField(req, 'email');
    return [email ? `email:${email}` : null];
  },
  message: 'Too many password reset requests. Please try again later.',
});

/**
 * Reset-token submission. The token is 32 random bytes, so this is not really
 * about guessing it — it is about not letting a script burn CPU on bcrypt by
 * firing reset attempts in a loop.
 */
export const resetPasswordLimiter = rateLimit({
  name: 'reset-password',
  windowMs: 15 * 60 * 1000,
  max: 15,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many reset attempts. Please try again later.',
});

/**
 * Login. Generous on purpose: a venue's staff share one office NAT address, so
 * a tight per-IP rule would lock out a whole outlet on a busy night. The
 * per-ACCOUNT brute-force defence is NOT this — it is the existing 5-strike
 * lockout in AuthController. This rule only stops one host spraying one
 * password across many different accounts, which that lockout cannot see.
 */
export const loginLimiter = rateLimit({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  max: 60,
  keys: (req) => [`ip:${clientIp(req)}`],
  message:
    'Too many sign-in attempts. Please wait a few minutes and try again.',
});

/**
 * WhatsApp OTP send. The tightest rule here, because every call past the
 * limiter spends real money and puts an unrequested message on someone's
 * phone. Keyed per phone number as well as per host for the same reason
 * forgot-password is keyed per email.
 */
export const otpSendLimiter = rateLimit({
  name: 'otp-send',
  windowMs: 60 * 60 * 1000,
  max: 30,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many verification codes requested. Please try again later.',
});

export const otpSendPerPhoneLimiter = rateLimit({
  name: 'otp-send-phone',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keys: (req) => {
    const phone = normalizedBodyField(req, 'phoneNum');
    // Digits only — "+60 12-345" and "60123 45" are one number, one budget.
    const digits = phone?.replace(/\D/g, '') ?? null;
    return [digits ? `phone:${digits}` : null];
  },
  message: 'Too many verification codes requested. Please try again later.',
});

/**
 * ONE BUDGET PER EMAIL ADDRESS on the PUBLIC `/auth/otp/send`.
 *
 * ⚠️ Added 21 Sep 2026 with the email channel on sign-up verification. That
 * body field is an address a STRANGER can type into an unauthenticated
 * endpoint, which is the classic shape of a mail relay: without this, the two
 * limiters already there bound an attacker's IP and their PHONE, and neither
 * bounds how much mail one victim's inbox receives — rotating either dimension
 * rotates the budget while the recipient stays the same.
 *
 * 3/hour per address, matching `forgotPasswordPerEmailLimiter`, which guards
 * the other public endpoint that mails an address from a request body. The key
 * is the RECIPIENT, so no amount of IP or phone rotation widens it.
 */
export const otpSendPerEmailLimiter = rateLimit({
  name: 'otp-send-email',
  windowMs: 60 * 60 * 1000,
  max: 3,
  keys: (req) => {
    const email = normalizedBodyField(req, 'email');
    return [email ? `email:${email}` : null];
  },
  message: 'Too many verification codes requested for that email. Please try again later.',
});

/**
 * WhatsApp OTP verify. /otp/verify carried NO limiter while /otp/send stacked
 * two — and verify is the more dangerous half: a verified row's id is the sole
 * proof POST /auth/password/reset-otp accepts, so guessing the 6-digit code IS
 * the account takeover. The per-row 5-attempt cap is the hard wall; this pair
 * exists so an attacker cannot cycle send→guess→send to mint themselves a
 * fresh 5-guess budget per code, and cannot spray many phones from one host.
 */
export const otpVerifyLimiter = rateLimit({
  name: 'otp-verify',
  windowMs: 15 * 60 * 1000,
  max: 60,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

export const otpVerifyPerPhoneLimiter = rateLimit({
  name: 'otp-verify-phone',
  windowMs: 60 * 60 * 1000,
  max: 15,
  keys: (req) => {
    const phone = normalizedBodyField(req, 'phoneNum');
    const digits = phone?.replace(/\D/g, '') ?? null;
    return [digits ? `phone:${digits}` : null];
  },
  message: 'Too many attempts for this number. Please try again later.',
});


/**
 * ACCOUNT CREATION. `/auth/register` and `/auth/register-member` were the last
 * public, unauthenticated, WRITING endpoints with no limiter at all, while
 * login, forgot-password, reset-password and both OTP halves each carried one
 * or two. A script could mint accounts — and, on `/register-member`, pending
 * join requests against a named organisation — as fast as the database would
 * take them, and the owner sees every one of those in their approvals queue.
 *
 * Keyed per host AND per email, for the shape the other rules already use: many
 * addresses from one host is bulk creation, one address from many hosts is
 * someone being spammed into a stranger's queue.
 *
 * ⚠️ Both endpoints are MULTIPART (a profile photo), and multer runs AFTER
 * this. `req.body` is therefore still empty here, so the email key resolves to
 * null and only the IP rule bites. That is deliberate rather than an oversight:
 * moving the limiter after multer would mean the file is fully parsed and
 * written to disk BEFORE the request is throttled, which hands an attacker the
 * expensive half for free. The per-email key stays declared because
 * `/register/check` below is JSON and does use it, and because a future
 * non-multipart register path would get it for nothing.
 */
export const registerLimiter = rateLimit({
  name: 'register',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keys: (req) => {
    const email = normalizedBodyField(req, 'email');
    return [`ip:${clientIp(req)}`, email ? `email:${email}` : null];
  },
  message: 'Too many sign-up attempts. Please try again later.',
});

/**
 * The availability check — an EXISTENCE ORACLE, and the reason it needs its own
 * rule. It answers "is this email/phone already registered?" with no account and
 * no limit, so it enumerates the platform's users at whatever rate a script can
 * ask.
 *
 * Far more generous than `register` because the sign-up form calls it as the
 * person types: a tight rule here breaks an honest wizard. Its job is to make
 * bulk enumeration slow, not to make one person's form feel broken.
 */
export const registerCheckLimiter = rateLimit({
  name: 'register-check',
  windowMs: 15 * 60 * 1000,
  max: 120,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many checks. Please wait a few minutes and try again.',
});
