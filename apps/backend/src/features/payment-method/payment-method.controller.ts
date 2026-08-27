import { Request, Response } from 'express';
import { PaymentMethodRepositoryClass, PaymentMethodOwner } from './payment-method.repository.js';
import { UpsertPaymentMethodSchema } from '@/schema/payment-method.schema.js';
import { fpxBankByCode, fpxBanks } from './payment-method.model.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { paramId } from '@/util/params.js';
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
   * The FPX bank roster the picker renders.
   *
   * Served from the server's own list so the browser cannot offer a bank the
   * save would then reject — two copies of this roster is exactly how that
   * mismatch happens.
   */
  async banks(_req: Request, res: Response) {
    res.status(200).json({ success: true, message: 'OK', data: fpxBanks });
  }

  /** Every instrument the caller holds, default first. */
  async listMine(req: Request, res: Response) {
    try {
      const outletId = typeof req.query.outletId === 'string' ? req.query.outletId : undefined;
      const owner = await this.ownerFor(req, outletId);
      if (!owner) {
        return res.status(200).json({ success: true, message: 'OK', data: [] });
      }
      const records = await this.repository.listFor(owner);
      res.status(200).json({ success: true, message: 'OK', data: records });
    } catch (error) {
      logger.error('[PaymentMethodController.listMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Save how the caller pays.
   *
   * REPLACES WITHIN A RAIL, rather than stacking: re-saving a card updates the
   * card on file, so a venue that corrects its expiry three times has one card
   * and not three with no way to tell which is charged. Saving a DIFFERENT rail
   * adds a row beside it, which is the whole point of the 0133 change — a venue
   * can hold a card and a bank-transfer arrangement at once, and `isDefault`
   * says which one would be charged.
   *
   * The gateway columns are deliberately left alone: they are set by whatever
   * payment integration eventually tokenises the instrument, never here, because
   * a token this endpoint invented would not charge anything.
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
          message: 'No venue or agency on this account to save a payment method for',
          data: null,
        });
      }
      const actor = getActor(req);
      const type = parsed.data.type;
      const isCard = type === 'card';

      const fields = {
        type,
        // A non-card rail has no brand to show; forcing the card default onto it
        // would print "Card" beside a bank transfer.
        brand: isCard ? parsed.data.brand : 'Card',
        last4: isCard ? (parsed.data.last4 ?? null) : null,
        expMonth: isCard ? (parsed.data.expMonth ?? null) : null,
        expYear: isCard ? (parsed.data.expYear ?? null) : null,
        holderName: parsed.data.holderName ?? null,
        billingEmail: parsed.data.billingEmail ?? null,
        /**
         * A MANDATE STARTS PENDING AND THE CALLER CANNOT SAY OTHERWISE.
         *
         * Only the payer's bank can approve a direct debit. Honouring an
         * 'active' sent from a browser would mark an unapproved mandate ready
         * to charge, which is the one mistake on this screen that moves money
         * nobody authorised.
         */
        mandateStatus: type === 'fpx_mandate' ? ('pending' as const) : null,
        mandateReference: type === 'fpx_mandate' ? (parsed.data.mandateReference ?? null) : null,
        /**
         * The bank to redirect the payer to. Its NAME is resolved from the
         * shared roster rather than taken from the body — a client-supplied
         * label could print "Maybank2u" beside a code pointing somewhere else.
         * There is no account number here, and there must never be one.
         */
        bankCode: type === 'fpx_mandate' ? (parsed.data.bankCode ?? null) : null,
        bankName:
          type === 'fpx_mandate' ? (fpxBankByCode(parsed.data.bankCode)?.name ?? null) : null,
        // Meaningless on a rail that cannot be charged unattended — a bank
        // transfer that claims auto-pay is a promise the app cannot keep.
        autoPay:
          type === 'card' || type === 'fpx_mandate' ? (parsed.data.autoPay ?? true) : false,
      };

      // Matched on the RAIL, not merely on "the active row": that is what lets
      // a second rail be added instead of overwriting the first.
      const held = await this.repository.listFor(owner);
      const existing = held.find((row) => row.type === type);

      const record = existing
        ? await this.repository.update(existing.id, { ...fields, updatedBy: actor })
        : await this.repository.create({
            ...('outletId' in owner ? { outletId: owner.outletId } : { agencyId: owner.agencyId }),
            ...fields,
            // The first instrument an org saves is its default; a later one is
            // not, or adding a backup would silently redirect the charge.
            isDefault: held.length === 0,
            status: 'active',
            createdBy: actor,
            updatedBy: actor,
          });

      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Payment method saved', data: record });
    } catch (error) {
      logger.error('[PaymentMethodController.upsertMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Choose which of several instruments is charged. */
  async setDefaultMine(req: Request, res: Response) {
    try {
      const outletId = typeof req.body?.outletId === 'string' ? req.body.outletId : undefined;
      const owner = await this.ownerFor(req, outletId);
      if (!owner) {
        return res.status(403).json({
          success: false,
          message: 'No venue or agency on this account',
          data: null,
        });
      }
      const id = paramId(req.params.id);
      // Ownership comes from the caller's own rows, never from the id given —
      // otherwise one venue could point another venue's charge at its card.
      const held = await this.repository.listFor(owner);
      if (!held.some((row) => row.id === id)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const ok = await this.repository.setDefault(owner, id, getActor(req));
      if (!ok) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({
        success: true,
        message: 'Default payment method updated',
        data: await this.repository.listFor(owner),
      });
    } catch (error) {
      logger.error('[PaymentMethodController.setDefaultMine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Retire an instrument. The row survives as `removed` — a settled period may
   * point at it, and how that period was paid must not vanish with the card.
   */
  async removeMine(req: Request, res: Response) {
    try {
      const outletId = typeof req.query.outletId === 'string' ? req.query.outletId : undefined;
      const owner = await this.ownerFor(req, outletId);
      if (!owner) {
        return res.status(403).json({
          success: false,
          message: 'No venue or agency on this account',
          data: null,
        });
      }
      const id = paramId(req.params.id);
      const held = await this.repository.listFor(owner);
      const target = held.find((row) => row.id === id);
      if (!target) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const ok = await this.repository.remove(owner, id, getActor(req));
      if (!ok) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      // Removing the default would leave the org with instruments and none
      // chosen, so the oldest survivor is promoted rather than leaving the
      // charge pointing nowhere.
      const remaining = await this.repository.listFor(owner);
      const next = [...remaining].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
      if (target.isDefault && next) {
        await this.repository.setDefault(owner, next.id, getActor(req));
      }

      res.status(200).json({
        success: true,
        message: 'Payment method removed',
        data: await this.repository.listFor(owner),
      });
    } catch (error) {
      logger.error('[PaymentMethodController.removeMine] Error:', error);
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
