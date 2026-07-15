import { Request, Response } from 'express';
import { SubscriptionFeatureRepositoryClass } from './subscription-feature.repository.js';
import { SubscriptionFeatureType } from './subscription-feature.model.js';
import { SubscriptionFeatureSchema } from '@/schema/subscription.schema.js';
import { paginate } from '@/util/pagination.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { Error } from '@/error/index.js';

function filterSubscriptionFeatures(
  features: SubscriptionFeatureType[],
  subscriptionId?: string,
  roleId?: string,
  limitTypeId?: string,
): SubscriptionFeatureType[] {
  return features.filter((feature) => {
    if (subscriptionId && feature.subscriptionId !== subscriptionId) return false;
    if (roleId && feature.roleId !== roleId) return false;
    if (limitTypeId && feature.limitTypeId !== limitTypeId) return false;
    return true;
  });
}

export class SubscriptionFeatureControllerClass {
  constructor(private subscriptionFeatureRepository: SubscriptionFeatureRepositoryClass) {}

  async getSubscriptionFeatures(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const features = filterSubscriptionFeatures(
        await this.subscriptionFeatureRepository.getAllSubscriptionFeatures(),
        req.query.subscriptionId as string | undefined,
        req.query.roleId as string | undefined,
        req.query.limitTypeId as string | undefined,
      );
      res.status(200).json({ success: true, message: 'Successfully fetched subscription features', ...paginate(features, page, pageSize) });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getSubscriptionFeatureById(req: Request, res: Response) {
    try {
      const feature = await this.subscriptionFeatureRepository.getSubscriptionFeatureById(paramId(req.params.id));
      if (!feature) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: feature });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createSubscriptionFeature(req: Request, res: Response) {
    try {
      const parsed = SubscriptionFeatureSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.subscriptionFeatureRepository.createSubscriptionFeature({
        ...parsed.data,
        createdBy: getActor(req),
        updatedBy: getActor(req),
      });
      if (!data) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      res.status(201).json({ success: true, message: 'Subscription feature created', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateSubscriptionFeature(req: Request, res: Response) {
    try {
      const parsed = SubscriptionFeatureSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const data = await this.subscriptionFeatureRepository.updateSubscriptionFeature(paramId(req.params.id), {
        ...parsed.data,
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Subscription feature updated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async deleteSubscriptionFeature(req: Request, res: Response) {
    try {
      const data = await this.subscriptionFeatureRepository.deleteSubscriptionFeature(paramId(req.params.id));
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Subscription feature deleted', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
