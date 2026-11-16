import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { env } from '@/env.js';
import { logger } from '@/util/logger.js';
import { AdminMfa, AdminMfaTable } from './admin-mfa.model.js';
import { mfaKeyFrom, openMfaSecret, sealMfaSecret } from './mfa-secret-crypto.js';

/**
 * The seed is sealed on the way IN and opened on the way OUT, here and only
 * here, so every caller keeps reading a plain `secret` (see mfa-secret-crypto).
 */
const mfaKey = () => mfaKeyFrom(env.MFA_SECRET_KEY);
const opened = (row: AdminMfa): AdminMfa => ({ ...row, secret: openMfaSecret(row.secret, mfaKey()) });

export class AdminMfaRepositoryClass {
  async getByUserId(userId: string): Promise<AdminMfa | null> {
    let row: AdminMfa | undefined;
    try {
      [row] = await db
        .select()
        .from(AdminMfaTable)
        .where(eq(AdminMfaTable.userId, userId))
        .limit(1);
    } catch (error) {
      // Missing table on a fresh DB must not turn a correct password into HTTP 500.
      logger.error('[AdminMfaRepository.getByUserId] Error:', error);
      return null;
    }
    // Opened OUTSIDE the catch on purpose: a sealed seed that cannot be opened
    // must fail the login, never read as "this admin has no second factor".
    return row ? opened(row) : null;
  }

  /**
   * Start (or restart) an enrolment.
   *
   * Refuses to touch a CONFIRMED row and returns null instead. That is the
   * whole safety property here: without it, calling enrol again would mint a
   * fresh secret and silently invalidate the authenticator the user already
   * relies on — locking them out of their own account with one request.
   * Replacing a confirmed factor has to go through a deliberate disable, which
   * is a separate act with its own authorisation.
   *
   * The `confirmed = false` predicate is repeated in the UPDATE's WHERE rather
   * than relying on the read above: two enrolment calls racing must not both
   * pass the check and have the second clobber a row the first confirmed.
   */
  async startEnrolment(userId: string, secret: string): Promise<AdminMfa | null> {
    try {
      const existing = await this.getByUserId(userId);
      if (existing?.confirmed) return null;

      const stored = sealMfaSecret(secret, mfaKey());
      if (existing) {
        const [row] = await db
          .update(AdminMfaTable)
          .set({ secret: stored, confirmed: false, updatedAt: new Date() })
          .where(and(eq(AdminMfaTable.id, existing.id), eq(AdminMfaTable.confirmed, false)))
          .returning();
        return row ? opened(row) : null;
      }

      const [row] = await db
        .insert(AdminMfaTable)
        .values({ userId, secret: stored, confirmed: false })
        .returning();
      return row ? opened(row) : null;
    } catch (error) {
      logger.error('[AdminMfaRepository.startEnrolment] Error:', error);
      throw error;
    }
  }

  async confirm(id: string): Promise<AdminMfa | null> {
    try {
      const [row] = await db
        .update(AdminMfaTable)
        .set({ confirmed: true, updatedAt: new Date() })
        .where(eq(AdminMfaTable.id, id))
        .returning();
      return row ? opened(row) : null;
    } catch (error) {
      logger.error('[AdminMfaRepository.confirm] Error:', error);
      throw error;
    }
  }
}
