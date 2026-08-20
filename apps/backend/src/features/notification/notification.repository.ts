import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
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

  /**
   * Retire the "Cover needed" nag for an assignment once the seat is filled.
   *
   * `shift_cover_needed` is a CALL TO ACTION — "find a replacement on the
   * roster's backfill list" — and nothing was retiring it. Re-staff the PR (or
   * backfill the slot) and every agency member kept an unread notification
   * telling them to go and do a job already done. The backfill WORKLIST corrects
   * itself, because it re-derives from "still below quantity" on every read; the
   * notification is a stored row, so it stays true forever unless something says
   * otherwise. This is that something.
   *
   * MARKED READ, not deleted. The agency really was asked to find cover, and
   * that is worth keeping; what has expired is the prompt, not the fact. Read
   * rows drop out of the bell and the unread count, which is the whole nag.
   *
   * Across ALL recipients, so it is deliberately not user-scoped like `markRead`
   * above: one event raised one notification per agency member, and it is the
   * EVENT that has been resolved. Leaving four of five members still nagged
   * would be the same bug wearing a smaller hat.
   *
   * Already-read rows are left alone (`readAt IS NULL`), so this never rewrites
   * a timestamp that recorded a human actually reading it.
   */
  async resolveCoverNeeded(assignmentId: string, actor: string): Promise<number> {
    try {
      const rows = await db
        .update(NotificationTable)
        .set({ readAt: new Date(), updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(NotificationTable.kind, 'shift_cover_needed'),
            isNull(NotificationTable.readAt),
            sql`${NotificationTable.payload}->>'assignmentId' = ${assignmentId}`,
          ),
        )
        .returning({ id: NotificationTable.id });
      return rows.length;
    } catch (error) {
      logger.error('[NotificationRepository.resolveCoverNeeded] Error:', error);
      return 0;
    }
  }

  /**
   * The same retirement, for the OTHER way a seat gets filled.
   *
   * A cancelled PR is usually not un-cancelled — somebody else is assigned in
   * their place. That backfill answers the prompt just as completely, but it
   * carries a DIFFERENT assignment id, so `resolveCoverNeeded` above can never
   * match it. Keyed on the shift instead.
   *
   * ⚠️ The caller must first establish that the shift is no longer SHORT. Two
   * PRs can drop off one shift and be replaced one at a time, and retiring both
   * prompts after the first replacement would tell the agency the job was done
   * with a seat still empty — the precise failure this whole fix is about, only
   * harder to notice because it looks like success.
   */
  async resolveCoverNeededForShift(shiftId: string, actor: string): Promise<number> {
    try {
      const rows = await db
        .update(NotificationTable)
        .set({ readAt: new Date(), updatedAt: new Date(), updatedBy: actor })
        .where(
          and(
            eq(NotificationTable.kind, 'shift_cover_needed'),
            isNull(NotificationTable.readAt),
            sql`${NotificationTable.payload}->>'shiftId' = ${shiftId}`,
          ),
        )
        .returning({ id: NotificationTable.id });
      return rows.length;
    } catch (error) {
      logger.error('[NotificationRepository.resolveCoverNeededForShift] Error:', error);
      return 0;
    }
  }
}
