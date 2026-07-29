import { Request, Response } from 'express';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import { CollectionInvoiceRepositoryClass } from './collection-invoice.repository.js';
import type { CollectionInvoice, CollectionInvoiceFilter } from './collection-invoice.model.js';

/** Days after the week ends before an issued invoice reads as overdue. */
const DUE_DAYS = 14;
const DUE_SOON_DAYS = 3;

/**
 * Collections — an agency's receivables from its outlets.
 *
 * This app does NOT move money between an agency and an outlet; they settle
 * that between themselves. So there is no pay endpoint here and no payment
 * fields on the table. `settle` records that the agency SAYS it was paid, which
 * is bookkeeping rather than evidence, and the wording keeps that distinction
 * rather than implying the system saw the money.
 */
export class CollectionInvoiceControllerClass {
  constructor(
    private repository: CollectionInvoiceRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
  ) {}

  /**
   * Aging is derived on read, never stored — a stored bucket is wrong the next
   * morning and would need a nightly job to stay honest. Only an ISSUED invoice
   * can age: a draft has not been sent to anyone, and settled/void are done.
   */
  private agingFor(invoice: CollectionInvoice): 'current' | 'due_soon' | 'overdue' | null {
    if (invoice.status !== 'issued') return null;
    const due = new Date(`${invoice.weekEnd}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + DUE_DAYS);
    const msLeft = due.getTime() - Date.now();
    if (msLeft < 0) return 'overdue';
    if (msLeft < DUE_SOON_DAYS * 86_400_000) return 'due_soon';
    return 'current';
  }

  private decorate(invoice: CollectionInvoice) {
    return { ...invoice, aging: this.agingFor(invoice) };
  }

  /** An agency sees its own receivables; an outlet sees what it has been billed. */
  private async scopedFilter(req: Request): Promise<CollectionInvoiceFilter | null> {
    const base: CollectionInvoiceFilter = {
      status: req.query.status as CollectionInvoiceFilter['status'],
      weekStart: typeof req.query.weekStart === 'string' ? req.query.weekStart : undefined,
    };
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.isAdmin) {
      return { ...base, agencyId: req.query.agencyId as string | undefined };
    }
    if (scope.agencyId) return { ...base, agencyId: scope.agencyId };
    const outletId = scope.outletIds[0];
    if (outletId) return { ...base, outletId };
    return null;
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const filter = await this.scopedFilter(req);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const rows = await this.repository.list(filter);
      // An outlet must not see a draft: it has not been issued to them, and
      // showing a figure the agency is still reviewing invites an argument
      // about a number nobody has stood behind yet.
      const isOutletOnly = !scope.isAdmin && !scope.agencyId;
      const visible = isOutletOnly ? rows.filter((r) => r.status !== 'draft') : rows;

      return res
        .status(200)
        .json({ success: true, message: 'OK', data: visible.map((r) => this.decorate(r)) });
    } catch (error) {
      logger.error('[CollectionInvoiceController.list] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Draft -> issued. The agency stands behind the figure and the outlet sees it. */
  async issue(req: Request, res: Response) {
    return this.transition(req, res, {
      from: 'draft',
      to: 'issued',
      stamp: 'issuedAt',
      wrongStatus: 'Only a draft invoice can be issued',
      ok: 'Invoice issued',
    });
  }

  /**
   * Issued -> settled. Records that the agency SAYS it has been paid, outside
   * this app. Nothing here can verify that, so the message does not claim to.
   */
  async settle(req: Request, res: Response) {
    return this.transition(req, res, {
      from: 'issued',
      to: 'settled',
      stamp: 'settledAt',
      wrongStatus: 'Only an issued invoice can be marked settled',
      ok: 'Marked settled — this records your confirmation, it does not verify payment',
    });
  }

  private async transition(
    req: Request,
    res: Response,
    opts: {
      from: CollectionInvoice['status'];
      to: CollectionInvoice['status'];
      stamp: 'issuedAt' | 'settledAt';
      wrongStatus: string;
      ok: string;
    },
  ) {
    try {
      const id = paramId(req.params.id);
      const existing = await this.repository.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Another agency's invoice is a 404, never a 403.
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Idempotent: already there is a 200, not an error. A double tap on a slow
      // connection should not read as a failure.
      if (existing.status === opts.to) {
        return res
          .status(200)
          .json({ success: true, message: opts.ok, data: this.decorate(existing) });
      }
      if (existing.status !== opts.from) {
        return res.status(400).json({ success: false, message: opts.wrongStatus, data: null });
      }

      const updated = await this.repository.update(id, {
        status: opts.to,
        [opts.stamp]: new Date(),
        updatedBy: getActor(req),
      } as Partial<CollectionInvoice>);
      if (!updated) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      return res.status(200).json({ success: true, message: opts.ok, data: this.decorate(updated) });
    } catch (error) {
      logger.error('[CollectionInvoiceController.transition] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
