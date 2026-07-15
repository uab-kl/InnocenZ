import { Request, Response } from 'express';
import { SubscriptionRepositoryClass } from './subscription.repository.js';
import { SubscriptionRoleRepositoryClass } from './subscription-role.repository.js';
import { Subscription, BillingCycle } from './subscription.model.js';
import { SubscriptionRoleSummary } from './subscription-role.model.js';
import { SubscriptionSchema } from '@/schema/subscription.schema.js';
import { paginate } from '@/util/pagination.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { Error } from '@/error/index.js';
import { db } from '@/db/index.js';

type SubscriptionWithRoles = Subscription & { roles: SubscriptionRoleSummary[] };

function filterSubscriptions(
  subscriptions: SubscriptionWithRoles[],
  name?: string,
  status?: string,
  billingCycle?: string,
  roleId?: string,
): SubscriptionWithRoles[] {
  return subscriptions.filter((subscription) => {
    if (name && !subscription.name.toLowerCase().includes(name.toLowerCase())) return false;
    if (status && subscription.status !== status) return false;
    if (billingCycle && subscription.billingCycle !== billingCycle) return false;
    if (roleId && !subscription.roles.some((role) => role.id === roleId)) return false;
    return true;
  });
}

async function attachRoles(
  subscriptionRoleRepository: SubscriptionRoleRepositoryClass,
  subscriptions: Subscription[],
): Promise<SubscriptionWithRoles[]> {
  const rolesMap = await subscriptionRoleRepository.getRolesBySubscriptionIds(
    subscriptions.map((subscription) => subscription.id),
  );
  return subscriptions.map((subscription) => ({
    ...subscription,
    roles: rolesMap.get(subscription.id) ?? [],
  }));
}

export class SubscriptionControllerClass {
  constructor(
    private subscriptionRepository: SubscriptionRepositoryClass,
    private subscriptionRoleRepository: SubscriptionRoleRepositoryClass,
  ) {}

  async getSubscriptions(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const withRoles = await attachRoles(
        this.subscriptionRoleRepository,
        await this.subscriptionRepository.getAllSubscriptions(),
      );
      const subscriptions = filterSubscriptions(
        withRoles,
        req.query.name as string | undefined,
        req.query.status as string | undefined,
        req.query.billingCycle as string | undefined,
        req.query.roleId as string | undefined,
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
      const roles = await this.subscriptionRoleRepository.getRolesBySubscriptionId(subscription.id);
      res.status(200).json({ success: true, message: 'OK', data: { ...subscription, roles } });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async createSubscription(req: Request, res: Response) {
    try {
      const parsed = SubscriptionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message });
      const actor = getActor(req);
      const roleIds = parsed.data.roleIds ?? [];

      const created = await db.transaction(async (tx) => {
        const subscription = await this.subscriptionRepository.createSubscription(
          {
            name: parsed.data.name,
            price: parsed.data.price.toFixed(2),
            billingCycle: parsed.data.billingCycle as BillingCycle,
            status: parsed.data.status,
            createdBy: actor,
            updatedBy: actor,
          },
          tx,
        );
        if (!subscription) return null;

        if (roleIds.length > 0) {
          await this.subscriptionRoleRepository.syncRoles(subscription.id, roleIds, actor, actor, tx);
        }

        return subscription;
      });

      if (!created) return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });

      const roles = await this.subscriptionRoleRepository.getRolesBySubscriptionId(created.id);
      res.status(201).json({ success: true, message: 'Subscription created', data: { ...created, roles } });
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

      const data = await db.transaction(async (tx) => {
        const subscription = await this.subscriptionRepository.updateSubscription(id, updatePayload, tx);
        if (!subscription) return null;

        if (parsed.data.roleIds !== undefined) {
          await this.subscriptionRoleRepository.syncRoles(id, parsed.data.roleIds, actor, actor, tx);
        }

        return subscription;
      });

      if (!data) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      const roles = await this.subscriptionRoleRepository.getRolesBySubscriptionId(data.id);
      res.status(200).json({ success: true, message: 'Subscription updated', data: { ...data, roles } });
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
      const roles = await this.subscriptionRoleRepository.getRolesBySubscriptionId(data.id);
      res.status(200).json({ success: true, message: 'Subscription deactivated', data: { ...data, roles } });
    } catch {
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
