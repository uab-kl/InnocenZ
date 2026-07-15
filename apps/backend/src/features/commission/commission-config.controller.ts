import { Request, Response } from 'express';
import { CommissionConfigRepositoryClass } from './commission-config.repository.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { UpsertCommissionConfigSchema, UpdateCommissionConfigSchema } from '@/schema/commission.schema.js';
import { CommissionConfigFilter } from './commission-config.model.js';

export class CommissionConfigControllerClass {
  constructor(private commissionConfigRepository: CommissionConfigRepositoryClass) {}

  async list(req: Request, res: Response) {
    try {
      const filter: CommissionConfigFilter = {
        outletId: req.query.outletId as string | undefined,
        agencyId: req.query.agencyId as string | undefined,
        itemType: req.query.itemType as string | undefined,
        status: req.query.status as string | undefined,
      };
      const configs = await this.commissionConfigRepository.list(filter);
      res.status(200).json({ success: true, message: 'OK', data: configs });
    } catch (error) {
      logger.error('[CommissionConfigController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const config = await this.commissionConfigRepository.getById(paramId(req.params.id));
      if (!config) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: config });
    } catch (error) {
      logger.error('[CommissionConfigController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const parsed = UpsertCommissionConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const config = await this.commissionConfigRepository.upsert({
        outletId: parsed.data.outletId,
        agencyId: parsed.data.agencyId,
        itemType: parsed.data.itemType,
        unitPrice: parsed.data.unitPrice.toFixed(2),
        commissionRate: parsed.data.commissionRate.toFixed(4),
        status: 'active',
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(200).json({ success: true, message: 'Commission config saved', data: config });
    } catch (error) {
      logger.error('[CommissionConfigController.upsert] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateCommissionConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const updatePayload: Parameters<CommissionConfigRepositoryClass['update']>[1] = {
        updatedBy: getActor(req),
      };
      if (parsed.data.unitPrice !== undefined) updatePayload.unitPrice = parsed.data.unitPrice.toFixed(2);
      if (parsed.data.commissionRate !== undefined) updatePayload.commissionRate = parsed.data.commissionRate.toFixed(4);
      if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status;

      const config = await this.commissionConfigRepository.update(paramId(req.params.id), updatePayload);
      if (!config) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Commission config updated', data: config });
    } catch (error) {
      logger.error('[CommissionConfigController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const removed = await this.commissionConfigRepository.delete(paramId(req.params.id));
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Commission config deactivated', data: null });
    } catch (error) {
      logger.error('[CommissionConfigController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
