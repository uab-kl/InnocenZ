/**
 * STAND-INS FOR FORGOT-PASSWORD REQUEST IDS THAT HAVE NO USABLE CODE BEHIND THEM.
 *
 * `forgot/start` answers the same 200 whether or not the typed address has an
 * account, handing back a `requestId` either way. That is only neutral if
 * `forgot/complete` then treats both ids the same. It did not: a real id hit a
 * pending row and a wrong code answered 400 "Invalid code", while the random id
 * of an unknown address found no row and answered 400 "This code has expired" —
 * two unauthenticated calls told anyone whether an email or phone had an
 * account.
 *
 * So the random id is REMEMBERED here and behaves exactly like a real row that
 * nobody can guess:
 *
 *   • every guess inside its TTL is "Invalid code", counted;
 *   • the guess that reaches the attempt cap is "too many attempts", and the
 *     id is closed from then on;
 *   • after its TTL, or once a newer start for the SAME typed identifier has
 *     superseded it, it is "expired" — as a real row is after its TTL, or after
 *     a newer start expired it.
 *
 * A real account's row joins the same table in one case: when its code reached
 * no channel. The row is expired in the database (a code nobody received must
 * not stay usable), and without a stand-in that early "expired" would be the
 * difference. With one, it answers like an unknown address until its TTL.
 *
 * A stand-in never accepts a code — there is nothing to compare against.
 *
 * In memory, like IdentifierCooldown beside it: a restart forgets the stand-ins
 * (their ids then answer "expired", as a real row does after its TTL), and
 * several processes would each keep their own. Both limits are recorded in the
 * handover; a shared store would close them.
 */

const MAX_ENTRIES = 20_000;

type Decoy = {
  expiresAt: number;
  attempts: number;
  open: boolean;
};

type Latest = { id: string; at: number };

export type DecoyAnswer = 'invalid' | 'exhausted' | 'expired';

export class DecoyRequests {
  private readonly decoys = new Map<string, Decoy>();
  /** The newest request id — real or stand-in — handed out for each typed identifier. */
  private readonly latest = new Map<string, Latest>();

  constructor(
    private readonly maxAttempts: number,
    private readonly ttlMs: number,
  ) {}

  /**
   * A start for `key` handed out `id`. Any earlier stand-in for the same key is
   * closed, as a newer real start expires the earlier row.
   */
  supersede(key: string, id: string, nowMs: number): void {
    const previous = this.latest.get(key);
    if (previous && previous.id !== id) {
      const decoy = this.decoys.get(previous.id);
      if (decoy) decoy.open = false;
    }
    this.prune(nowMs);
    this.latest.set(key, { id, at: nowMs });
  }

  /**
   * Make `id` a stand-in until `expiresAtMs`. Ignored when `id` is no longer the
   * newest request for `key` — it has been superseded, and an absent stand-in
   * already answers "expired".
   */
  issue(key: string, id: string, expiresAtMs: number, attempts = 0): void {
    if (this.latest.get(key)?.id !== id) return;
    this.decoys.set(id, {
      expiresAt: expiresAtMs,
      attempts,
      open: attempts < this.maxAttempts,
    });
  }

  /** One guess at `id`. `null` when `id` was never a stand-in. */
  guess(id: string, nowMs: number): DecoyAnswer | null {
    const decoy = this.decoys.get(id);
    if (!decoy) return null;
    if (!decoy.open || nowMs >= decoy.expiresAt) return 'expired';
    // The same arithmetic as `recordWrongCode`: the guess that reaches the cap
    // is refused with "too many attempts" and closes the id.
    decoy.attempts += 1;
    if (decoy.attempts >= this.maxAttempts) {
      decoy.open = false;
      return 'exhausted';
    }
    return 'invalid';
  }

  private prune(nowMs: number): void {
    if (this.decoys.size + this.latest.size < MAX_ENTRIES) return;
    // A closed or lapsed stand-in answers "expired" — exactly what an absent one
    // answers — so it can go at any time.
    for (const [id, decoy] of this.decoys) {
      if (!decoy.open || nowMs >= decoy.expiresAt) this.decoys.delete(id);
    }
    for (const [key, entry] of this.latest) {
      if (nowMs - entry.at >= this.ttlMs) this.latest.delete(key);
    }
    // Still full: drop the oldest tenth rather than refuse new entries.
    if (this.decoys.size + this.latest.size >= MAX_ENTRIES) {
      const oldest = [...this.latest.entries()].sort((a, b) => a[1].at - b[1].at);
      for (let i = 0; i < Math.ceil(MAX_ENTRIES / 10) && i < oldest.length; i += 1) {
        const [key, entry] = oldest[i];
        this.latest.delete(key);
        this.decoys.delete(entry.id);
      }
    }
  }
}
