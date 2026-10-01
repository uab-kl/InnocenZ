import { Request, Response } from 'express';
import type { AdminRequestRepositoryClass } from './admin-request.repository.js';
import type { MemberSubscriptionRepositoryClass } from '@/features/member-subscription/member-subscription.repository.js';
import type { SubscriptionRepositoryClass } from '@/features/subscription/subscription.repository.js';
import type { SubscriptionInvoiceRepositoryClass } from '@/features/subscription-invoice/subscription-invoice.repository.js';
import type { OrgScopeDeps } from '@/util/org-scope.js';
import { AdminRequestLedger } from './admin-request-ledger.js';
import { AdminRequestQueueHandlers } from './admin-request-queue.js';
import { AdminRequestSubscriberHandlers } from './admin-request-subscriber.js';
import { AdminRequestActionHandlers } from './admin-request-actions.js';

/**
 * The admin-request inbox's HTTP surface — the one class `composition-root.ts`
 * builds and `admin-request.routes.ts` binds. Each handler lives with its family
 * and is delegated to unchanged:
 *
 * - admin-request-queue.ts      — the admin's reads (list, badge, one row, summary)
 * - admin-request-subscriber.ts — the subscriber's own side (file, read back, withdraw)
 * - admin-request-actions.ts    — the admin's actions on one request
 * - admin-request-ledger.ts     — the billing-ledger side, shared by the two above
 */
export class AdminRequestControllerClass {
  private readonly queue: AdminRequestQueueHandlers;
  private readonly subscriber: AdminRequestSubscriberHandlers;
  private readonly actions: AdminRequestActionHandlers;

  constructor(
    repository: AdminRequestRepositoryClass,
    memberSubscriptionRepository: MemberSubscriptionRepositoryClass,
    subscriptionRepository: SubscriptionRepositoryClass,
    /** The billing ledger — the owner's unpaid→no-switch rule reads it. */
    subscriptionInvoiceRepository: SubscriptionInvoiceRepositoryClass,
    orgScopeDeps: OrgScopeDeps,
  ) {
    const ledger = new AdminRequestLedger(
      repository,
      memberSubscriptionRepository,
      subscriptionRepository,
      subscriptionInvoiceRepository,
    );
    this.queue = new AdminRequestQueueHandlers(repository, memberSubscriptionRepository);
    this.subscriber = new AdminRequestSubscriberHandlers(
      repository,
      memberSubscriptionRepository,
      subscriptionInvoiceRepository,
      orgScopeDeps,
      ledger,
    );
    this.actions = new AdminRequestActionHandlers(repository, ledger);
  }

  // ── The admin's queue (admin-request-queue.ts) ──

  list(req: Request, res: Response) {
    return this.queue.list(req, res);
  }

  pendingCount(req: Request, res: Response) {
    return this.queue.pendingCount(req, res);
  }

  getById(req: Request, res: Response) {
    return this.queue.getById(req, res);
  }

  negotiatedSummary(req: Request, res: Response) {
    return this.queue.negotiatedSummary(req, res);
  }

  // ── The subscriber's own side (admin-request-subscriber.ts) ──

  create(req: Request, res: Response) {
    return this.subscriber.create(req, res);
  }

  myLatestPlanChange(req: Request, res: Response) {
    return this.subscriber.myLatestPlanChange(req, res);
  }

  myLatestPosQuote(req: Request, res: Response) {
    return this.subscriber.myLatestPosQuote(req, res);
  }

  myLatestCustomQuote(req: Request, res: Response) {
    return this.subscriber.myLatestCustomQuote(req, res);
  }

  withdrawMine(req: Request, res: Response) {
    return this.subscriber.withdrawMine(req, res);
  }

  // ── The admin's actions on one request (admin-request-actions.ts) ──

  markContacted(req: Request, res: Response) {
    return this.actions.markContacted(req, res);
  }

  update(req: Request, res: Response) {
    return this.actions.update(req, res);
  }

  resolve(req: Request, res: Response) {
    return this.actions.resolve(req, res);
  }

  approve(req: Request, res: Response) {
    return this.actions.approve(req, res);
  }

  decline(req: Request, res: Response) {
    return this.actions.decline(req, res);
  }
}
