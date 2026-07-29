import crypto from 'node:crypto';

/**
 * TOTP (RFC 6238) on node's own crypto.
 *
 * Hand-rolled because no OTP library is installed and adding one mid-flight was
 * not worth it. That is a defensible call for TOTP specifically — it is a short,
 * fully-specified HMAC construction with published test vectors — and would NOT
 * be for anything that invents its own cryptography. Everything below is
 * standard: HMAC-SHA1 over the 30-second counter, dynamic truncation, 6 digits.
 *
 * Two details that are security-relevant rather than cosmetic:
 *  - verification uses a CONSTANT-TIME compare, so a wrong code cannot be
 *    narrowed digit by digit from response timing;
 *  - it accepts one step either side of now, and no more. That covers ordinary
 *    clock drift; a wider window multiplies the codes valid at any moment and
 *    quietly weakens the factor.
 */

const DIGITS = 6;
const PERIOD_SECONDS = 30;
/** ±1 step. Wider is not "more forgiving", it is more guessable. */
const DRIFT_STEPS = 1;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32, no padding — the form authenticator apps expect. */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new TypeError(`not base32: "${char}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, the size RFC 4226 recommends for HMAC-SHA1. */
export function generateSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

/** The 6-digit code for one 30-second step. */
function codeForCounter(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  // Counter is a 64-bit big-endian int; it stays well inside 2^53 for the next
  // few hundred thousand years, so splitting it into two 32-bit halves is safe.
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  // Dynamic truncation (RFC 4226 §5.4): the low nibble of the last byte picks
  // the 4-byte window, and the top bit is masked off to avoid sign issues.
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** The code valid right now — for tests and for confirming an enrolment. */
export function currentCode(secret: string, atMs: number = Date.now()): string {
  return codeForCounter(secret, Math.floor(atMs / 1000 / PERIOD_SECONDS));
}

/**
 * Is `token` valid for this secret, allowing ±1 step of clock drift?
 *
 * Constant-time comparison, and every candidate step is compared even after a
 * match so the loop's duration does not leak which step succeeded.
 */
export function verifyTotp(secret: string, token: string, atMs: number = Date.now()): boolean {
  const cleaned = (token ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;

  const counter = Math.floor(atMs / 1000 / PERIOD_SECONDS);
  const given = Buffer.from(cleaned);
  let ok = false;
  for (let step = -DRIFT_STEPS; step <= DRIFT_STEPS; step++) {
    let expected: Buffer;
    try {
      expected = Buffer.from(codeForCounter(secret, counter + step));
    } catch {
      return false;
    }
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) {
      ok = true;
    }
  }
  return ok;
}

/** The otpauth:// URI an authenticator scans. Never log it — it carries the secret. */
export function otpauthUri(secret: string, account: string, issuer = 'InnocenZ'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
