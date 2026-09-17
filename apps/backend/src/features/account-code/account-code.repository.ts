import { and, eq, gt, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { PhoneVerificationTable } from '@/features/auth/phone-verification.model.js';
import { redactQueryError } from '@/features/auth/query-error-redaction.js';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository.js';
import { UserTable, type UserType } from '@/features/user/user.model.js';
import { phoneLoginCandidates } from '@/features/user/user.repository.js';
import type { DbTransaction } from '@/types/db-transaction';

export type ContactKind = 'email' | 'phone';

/** Postgres unique_violation — drizzle 0.45 hides the pg error in `.cause`. */
export function isUniqueViolation(error: unknown): boolean {
  const direct = (error as { code?: unknown } | null)?.code;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return direct === '23505' || cause === '23505';
}

/** Thrown inside a transaction to roll it back with a known outcome. */
class Outcome extends globalThis.Error {
  constructor(readonly outcome: 'already_used' | 'taken') {
    super(outcome);
  }
}

/**
 * The transactional writes of the account-code flows.
 *
 * Each one SPENDS a code row and CHANGES the account in one transaction, so
 * neither can happen without the other: a spent code with an unchanged
 * password would strand the person, and a changed password with a still-live
 * code would let the same code be used twice. Every spend is conditional on the
 * status it expects (`WHERE status = 'pending'`), so two requests racing with
 * the same code cannot both succeed — the loser rolls back and is told the code
 * was already used.
 */
export class AccountCodeRepositoryClass {
  constructor(private authRepository: Pick<AuthRepositoryClass, 'updateUserPassword'>) {}

  /**
   * Logged-out password reset, completed: spend the row, write the password,
   * clear the lockout, and end every session opened before this second.
   */
  async completePasswordReset(input: {
    requestId: string;
    userId: string;
    passwordHash: string;
    cutoff: Date;
  }): Promise<'ok' | 'already_used'> {
    try {
      await db.transaction(async (tx) => {
        const spent = await tx
          .update(PhoneVerificationTable)
          .set({ status: 'consumed', updatedAt: new Date(), updatedBy: input.userId })
          .where(
            and(
              eq(PhoneVerificationTable.id, input.requestId),
              eq(PhoneVerificationTable.purpose, 'reset_password'),
              eq(PhoneVerificationTable.status, 'pending'),
              gt(PhoneVerificationTable.expiresAt, new Date()),
            ),
          )
          .returning({ id: PhoneVerificationTable.id });
        if (spent.length === 0) throw new Outcome('already_used');

        await this.authRepository.updateUserPassword(input.userId, input.passwordHash, {
          tx,
          updatedBy: input.userId,
          clearLockout: true,
          cutoff: input.cutoff,
        });
      });
      return 'ok';
    } catch (error) {
      if (error instanceof Outcome && error.outcome === 'already_used') return 'already_used';
      // The new password hash is a bound value inside this transaction.
      throw redactQueryError(error);
    }
  }

  /**
   * Does ANOTHER account already sign in with this email / phone?
   *
   * Email: compared trimmed and lowercased, like sign-in. Phone: compared on
   * digits in every form sign-in accepts (`phoneLoginCandidates`), so
   * "+60123…" and "0123…" are the same number here exactly as they are at the
   * sign-in box. The caller's own row never counts.
   */
  async isContactTaken(
    kind: ContactKind,
    value: string,
    excludeUserId: string,
    tx?: DbTransaction,
  ): Promise<boolean> {
    const client = tx ?? db;
    if (kind === 'email') {
      const needle = value.trim().toLowerCase();
      const rows = await client
        .select({ id: UserTable.id })
        .from(UserTable)
        .where(and(sql`lower(btrim(${UserTable.email})) = ${needle}`, ne(UserTable.id, excludeUserId)))
        .limit(1);
      return rows.length > 0;
    }
    const candidates = phoneLoginCandidates(value);
    if (candidates.length === 0) return false;
    const rows = await client
      .select({ id: UserTable.id })
      .from(UserTable)
      .where(
        and(
          inArray(sql`regexp_replace(${UserTable.phoneNum}, '\\D', '', 'g')`, candidates),
          ne(UserTable.id, excludeUserId),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  /**
   * The contact change itself: spend the new-contact row AND the identity row,
   * re-check the value is still free, write it, and cut the older sessions.
   *
   * The re-check inside the transaction narrows the window between "free at
   * start" and "written"; the unique index on `user.email` / `user.phone_num`
   * closes it — a 23505 from either statement is reported as `taken`.
   */
  async applyContactChange(input: {
    identityRowId: string;
    newRowId: string;
    userId: string;
    kind: ContactKind;
    /** Already normalised: lowercase email, or '+digits'. */
    value: string;
    cutoff: Date;
  }): Promise<{ status: 'ok'; user: UserType } | { status: 'already_used' } | { status: 'taken' }> {
    try {
      const user = await db.transaction(async (tx) => {
        const now = new Date();
        const newSpent = await tx
          .update(PhoneVerificationTable)
          .set({ status: 'consumed', updatedAt: now, updatedBy: input.userId })
          .where(
            and(
              eq(PhoneVerificationTable.id, input.newRowId),
              eq(PhoneVerificationTable.purpose, 'contact_change_new'),
              eq(PhoneVerificationTable.createdBy, input.userId),
              eq(PhoneVerificationTable.status, 'pending'),
              gt(PhoneVerificationTable.expiresAt, now),
            ),
          )
          .returning({ id: PhoneVerificationTable.id });
        if (newSpent.length === 0) throw new Outcome('already_used');

        const identitySpent = await tx
          .update(PhoneVerificationTable)
          .set({ status: 'consumed', updatedAt: now, updatedBy: input.userId })
          .where(
            and(
              eq(PhoneVerificationTable.id, input.identityRowId),
              eq(PhoneVerificationTable.purpose, 'contact_change_identity'),
              eq(PhoneVerificationTable.createdBy, input.userId),
              eq(PhoneVerificationTable.status, 'verified'),
            ),
          )
          .returning({ id: PhoneVerificationTable.id });
        if (identitySpent.length === 0) throw new Outcome('already_used');

        if (await this.isContactTaken(input.kind, input.value, input.userId, tx)) {
          throw new Outcome('taken');
        }

        const [updated] = await tx
          .update(UserTable)
          .set({
            ...(input.kind === 'email' ? { email: input.value } : { phoneNum: input.value }),
            sessionsValidFrom: input.cutoff,
            updatedAt: now,
            updatedBy: input.userId,
          })
          .where(eq(UserTable.id, input.userId))
          .returning();
        // The account vanished mid-flow; nothing to change, so nothing is spent.
        if (!updated) throw new Outcome('already_used');
        return updated;
      });
      return { status: 'ok', user };
    } catch (error) {
      if (error instanceof Outcome) return { status: error.outcome };
      if (isUniqueViolation(error)) return { status: 'taken' };
      throw redactQueryError(error);
    }
  }
}
