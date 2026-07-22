import { Request, Response } from 'express';
import { SubscriptionRepositoryClass } from './subscription.repository.js';
import { Subscription, BillingCycle } from './subscription.model.js';
import { SubscriptionSchema } from '@/schema/subscription.schema.js';
import { paginate } from '@/util/pagination.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { Error } from '@/error/index.js';

function filterSubscriptions(
  subscriptions: Subscription[],
  name?: string,
  status?: string,
  billingCycle?: string,
  subscriptionType?: string,
): Subscription[] {
  return subscriptions.filter((subscription) => {
    if (name && !subscription.name.toLowerCase().includes(name.toLowerCase())) return false;
    if (status && subscription.status !== status) return false;
    if (billingCycle && subscription.billingCycle !== billingCycle) return false;
    if (subscriptionType && subscription.subscriptionType !== subscriptionType) return false;
    return true;
  });
}

export class SubscriptionControllerClass {
  constructor(private subscriptionRepository: SubscriptionRepositoryClass) {}

  async getSubscriptions(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const subscriptions = filterSubscriptions(
        await this.subscriptionRepository.getAllSubscriptions(),
        req.query.name as string | undefined,
        req.query.status as string | undefined,
        req.query.billingCycle as string | undefined,
        req.query.subscriptionType as string | undefined,
      );
      res.status(200).json({ success: true, message: 'Successfully fetched subscriptions', ...paginate(subscriptions, page, pageSize) });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getSubscriptionById(req: Request, res: Response) {
    try {
      const subscription = await this.subscriptionRepository.getSubscriptionById(paramId(req.params.id));
      if (!subscription) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'OK', data: subscription });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createSubscription(req: Request, res: Response) {
    try {
      const parsed = SubscriptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const actor = getActor(req);

      const created = await this.subscriptionRepository.createSubscription({
        name: parsed.data.name,
        price: parsed.data.price.toFixed(2),
        billingCycle: parsed.data.billingCycle as BillingCycle,
        subscriptionType: parsed.data.subscriptionType,
        roleId: await this.subscriptionRepository.roleIdForType(parsed.data.subscriptionType),
        status: parsed.data.status,
        coverage: parsed.data.coverage ?? null,
        createdBy: actor,
        updatedBy: actor,
      });

      if (!created) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });

      res.status(201).json({ success: true, message: 'Subscription created', data: created });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateSubscription(req: Request, res: Response) {
    try {
      const parsed = SubscriptionSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const id = paramId(req.params.id);
      const actor = getActor(req);

      const updatePayload: Parameters<SubscriptionRepositoryClass['updateSubscription']>[1] = {
        updatedBy: actor,
      };
      if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
      if (parsed.data.price !== undefined) updatePayload.price = parsed.data.price.toFixed(2);
      if (parsed.data.billingCycle !== undefined) updatePayload.billingCycle = parsed.data.billingCycle;
      if (parsed.data.status !== undefined) updatePayload.status = parsed.data.status;
      if (parsed.data.coverage !== undefined) updatePayload.coverage = parsed.data.coverage;

      const data = await this.subscriptionRepository.updateSubscription(id, updatePayload);
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      res.status(200).json({ success: true, message: 'Subscription updated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async inactiveSubscription(req: Request, res: Response) {
    try {
      const data = await this.subscriptionRepository.updateSubscription(paramId(req.params.id), {
        status: 'inactive',
        updatedBy: getActor(req),
      });
      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Subscription deactivated', data });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
