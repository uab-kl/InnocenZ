import crypto from 'node:crypto';

/**
 * FAILED SIGN-INS FOR AN IDENTIFIER WITH NO ACCOUNT, COUNTED LIKE A REAL ONE'S
 * (owner, 29 Sep 2026: "General message, both").
 *
 * A real account locks after MAX failures (`user.failed_login_attempts` /
 * `locked_until`, `UserRepositoryClass.recordFailedLoginAttempt`) and answers
 * 429 "Too many failed attempts…" until the lock runs out. An identifier with
 * no account used to answer 401 forever — so five wrong guesses and a sixth
 * told a stranger whether the account exists, whatever the 401 said. This keeps
 * the same count, by the same rules, for identifiers that have no row:
 *   · the lock starts at the MAX-th failure, and every failure at or past it
 *     starts it again (the SQL's CASE);
 *   · a locked identifier is answered 429 WITHOUT counting — the controller
 *     checks the lock before comparing, for both kinds;
 *   · the lock running out never resets the count. A successful sign-in resets
 *     a real one (an identifier with no account never has one), and a DAY with
 *     no wrong guess resets both — `FAILED_LOGIN_MEMORY_MINUTES`: here the idle
 *     expiry, for a real account `last_failed_login_at` (migration 0170, owner
 *     30 Sep 2026). Before 0170 a real account's count never decayed, so old
 *     typos locked it before an identifier with no account would lock.
 *
 * In memory, per process, and bounded — as good as the real counter for as
 * long as an entry lives, and no better:
 *   · past `maxEntries` the oldest UNLOCKED entries go first (see `evict`);
 *     that identifier then counts from zero where a real account would not.
 *     That takes tens of thousands of sign-ins (`loginLimiter` allows 60 per
 *     15 min per address).
 *   · a restart forgets everything, and two instances count apart.
 * Keys are SHA-256 of the normalised identifier, so the map never holds an
 * address or a number in the clear.
 */

/**
 * How long a wrong password is remembered — ONE rule for both counters (owner,
 * 30 Sep 2026: "let old wrong guesses expire"). A wrong guess more than this
 * long after the previous one counts from 1 again: for a real account in SQL
 * (`recordFailedLoginAttempt`, migration 0170), for an identifier with no
 * account here (the idle expiry). While the two agree, so do their locks.
 */
export const FAILED_LOGIN_MEMORY_MINUTES = 24 * 60;

type Entry = {
  attempts: number;
  /** Epoch ms; null until the MAX-th failure. */
  lockedUntil: number | null;
  /** Epoch ms of the last failure — what the idle expiry measures from. */
  touchedAt: number;
};

export type UnknownLoginLockoutOptions = {
  maxAttempts: number;
  lockoutMinutes: number;
  maxEntries?: number;
  idleTtlMs?: number;
  now?: () => number;
};

const DEFAULT_MAX_ENTRIES = 20_000;
const DEFAULT_IDLE_TTL_MS = FAILED_LOGIN_MEMORY_MINUTES * 60_000;

export class UnknownLoginLockout {
  private readonly entries = new Map<string, Entry>();
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;
  private readonly maxEntries: number;
  private readonly idleTtlMs: number;
  private readonly now: () => number;

  constructor(options: UnknownLoginLockoutOptions) {
    this.maxAttempts = options.maxAttempts;
    this.lockoutMs = options.lockoutMinutes * 60_000;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.idleTtlMs = options.idleTtlMs ?? DEFAULT_IDLE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** Whole minutes left on this identifier's lock (rounded up, as the real one is), or null. */
  minutesLeft(key: string): number | null {
    const lockedUntil = this.read(key)?.lockedUntil;
    if (!lockedUntil) return null;
    const left = lockedUntil - this.now();
    return left > 0 ? Math.ceil(left / 60_000) : null;
  }

  /** One more wrong guess against an identifier with no account. */
  recordFailure(key: string): void {
    const now = this.now();
    const previous = this.read(key);
    const attempts = (previous?.attempts ?? 0) + 1;
    // Deleted and re-set so Map order stays oldest-failure-first for eviction.
    this.entries.delete(key);
    this.entries.set(key, {
      attempts,
      lockedUntil: attempts >= this.maxAttempts ? now + this.lockoutMs : (previous?.lockedUntil ?? null),
      touchedAt: now,
    });
    this.evict(now, key);
  }

  /**
   * Over the bound: drop UNLOCKED entries first, oldest first, down to 90% (so
   * this runs rarely), and only then the oldest locked ones. A locked entry is
   * the one whose loss shows — a prober who locked an identifier and then
   * flooded the map would read a 401 where a real account says 429 (security
   * review, 30 Sep 2026). A counted-but-unlocked entry can still be flushed;
   * that needs tens of thousands of sign-ins inside the lock window. The
   * identifier just counted (`keep`) is never the one dropped, or under a full
   * map it could never reach its lock.
   */
  private evict(now: number, keep: string): void {
    if (this.entries.size <= this.maxEntries) return;
    const target = this.maxEntries - Math.ceil(this.maxEntries / 10);
    for (const [key, entry] of this.entries) {
      if (this.entries.size <= target) break;
      if (key === keep) continue;
      if (!entry.lockedUntil || entry.lockedUntil <= now) this.entries.delete(key);
    }
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.maxEntries) break;
      if (key !== keep) this.entries.delete(key);
    }
  }

  private read(key: string): Entry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (this.now() - entry.touchedAt > this.idleTtlMs) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }
}

/**
 * The counter key for one sign-in identifier — normalised the way the lookup
 * matches (`loginValueMatch` in user.repository.ts), so `Owner@X.com ` and
 * `owner@x.com`, or `012-345 6789` and `+60123456789`, share one count the way
 * they would share one account.
 */
export function loginIdentifierKey(method: 'email' | 'phone', value: string): string {
  const normalised =
    method === 'email' ? (value ?? '').trim().toLowerCase() : canonicalPhone(value ?? '');
  return crypto.createHash('sha256').update(`${method}:${normalised}`).digest('hex');
}

/**
 * Digits only, in the international form `toWhatsAppDigits` delivers to — a
 * `00` prefix dropped, a local `0…` folded onto `60…` — one line, as
 * `phoneLoginCandidates` treats it.
 */
function canonicalPhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  return digits.startsWith('0') ? `60${digits.slice(1)}` : digits;
}
