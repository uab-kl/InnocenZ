import { Request, Response } from 'express';
import { z } from 'zod';
import { PlatformConfigRepositoryClass } from './platform-config.repository.js';
import { NewPlatformConfig } from './platform-config.model.js';
import { getActor } from '@/util/actor.js';
import { Error } from '@/error/index.js';

const UpdatePlatformConfigSchema = z.object({
  platformFeePercent: z.coerce.number().min(0).max(100).optional(),
  geofenceRadiusMeters: z.coerce.number().int().min(0).max(100000).optional(),
  subscriptionMonthlyFee: z.coerce.number().min(0).optional(),
  duplicatePaymentWindowHours: z.coerce.number().int().min(0).max(8760).optional(),
  currency: z.string().min(1).max(8).optional(),
});

export class PlatformConfigControllerClass {
  constructor(private platformConfigRepository: PlatformConfigRepositoryClass) {}

  async getConfig(_req: Request, res: Response) {
    try {
      const config = await this.platformConfigRepository.getConfig();
      if (!config) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'OK', data: config });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateConfig(req: Request, res: Response) {
    try {
      const parsed = UpdatePlatformConfigSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const patch: Partial<NewPlatformConfig> = { updatedBy: getActor(req) };
      const d = parsed.data;
      // numeric columns are stored as strings by drizzle — normalise to 2 dp
      if (d.platformFeePercent !== undefined) patch.platformFeePercent = d.platformFeePercent.toFixed(2);
      if (d.subscriptionMonthlyFee !== undefined) patch.subscriptionMonthlyFee = d.subscriptionMonthlyFee.toFixed(2);
      if (d.geofenceRadiusMeters !== undefined) patch.geofenceRadiusMeters = d.geofenceRadiusMeters;
      if (d.duplicatePaymentWindowHours !== undefined) patch.duplicatePaymentWindowHours = d.duplicatePaymentWindowHours;
      if (d.currency !== undefined) patch.currency = d.currency;

      const config = await this.platformConfigRepository.updateConfig(patch);
      if (!config) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Platform configuration updated', data: config });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
