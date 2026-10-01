import { Request, Response } from 'express';
import type { AdminRequestRepositoryClass } from './admin-request.repository.js';
import { AdminRequest, AdminRequestType } from './admin-request.model.js';
import {
  ResolveAdminRequestSchema,
  UpdateAdminRequestSchema,
} from '@/schema/admin-request.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import type { AppliedPlanChange } from './apply-plan-change.js';
import {
  PlanChangeRefusedError,
  RequestNotPendingError,
  answeredRequestMessage,
  notPendingMessage,
} from './plan-change-rules.js';
import { isAwaitingAnswer, refusalBody } from './admin-request-rules.js';
import { type AdminRequestLedger, SwitchNotAppliedError } from './admin-request-ledger.js';

/**
 * The admin's actions on one request: mark contacted, edit, resolve, approve
 * and decline. Every answer is claimed atomically (`claimAwaitingAnswer`), and
 * the ones that bill go through the shared ledger (admin-request-ledger.ts).
 */
export class AdminRequestActionHandlers {
  constructor(
    private readonly repository: AdminRequestRepositoryClass,
    private readonly ledger: AdminRequestLedger,
  ) {}

  async markContacted(req: Request, res: Response) {
    try {
      const actor = getActor(req);
      const id = paramId(req.params.id);
      /*
       * Only a request still AWAITING an answer (28 Sep 2026 follow-up). This
       * wrote `contacted` over any status, which re-opened an answered request
       * — and a re-opened POS quote or Custom price could then be resolved, and
       * applied to billing, a second time.
       */
      const record = await this.repository.claimAwaitingAnswer(id, {
        status: 'contacted',
        contactedAt: new Date(),
        contactedBy: actor,
        updatedBy: actor,
      });
      if (!record) {
        const now = await this.repository.getById(id);
        if (!now) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        return res
          .status(409)
          .json({ success: false, message: answeredRequestMessage(now.status), data: null });
      }
      res.status(200).json({ success: true, message: 'Marked as contacted', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.markContacted] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Edit who / role / type on an inbox row. */
  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        updatedBy: getActor(req),
      };
      if (parsed.data.type !== undefined) payload.type = parsed.data.type;
      if (parsed.data.subscriberType !== undefined) {
        payload.subscriberType = parsed.data.subscriberType;
      }
      if (parsed.data.subscriberName !== undefined) {
        payload.subscriberName = parsed.data.subscriberName;
      }
      if (parsed.data.message !== undefined) payload.message = parsed.data.message;
      if (parsed.data.remarks !== undefined) payload.remarks = parsed.data.remarks;
      if (parsed.data.quotedAmount !== undefined) {
        payload.quotedAmount =
          parsed.data.quotedAmount === null
            ? null
            : parsed.data.quotedAmount.toFixed(2);
      }

      /**
       * RE-TYPING A REQUEST IS RE-FILING IT. The subscriber id cannot be edited,
       * but its TYPE can — so switching "outlet" to "agency" points the same id
       * at the other table, where it most likely names nobody, and turning a
       * contact request into a plan change makes it approvable. Both are checked
       * as create() checks a new request. Only when one of them actually
       * changes: an admin annotating an old request must not be blocked by it.
       */
      const nextType = payload.type ?? existing.type;
      const nextSubscriberType =
        payload.subscriberType !== undefined ? payload.subscriberType : existing.subscriberType;
      if (nextType !== existing.type || nextSubscriberType !== existing.subscriberType) {
        const refusal = await this.ledger.ledgerRefusal({
          type: nextType,
          subscriberType: nextSubscriberType,
          subscriberId: existing.subscriberId,
          requestedPlanId: existing.requestedPlanId,
        });
        if (refusal) return res.status(refusal.status).json(refusalBody(refusal));
      }

      const record = await this.repository.update(existing.id, payload);
      if (!record) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Request updated', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Resolve a request, optionally recording the negotiated/quoted price.
  async resolve(req: Request, res: Response) {
    try {
      const parsed = ResolveAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      /*
       * ⚠️ A PLAN CHANGE IS APPROVED — EVEN WHEN IT ARRIVES HERE (29 Sep 2026
       * follow-up: "custom-destination plan_change requests may never reach
       * billing").
       *
       * The two inboxes split on DESTINATION (`negotiatedClause`): a plain
       * `plan_change` onto Custom — or onto an add-on — is listed on Plan
       * REQUEST, whose only "yes" is Resolve, and Plan Change never shows it.
       * Resolve used to claim it `resolved` and move nothing:
       * `applyResolvedPriceToLedger` prices POS quotes and Custom
       * renegotiations and has no branch for a plan change, so the admin read
       * "Request resolved" over a subscriber still on the old plan. No live row
       * is in that state today (every agency switch files as 'direct', and the
       * catalog's only Custom is the agency tier), but the door was open: an
       * admin re-typing a request, or a catalog plan named Custom.
       *
       * So it takes approve's path — ONE path, not a copy: the same validation,
       * the same atomic claim inside the switch's transaction, the same
       * refusals, the same sentence. It lands `approved`, as every applied
       * plan change does.
       */
      if (existing.type === 'plan_change') {
        return await this.approvePlanChange(res, existing, parsed.data.quotedAmount, actor);
      }

      // The early answer for a stale screen; the claim below is what actually
      // guarantees it, as in `approve`.
      if (!isAwaitingAnswer(existing.status)) {
        return res
          .status(409)
          .json({ success: false, message: answeredRequestMessage(existing.status), data: null });
      }

      // Resolving a POS quote or a Custom renegotiation WRITES the ledger (see
      // applyResolvedPriceToLedger), so it is checked before it is recorded: an
      // add-on line or a Custom switch for an organisation that does not exist
      // is refused here, not logged afterwards behind a "Request resolved".
      // A request naming no organisation moves nothing — the ledger step skips
      // it outright. (A plan change has already left above, for approve's path.)
      if (existing.subscriberType && existing.subscriberId) {
        const refusal = await this.ledger.ledgerRefusal(existing);
        if (refusal) return res.status(refusal.status).json(refusalBody(refusal));
      }

      const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
        status: 'resolved',
        updatedBy: actor,
      };
      if (parsed.data.quotedAmount !== undefined) payload.quotedAmount = parsed.data.quotedAmount.toFixed(2);

      /*
       * ⚠️ CLAIMED, NOT OVERWRITTEN (28 Sep 2026 follow-up). This was a plain
       * `update`, so a request already resolved — or declined, or withdrawn by
       * the subscriber — could be resolved again, and each resolve applied the
       * price to the ledger again. The claim moves it only while it is still
       * awaiting an answer, so a double-click applies it once.
       */
      const record = await this.repository.claimAwaitingAnswer(existing.id, payload);
      if (!record) {
        const now = await this.repository.getById(existing.id);
        if (!now) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        return res
          .status(409)
          .json({ success: false, message: answeredRequestMessage(now.status), data: null });
      }
      // Resolving is where a negotiated price becomes real — until now the
      // figure lived only on this row, so nothing billed it and the subscriber
      // never saw it.
      try {
        await this.ledger.applyResolvedPriceToLedger(record, actor);
      } catch (error) {
        if (!(error instanceof SwitchNotAppliedError)) throw error;
        // The switch was refused or rolled back AFTER the request was marked
        // resolved: put the request back as it was, so it is still open and the
        // admin is told the truth instead of "Request resolved".
        await this.repository.update(existing.id, {
          status: existing.status,
          ...(parsed.data.quotedAmount !== undefined ? { quotedAmount: existing.quotedAmount } : {}),
          updatedBy: actor,
        });
        if (error.cause instanceof PlanChangeRefusedError) {
          return res.status(error.cause.status).json(refusalBody(error.cause));
        }
        logger.error('[AdminRequestController.resolve] switch failed:', error.cause);
        return res.status(500).json({
          success: false,
          message:
            'The plan switch could not be applied to billing. Nothing was changed — the request is still open, so try again.',
          data: null,
        });
      }
      res.status(200).json({ success: true, message: 'Request resolved', data: record });
    } catch (error) {
      logger.error('[AdminRequestController.resolve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Approve an outlet plan change. The price follows the to-plan from now on —
   * the frontend passes the to-plan price as quotedAmount so it is stamped here.
   *
   * ⚠️ ONLY A REQUEST STILL AWAITING AN ANSWER, CLAIMED ATOMICALLY. This checked
   * the type and nothing else, so an approved, declined, withdrawn or 'direct'
   * plan change could be approved again — and each approval applied the switch
   * to the ledger again. Now:
   *  - a request that is plainly answered is refused 409 with the reason;
   *  - the switch is validated BEFORE anything is written, so a ghost
   *    organisation or a wrong plan is refused while the request is still
   *    open, for the admin to decline;
   *  - the move out of waiting is one `UPDATE … WHERE status IN ('pending',
   *    'contacted')`, run INSIDE the switch's transaction, so a double-click
   *    (or two admins) applies it once, and a switch that fails leaves the
   *    request as it was rather than "approved" with nothing behind it.
   *
   * ⚠️ `contacted` IS STILL WAITING (29 Sep 2026 follow-up). "Mark contacted"
   * records that an admin SPOKE to the subscriber — it decides nothing
   * (`AWAITING_ANSWER`), and resolve, decline and withdraw all accept it. This
   * claimed `pending` alone, so a plan change an admin had phoned about could
   * never be approved: the Plan Change page still offered Approve (it reads a
   * contacted row as pending) and the server refused it every time, leaving
   * the venue on its old plan with only a decline left to press.
   *
   * `resolve` hands a plan change here too (29 Sep 2026) — see
   * `approvePlanChange`, the one path both doors share.
   */
  async approve(req: Request, res: Response) {
    try {
      const parsed = ResolveAdminRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (existing.type !== 'plan_change') {
        return res.status(400).json({ success: false, message: 'Only plan changes can be approved', data: null });
      }
      return await this.approvePlanChange(res, existing, parsed.data.quotedAmount, getActor(req));
    } catch (error) {
      logger.error('[AdminRequestController.approve] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * THE ONE WAY A PLAN CHANGE IS APPLIED BY AN ADMIN — Approve on Plan Change,
   * and Resolve on Plan Request for a plan change listed there (a switch onto
   * Custom). Everything `approve`'s note above describes lives here, so the two
   * buttons cannot come to disagree about what "yes" does to billing.
   */
  private async approvePlanChange(
    res: Response,
    existing: AdminRequest,
    quotedAmount: number | undefined,
    actor: string,
  ) {
    // The early answer for a stale screen. The claim below is what actually
    // guarantees it — this read cannot, on its own, stop a double-click.
    if (!isAwaitingAnswer(existing.status)) {
      return res
        .status(409)
        .json({ success: false, message: notPendingMessage(existing.status), data: null });
    }

    const payload: Parameters<AdminRequestRepositoryClass['update']>[1] = {
      status: 'approved',
      updatedBy: actor,
    };
    if (quotedAmount !== undefined) payload.quotedAmount = quotedAmount.toFixed(2);

    // Approval is what makes the switch real: reflect it in the billing ledger
    // so the admin History page and the subscriber's own screen agree.
    const claimed: { record: AdminRequest | null } = { record: null };
    let applied: AppliedPlanChange;
    try {
      applied = await this.ledger.applyPlanChangeToLedger(
        { ...existing, quotedAmount: payload.quotedAmount ?? existing.quotedAmount },
        actor,
        async (tx) => {
          claimed.record = await this.repository.claimAwaitingAnswer(existing.id, payload, tx);
          if (!claimed.record) throw new RequestNotPendingError();
        },
      );
    } catch (error) {
      if (error instanceof PlanChangeRefusedError) {
        return res.status(error.status).json(refusalBody(error));
      }
      if (error instanceof RequestNotPendingError) {
        // Answered between the read above and the claim — name the state it
        // is in now, so the admin knows what happened instead of retrying.
        const now = await this.repository.getById(existing.id);
        if (!now) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        return res
          .status(409)
          .json({ success: false, message: notPendingMessage(now.status), data: null });
      }
      logger.error('[AdminRequestController.approvePlanChange] switch failed:', error);
      return res.status(500).json({
        success: false,
        message:
          'The plan change could not be applied to billing. Nothing was changed — the request is still open, so try again.',
        data: null,
      });
    }
    return res.status(200).json({
      success: true,
      message: `Plan change approved — ${existing.subscriberName} is now on ${applied.opened.planName}.`,
      data: claimed.record,
    });
  }

  /**
   * Say NO to a request, without touching the ledger — the subscriber keeps
   * exactly what it has today.
   *
   * Two things are refused here and they read the same to the admin:
   * - an outlet plan change → the venue stays on its from-plan;
   * - a negotiated request (POS quote, Custom renegotiation, or either one's
   *   cancellation) → the add-on / Custom price stands, unchanged.
   *
   * The second case had no answer at all: a POS or Custom request could only be
   * RESOLVED, so an admin who did not agree to it had nothing to click and the
   * row sat Pending forever — while the subscriber's own screen kept saying
   * "waiting for admin". Declining clears that on both sides, because the
   * subscriber's "waiting" state reads pending rows only.
   *
   * A contact/other request is not a decision, so it stays out.
   */
  private static readonly DECLINABLE: readonly AdminRequestType[] = [
    'plan_change',
    'pos_integration_quote',
    'custom_renegotiation',
  ];

  async decline(req: Request, res: Response) {
    try {
      const existing = await this.repository.getById(paramId(req.params.id));
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      if (!AdminRequestActionHandlers.DECLINABLE.includes(existing.type)) {
        return res.status(400).json({
          success: false,
          message: 'Only plan changes and negotiated requests can be declined',
          data: null,
        });
      }
      // Declining an answered request would rewrite a decision already acted on:
      // a resolved quote is billing, an approved switch has moved the ledger, and
      // a 'direct' row was applied the moment it was filed. Cancelling any of
      // them would change the badge and nothing else — the ledger would still say
      // otherwise, which is worse than refusing.
      if (existing.status === 'resolved' || existing.status === 'approved' || existing.status === 'direct') {
        return res.status(400).json({
          success: false,
          message:
            existing.status === 'direct'
              ? 'This was applied on the spot — file the reverse change instead of cancelling it'
              : `This request is already ${existing.status} — it cannot be cancelled`,
          data: null,
        });
      }
      // A request already declined, or WITHDRAWN by the subscriber, is not the
      // admin's to decline: writing 'declined' over a withdrawal would record a
      // refusal nobody made. And the claim is atomic, so a decline racing a
      // resolve cannot stamp 'declined' over a price the resolve just billed.
      const record = await this.repository.claimAwaitingAnswer(existing.id, {
        status: 'declined',
        updatedBy: getActor(req),
      });
      if (!record) {
        const now = await this.repository.getById(existing.id);
        if (!now) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
        return res
          .status(409)
          .json({ success: false, message: answeredRequestMessage(now.status), data: null });
      }
      res.status(200).json({
        success: true,
        message:
          existing.type === 'plan_change'
            ? 'Plan change declined'
            : 'Request cancelled — nothing was changed',
        data: record,
      });
    } catch (error) {
      logger.error('[AdminRequestController.decline] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
