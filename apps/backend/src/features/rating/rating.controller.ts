import { Request, Response } from 'express';
import { RatingRepositoryClass } from './rating.repository.js';
import { RatingFilter } from './rating.model.js';
import { CreateRatingSchema } from '@/schema/rating.schema.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';

export class RatingControllerClass {
  constructor(private repository: RatingRepositoryClass) {}

  async list(req: Request, res: Response) {
    try {
      const filter: RatingFilter = {
        outletId: req.query.outletId as string | undefined,
        prId: req.query.prId as string | undefined,
      };
      const records = await this.repository.list(filter);
      res.status(200).json({ success: true, message: 'OK', data: records });
    } catch (error) {
      logger.error('[RatingController.list] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const parsed = CreateRatingSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const record = await this.repository.upsert(
        {
          outletId: parsed.data.outletId,
          prId: parsed.data.prId,
          prName: parsed.data.prName,
          stars: parsed.data.stars,
          note: parsed.data.note,
          tags: parsed.data.tags,
        },
        actor,
      );
      if (!record) {
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(201).json({ success: true, message: 'Rating saved', data: record });
    } catch (error) {
      logger.error('[RatingController.upsert] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
