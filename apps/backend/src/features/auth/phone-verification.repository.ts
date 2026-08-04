import crypto from 'node:crypto';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  NewPhoneVerification,
  PhoneVerification,
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

  /** Newest still-pending, unexpired challenge for this phone. */
  async findActivePending(phoneNum: string): Promise<PhoneVerification | null> {
    try {
      const [row] = await db
        .select()
        .from(PhoneVerificationTable)
        .where(
          and(
            eq(PhoneVerificationTable.phoneNum, phoneNum),
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

  /** Expire any other pending rows for this phone when a fresh code is issued. */
  async expirePendingForPhone(phoneNum: string, actor: string): Promise<void> {
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
            eq(PhoneVerificationTable.status, 'pending'),
          ),
        );
    } catch (error) {
      logger.error('[PhoneVerificationRepository.expirePendingForPhone] Error:', error);
    }
  }
}
