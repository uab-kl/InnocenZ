/**
 * A resend cooldown keyed on WHAT WAS TYPED (an email or a phone), not on an
 * account.
 *
 * Why it exists: logged-out forgot-password must answer the same for an
 * address that has an account and one that does not. A cooldown measured on
 * the account's newest code row answers 429 only when an account exists — so
 * two quick requests would enumerate the platform. Measuring on the identifier
 * instead gives every address, registered or not, the identical 60-second
 * rhythm.
 *
 * In memory, like the rate limiter beside it: a restart clears it, and several
 * processes would each keep their own. Both are acceptable for a 60-second
 * courtesy window; the hard limits are the per-identifier and per-IP limiters.
 */
const MAX_KEYS = 20_000;

export class IdentifierCooldown {
  private readonly last = new Map<string, number>();

  constructor(private readonly windowSec: number) {}

  /** Seconds to wait if `key` was used within the window; otherwise records it and returns 0. */
  hit(key: string, nowMs: number): number {
    const previous = this.last.get(key);
    if (previous !== undefined) {
      const remaining = this.windowSec - (nowMs - previous) / 1000;
      if (remaining > 0) return Math.ceil(remaining);
    }
    this.prune(nowMs);
    this.last.set(key, nowMs);
    return 0;
  }

  private prune(nowMs: number): void {
    if (this.last.size < MAX_KEYS) return;
    for (const [key, at] of this.last) {
      if ((nowMs - at) / 1000 >= this.windowSec) this.last.delete(key);
    }
    // Still full: drop the oldest tenth rather than refuse new keys, which
    // would let a flood of fresh addresses switch the cooldown off.
    if (this.last.size >= MAX_KEYS) {
      const oldest = [...this.last.entries()].sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < Math.ceil(MAX_KEYS / 10) && i < oldest.length; i += 1) {
        this.last.delete(oldest[i][0]);
      }
    }
  }
}
