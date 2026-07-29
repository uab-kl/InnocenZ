import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { AdminMfa, AdminMfaTable } from './admin-mfa.model.js';

export class AdminMfaRepositoryClass {
  async getByUserId(userId: string): Promise<AdminMfa | null> {
    try {
      const [row] = await db
        .select()
        .from(AdminMfaTable)
        .where(eq(AdminMfaTable.userId, userId))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[AdminMfaRepository.getByUserId] Error:', error);
      throw error;
    }
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

      if (existing) {
        const [row] = await db
          .update(AdminMfaTable)
          .set({ secret, confirmed: false, updatedAt: new Date() })
          .where(and(eq(AdminMfaTable.id, existing.id), eq(AdminMfaTable.confirmed, false)))
          .returning();
        return row ?? null;
      }

      const [row] = await db
        .insert(AdminMfaTable)
        .values({ userId, secret, confirmed: false })
        .returning();
      return row ?? null;
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
      return row ?? null;
    } catch (error) {
      logger.error('[AdminMfaRepository.confirm] Error:', error);
      throw error;
    }
  }
}
