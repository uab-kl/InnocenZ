import { and, eq } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import {
  NewPaymentMethod,
  PaymentMethod,
  PaymentMethodTable,
} from './payment-method.model.js';

/** Which organisation a card belongs to. Exactly one field is ever set. */
export type PaymentMethodOwner = { outletId: string } | { agencyId: string };

function ownerClause(owner: PaymentMethodOwner) {
  return 'outletId' in owner
    ? eq(PaymentMethodTable.outletId, owner.outletId)
    : eq(PaymentMethodTable.agencyId, owner.agencyId);
}

export class PaymentMethodRepositoryClass {
  /**
   * The organisation's current card, or null.
   *
   * Filtered to `active` deliberately: a removed card stays as a row for the
   * audit trail, and without the filter it could come back as the card on file.
   */
  async getActiveFor(owner: PaymentMethodOwner): Promise<PaymentMethod | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentMethodTable)
        .where(and(ownerClause(owner), eq(PaymentMethodTable.status, 'active')))
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentMethodRepository.getActiveFor] Error:', error);
      return null;
    }
  }

  async create(
    data: Omit<NewPaymentMethod, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<PaymentMethod | null> {
    try {
      const [row] = await db.insert(PaymentMethodTable).values(data).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentMethodRepository.create] Error:', error);
      return null;
    }
  }

  async update(
    id: string,
    data: Partial<Omit<NewPaymentMethod, 'id' | 'createdAt' | 'createdBy'>>,
  ): Promise<PaymentMethod | null> {
    try {
      const [row] = await db
        .update(PaymentMethodTable)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(PaymentMethodTable.id, id))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentMethodRepository.update] Error:', error);
      return null;
    }
  }

  /** Every card on file — admin only, for support ("which card is this venue on"). */
  async listAll(): Promise<PaymentMethod[]> {
    try {
      return await db.select().from(PaymentMethodTable);
    } catch (error) {
      logger.error('[PaymentMethodRepository.listAll] Error:', error);
      return [];
    }
  }
}
