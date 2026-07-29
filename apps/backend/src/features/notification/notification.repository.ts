import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { logger } from '@/util/logger.js';
import { DbTransaction } from '@/types/db-transaction.js';
import {
  Notification,
  NotificationInsertType,
  NotificationTable,
} from './notification.model.js';

export class NotificationRepositoryClass {
  /**
   * Writes one notification.
   *
   * Takes an optional transaction because the useful callers raise a notification
   * as part of a larger write — issuing a voucher, resolving a dispute — and the
   * notification must not survive a rolled-back parent. Pass the tx and it does
   * not.
   */
  async create(
    input: NotificationInsertType,
    tx?: DbTransaction,
  ): Promise<Notification | null> {
    try {
      const [row] = await (tx ?? db).insert(NotificationTable).values(input).returning();
      return row ?? null;
    } catch (error) {
      logger.error('[NotificationRepository.create] Error:', error);
      return null;
    }
  }

  /** Newest first. `unreadOnly` drives the bell; the full list drives the inbox. */
  async listForUser(
    userId: string,
    options?: { unreadOnly?: boolean; limit?: number },
  ): Promise<Notification[]> {
    try {
      const where = options?.unreadOnly
        ? and(eq(NotificationTable.userId, userId), isNull(NotificationTable.readAt))
        : eq(NotificationTable.userId, userId);

      return await db
        .select()
        .from(NotificationTable)
        .where(where)
        .orderBy(desc(NotificationTable.createdAt))
        // Bounded by default: an inbox with no limit is an unbounded query on a
        // table that only ever grows.
        .limit(options?.limit ?? 50);
    } catch (error) {
      logger.error('[NotificationRepository.listForUser] Error:', error);
      return [];
    }
  }

  async unreadCount(userId: string): Promise<number> {
    try {
      const [row] = await db
        .select({ value: count() })
        .from(NotificationTable)
        .where(and(eq(NotificationTable.userId, userId), isNull(NotificationTable.readAt)));
      return row?.value ?? 0;
    } catch (error) {
      logger.error('[NotificationRepository.unreadCount] Error:', error);
      return 0;
    }
  }

  /**
   * Marks one notification read, scoped to its owner.
   *
   * userId is part of the WHERE rather than checked beforehand: without it, an id
   * from another user's inbox would be perfectly writable. Returns null when the
   * row is not this user's, which the caller should surface as 404 rather than
   * 403 so it does not confirm the id exists.
   */
  async markRead(id: string, userId: string): Promise<Notification | null> {
    try {
      const [row] = await db
        .update(NotificationTable)
        .set({ readAt: new Date(), updatedAt: new Date(), updatedBy: userId })
        .where(and(eq(NotificationTable.id, id), eq(NotificationTable.userId, userId)))
        .returning();
      return row ?? null;
    } catch (error) {
      logger.error('[NotificationRepository.markRead] Error:', error);
      return null;
    }
  }
}
