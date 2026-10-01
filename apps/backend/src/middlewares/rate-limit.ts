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
import { toWhatsAppDigits } from '@/features/account-code/phone.js';

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

/**
 * ONE BUDGET PER IPv6 NETWORK, not per address (security review, 30 Sep 2026).
 *
 * A subscriber is handed a whole /64 — 18 quintillion addresses — so a per-host
 * limit keyed on the full IPv6 address gave an attacker a fresh budget with
 * every request, just by picking the next address in their own block. The
 * limit now counts the /64. IPv4, and IPv4 carried inside IPv6 (`::ffff:a.b.c.d`),
 * stay one address each. Anything that does not parse is used as it came, so a
 * malformed value can never fold several callers together.
 */
export function ipBudgetKey(ip: string): string {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) return mapped[1];
  if (!ip.includes(':')) return ip;

  const bare = ip.split('%')[0]; // a link-local zone id is not part of the network
  const halves = bare.split('::');
  if (halves.length > 2) return ip;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  // An embedded IPv4 tail (`64:ff9b::1.2.3.4`) fills two groups.
  const tailWidth = (right.length ? right : left).at(-1)?.includes('.') ? 1 : 0;
  const missing = 8 - (left.length + right.length + tailWidth);
  if (halves.length === 1 ? missing !== 0 : missing < 1) return ip;
  const groups = [...left, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...right];

  const network = groups.slice(0, 4);
  if (!network.every((group) => /^[0-9a-f]{1,4}$/i.test(group))) return ip;
  return `${network.map((group) => parseInt(group, 16).toString(16)).join(':')}::/64`;
}

/** The per-host key every limiter counts: the address, or its /64 for IPv6. */
export function clientBudgetKey(req: Request): string {
  return `ip:${ipBudgetKey(clientIp(req))}`;
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
  keys: (req) => [clientBudgetKey(req)],
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
  keys: (req) => [clientBudgetKey(req)],
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
  keys: (req) => [clientBudgetKey(req)],
  message:
    'Too many sign-in attempts. Please wait a few minutes and try again.',
});

/**
 * Token refresh — its OWN bucket, not login's (28 Sep 2026).
 *
 * It rode `loginLimiter` until the web and the app learned to refresh: every
 * open tab now trades its refresh token for a new access token about four times
 * an hour, so a venue with fifteen tabs open behind one NAT address would spend
 * login's 60 on refreshes alone — and then nobody at that venue could sign IN
 * either, because the two shared a counter. A refresh cannot guess anything (it
 * needs a valid signed refresh token), so this cap only bounds a runaway client.
 */
export const refreshLimiter = rateLimit({
  name: 'refresh',
  windowMs: 15 * 60 * 1000,
  max: 300,
  keys: (req) => [clientBudgetKey(req)],
  message: 'Too many session refreshes. Please wait a moment and try again.',
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
  keys: (req) => [clientBudgetKey(req)],
  message: 'Too many verification codes requested. Please try again later.',
});

/**
 * One budget per LINE, however it is typed. Bare digits made "0123…", "60123…"
 * and "0060123…" — one handset — three budgets (security review, 30 Sep 2026);
 * the key is now the international form the code is actually delivered to
 * (`toWhatsAppDigits`), falling back to the digits for a value it rejects.
 */
function phoneBudgetKey(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = toWhatsAppDigits(phone) ?? phone.replace(/\D/g, '');
  return digits ? `phone:${digits}` : null;
}

export const otpSendPerPhoneLimiter = rateLimit({
  name: 'otp-send-phone',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keys: (req) => [phoneBudgetKey(normalizedBodyField(req, 'phoneNum'))],
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
  keys: (req) => [mailboxBudgetKey(normalizedBodyField(req, 'email'))],
  message: 'Too many verification codes requested for that email. Please try again later.',
});

/**
 * ONE BUDGET PER MAILBOX, however the address is dressed (security review,
 * 30 Sep 2026). `name+anything@…` reaches the same inbox as `name@…`, and at
 * Gmail so does `n.a.m.e@…`; keyed on the literal address, each spelling was a
 * fresh 3-an-hour budget aimed at one person. Only the KEY is folded — the mail
 * still goes to the address as typed. Expects a lowercased, trimmed value.
 */
export function mailboxBudgetKey(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  if (at <= 0) return `email:${email}`;
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus > 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `email:${local}@${domain}`;
}

/**
 * ONE CEILING FOR THE WHOLE SIGN-UP-CODE MAILER (security review, 30 Sep 2026).
 * `POST /auth/signup-email-code` mails a branded code to any address a stranger
 * types. The per-host and per-mailbox budgets bound one sender and one inbox;
 * neither bounds the TOTAL — the email provider's quota, which every
 * password-reset mail shares. Venues and agencies sign up a handful of times a
 * day, so no real sign-up meets this; a flood from many hosts meets it instead
 * of the quota. A flood can therefore hold sign-up codes for up to an hour —
 * the better failure than holding password resets.
 */
export const signupEmailCodeGlobalLimiter = rateLimit({
  name: 'signup-email-code-global',
  windowMs: 60 * 60 * 1000,
  max: 200,
  keys: () => ['all'],
  message: 'Too many verification codes requested. Please try again later.',
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
  keys: (req) => [clientBudgetKey(req)],
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

export const otpVerifyPerPhoneLimiter = rateLimit({
  name: 'otp-verify-phone',
  windowMs: 60 * 60 * 1000,
  max: 15,
  keys: (req) => [phoneBudgetKey(normalizedBodyField(req, 'phoneNum'))],
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
    return [clientBudgetKey(req), email ? `email:${email}` : null];
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
  keys: (req) => [clientBudgetKey(req)],
  message: 'Too many checks. Please wait a few minutes and try again.',
});
