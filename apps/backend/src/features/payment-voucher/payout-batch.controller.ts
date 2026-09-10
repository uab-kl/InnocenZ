import type { Request, Response } from 'express';
import { logger } from '@/util/logger';
import { getActor } from '@/util/actor';
import { pickAgencyId } from '@/util/org-scope.js';
import { paramId } from '@/util/params';
import { notify } from '@/features/notification/notify';
import type { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import type { AuthRepositoryClass } from '@/features/auth/auth.repository';
import type { PaymentVoucherRepositoryClass } from './payment-voucher.repository';
import type {
  PayoutBatchRepositoryClass,
  PayoutSettlement,
} from './payout-batch.repository';
import { buildPayoutCsv, payoutCsvFilename } from './payout-csv';
import { toCents } from './payment-voucher-balance';
import {
  maskBankAccount,
  payoutMethodValues,
  toPublicPayoutBatch,
  type PayoutMethod,
} from './payout-batch.model';
import {
  credentialsFromEnv,
  payoutProviderConfigured,
  resolvePayoutProvider,
} from './payout-provider';
import { matchResponseToItems, parsePayoutResponseCsv } from './payout-response-csv';
import { resolveAgencyCredentials } from './agency-payout-account.model';

type Scope = { isAdmin: boolean; agencyId: string | null };

/**
 * THE AGENCY'S PAYOUT RUN — assemble, export, hand to the bank, settle.
 *
 * This lane deliberately does NOT move money. InnocenZ is not the payer
 * (owner's decision, 27 Aug 2026); the agency uploads the exported file to its
 * own corporate banking, or its own provider account does it. Everything here
 * RECORDS that, and the only write reaching a voucher is the one marking a
 * signed voucher paid after a bank confirmed the line.
 */
export class PayoutBatchControllerClass {
  constructor(
    private payoutBatchRepository: PayoutBatchRepositoryClass,
    private paymentVoucherRepository: PaymentVoucherRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
  ) {}

  /**
   * Mirrors `PaymentVoucherController.resolveScope`, including the reason it
   * uses `activeAgencyId` rather than `memberships[0]`: an INACTIVE membership
   * still resolves an agencyId, so an operator the agency removed would keep
   * reading and writing its money records.
   */
  private async resolveScope(req: Request): Promise<Scope> {
    const user = req.user!;
    const roles = await this.authRepository.getRolesForUserIds([user.id]);
    if (roles.some((r) => r.roleName === 'admin')) return { isAdmin: true, agencyId: null };
    const memberships = await this.agencyMemberRepository.listByUser(user.id);
    return { isAdmin: false, agencyId: pickAgencyId(req, memberships) };
  }

  /** A batch this caller may touch, or null. Cross-agency reads 404, never 403. */
  private async ownedBatch(req: Request, id: string) {
    const scope = await this.resolveScope(req);
    const batch = await this.payoutBatchRepository.getById(id);
    if (!batch) return null;
    if (!scope.isAdmin && batch.agencyId !== scope.agencyId) return null;
    return batch;
  }

  /**
   * WHO CAN BE PAID FOR A WEEK — and, just as importantly, who cannot.
   *
   * This is also the agency's only view of a PR's bank details, and it sits
   * behind the same sub-role gate as recording a payment: an account number is
   * PII, and nobody who cannot pay needs to read one.
   */
  async listCandidates(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const agencyId = scope.isAdmin
        ? ((req.query.agencyId as string) ?? null)
        : scope.agencyId;
      if (!agencyId) {
        return res.status(400).json({
          success: false,
          message: 'No agency in scope — admins must pass ?agencyId',
          data: null,
        });
      }
      const weekStart = req.query.weekStart as string | undefined;
      const weekEnd = req.query.weekEnd as string | undefined;
      if (!weekStart || !weekEnd) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd are required (yyyy-MM-dd)',
          data: null,
        });
      }
      const candidates = await this.payoutBatchRepository.listPayableCandidates({
        agencyId,
        weekStart,
        weekEnd,
      });
      const ready = candidates.filter((c) => c.payable && !c.alreadyBatched);
      return res.status(200).json({
        success: true,
        message: 'Payout candidates',
        data: {
          weekStart,
          weekEnd,
          // Masked here for the same reason as batch items: the screen needs to
          // identify an account, not reproduce it. `payable` already carries
          // the only decision the UI makes from it.
          candidates: candidates.map(({ bankAccountNo, ...c }) => ({
            ...c,
            bankAccountMasked: maskBankAccount(bankAccountNo),
          })),
          // Counted server-side so every surface agrees. `blocked` is the
          // number a human must react to: those people are signed off and
          // cannot be paid.
          summary: {
            total: candidates.length,
            ready: ready.length,
            blocked: candidates.filter((c) => !c.payable).length,
            alreadyBatched: candidates.filter((c) => c.alreadyBatched).length,
            // Per-candidate try/catch, NOT a bare toCents over the reduce.
            // toCents throws, this sits inside a catch that returns 500, and
            // one unreadable amount would blank the whole candidate list —
            // hiding every other payable person. That is precisely the
            // "list silently shrinks and everything looks fine" failure this
            // lane is built to prevent, so a bad row is skipped from the TOTAL
            // and still appears in `candidates` for a human to see.
            readyTotalCents: ready.reduce((sum, c) => {
              try {
                return sum + toCents(c.net);
              } catch {
                return sum;
              }
            }, 0),
          },
          providerConfigured: payoutProviderConfigured(),
        },
      });
    } catch (error) {
      logger.error('[PayoutBatchController.listCandidates] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to list payout candidates', data: null });
    }
  }

  /**
   * Assemble a run from a week's signed vouchers.
   *
   * ⚠️ REFUSES on any unpayable line rather than dropping it. A file that
   * quietly omits two of 59 people uploads cleanly, pays 57 and tells nobody —
   * the agency finds out when a PR asks. The refusal names who is missing.
   */
  async create(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const agencyId = scope.isAdmin ? req.body?.agencyId : scope.agencyId;
      if (!agencyId) {
        return res
          .status(400)
          .json({ success: false, message: 'No agency in scope', data: null });
      }
      const { weekStart, weekEnd } = req.body ?? {};
      if (!weekStart || !weekEnd) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd are required (yyyy-MM-dd)',
          data: null,
        });
      }
      const method: PayoutMethod = (
        payoutMethodValues as readonly string[]
      ).includes(req.body?.method)
        ? req.body.method
        : 'ibg';

      const candidates = await this.payoutBatchRepository.listPayableCandidates({
        agencyId,
        weekStart,
        weekEnd,
      });
      // An explicit id list narrows the week; absent, the whole week goes.
      const wanted: string[] | null = Array.isArray(req.body?.voucherIds)
        ? req.body.voucherIds
        : null;
      const chosen = candidates.filter(
        (c) => !c.alreadyBatched && (!wanted || wanted.includes(c.voucherId)),
      );

      const blocked = chosen.filter((c) => !c.payable);
      if (blocked.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            `${blocked.length} of ${chosen.length} cannot be paid yet — they have not entered ` +
            'their bank details. Remove them from this run, or ask them to add their bank in the app.',
          data: {
            blocked: blocked.map((c) => ({
              voucherId: c.voucherId,
              voucherNo: c.voucherNo,
              prName: c.prName,
              missingBankName: !c.bankName?.trim(),
              missingAccountNo: !c.bankAccountNo?.trim(),
            })),
          },
        });
      }
      if (chosen.length === 0) {
        return res.status(409).json({
          success: false,
          message:
            'Nothing to pay for this week — no signed voucher is outstanding. A voucher must be ' +
            'signed by the PR before it can go into a payout run.',
          data: null,
        });
      }

      const actor = getActor(req);
      let batch;
      try {
        batch = await this.payoutBatchRepository.createBatch({
        agencyId,
        weekStart,
        weekEnd,
        method,
        actor,
        note: typeof req.body?.note === 'string' ? req.body.note.slice(0, 1000) : null,
        items: chosen.map((c) => ({
            voucherId: c.voucherId,
            payeeName: c.payeeName ?? c.prName,
            payeeIc: c.payeeIc,
            bankName: c.bankName,
            bankAccountNo: c.bankAccountNo,
            amount: c.net,
          })),
        });
      } catch (error) {
        // The partial unique index from 0142 firing means another run took one
        // of these vouchers between our read and our write — the race
        // `alreadyBatched` cannot see. Answer with what happened rather than a
        // 500: nothing was written, and re-reading the candidates fixes it.
        // MATCH ON THE SQLSTATE, NOT THE PROSE.
        //
        // The first version of this matched `error.message` for the index name
        // and a staged concurrent create came back 500, not 409 — postgres-js
        // carries the constraint on `code`/`constraint_name` and drizzle wraps
        // the original in `cause`, so the name is often nowhere in .message.
        // 23505 is unique_violation; the name check stays as a narrowing filter
        // wherever the driver does expose it.
        const pg = (error ?? {}) as {
          code?: string;
          constraint_name?: string;
          constraint?: string;
          message?: string;
          cause?: { code?: string; constraint_name?: string; constraint?: string };
        };
        const code = pg.code ?? pg.cause?.code;
        const constraint =
          pg.constraint_name ?? pg.constraint ?? pg.cause?.constraint_name ?? pg.cause?.constraint ?? '';
        const message = typeof pg.message === 'string' ? pg.message : '';
        // Any 23505 out of createBatch means a concurrent run beat us — either
        // to the voucher (the guard that matters) or, before the advisory lock
        // was added, to the reference number. Both are "nothing was written,
        // reload and retry", and both must be a 409 rather than a 500: the
        // staged race originally surfaced as a 500 because this matched on the
        // index NAME, which postgres puts on `cause.constraint`, not in
        // `.message`.
        const isConcurrentClash = code === '23505';
        if (isConcurrentClash) {
          logger.warn(
            `[PayoutBatchController.create] concurrent create refused by ${constraint || 'a unique constraint'}`,
          );
          return res.status(409).json({
            success: false,
            message:
              'One of these vouchers entered another payout run a moment ago. Nothing was created — ' +
              'reload the week and try again.',
            data: null,
          });
        }
        throw error;
      }
      return res.status(201).json({
        success: true,
        message: 'Payout batch created',
        data: toPublicPayoutBatch(batch),
      });
    } catch (error) {
      logger.error('[PayoutBatchController.create] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to create payout batch', data: null });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      const agencyId = scope.isAdmin
        ? ((req.query.agencyId as string) ?? null)
        : scope.agencyId;
      if (!agencyId) {
        return res.status(200).json({ success: true, message: 'No agency', data: [] });
      }
      const batches = await this.payoutBatchRepository.listForAgency(agencyId);
      return res
        .status(200)
        .json({ success: true, message: 'Payout batches', data: batches });
    } catch (error) {
      logger.error('[PayoutBatchController.list] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to list payout batches', data: null });
    }
  }

  async detail(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      return res.status(200).json({
        success: true,
        message: 'Payout batch',
        data: toPublicPayoutBatch(batch),
      });
    } catch (error) {
      logger.error('[PayoutBatchController.detail] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to read payout batch', data: null });
    }
  }

  /**
   * THE FILE. Downloading it moves the batch to `exported` and its lines to
   * `sent` — the agency now holds something a bank will act on, and the app
   * cannot see what happens next.
   */
  async exportCsv(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      const actor = getActor(req);
      const csv = buildPayoutCsv(batch, batch.items);
      await this.payoutBatchRepository.markStatus(batch.id, 'exported', actor);
      await this.payoutBatchRepository.markItemsSent(batch.id, actor);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${payoutCsvFilename(batch)}"`,
      );
      return res.status(200).send(csv);
    } catch (error) {
      logger.error('[PayoutBatchController.exportCsv] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to export payout batch', data: null });
    }
  }

  /**
   * Abandon a draft and release its vouchers back to the pool.
   *
   * ⚠️ REFUSED ONCE THE FILE HAS LEFT. After `exported` the agency holds
   * something a bank will act on, and this app cannot see what they did with
   * it. Letting a cancel release those vouchers would invite a second run that
   * pays everyone twice — and the app would have no way to know it had. A batch
   * that went out and should not have is settled with 'failed' lines, which
   * records what actually happened.
   */
  async cancel(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      if (batch.status !== 'draft') {
        return res.status(409).json({
          success: false,
          message:
            `This run is ${batch.status} — only a draft can be cancelled. Once the file has been ` +
            'downloaded the bank may already have acted on it; settle the lines with what actually ' +
            'happened instead.',
          data: null,
        });
      }
      const cancelled = await this.payoutBatchRepository.cancelBatch(
        batch.id,
        getActor(req),
      );
      return res.status(200).json({
        success: true,
        message: `Run cancelled — ${batch.items.length} voucher(s) released`,
        data: cancelled,
      });
    } catch (error) {
      logger.error('[PayoutBatchController.cancel] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to cancel payout batch', data: null });
    }
  }

  /** The agency confirms they uploaded and authorised the file at their bank. */
  async markSubmitted(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      const updated = await this.payoutBatchRepository.markStatus(
        batch.id,
        'submitted',
        getActor(req),
      );
      return res
        .status(200)
        .json({ success: true, message: 'Payout batch submitted', data: updated });
    } catch (error) {
      logger.error('[PayoutBatchController.markSubmitted] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to update payout batch', data: null });
    }
  }

  /**
   * WHAT THE BANK SAID — the write-back, line by line.
   *
   * Accepts a partial report: a response naming 57 successes and 2 failures
   * settles exactly those, and the batch closes only when nothing is still in
   * flight. Only vouchers that genuinely moved signed -> paid are notified, so
   * a re-posted response cannot ring the same bell twice.
   */
  async settle(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      const raw = req.body?.settlements;
      if (!Array.isArray(raw) || raw.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'settlements[] is required — one entry per line the bank reported',
          data: null,
        });
      }
      const allowed = new Set(['paid', 'failed', 'returned', 'sent']);
      const settlements: PayoutSettlement[] = [];
      for (const s of raw) {
        if (!s?.itemId || !allowed.has(s?.status)) {
          return res.status(400).json({
            success: false,
            message: `Each settlement needs itemId and status (${[...allowed].join('|')})`,
            data: null,
          });
        }
        settlements.push({
          itemId: s.itemId,
          status: s.status,
          bankRef: typeof s.bankRef === 'string' ? s.bankRef.slice(0, 100) : null,
          providerPayoutId:
            typeof s.providerPayoutId === 'string'
              ? s.providerPayoutId.slice(0, 120)
              : null,
          failureReason:
            typeof s.failureReason === 'string' ? s.failureReason.slice(0, 500) : null,
        });
      }

      const actor = getActor(req);
      const result = await this.payoutBatchRepository.settle({
        batchId: batch.id,
        settlements,
        actor,
      });
      await this.notifyPaid(result.paidVoucherIds, actor);

      const after = await this.payoutBatchRepository.getById(batch.id);
      return res.status(200).json({
        success: true,
        message: `Settled ${result.updatedItems} line(s); ${result.paidVoucherIds.length} voucher(s) marked paid`,
        data: after ? toPublicPayoutBatch(after) : null,
      });
    } catch (error) {
      logger.error('[PayoutBatchController.settle] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to settle payout batch', data: null });
    }
  }

  /**
   * IMPORT THE BANK'S RESPONSE FILE — settle a whole run from what came back.
   *
   * Takes the CSV as TEXT in the body rather than a multipart upload: no
   * upload middleware is mounted on this router, and a response file is a few
   * kilobytes that a person can paste. Adding multipart here would be new
   * plumbing for no gain.
   *
   * ⚠️ REFUSES IF ANYTHING COULD NOT BE MATCHED, and names every line. A partial
   * import that settles 56 of 59 and says "done" is the failure this lane keeps
   * being built against. The agency fixes the file, or settles the odd lines by
   * hand — which never stops working.
   */
  async importResponse(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      const csv = typeof req.body?.csv === 'string' ? req.body.csv : '';
      if (!csv.trim()) {
        return res.status(400).json({
          success: false,
          message: 'Paste the bank response file contents as `csv`',
          data: null,
        });
      }
      const parsed = parsePayoutResponseCsv(csv);
      const { matches, unmatched } = matchResponseToItems(batch.items, parsed);
      if (unmatched.length > 0) {
        return res.status(409).json({
          success: false,
          message:
            `${unmatched.length} line(s) in that file could not be matched to this run. Nothing ` +
            'was settled — fix the file, or settle those lines by hand.',
          data: { unmatched, wouldSettle: matches.length },
        });
      }
      if (matches.length === 0) {
        return res.status(409).json({
          success: false,
          message: 'That file has no payment lines in it.',
          data: null,
        });
      }

      const actor = getActor(req);
      const result = await this.payoutBatchRepository.settle({
        batchId: batch.id,
        settlements: matches.map((m) => ({
          itemId: m.itemId,
          status: m.status,
          bankRef: m.bankRef,
          failureReason: m.failureReason,
        })),
        actor,
      });
      await this.notifyPaid(result.paidVoucherIds, actor);
      const after = await this.payoutBatchRepository.getById(batch.id);
      return res.status(200).json({
        success: true,
        message: `Imported ${matches.length} line(s); ${result.paidVoucherIds.length} voucher(s) marked paid`,
        data: after ? toPublicPayoutBatch(after) : null,
      });
    } catch (error) {
      logger.error('[PayoutBatchController.importResponse] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Failed to import the response file', data: null });
    }
  }

  /**
   * Hand the batch to a payout API — the step an API key switches on.
   *
   * 501 when nothing is configured, with a message that says what to do. That
   * is NOT a failure state: the file path above is fully functional, and most
   * deployments will never configure a provider at all.
   */
  async submitToProvider(req: Request, res: Response) {
    try {
      const batch = await this.ownedBatch(req, paramId(req.params.id));
      if (!batch) {
        return res
          .status(404)
          .json({ success: false, message: 'Payout batch not found', data: null });
      }
      /*
       * THIS AGENCY'S OWN ACCOUNT FIRST — the env is only the single-deployment
       * fallback.
       *
       * The order matters and is the owner's rule in code: an agency pays from
       * an account IT owns. Reaching for the shared env key first would make one
       * key pay many agencies' PRs, which is InnocenZ moving third-party funds.
       *
       * Throws, deliberately, when a provider is NAMED but unregistered — an
       * agency that believes it pays by API must not be dropped silently onto
       * the file path with nobody told.
       */
      const agencyCredentials = await resolveAgencyCredentials(batch.agencyId);
      const provider = resolvePayoutProvider(
        batch.agencyId,
        agencyCredentials ?? credentialsFromEnv(),
      );
      if (!provider) {
        return res.status(501).json({
          success: false,
          message:
            'No payout provider is configured. Export the bank file and upload it at your bank, ' +
            'or set PAYOUT_PROVIDER and PAYOUT_API_KEY to enable API payouts.',
          data: null,
        });
      }
      const unpayable = batch.items.filter((i) => !i.bankName || !i.bankAccountNo);
      if (unpayable.length > 0) {
        return res.status(409).json({
          success: false,
          message: `${unpayable.length} line(s) have no bank details and cannot be sent`,
          data: null,
        });
      }

      const actor = getActor(req);
      const result = await provider.submit({
        agencyId: batch.agencyId,
        batchReference: batch.runNo ?? batch.id,
        items: batch.items.map((i) => ({
          itemId: i.id,
          amount: i.amount,
          payeeName: i.payeeName ?? '',
          payeeIc: i.payeeIc,
          bankName: i.bankName as string,
          bankAccountNo: i.bankAccountNo as string,
          reference: batch.runNo ?? '',
        })),
      });
      const settleResult = await this.payoutBatchRepository.settle({
        batchId: batch.id,
        settlements: result.items.map((r) => ({
          itemId: r.itemId,
          status: r.status,
          providerPayoutId: r.providerPayoutId ?? null,
          failureReason: r.failureReason ?? null,
        })),
        actor,
      });
      await this.notifyPaid(settleResult.paidVoucherIds, actor);
      await this.payoutBatchRepository.markStatus(batch.id, 'submitted', actor);

      const after = await this.payoutBatchRepository.getById(batch.id);
      return res.status(200).json({
        success: true,
        message: `Submitted to ${provider.name} (${result.providerBatchId})`,
        data: after ? toPublicPayoutBatch(after) : null,
      });
    } catch (error) {
      logger.error('[PayoutBatchController.submitToProvider] Error:', error);
      return res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to submit payout batch',
        data: null,
      });
    }
  }

  /**
   * Ring the bell for exactly the vouchers that moved.
   *
   * Non-fatal by design, like every other notify in this feature: the money has
   * already landed and the payout record is already correct. Failing the
   * request because a bell did not ring would invite a retry that re-settles a
   * finished batch.
   */
  private async notifyPaid(voucherIds: string[], actor: string): Promise<void> {
    for (const voucherId of voucherIds) {
      try {
        const voucher = await this.paymentVoucherRepository.getById(voucherId);
        const userId = voucher?.userId ?? voucher?.prId ?? null;
        if (!voucher || !userId) continue;
        await notify({
          userId,
          kind: 'payment_voucher_paid',
          title: 'You have been paid',
          body: `${voucher.voucherNo ?? 'Your voucher'} — RM ${voucher.net} has been transferred to your bank.`,
          payload: { voucherId: voucher.id, amount: voucher.net },
          actor,
        });
      } catch (error) {
        logger.error('[PayoutBatchController.notifyPaid] Error:', error);
      }
    }
  }
}
