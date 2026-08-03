import { Request, Response } from 'express';
import { PaymentMethodRepositoryClass, PaymentMethodOwner } from './payment-method.repository.js';
import { UpsertPaymentMethodSchema } from '@/schema/payment-method.schema.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';

export class PaymentMethodControllerClass {
  constructor(
    private repository: PaymentMethodRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
  ) {}

  /**
   * Which organisation the caller is acting for, from the SESSION.
   *
   * An operator with several venues says which one via `outletId`, and it is
   * checked against the venues they actually hold — accepting it as given would
   * let one venue's operator replace another venue's card. A single-venue
   * operator can omit it.
   */
  private async ownerFor(req: Request, outletId?: string): Promise<PaymentMethodOwner | null> {
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.agencyId) return { agencyId: scope.agencyId };
    if (outletId) {
      return scope.outletIds.includes(outletId) ? { outletId } : null;
    }
    return scope.outletIds.length === 1 ? { outletId: scope.outletIds[0] } : null;
  }

  /** The caller's own card, or null when they have never saved one. */
  async getMine(req: Request, res: Response) {
    try {
      const outletId = typeof req.query.outletId === 'string' ? req.query.outletId : undefined;
      const owner = await this.ownerFor(req, outletId);
      if (!owner) {
        return res.status(200).json({ success: true, message: 'OK', data: null });
      }
      const record = await this.repository.getActiveFor(owner);
      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[PaymentMethodController.getMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Save the caller's card — one row per organisation, so this REPLACES rather
   * than stacks. A venue that updates its card three times has one card on file,
   * not three with no way to tell which one is charged.
   *
   * The gateway columns are deliberately left alone: they are set by whatever
   * payment integration eventually tokenises the card, never here, because a
   * token this endpoint invented would not charge anything.
   */
  async upsertMine(req: Request, res: Response) {
    try {
      const parsed = UpsertPaymentMethodSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const owner = await this.ownerFor(req, parsed.data.outletId);
      if (!owner) {
        return res.status(403).json({
          success: false,
          message: 'No venue or agency on this account to save a card for',
          data: null,
        });
      }
      const actor = getActor(req);
      const fields = {
        brand: parsed.data.brand,
        last4: parsed.data.last4,
        expMonth: parsed.data.expMonth,
        expYear: parsed.data.expYear,
        holderName: parsed.data.holderName ?? null,
        billingEmail: parsed.data.billingEmail ?? null,
        ...(parsed.data.autoPay === undefined ? {} : { autoPay: parsed.data.autoPay }),
      };

      const existing = await this.repository.getActiveFor(owner);
      const record = existing
        ? await this.repository.update(existing.id, { ...fields, updatedBy: actor })
        : await this.repository.create({
            ...('outletId' in owner ? { outletId: owner.outletId } : { agencyId: owner.agencyId }),
            ...fields,
            status: 'active',
            createdBy: actor,
            updatedBy: actor,
          });

      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Card saved', data: record });
    } catch (error) {
      logger.error('[PaymentMethodController.upsertMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Every card on file — admin support view ("which card is this venue on"). */
  async list(_req: Request, res: Response) {
    try {
      const records = await this.repository.listAll();
      res.status(200).json({ success: true, message: 'OK', data: records });
    } catch (error) {
      logger.error('[PaymentMethodController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
