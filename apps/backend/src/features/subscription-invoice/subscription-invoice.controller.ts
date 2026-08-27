import { Request, Response } from 'express';
import { SubscriptionInvoiceRepositoryClass } from './subscription-invoice.repository.js';
import {
  SubscriptionInvoiceFilter,
  SubscriptionInvoiceStatus,
} from './subscription-invoice.model.js';
import { SubscriberType } from '@/features/member-subscription/member-subscription.model.js';
import { UpdateSubscriptionInvoiceSchema } from '@/schema/subscription-invoice.schema.js';
import { Error } from '@/error/index.js';
import { paramId } from '@/util/params.js';
import { getActor } from '@/util/actor.js';
import { logger } from '@/util/logger.js';
import { resolveOrgScope, type OrgScopeDeps } from '@/util/org-scope.js';
import type { SubscriptionPaymentRepositoryClass } from '@/features/subscription-payment/subscription-payment.repository.js';
import type { PaymentMethodRepositoryClass } from '@/features/payment-method/payment-method.repository.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(value: unknown): string | undefined {
  return typeof value === 'string' && DAY_RE.test(value) ? value : undefined;
}

export class SubscriptionInvoiceControllerClass {
  constructor(
    private repository: SubscriptionInvoiceRepositoryClass,
    private orgScopeDeps: OrgScopeDeps,
    /**
     * The attempt ledger. Marking a period paid is a PAYMENT event, so it is
     * written there and reflected here — through the very call a gateway
     * webhook uses, so the manual and automatic paths cannot disagree.
     */
    private subscriptionPaymentRepository: SubscriptionPaymentRepositoryClass,
    /** Resolves WHICH instrument settled a period, when the admin names a rail. */
    private paymentMethodRepository: PaymentMethodRepositoryClass,
  ) {}

  private buildFilter(req: Request): SubscriptionInvoiceFilter {
    const datesRaw = req.query.dates;
    const dates =
      typeof datesRaw === 'string'
        ? datesRaw
            .split(',')
            .map((value) => value.trim())
            .filter((value) => DAY_RE.test(value))
        : undefined;

    return {
      subscriberType: req.query.subscriberType as SubscriberType | undefined,
      subscriberId: req.query.subscriberId as string | undefined,
      memberSubscriptionId: req.query.memberSubscriptionId as string | undefined,
      status: req.query.status as SubscriptionInvoiceStatus | undefined,
      from: parseDay(req.query.from),
      to: parseDay(req.query.to),
      dates: dates && dates.length > 0 ? dates : undefined,
      search:
        typeof req.query.search === 'string' && req.query.search.trim().length > 0
          ? req.query.search.trim()
          : undefined,
    };
  }

  /**
   * Narrows the client's filter to the caller's own invoices.
   *
   * Server-derived, and it OVERWRITES whatever the client asked for — the same
   * shape `member-subscription` uses and for the same reason: this endpoint
   * carries what every org is charged, so a subscriber filter a caller can set
   * is one a caller can widen. Returns null when the caller belongs to no org;
   * the caller must 403 on it rather than fall through to an unfiltered query.
   */
  private async scopedFilter(req: Request): Promise<SubscriptionInvoiceFilter | null> {
    const filter = this.buildFilter(req);
    const scope = await resolveOrgScope(req, this.orgScopeDeps);
    if (scope.isAdmin) return filter;

    if (scope.agencyId) {
      return { ...filter, subscriberType: 'agency', subscriberId: scope.agencyId };
    }
    // An operator of several venues holds one subscription per venue; the filter
    // takes a single id, so this reads the first — the same known limitation
    // `member-subscription` documents, not a new one.
    const outletId = scope.outletIds[0];
    if (outletId) {
      return { ...filter, subscriberType: 'outlet', subscriberId: outletId };
    }
    return null;
  }

