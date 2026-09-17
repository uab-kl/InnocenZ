import type { Request } from 'express';
import { rateLimit } from '@/middlewares/rate-limit.js';
import { toWhatsAppDigits } from './phone.js';

/**
 * Rate limits for the account-code endpoints, built on the shared fixed-window
 * factory. Two shapes:
 *
 *  • logged-out forgot-password — per IP AND per typed identifier, like the
 *    legacy reset. Both run BEFORE the account lookup, so a throttled caller
 *    learns nothing about whether the address is registered;
 *  • signed-in flows — per USER, mounted AFTER authenticateJWT so the key is
 *    the verified account, never something the body claims. The shared per-IP
 *    OTP limiters are stacked on top in the routes.
 */

function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}

function userKey(req: Request): string | null {
  return req.user?.id ? `user:${req.user.id}` : null;
}

export const forgotStartIpLimiter = rateLimit({
  name: 'password-forgot-start-ip',
  windowMs: 60 * 60 * 1000,
  max: 20,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many password reset requests. Please try again later.',
});

/** One budget per remembered identifier — "Foo@x.com" and "foo@x.com", "012…" and "+6012…" share it. */
export const forgotStartIdentifierLimiter = rateLimit({
  name: 'password-forgot-start-identifier',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keys: (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email) return [`email:${email}`];
    const phone = typeof body.phoneNum === 'string' ? body.phoneNum : '';
    const digits = toWhatsAppDigits(phone) ?? phone.replace(/\D/g, '');
    return [digits ? `phone:${digits}` : null];
  },
  message: 'Too many password reset requests. Please try again later.',
});

export const forgotCompleteIpLimiter = rateLimit({
  name: 'password-forgot-complete-ip',
  windowMs: 15 * 60 * 1000,
  max: 15,
  keys: (req) => [`ip:${clientIp(req)}`],
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

/** start + resend-new share one budget: both put a message on somebody's phone. */
export const contactChangeSendUserLimiter = rateLimit({
  name: 'contact-change-send-user',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keys: (req) => [userKey(req)],
  message: 'Too many verification codes requested. Please try again later.',
});

/** verify-identity + confirm share one budget: both spend a guess at a code. */
export const contactChangeCheckUserLimiter = rateLimit({
  name: 'contact-change-check-user',
  windowMs: 60 * 60 * 1000,
  max: 15,
  keys: (req) => [userKey(req)],
  message: 'Too many attempts. Please try again later.',
});

export const passwordChangeUserLimiter = rateLimit({
  name: 'password-change-user',
  windowMs: 60 * 60 * 1000,
  max: 10,
  keys: (req) => [userKey(req)],
  message: 'Too many password change attempts. Please try again later.',
});
