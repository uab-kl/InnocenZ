import crypto from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  NewPhoneVerification,
  PhoneVerification,
  PhoneVerificationPurpose,
  PhoneVerificationTable,
} from './phone-verification.model.js';

/** Digits only — same spirit as login phone matching. */
export function normalizePhoneDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

export function hashOtpCode(code: string): string {
  return crypto.createHash('sha256').update(code, 'utf8').digest('hex');
}

export function codesMatch(code: string, codeHash: string): boolean {
  const a = Buffer.from(hashOtpCode(code), 'hex');
  const b = Buffer.from(codeHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Verified receipt still usable for ~30 min after its OTP window (matches signup). */
export function isVerifiedOtpUsable(
  proof: PhoneVerification | null | undefined,
  phoneNum: string,
  purpose: PhoneVerificationPurpose,
): proof is PhoneVerification {
  if (!proof) return false;
  if (proof.status !== 'verified') return false;
  if (proof.purpose !== purpose) return false;
  if (proof.phoneNum !== phoneNum) return false;
  const graceMs = 30 * 60_000;
  return !proof.expiresAt || proof.expiresAt.getTime() > Date.now() - graceMs;
}

export class PhoneVerificationRepositoryClass {
  async create(
    data: Omit<NewPhoneVerification, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PhoneVerification | null> {
    try {
      const [row] = await db.insert(PhoneVerificationTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PhoneVerificationRepository.create] Error:', error);
      return null;
    }
  }

  /** Newest still-pending, unexpired challenge for this phone + purpose. */
  async findActivePending(
    phoneNum: string,
    purpose: PhoneVerificationPurpose,
  ): Promise<PhoneVerification | null> {
    try {
      const [row] = await db
        .select()
        .from(PhoneVerificationTable)
        .where(
          and(
            eq(PhoneVerificationTable.phoneNum, phoneNum),
            eq(PhoneVerificationTable.purpose, purpose),
            eq(PhoneVerificationTable.status, 'pending'),
            gt(PhoneVerificationTable.expiresAt, new Date()),
          ),
        )
        .orderBy(desc(PhoneVerificationTable.createdAt))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PhoneVerificationRepository.findActivePending] Error:', error);
      return null;
    }
  }

  async getById(id: string): Promise<PhoneVerification | null> {
    try {
      const [row] = await db
        .select()
        .from(PhoneVerificationTable)
        .where(eq(PhoneVerificationTable.id, id))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PhoneVerificationRepository.getById] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<Omit<NewPhoneVerification, 'id' | 'createdAt' | 'createdBy'>>,
  ): Promise<PhoneVerification | null> {
    try {
      const [row] = await db
        .update(PhoneVerificationTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PhoneVerificationTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PhoneVerificationRepository.update] Error:', error);
      return null;
    }
  }

  /** Expire other pending rows for this phone + purpose when a fresh code is issued. */
  async expirePendingForPhone(
    phoneNum: string,
    purpose: PhoneVerificationPurpose,
    actor: string,
  ): Promise<void> {
    try {
      await db
        .update(PhoneVerificationTable)
        .set({
          status: 'expired',
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(
          and(
            eq(PhoneVerificationTable.phoneNum, phoneNum),
            eq(PhoneVerificationTable.purpose, purpose),
            eq(PhoneVerificationTable.status, 'pending'),
          ),
        );
    } catch (error) {
      logger.error('[PhoneVerificationRepository.expirePendingForPhone] Error:', error);
    }
  }
}
