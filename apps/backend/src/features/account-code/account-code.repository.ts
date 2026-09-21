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
    return this.spendCodeAndWritePassword(input, {
      purpose: 'reset_password',
      scopeToCreator: false,
      // The person could not sign in — that is why they are here. A reset that
      // left the lockout standing would hand back a password they still cannot
      // use.
      clearLockout: true,
    });
  }

  /**
   * SIGNED-IN password change, completed: spend the row and write the password
   * in one transaction, ending every session opened before this second.
   *
   * Two differences from the reset above, both deliberate:
   *
   *  • The row must have been created BY this account (`created_by`). A reset
   *    row is addressed by an id handed out to whoever proved a contact; a
   *    password-change row belongs to a session, so the account is part of the
   *    condition as well as of the bound hash.
   *  • The lockout is NOT cleared. Nothing here says the failed sign-ins were
   *    this person — they arrived with a live session — so a lockout earned at
   *    the login door keeps running. `proveIdentity` already refuses to issue a
   *    code at all while one is in force.
   */
  async completePasswordChange(input: {
    requestId: string;
    userId: string;
    passwordHash: string;
    cutoff: Date;
  }): Promise<'ok' | 'already_used'> {
    return this.spendCodeAndWritePassword(input, {
      purpose: 'password_change',
      scopeToCreator: true,
      clearLockout: false,
    });
  }

  /**
   * The body both password writes share: spend the code CONDITIONALLY on
   * `pending` and unexpired, then write — so neither can happen without the
   * other, and two taps racing on one code leave exactly one winner.
   */
  private async spendCodeAndWritePassword(
    input: { requestId: string; userId: string; passwordHash: string; cutoff: Date },
    options: {
      purpose: 'reset_password' | 'password_change';
      scopeToCreator: boolean;
      clearLockout: boolean;
    },
  ): Promise<'ok' | 'already_used'> {
    try {
      await db.transaction(async (tx) => {
        const now = new Date();
        const spent = await tx
          .update(PhoneVerificationTable)
          .set({ status: 'consumed', updatedAt: now, updatedBy: input.userId })
          .where(
            and(
              eq(PhoneVerificationTable.id, input.requestId),
              eq(PhoneVerificationTable.purpose, options.purpose),
              ...(options.scopeToCreator
                ? [eq(PhoneVerificationTable.createdBy, input.userId)]
                : []),
              eq(PhoneVerificationTable.status, 'pending'),
              gt(PhoneVerificationTable.expiresAt, now),
            ),
          )
          .returning({ id: PhoneVerificationTable.id });
        if (spent.length === 0) throw new Outcome('already_used');

        await this.authRepository.updateUserPassword(input.userId, input.passwordHash, {
          tx,
          updatedBy: input.userId,
          clearLockout: options.clearLockout,
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
   * The contact change itself: spend the new-contact row, re-check the value is
   * still free, write it, and cut the older sessions. ONE row since the
   * identity step was retired (owner, 21 Sep 2026).
   *
   * The re-check inside the transaction narrows the window between "free at
   * start" and "written", and a 23505 is reported as `taken`.
   *
   * ⚠️ The unique index is only a PARTIAL backstop, and this comment used to
   * claim it "closes" that window. `user_email_unique` / `user_phone_num_unique`
   * are plain btrees over the RAW columns, while `isContactTaken` compares
   * `lower(btrim(email))` and digits-only phones — so two values differing only
   * in case, or in phone formatting, never collide in the index. The in-
   * transaction re-check is what carries this, not the index.
   */
  async applyContactChange(input: {
    rowId: string;
    userId: string;
    kind: ContactKind;
    /** Already normalised: lowercase email, or '+digits'. */
    value: string;
    cutoff: Date;
  }): Promise<{ status: 'ok'; user: UserType } | { status: 'already_used' } | { status: 'taken' }> {
    try {
      const user = await db.transaction(async (tx) => {
        const now = new Date();
        const spent = await tx
          .update(PhoneVerificationTable)
          .set({ status: 'consumed', updatedAt: now, updatedBy: input.userId })
          .where(
            and(
              eq(PhoneVerificationTable.id, input.rowId),
              eq(PhoneVerificationTable.purpose, 'contact_change_new'),
              eq(PhoneVerificationTable.createdBy, input.userId),
              eq(PhoneVerificationTable.status, 'pending'),
              gt(PhoneVerificationTable.expiresAt, now),
            ),
          )
          .returning({ id: PhoneVerificationTable.id });
        // Conditional on `pending`, so two taps racing on one code leave only
        // one winner and the loser reads `already_used`.
        if (spent.length === 0) throw new Outcome('already_used');

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