  async list(req: Request, res: Response) {
    try {
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 10);
      const filter = await this.scopedFilter(req);
      if (!filter) {
        return res.status(403).json({
          success: false,
          message: 'No organization associated with this account',
          data: null,
        });
      }
      const { records, totalCount } = await this.repository.listPaginated({
        filter,
        page,
        pageSize,
      });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: records,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      });
    } catch (error) {
      logger.error('[SubscriptionInvoiceController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const record = await this.repository.getById(paramId(req.params.id));
      if (!record) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Someone else's invoice is a 404, not a 403 — the response must not
      // confirm the id exists.
      const scope = await resolveOrgScope(req, this.orgScopeDeps);
      const ownsIt =
        scope.isAdmin ||
        (record.subscriberType === 'agency' && record.subscriberId === scope.agencyId) ||
        (record.subscriberType === 'outlet' && scope.outletIds.includes(record.subscriberId));
      if (!ownsIt) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[SubscriptionInvoiceController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Mark an invoice paid, or take that back. Admin-only at the route.
   *
   * `paid_at` is stamped by the settle path rather than taken from the body, and
   * cleared when the status goes back to unpaid — a row reading `unpaid` beside
   * a paid date would be a record that contradicts itself, and someone would
   * eventually believe the date.
   *
   * BOTH DIRECTIONS NOW GO THROUGH `subscription_payment`, not through a bare
   * write to this table. Marking paid records the attempt that says HOW and with
   * which bank reference; marking unpaid VOIDS that attempt rather than deleting
   * it, so "who said this was paid and when did they take it back" stays
   * answerable. This is the same call a gateway webhook makes, which is the
   * point: one definition of a settled period, not two that drift.
   *
   * The manual path is deliberately kept. Some venues will only ever bank-
   * transfer, and it is what an admin needs on the day a gateway is down.
   */
  async update(req: Request, res: Response) {
    try {
      const parsed = UpdateSubscriptionInvoiceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const id = paramId(req.params.id);
      const actor = getActor(req);

      // Checked before either branch so a missing invoice is a 404 rather than
      // a settle call that silently finds nothing.
      const existing = await this.repository.getById(id);
      if (!existing) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      if (parsed.data.status === 'paid') {
        /**
         * WHICH INSTRUMENT, when the admin names a rail rather than a transfer.
         *
         * The gateway webhook resolves this the same way, and the two must not
         * diverge — one settle path recording the instrument while its sibling
         * leaves the foreign key NULL is how the trail stops answering 'how was
         * this period paid'. Left null for a plain bank transfer, which really
         * does pass through no instrument on file.
         */
        const method = parsed.data.methodType ?? 'manual_transfer';
        const instrument =
          method === 'manual_transfer'
            ? null
            : ((
                await this.paymentMethodRepository.listFor(
                  existing.subscriberType === 'agency'
                    ? { agencyId: existing.subscriberId }
                    : { outletId: existing.subscriberId },
                )
              ).find((row) => row.type === method) ?? null);

        const result = await this.subscriptionPaymentRepository.recordAttempt({
          subscriptionInvoiceId: id,
          // A manual mark-paid is an admin recording a transfer they have seen
          // on a statement; that is the honest default when none is given.
          methodType: method,
          paymentMethodId: instrument?.id ?? null,
          reference: parsed.data.reference ?? null,
          actor,
        });
        if (!result.ok) {
          return res
            .status(result.reason === 'invoice_not_found' ? 404 : 500)
            .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
        }
      } else {
        const ok = await this.subscriptionPaymentRepository.voidSettlements(id, actor);
        if (!ok) {
          return res
            .status(500)
            .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
        }
      }

      // Re-read so the response carries the row as it now stands, rather than
      // the caller's assumption of it.
      const record = await this.repository.getById(id);
      res.status(200).json({
        success: true,
        message: parsed.data.status === 'paid' ? 'Marked paid' : 'Marked unpaid',
        data: record,
      });
    } catch (error) {
      logger.error('[SubscriptionInvoiceController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Bring the ledger up to today. Admin-only, idempotent, safe to press twice —
   * see `generateMissing`. The scheduler runs the same call daily; this exists
   * so an admin never has to wait for a cron tick to see a period that has just
   * started.
   */
  async generate(req: Request, res: Response) {
    try {
      const result = await this.repository.generateMissing({ actor: getActor(req) });
      res.status(200).json({
        success: true,
        message: `${result.created} invoice${result.created === 1 ? '' : 's'} added`,
        data: result,
      });
    } catch (error) {
      logger.error('[SubscriptionInvoiceController.generate] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
