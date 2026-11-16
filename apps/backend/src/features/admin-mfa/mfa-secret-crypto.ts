import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * THE ADMIN AUTHENTICATOR SECRET, SEALED AT REST (Support Desk risk, 16 Nov 2026).
 *
 * `admin_mfa.secret` is the TOTP seed itself: anyone who can read that row can
 * mint valid second-factor codes for the account, so a database read — a
 * backup, a support query, a leaked replica — was a second factor handed over.
 * With `MFA_SECRET_KEY` set, the repository stores the seed sealed with
 * AES-256-GCM and opens it only in memory, at the moment a code is checked.
 *
 * - NO KEY, NO CHANGE: without the key the seed is stored as before, so a
 *   deploy that has not set it behaves exactly as it did yesterday.
 * - LEGACY ROWS KEEP WORKING: a value without the prefix is read as plain text.
 *   It is re-sealed the next time that admin enrols — nothing is rewritten in
 *   bulk, because a bulk rewrite of credentials is the owner's to run.
 * - FAILS CLOSED: a sealed value that cannot be opened (key missing, changed or
 *   tampered with) THROWS. It never comes back as "no MFA", because the login
 *   path reads "no row" as "no second factor to check".
 *
 * ⚠️ Changing or losing the key locks every enrolled admin out until they are
 * re-enrolled — keep it with the other production secrets, never in git.
 */
const PREFIX = 'enc:v1:';

/** Any operator-chosen string → a 32-byte AES key. Null when unset. */
export function mfaKeyFrom(raw: string | undefined | null): Buffer | null {
  if (!raw) return null;
  return createHash('sha256').update(raw, 'utf8').digest();
}

export function isSealedMfaSecret(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function sealMfaSecret(plain: string, key: Buffer | null): string {
  if (!key || isSealedMfaSecret(plain)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${body.toString('base64url')}`;
}

export function openMfaSecret(stored: string, key: Buffer | null): string {
  if (!isSealedMfaSecret(stored)) return stored;
  if (!key) {
    throw new Error('An admin authenticator secret is sealed but MFA_SECRET_KEY is not set.');
  }
  const [iv, tag, body] = stored.slice(PREFIX.length).split('.');
  if (!iv || !tag || !body) throw new Error('An admin authenticator secret is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  // `final()` throws on a wrong key or a tampered value — the GCM tag is the check.
  return Buffer.concat([
    decipher.update(Buffer.from(body, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
