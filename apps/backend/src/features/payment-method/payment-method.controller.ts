import { Request, Response } from 'express';
import { PaymentMethodRepositoryClass, PaymentMethodOwner } from './payment-method.repository.js';
import { UpsertPaymentMethodSchema } from '@/schema/payment-method.schema.js';
import {
  ewalletProviders,
  fpxBankByCode,
  fpxBanks,
  toPublicPaymentMethod,
} from './payment-method.model.js';
import {
  type OrgScopeDeps,
  pickedOrgKind,
  resolveActingOrgId,
  resolveOrgScope,
} from '@/util/org-scope.js';
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
    /*
     * ⚠️ AN ADMIN CAN ALSO BE AN ORGANISATION'S OWNER — owner's call, 11 Sep
     * 2026 ("make admin can be the org team member"). `resolveOrgScope` answers
     * `{isAdmin:true, agencyId:null, outletIds:[]}` and DISCARDS memberships, so
     * every branch below missed and this returned null: the card read back as
     * "no payment method saved" on an organisation that has one, and saving it
     * answered 403. A silent wrong answer on a billing screen, for the exact
     * account the reversal was written to support.
     *
     * Resolved the same way every other org read is — the verified `x-org-id`
     * with its kind — rather than by widening `isAdmin`, which ~39 call sites
     * read as "see everything" and would start narrowing.
     */
    if (scope.isAdmin) {
      const kind = pickedOrgKind(req);
      if (kind === 'outlet' || (!kind && outletId)) {
        const asOutlet = await resolveActingOrgId(
          req,
          this.orgScopeDeps,
          'outlet',
          outletId,
        );
        if (asOutlet) return { outletId: asOutlet };
      }
      if (kind === 'agency' || !kind) {
        const asAgency = await resolveActingOrgId(
          req,
          this.orgScopeDeps,
          'agency',
        );
        if (asAgency) return { agencyId: asAgency };
      }
      // A pure admin, acting on nobody's behalf — unchanged.
      return null;
    }
    /*
     * ⚠️ A NAMED VENUE FIRST — the agency check used to come before this, so
     * `outletId` was read only by callers with no agency membership at all.
     * Anyone who both staffs an agency and operates a venue had the agency
     * returned regardless: the outlet Settings page then showed, saved and
     * REPLACED the agency's card while the heading said the venue's name.
     *
     * Still verified against the venues they actually hold — accepting the id
     * as given would let one venue's operator replace another's.
     */
    if (outletId) {
      if (scope.outletIds.includes(outletId)) return { outletId };
      /*
       * Named a venue they do not staff. Falling through to the agency here
       * would answer a question about venue B with agency A's card, so this is
       * a refusal rather than a different answer.
       */
      return null;
    }
    if (scope.agencyId) return { agencyId: scope.agencyId };
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
      res.status(200).json({
        success: true,
        message: 'OK',
        data: record ? toPublicPaymentMethod(record) : null,
      });
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

  /**
   * The e-wallet roster the picker renders — the exact sibling of `banks` above,
   * and served from the server for the same reason: two copies of a roster is
   * how the browser comes to offer a provider the save would then reject.
   */
  async wallets(_req: Request, res: Response) {
    res.status(200).json({ success: true, message: 'OK', data: ewalletProviders });
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
      res.status(200).json({ success: true, message: 'OK', data: records.map(toPublicPaymentMethod) });
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
        // The e-wallet rail cannot be saved any more (0148 retired the rows;
        // the schema refuses the type), so nothing is ever written here.
        walletProvider: null,
        // Meaningless on a rail that cannot be charged unattended — a bank
        // transfer that claims auto-pay is a promise the app cannot keep, and an
        // e-wallet is a PUSH rail: the payer approves each payment inside their
        // own app, so nothing here can ever debit them without that tap.
        autoPay:
          type === 'card' || type === 'fpx_mandate' ? (parsed.data.autoPay ?? true) : false,
      };

      // Matched on the RAIL, not merely on "the active row": that is what lets
      // a second rail be added instead of overwriting the first.
      const held = await this.repository.listFor(owner);
      const existing = held.find((row) => row.type === type);

      /**
       * AN APPROVED MANDATE IS NOT RE-ASKED FOR BY AN EDIT.
       *
       * `fields` above is INSERT-shaped: it forces `mandateStatus: 'pending'`,
       * which is exactly right for a mandate being asked for and destructive for
       * one that already exists. Re-using it on the update branch meant a venue
       * correcting its billing email walked its BANK-APPROVED direct debit back
       * to pending — the arrangement stops being chargeable, and getting it back
       * costs another trip to the bank. `mandateReference`, written by the
       * gateway rather than by this screen, was nulled the same way whenever the
       * browser did not happen to echo it.
       *
       * Only the bank moves a mandate's state. So an update keeps whatever the
       * existing row holds, and re-asks only when the venue has genuinely picked
       * a DIFFERENT bank — which is a new authorisation and must start pending.
       */
      const rebank = existing?.type === 'fpx_mandate' && fields.bankCode !== existing.bankCode;
      const updateFields =
        existing?.type === 'fpx_mandate' && !rebank
          ? {
              ...fields,
              mandateStatus: existing.mandateStatus,
              mandateReference: parsed.data.mandateReference ?? existing.mandateReference,
            }
          : fields;

      const record = existing
        ? await this.repository.update(existing.id, { ...updateFields, updatedBy: actor })
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
      res.status(200).json({
        success: true,
        message: 'Payment method saved',
        data: toPublicPaymentMethod(record),
      });
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
        data: (await this.repository.listFor(owner)).map(toPublicPaymentMethod),
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
        data: (await this.repository.listFor(owner)).map(toPublicPaymentMethod),
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
      res.status(200).json({ success: true, message: 'OK', data: records.map(toPublicPaymentMethod) });
    } catch (error) {
      logger.error('[PaymentMethodController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
