import crypto from 'node:crypto';

/**
 * ONE-TIME CODES, BOUND TO WHAT THEY PROVE.
 *
 * The public WhatsApp OTP hashes the code alone, which is fine for a code that
 * proves "you hold this phone". An account code proves more — "the owner of
 * THIS account agreed to change THIS contact to THIS value" — so the hash
 * covers all of it:
 *
 *   code_hash = sha256_hex( JSON.stringify([code, userId, ...binding]) )
 *
 * A code is then useless for anything other than what it was issued for: the
 * right six digits submitted with a different user, a different new email, or
 * a different step's row simply do not match. JSON, not string concatenation,
 * so ['1','23'] and ['12','3'] can never hash alike.
 */

export const ACCOUNT_CODE_LENGTH = 6;

export function generateAccountCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(ACCOUNT_CODE_LENGTH, '0');
}

export function hashBoundCode(code: string, userId: string, ...binding: string[]): string {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([code, userId, ...binding]), 'utf8')
    .digest('hex');
}

/** Constant-time comparison of a submitted code against a stored bound hash. */
export function boundCodeMatches(
  codeHash: string,
  code: string,
  userId: string,
  ...binding: string[]
): boolean {
  const expected = Buffer.from(hashBoundCode(code, userId, ...binding), 'hex');
  const stored = Buffer.from(codeHash ?? '', 'hex');
  if (expected.length !== stored.length) return false;
  return crypto.timingSafeEqual(expected, stored);
}
