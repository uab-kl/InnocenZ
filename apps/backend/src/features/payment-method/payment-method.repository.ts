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
   * The organisation's DEFAULT instrument — the one that would be charged.
   *
   * Filtered to `active` deliberately: a removed instrument stays as a row for
   * the audit trail, and without the filter it could come back as the one on
   * file. Filtered to `is_default` because an org may now hold several, and
   * "the first active row" was only ever the right answer while there could be
   * exactly one.
   */
  async getActiveFor(owner: PaymentMethodOwner): Promise<PaymentMethod | null> {
    try {
      const [row] = await db
        .select()
        .from(PaymentMethodTable)
        .where(
          and(
            ownerClause(owner),
            eq(PaymentMethodTable.status, 'active'),
            eq(PaymentMethodTable.isDefault, true),
          ),
        )
        .limit(1);
      return row ?? null;
    } catch (error) {
      logger.error('[PaymentMethodRepository.getActiveFor] Error:', error);
      return null;
    }
  }

  /** Every active instrument an organisation holds, default first. */
  async listFor(owner: PaymentMethodOwner): Promise<PaymentMethod[]> {
    try {
      const rows = await db
        .select()
        .from(PaymentMethodTable)
        .where(and(ownerClause(owner), eq(PaymentMethodTable.status, 'active')));
      return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    } catch (error) {
      logger.error('[PaymentMethodRepository.listFor] Error:', error);
      return [];
    }
  }

  /**
   * Make one instrument the default, clearing the flag from the rest.
   *
   * BOTH WRITES IN ONE TRANSACTION, and the clear happens FIRST: the partial
   * unique index allows exactly one default per org, so setting the new one
   * before clearing the old would violate it and roll the whole thing back.
   * That ordering is the entire reason this is a repository method rather than
   * two calls from a controller.
   */
  async setDefault(owner: PaymentMethodOwner, id: string, actor: string): Promise<boolean> {
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(PaymentMethodTable)
          .set({ isDefault: false, updatedAt: new Date(), updatedBy: actor })
          .where(and(ownerClause(owner), eq(PaymentMethodTable.isDefault, true)));

        await tx
          .update(PaymentMethodTable)
          .set({ isDefault: true, updatedAt: new Date(), updatedBy: actor })
          .where(and(ownerClause(owner), eq(PaymentMethodTable.id, id)));
      });
      return true;
    } catch (error) {
      logger.error('[PaymentMethodRepository.setDefault] Error:', error);
      return false;
    }
  }

  /**
   * Retire an instrument. The row stays — `status` moves to 'removed' — because
   * a `subscription_payment` may point at it and the history of how a period
   * was paid must survive the venue changing rails.
   */
  async remove(owner: PaymentMethodOwner, id: string, actor: string): Promise<boolean> {
    try {
      const [row] = await db
        .update(PaymentMethodTable)
        .set({
          status: 'removed',
          // Cleared with the same write: a removed row that is still flagged
          // default holds the partial unique index against its replacement.
          isDefault: false,
          updatedAt: new Date(),
          updatedBy: actor,
        })
        .where(and(ownerClause(owner), eq(PaymentMethodTable.id, id)))
        .returning();
      return Boolean(row);
    } catch (error) {
      logger.error('[PaymentMethodRepository.remove] Error:', error);
      return false;
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
