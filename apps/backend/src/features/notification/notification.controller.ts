import { Request, Response } from 'express';
import { Error } from '@/error/index.js';
import { logger } from '@/util/logger.js';
import { paramId } from '@/util/params.js';
import { NotificationRepositoryClass } from './notification.repository.js';

/** Hard ceiling on one page, whatever the caller asks for. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

/**
 * The read side of in-app notifications.
 *
 * Producers have been writing rows since the scheduler landed; until this
 * controller existed there was no way to read one back, so every notification
 * the system raised was invisible to the person it was raised for.
 *
 * There is no role guard on this router, and that is deliberate: a PR, an
 * agency and an outlet all have an inbox. Scoping is by `req.user.id` on every
 * query — no route takes a user id from the caller, so there is no id to
 * tamper with.
 */
export class NotificationControllerClass {
  constructor(private repository: NotificationRepositoryClass) {}

  /**
   * Parses ?limit. A junk value falls back to the default rather than 400ing —
   * a malformed query string should not empty someone's inbox.
   */
  private parseLimit(raw: unknown): number {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
  }

  /** GET /notification?unreadOnly=true&limit=50 — newest first. */
  async listMine(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const rows = await this.repository.listForUser(userId, {
        unreadOnly: req.query.unreadOnly === 'true',
        limit: this.parseLimit(req.query.limit),
      });

      return res.status(200).json({ success: true, message: 'OK', data: rows });
    } catch (error) {
      logger.error('[NotificationController.listMine] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** GET /notification/unread-count — just the badge number. */
  async unreadCount(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const value = await this.repository.unreadCount(userId);
      return res.status(200).json({ success: true, message: 'OK', data: { unread: value } });
    } catch (error) {
      logger.error('[NotificationController.unreadCount] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** POST /notification/:id/read — idempotent; re-reading a read one is fine. */
  async markRead(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: Error.UNAUTHORIZED, data: null });
      }

      const id = paramId(req.params.id);
      if (!id) {
        return res
          .status(400)
          .json({ success: false, message: 'Notification id is required', data: null });
      }

      const row = await this.repository.markRead(id, userId);
      if (!row) {
        // 404 and not 403: the repository scopes by owner, so "not yours" and
        // "does not exist" are indistinguishable here — and saying 403 would
        // confirm to a prober that the id is real.
        return res
          .status(404)
          .json({ success: false, message: 'Notification not found', data: null });
      }

      return res.status(200).json({ success: true, message: 'OK', data: row });
    } catch (error) {
      logger.error('[NotificationController.markRead] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
