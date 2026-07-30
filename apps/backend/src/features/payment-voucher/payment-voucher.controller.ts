import { Request, Response } from 'express';
import {
  DuplicateDisputeError,
  PaymentVoucherDisputeRepositoryClass,
} from './payment-voucher-dispute.repository.js';
import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';
import { buildVoucherWorkbook, voucherRef } from './payment-voucher-excel.js';
import { PrRepositoryClass } from '@/features/pr/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import { notify } from '@/features/notification/notify.js';
import {
  CreatePaymentVoucherSchema,
  UpdatePaymentVoucherSchema,
  PaymentVoucherLineInput,
  CreatePrReceiptLineSchema,
  CreatePrReceiptSchema,
  UpdatePrReceiptLineSchema,
  PrRaiseDisputeSchema,
  PrWithdrawDisputeSchema,
  ResolveDisputeSchema,
  PrReceiptKind,
  PrReceiptSource,
  prReceiptKindValues,
  prReceiptSourceValues,
} from '@/schema/payment-voucher.schema';
import {
  PaymentVoucherFilter,
  PaymentVoucherStatus,
  PaymentVoucherLineType,
} from './payment-voucher.model';
import type { PrType } from '@/features/pr/pr.model';

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

type Scope = { isAdmin: boolean; agencyId: string | null };

function parsePaging(req: Request): { page: number; pageSize: number } {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(req.query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

/** Maps validated line inputs to insert rows (amounts become fixed(2) strings). */
function toLineRows(lines: PaymentVoucherLineInput[]) {
  return lines.map((line) => ({
    lineDate: line.lineDate,
    outlet: line.outlet,
    description: line.description,
    quantity: line.quantity ?? 1,
    amount: line.amount.toFixed(2),
    ref: line.ref,
  }));
}

/**
 * Resolves subtotal/deduction/net. Anything the client omitted is derived:
 * subtotal from the line amounts, net from subtotal - deduction.
 */
function resolveTotals(params: {
  lines?: PaymentVoucherLineInput[];
  subtotal?: string;
  deduction?: string;
  net?: string;
}): { subtotal: string; deduction: string; net: string } {
  const subtotalNum =
    params.subtotal !== undefined
      ? Number(params.subtotal)
      : (params.lines ?? []).reduce((sum, line) => sum + line.amount, 0);
  const deductionNum = params.deduction !== undefined ? Number(params.deduction) : 0;
  const netNum = params.net !== undefined ? Number(params.net) : subtotalNum - deductionNum;
  return {
    subtotal: subtotalNum.toFixed(2),
    deduction: deductionNum.toFixed(2),
    net: netNum.toFixed(2),
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The Mon–Sun window (yyyy-MM-dd) containing `now`, matching the PV cycle. */
function weekBounds(now = new Date()): { weekStart: string; weekEnd: string } {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceMonday = (base.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: iso(monday), weekEnd: iso(sunday) };
}

/** The Mon–Sun window immediately before the one containing `now`. */
function previousWeekBounds(now = new Date()): { weekStart: string; weekEnd: string } {
  const prior = new Date(now);
  prior.setUTCDate(now.getUTCDate() - 7);
  return weekBounds(prior);
}

// A receipt line's kind/source/gross-sale/dedupe don't have their own columns —
// the reused payment_voucher_line stores them packed into `ref`. `amount` holds
// the commission (or wages) that actually feeds the voucher net.
const REF_SEP = '|';
function encodeRef(
  kind: PrReceiptKind,
  source: PrReceiptSource,
  sales: number,
  dedupe?: string,
  category?: string,
): string {
  return [kind, source, sales.toFixed(2), dedupe ?? '', category ?? ''].join(REF_SEP);
}
function decodeRef(ref: string | null): {
  kind: PrReceiptKind;
  source: PrReceiptSource;
  sales: number;
  dedupe: string;
  /** Catalog category ('drink' | 'service' | 'tip') when the line came from a receipt. */
  category: string;
} {
  const [kind, source, sales, dedupe, category] = (ref ?? '').split(REF_SEP);
  return {
    kind: (prReceiptKindValues as readonly string[]).includes(kind) ? (kind as PrReceiptKind) : 'others',
    source: (prReceiptSourceValues as readonly string[]).includes(source)
      ? (source as PrReceiptSource)
      : 'manual',
    sales: Number(sales) || 0,
    dedupe: dedupe ?? '',
    category: category ?? '',
  };
}

type PrReceiptLineDTO = {
  id: string;
  kind: PrReceiptKind;
  source: PrReceiptSource;
  item: string;
  quantity: number;
  sales: number;
  commission: number;
  lineDate: string | null;
  outlet: string | null;
  at: Date;
  /** Manual self-logs stay pending until the agency verifies them. */
  pending: boolean;
  /** Proof photo(s) attached to the self-log — [] when none. */
  proofPhotos: string[];
};

/** Maps a stored line back to the clean receipt shape the mobile app renders. */
function toReceiptLineDTO(line: PaymentVoucherLineType): PrReceiptLineDTO {
  const { kind, source, sales } = decodeRef(line.ref);
  return {
    id: line.id,
    kind,
    source,
    item: line.description,
    quantity: line.quantity,
    sales,
    commission: Number(line.amount),
    lineDate: line.lineDate,
    outlet: line.outlet,
    at: line.createdAt,
    pending: source === 'manual',
    proofPhotos: line.proofPhotos ?? [],
  };
}

/** Wage lines only — History summary "RM X wages" beside net. */
function sumWages(lines: PaymentVoucherLineType[]): string {
  const total = lines.reduce((sum, line) => {
    const { kind } = decodeRef(line.ref);
    return kind === 'wages' ? sum + Number(line.amount) : sum;
  }, 0);
  return total.toFixed(2);
}

export class PaymentVoucherControllerClass {
  constructor(
    private paymentVoucherRepository: PaymentVoucherRepositoryClass,
    private agencyMemberRepository: AgencyMemberRepositoryClass,
    private authRepository: AuthRepositoryClass,
    private prRepository: PrRepositoryClass,
    private paymentVoucherDisputeRepository: PaymentVoucherDisputeRepositoryClass,
  ) {}

  /** The PR profile bound to the signed-in account, or null (not a PR). */
  private async resolvePr(req: Request): Promise<PrType | null> {
    const userId = req.user?.id;
    return userId ? this.prRepository.getByUserId(userId) : null;
  }

  /**
   * Admins see everything; every other caller is confined to the agency they
   * belong to (resolved from the DB, never trusted from the request body).
   */
  private async resolveScope(req: Request): Promise<Scope> {
    const user = req.user!;
    const roles = await this.authRepository.getRolesForUserIds([user.id]);
    const isAdmin = roles.some((r) => r.roleName === 'admin');
    if (isAdmin) return { isAdmin: true, agencyId: null };

    const memberships = await this.agencyMemberRepository.listByUser(user.id);
    const active = memberships.find((m) => m.status === 'active') ?? memberships[0];
    return { isAdmin: false, agencyId: active?.agencyId ?? null };
  }

  async list(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const { page, pageSize } = parsePaging(req);
      const filter: PaymentVoucherFilter = {
        prId: req.query.prId as string | undefined,
        status: req.query.status as PaymentVoucherStatus | undefined,
        prName: req.query.prName as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
        agencyId: scope.isAdmin ? (req.query.agencyId as string | undefined) : scope.agencyId!,
      };

      const { vouchers, totalCount } = await this.paymentVoucherRepository.listPaginated({ filter, page, pageSize });
      const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
      res.status(200).json({
        success: true,
        message: 'OK',
        data: vouchers,
        pagination: { page, pageSize, totalCount, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.list] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const voucher = await this.paymentVoucherRepository.getById(paramId(req.params.id));
      if (!voucher) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Hide existence of records outside the caller's agency (404, not 403).
      if (!scope.isAdmin && voucher.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Receipts ride along so the agency can verify a week's commission against
      // the evidence without a second round trip. Loaded only AFTER the ownership
      // check above, so a foreign voucher never leaks its receipts.
      const receipts = await this.paymentVoucherRepository.listReceipts(voucher.id);

      res.status(200).json({ success: true, message: 'OK', data: { ...voucher, receipts } });
    } catch (error) {
      logger.error('[PaymentVoucherController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const parsed = CreatePaymentVoucherSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      let agencyId: string;
      if (scope.isAdmin) {
        if (!parsed.data.agencyId) {
          return res.status(400).json({ success: false, message: 'agencyId is required', data: null });
        }
        agencyId = parsed.data.agencyId;
      } else {
        if (!scope.agencyId) {
          return res.status(403).json({ success: false, message: 'No agency associated with this account', data: null });
        }
        agencyId = scope.agencyId;
      }

      const { lines, ...header } = parsed.data;
      const totals = resolveTotals({ lines, subtotal: header.subtotal, deduction: header.deduction, net: header.net });
      const actor = getActor(req);
      const voucher = await this.paymentVoucherRepository.create(
        {
          ...header,
          ...totals,
          agencyId, // authoritative — overrides any client-supplied value
          status: 'pending_review',
          // The finance head signs off before a voucher is sent to the PR.
          financeHeadSignedAt: header.financeHeadName ? new Date() : undefined,
          createdBy: actor,
          updatedBy: actor,
        },
        toLineRows(lines ?? []),
      );
      res.status(201).json({ success: true, message: 'Payment voucher created', data: voucher });
    } catch (error) {
      logger.error('[PaymentVoucherController.create] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);
      const parsed = UpdatePaymentVoucherSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const existing = await this.paymentVoucherRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const { lines, ...data } = parsed.data;
      // Agency users cannot move a voucher to a different agency.
      if (!scope.isAdmin) delete data.agencyId;

      // Replacing the lines invalidates client-omitted totals — recompute them.
      const totals = lines
        ? resolveTotals({ lines, subtotal: data.subtotal, deduction: data.deduction, net: data.net })
        : {};

      // Status transitions stamp their timestamp once (never overwritten).
      const stamps: { prSignedAt?: Date; paidAt?: Date; disputedAt?: Date } = {};
      if (data.status === 'signed' && !existing.prSignedAt) stamps.prSignedAt = new Date();
      if (data.status === 'paid' && !existing.paidAt) stamps.paidAt = new Date();
      if (data.status === 'disputed' && !existing.disputedAt) stamps.disputedAt = new Date();

      const voucher = await this.paymentVoucherRepository.update(
        id,
        { ...data, ...totals, ...stamps, updatedBy: getActor(req) },
        lines ? toLineRows(lines) : undefined,
      );
      if (!voucher) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Payment voucher updated', data: voucher });
    } catch (error) {
      logger.error('[PaymentVoucherController.update] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async remove(req: Request, res: Response) {
    try {
      const id = paramId(req.params.id);

      const existing = await this.paymentVoucherRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const removed = await this.paymentVoucherRepository.remove(id);
      if (!removed) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      res.status(200).json({ success: true, message: 'Payment voucher removed', data: null });
    } catch (error) {
      logger.error('[PaymentVoucherController.remove] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // --- PR self-service: current-week draft voucher + receipt lines ----------
  // Scoped server-side by the signed-in PR, so these sit OUTSIDE the
  // admin/agency role guard (mounted before it in the router).

  /** The signed-in PR's live current-week earnings (Check-In STATUS + Payment This-week). */
  async getMyCurrentWeek(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart, weekEnd } = weekBounds();
      const draft = await this.paymentVoucherRepository.getCurrentWeekDraft(pr.id, weekStart);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          voucherId: draft?.id ?? null,
          weekStart,
          weekEnd,
          net: draft?.net ?? '0.00',
          status: draft?.status ?? null,
          lines: (draft?.lines ?? []).map(toReceiptLineDTO),
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.getMyCurrentWeek] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The signed-in PR's previous-week voucher (Payment "Last week"), or an empty week. */
  async getMyLastWeek(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart, weekEnd } = previousWeekBounds();
      const voucher = await this.paymentVoucherRepository.getWeekVoucher(pr.id, weekStart);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          voucherId: voucher?.id ?? null,
          weekStart,
          weekEnd,
          net: voucher?.net ?? '0.00',
          status: voucher?.status ?? null,
          // A PR can dispute this issued voucher; surface the persisted dispute
          // so the "Last week" grid reflects it after a reload (§3 F).
          disputeReason: voucher?.disputeReason ?? null,
          disputeNote: voucher?.disputeNote ?? null,
          disputedAt: voucher?.disputedAt ?? null,
          lines: (voucher?.lines ?? []).map(toReceiptLineDTO),
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.getMyLastWeek] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Signed/paid vouchers for History → Payment (and past payroll weeks on
   * History → Shifts). Sourced only from payment_voucher — never demo seed.
   */
  async getMyHistory(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart: currentWeekStart } = weekBounds();
      const vouchers = await this.paymentVoucherRepository.listHistoryForPr(pr.id, {
        excludeWeekStart: currentWeekStart,
      });

      res.status(200).json({
        success: true,
        message: 'OK',
        data: vouchers.map((v) => ({
          voucherId: v.id,
          weekStart: v.weekStart,
          weekEnd: v.weekEnd,
          net: v.net,
          wages: sumWages(v.lines),
          status: v.status,
          outlet: v.outlet,
          bankRef: v.bankRef,
          issuedDate: v.issuedDate,
          prSignedAt: v.prSignedAt,
          paidAt: v.paidAt,
          lines: v.lines.map(toReceiptLineDTO),
        })),
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.getMyHistory] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Logs one earning (drink/tip self-log, or a wages seal on check-out). */
  async addMyLine(req: Request, res: Response) {
    try {
      const parsed = CreatePrReceiptLineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart, weekEnd } = weekBounds();
      const actor = getActor(req);
      const draft = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
        prId: pr.id,
        agencyId: pr.agencyId,
        prName: pr.name,
        prIc: pr.icNo,
        outlet: parsed.data.outlet ?? null,
        weekStart,
        weekEnd,
        actor,
      });

      // Check-out seals (wages, overtime) carry a dedupeRef so a repeated
      // check-out no-ops instead of double-paying.
      if (parsed.data.dedupeRef) {
        const full = await this.paymentVoucherRepository.getById(draft.id);
        const dupe = full?.lines.find((l) => decodeRef(l.ref).dedupe === parsed.data.dedupeRef);
        if (dupe) {
          return res.status(200).json({ success: true, message: 'Already sealed', data: toReceiptLineDTO(dupe) });
        }
      }

      const line = await this.paymentVoucherRepository.addLine(draft.id, {
        lineDate: parsed.data.lineDate ?? todayIso(),
        outlet: parsed.data.outlet,
        description: parsed.data.item,
        quantity: parsed.data.quantity ?? 1,
        amount: parsed.data.commission.toFixed(2),
        ref: encodeRef(parsed.data.kind, parsed.data.source, parsed.data.sales, parsed.data.dedupeRef),
        proofPhotos: parsed.data.proofPhotos ?? null,
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Logged', data: toReceiptLineDTO(line) });
    } catch (error) {
      logger.error('[PaymentVoucherController.addMyLine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Logs ONE whole scanned / self-logged receipt: header (OCR order number,
   * date, time, source, proof photo) + its item lines, saved as one
   * payment_voucher_receipt row (auto receipt number RCP-000001…) with
   * FK-linked payment_voucher_line rows on the PR's current-week voucher.
   * The same paper receipt (same order number) can only be logged once per
   * voucher — a second attempt answers 409.
   */
  async addMyReceipt(req: Request, res: Response) {
    try {
      const parsed = CreatePrReceiptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart, weekEnd } = weekBounds();
      const actor = getActor(req);
      const draft = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
        prId: pr.id,
        agencyId: pr.agencyId,
        prName: pr.name,
        prIc: pr.icNo,
        outlet: parsed.data.outlet ?? null,
        weekStart,
        weekEnd,
        actor,
      });

      // One paper receipt = one log PER SHIFT. Outlets reuse order numbers
      // across nights, so the same ORD number on a new shift is a new paper —
      // it inserts normally and gets its own unique RCP number. Only a
      // re-scan within the same shift is refused.
      if (parsed.data.orderNo) {
        const dupe = await this.paymentVoucherRepository.findReceiptByOrderNo(
          draft.id,
          parsed.data.orderNo,
          parsed.data.assignmentId ?? null,
        );
        if (dupe) {
          return res.status(409).json({
            success: false,
            message: `Receipt ${parsed.data.orderNo} is already logged on this shift (${dupe.receiptNo}) — re-scan its row (camera icon) to replace the picture, edit it, or remove the row and scan afresh.`,
            data: null,
          });
        }
      }

      // The RECEIPT row records the paper's printed date/time verbatim
      // (receipt_date / receipt_time). The PAY LINES bucket on the day they
      // were logged, so the earning lands in the current shift/week PV even
      // when the paper is dated differently.
      const lineDate = parsed.data.lineDate ?? todayIso();
      const { receipt, lines } = await this.paymentVoucherRepository.createReceiptWithLines(
        {
          voucherId: draft.id,
          shiftAssignmentId: parsed.data.assignmentId ?? null,
          orderNo: parsed.data.orderNo ?? null,
          source: parsed.data.source,
          receiptDate: parsed.data.receiptDate ?? null,
          receiptTime: parsed.data.receiptTime ?? null,
          note: parsed.data.note ?? null,
          proofPhotos: parsed.data.proofPhotos ?? null,
          createdBy: actor,
          updatedBy: actor,
        },
        parsed.data.items.map((item, i) => ({
          lineDate,
          outlet: parsed.data.outlet,
          description: item.item,
          quantity: item.quantity,
          amount: item.commission.toFixed(2),
          ref: encodeRef(
            item.kind,
            parsed.data.source,
            item.sales,
            `${parsed.data.orderNo ?? ''}:${i}`,
            item.category,
          ),
          proofPhotos: i === 0 ? (parsed.data.proofPhotos ?? null) : null,
          createdBy: actor,
          updatedBy: actor,
        })),
      );

      res.status(201).json({
        success: true,
        message: 'Receipt logged',
        data: {
          id: receipt.id,
          receiptNo: receipt.receiptNo,
          orderNo: receipt.orderNo,
          receiptDate: receipt.receiptDate,
          receiptTime: receipt.receiptTime,
          source: receipt.source,
          lines: lines.map(toReceiptLineDTO),
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.addMyReceipt] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Edits one of the PR's own pending receipt lines. */
  /**
   * The agency's receipt review feed: every scanned/self-logged receipt from
   * its OWN PRs with the full OCR evidence — order number, printed date/time,
   * proof photos, PR note, and each line's item/quantity/amount — so the
   * approve/dispute decision is made on everything the PR submitted. Admin may
   * pass ?agencyId=…; an agency caller is pinned to its own membership.
   */
  async listAgencyReceipts(req: Request, res: Response) {
    try {
      const user = req.user!;
      const roles = await this.authRepository.getRolesForUserIds([user.id]);
      const isAdmin = roles.some((r) => r.roleName === 'admin');
      let agencyId: string | null = null;
      if (isAdmin && typeof req.query.agencyId === 'string' && req.query.agencyId) {
        agencyId = req.query.agencyId;
      } else {
        const memberships = await this.agencyMemberRepository.listByUser(user.id);
        agencyId =
          (memberships.find((m) => m.status === 'active') ?? memberships[0])?.agencyId ?? null;
      }
      if (!agencyId) {
        return res
          .status(403)
          .json({ success: false, message: 'No agency associated with this account', data: null });
      }

      const rows = await this.paymentVoucherRepository.listReceiptsForAgency(agencyId, {
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
      });

      res.status(200).json({
        success: true,
        message: 'OK',
        data: rows.map((r) => ({
          id: r.receipt.id,
          receiptNo: r.receipt.receiptNo,
          orderNo: r.receipt.orderNo,
          source: r.receipt.source,
          receiptDate: r.receipt.receiptDate,
          receiptTime: r.receipt.receiptTime,
          note: r.receipt.note,
          proofPhotos: r.receipt.proofPhotos ?? [],
          loggedAt: r.receipt.createdAt,
          voucherId: r.voucherId,
          voucherStatus: r.voucherStatus,
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          prId: r.prId,
          prName: r.prName,
          prNickname: r.prNickname,
          shiftAssignmentId: r.receipt.shiftAssignmentId,
          lines: r.lines.map((l) => ({
            id: l.id,
            lineDate: l.lineDate,
            outlet: l.outlet,
            description: l.description,
            quantity: l.quantity,
            amount: l.amount,
            ref: l.ref,
          })),
        })),
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.listAgencyReceipts] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async updateMyLine(req: Request, res: Response) {
    try {
      const lineId = paramId(req.params.lineId);
      const parsed = UpdatePrReceiptLineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const owned = await this.paymentVoucherRepository.getLineWithVoucher(lineId);
      if (!owned || owned.voucher.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (owned.voucher.status !== 'pending_review') {
        return res.status(400).json({ success: false, message: 'This week is already closed for edits', data: null });
      }

      // Partial update: unspecified ref parts keep their current values.
      const cur = decodeRef(owned.line.ref);
      const patch: {
        description?: string;
        quantity?: number;
        amount?: string;
        lineDate?: string;
        outlet?: string | null;
        ref?: string;
        proofPhotos?: string[] | null;
        updatedBy: string;
      } = { updatedBy: getActor(req) };
      if (parsed.data.item !== undefined) patch.description = parsed.data.item;
      if (parsed.data.quantity !== undefined) patch.quantity = parsed.data.quantity;
      if (parsed.data.commission !== undefined) patch.amount = parsed.data.commission.toFixed(2);
      if (parsed.data.lineDate !== undefined) patch.lineDate = parsed.data.lineDate;
      if (parsed.data.outlet !== undefined) patch.outlet = parsed.data.outlet;
      if (parsed.data.proofPhotos !== undefined) patch.proofPhotos = parsed.data.proofPhotos;
      patch.ref = encodeRef(
        parsed.data.kind ?? cur.kind,
        parsed.data.source ?? cur.source,
        parsed.data.sales ?? cur.sales,
        cur.dedupe || undefined,
      );

      const line = await this.paymentVoucherRepository.updateLine(lineId, patch);
      if (!line) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      // A re-snapped picture must follow the paper: keep the parent receipt's
      // photo in step with the line the app displays and the agency verifies.
      if (parsed.data.proofPhotos !== undefined && owned.line.receiptId) {
        await this.paymentVoucherRepository.updateReceiptPhotos(
          owned.line.receiptId,
          parsed.data.proofPhotos ?? null,
          getActor(req),
        );
      }
      res.status(200).json({ success: true, message: 'Updated', data: toReceiptLineDTO(line) });
    } catch (error) {
      logger.error('[PaymentVoucherController.updateMyLine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Deletes one of the PR's own pending receipt lines. */
  async deleteMyLine(req: Request, res: Response) {
    try {
      const lineId = paramId(req.params.lineId);
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const owned = await this.paymentVoucherRepository.getLineWithVoucher(lineId);
      if (!owned || owned.voucher.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (owned.voucher.status !== 'pending_review') {
        return res.status(400).json({ success: false, message: 'This week is already closed for edits', data: null });
      }

      await this.paymentVoucherRepository.deleteLine(lineId);
      // Removing the LAST line of a scanned receipt removes the receipt too —
      // its snap goes with it, and the order number becomes scannable again on
      // this shift instead of a ghost RCP blocking every re-scan.
      if (owned.line.receiptId) {
        const left = await this.paymentVoucherRepository.countLinesForReceipt(
          owned.line.receiptId,
        );
        if (left === 0) {
          await this.paymentVoucherRepository.deleteReceipt(owned.line.receiptId);
        }
      }
      res.status(200).json({ success: true, message: 'Removed', data: null });
    } catch (error) {
      logger.error('[PaymentVoucherController.deleteMyLine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  // Statuses on which a PR can raise/amend a dispute — the week is issued/under
  // review but not yet signed or paid. Signed/paid vouchers are locked.
  private static readonly DISPUTABLE_STATUSES: PaymentVoucherStatus[] = [
    'pending_review',
    'sent',
    'disputed',
  ];

  /** Small dispute-state DTO the mobile app reads back after raise/withdraw. */
  private disputeStateDTO(voucher: {
    id: string;
    status: PaymentVoucherStatus;
    disputeReason: string | null;
    disputeNote: string | null;
    disputedAt: Date | null;
  }) {
    return {
      voucherId: voucher.id,
      status: voucher.status,
      disputeReason: voucher.disputeReason,
      disputeNote: voucher.disputeNote,
      disputedAt: voucher.disputedAt,
    };
  }

  /**
   * The signed-in PR flags its OWN issued voucher for the agency to verify
   * (§3 F). Reuses the payment_voucher dispute columns — status flips to
   * 'disputed' with the reason + note; disputedAt is stamped once. The agency
   * payroll page already reads exactly these fields.
   */
  /**
   * A PR accepts their own voucher.
   *
   * Until this existed the signature was written to a local AsyncStorage key on
   * the phone and nowhere else, so the agency never learned the voucher had
   * been accepted and a reinstall erased it.
   *
   * No migration was needed: `pr_signed_at` and the 'signed' status have been on
   * the table since it was created, waiting for a writer.
   *
   * What is deliberately NOT stored is the typed signature name the app
   * collects. The authoritative identity is the authenticated user behind
   * `pr_id` — a name typed into a box adds nothing a JWT has not already
   * established, and storing it would imply a legal weight it does not carry.
   */
  async signMyVoucher(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) {
        return res
          .status(403)
          .json({ success: false, message: 'No PR profile for this account', data: null });
      }

      const voucherId = paramId(req.params.voucherId);
      const existing = await this.paymentVoucherRepository.getById(voucherId);
      // Same rule as the dispute routes: someone else's voucher is a 404, never
      // a 403, so the response does not confirm the id exists.
      if (!existing || existing.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Idempotent. A double tap, or a retry after a dropped response, must not
      // re-stamp pr_signed_at — the first signature is the one that counts.
      if (existing.status === 'signed' || existing.status === 'paid') {
        return res
          .status(200)
          .json({ success: true, message: 'Already signed', data: existing });
      }

      if (existing.status === 'pending_review') {
        return res.status(400).json({
          success: false,
          message: 'This voucher has not been sent to you yet',
          data: null,
        });
      }

      // An open dispute and a signature are contradictory claims about the same
      // money. Withdrawing is a deliberate act the PR already has an endpoint
      // for, so make them do it rather than silently resolving it by signing.
      if (existing.status === 'disputed') {
        return res.status(409).json({
          success: false,
          message: 'Withdraw your dispute before signing this voucher',
          data: null,
        });
      }

      const actor = getActor(req);
      // No `lines` argument on purpose: update() wipes and reinserts lines when
      // given them, and this route has no business touching the money.
      const signed = await this.paymentVoucherRepository.update(voucherId, {
        status: 'signed',
        prSignedAt: new Date(),
        updatedBy: actor,
      });
      if (!signed) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      return res
        .status(200)
        .json({ success: true, message: 'Voucher signed', data: signed });
    } catch (error) {
      logger.error('[PaymentVoucherController.signMyVoucher] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The PR downloads their OWN voucher as the printed Excel document — the
   * same cell layout as the prototype's PV-...-payment-voucher.xlsx export.
   * Any status is allowed: an unsigned voucher simply exports with an empty
   * signature block, because the export never shows what the DB does not hold.
   */
  async exportMyVoucherExcel(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) {
        return res
          .status(403)
          .json({ success: false, message: 'No PR profile for this account', data: null });
      }

      const voucherId = paramId(req.params.voucherId);
      const bundle = await this.paymentVoucherRepository.getExportBundle(voucherId);
      // Someone else's voucher is a 404, never a 403 — same rule as sign/dispute.
      if (!bundle || bundle.voucher.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const lines = bundle.voucher.lines.map(toReceiptLineDTO).map((l) => ({
        kind: l.kind,
        lineDate: l.lineDate,
        outlet: l.outlet,
        quantity: l.quantity,
        commission: l.commission,
      }));
      const buffer = await buildVoucherWorkbook({
        voucher: bundle.voucher,
        agency: bundle.agency,
        pr: bundle.pr,
        lines,
      });
      const filename = `${voucherRef(bundle.voucher)}-payment-voucher.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(Buffer.from(buffer as ArrayBuffer));
    } catch (error) {
      logger.error('[PaymentVoucherController.exportMyVoucherExcel] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async raiseMyDispute(req: Request, res: Response) {
    try {
      const parsed = PrRaiseDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const voucherId = paramId(req.params.voucherId);
      const existing = await this.paymentVoucherRepository.getById(voucherId);
      // Hide vouchers that aren't this PR's own behind a 404 (never 403-leak).
      if (!existing || existing.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (!PaymentVoucherControllerClass.DISPUTABLE_STATUSES.includes(existing.status)) {
        return res.status(400).json({
          success: false,
          message: 'This voucher is already signed or paid and can no longer be disputed',
          data: null,
        });
      }

      const { disputeDate, component } = parsed.data;
      const actor = getActor(req);

      // The day has to be one this voucher actually covers, or a PR could raise
      // a claim against a date with nothing on it — and the baseline below would
      // silently compute as 0.00.
      const covered = await this.paymentVoucherDisputeRepository.voucherHasDate(
        voucherId,
        disputeDate,
      );
      if (!covered) {
        return res.status(400).json({
          success: false,
          message: 'That day has no lines on this voucher',
          data: null,
        });
      }

      // Server-computed, never from the request: this is the figure the claim is
      // measured against, so the claimant must not be able to set it.
      const disputedAmount = await this.paymentVoucherDisputeRepository.sumLinesFor(
        voucherId,
        disputeDate,
        component,
      );

      let dispute;
      try {
        dispute = await this.paymentVoucherDisputeRepository.create({
          voucherId,
          disputeDate,
          component,
          reason: parsed.data.reason,
          note: parsed.data.note ?? null,
          disputedAmount,
          claimedAmount: parsed.data.claimedAmount?.toFixed(2) ?? null,
          proofPhotos: parsed.data.proofPhotos,
          receiptRefs: parsed.data.receiptRefs ?? null,
          createdBy: actor,
          updatedBy: actor,
        });
      } catch (duplicate) {
        // One dispute per day per component, decided by the unique index
        // payment_voucher_dispute_one_per_day_component — so two simultaneous
        // taps cannot both win. Narrowed on purpose: anything else is a real
        // fault and must not be reported to the PR as "already disputed".
        if (!(duplicate instanceof DuplicateDisputeError)) throw duplicate;
        return res.status(409).json({
          success: false,
          message: `${component} on ${disputeDate} has already been disputed`,
          data: null,
        });
      }
      if (!dispute) {
        return res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      // The voucher's dispute columns are now a CACHE of the rows, not the truth.
      // Kept in step because the agency payroll page still reads them; the
      // dispute table is what actually records the claim.
      const voucher = await this.paymentVoucherRepository.update(voucherId, {
        status: 'disputed',
        disputeReason: parsed.data.reason,
        disputeNote: parsed.data.note ?? null,
        // Stamp the first dispute time only; later ones keep the original.
        disputedAt: existing.disputedAt ?? new Date(),
        updatedBy: actor,
      });

      // Both halves: the dispute row is the record, and the voucher state is
      // what the PR app's grid header already renders.
      res.status(201).json({
        success: true,
        message: 'Dispute raised',
        data: { dispute, voucher: this.disputeStateDTO(voucher ?? existing) },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.raiseMyDispute] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** The PR withdraws its own dispute — the voucher returns to 'sent' for review. */
  async withdrawMyDispute(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const voucherId = paramId(req.params.voucherId);
      const existing = await this.paymentVoucherRepository.getById(voucherId);
      if (!existing || existing.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const parsed = PrWithdrawDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const actor = getActor(req);
      // Addressed by the grid cell the PR tapped. Scoped to this voucher, which
      // is already proven to be theirs, so another PR's dispute is unreachable.
      const target = await this.paymentVoucherDisputeRepository.findOpen(
        voucherId,
        parsed.data.disputeDate,
        parsed.data.component,
      );
      if (!target) {
        return res.status(404).json({
          success: false,
          message: 'No open dispute on that day and component',
          data: null,
        });
      }

      const withdrawn = await this.paymentVoucherDisputeRepository.withdraw(target.id, actor);
      if (!withdrawn) {
        // Already decided by the agency, or already withdrawn. Retracting a
        // settled claim would rewrite the outcome of a money decision.
        return res.status(400).json({
          success: false,
          message: 'This dispute has already been resolved',
          data: null,
        });
      }

      // Only hand the voucher back once NOTHING is still contested — withdrawing
      // Tuesday's tips must not clear Thursday's wages claim.
      const stillOpen = await this.paymentVoucherDisputeRepository.listOpenForVoucher(voucherId);
      const voucher =
        stillOpen.length === 0
          ? await this.paymentVoucherRepository.update(voucherId, {
              status: 'sent',
              disputeReason: null,
              disputeNote: null,
              disputedAt: null,
              updatedBy: actor,
            })
          : existing;

      res.status(200).json({
        success: true,
        message: 'Dispute withdrawn',
        data: {
          dispute: withdrawn,
          voucher: this.disputeStateDTO(voucher ?? existing),
          openDisputes: stillOpen.length,
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.withdrawMyDispute] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The agency's dispute queue. `?open=1` narrows to what still needs deciding,
   * which is what the review screen opens on.
   */
  async listDisputes(req: Request, res: Response) {
    try {
      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency for this account', data: null });
      }

      const rows = await this.paymentVoucherDisputeRepository.listForScope(scope.agencyId, {
        openOnly: req.query.open === '1' || req.query.open === 'true',
      });

      res.status(200).json({
        success: true,
        message: 'Disputes fetched',
        data: rows.map(({ dispute, voucher }) => ({
          ...dispute,
          voucher: {
            id: voucher.id,
            prId: voucher.prId,
            prName: voucher.prName,
            weekStart: voucher.weekStart,
            weekEnd: voucher.weekEnd,
            status: voucher.status,
            net: voucher.net,
          },
        })),
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.listDisputes] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Accept or reject one dispute.
   *
   * Records the decision only — it does NOT rewrite the voucher's lines.
   * Adjusting the money is a separate, deliberate edit, because updating a
   * voucher deletes and re-inserts every line on it, including the PR's own
   * self-logged ones. Silently doing that as a side effect of pressing Accept
   * is how a PR's receipts would disappear at the moment they were vindicated.
   */
  async resolveDispute(req: Request, res: Response) {
    try {
      const parsed = ResolveDisputeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && !scope.agencyId) {
        return res.status(403).json({ success: false, message: 'No agency for this account', data: null });
      }

      const disputeId = paramId(req.params.disputeId);
      const dispute = await this.paymentVoucherDisputeRepository.getById(disputeId);
      if (!dispute) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Ownership is checked through the voucher, since a dispute carries no
      // agency of its own. Cross-tenant reads 404 rather than 403.
      const voucher = await this.paymentVoucherRepository.getById(dispute.voucherId);
      if (!voucher || (!scope.isAdmin && voucher.agencyId !== scope.agencyId)) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const actor = getActor(req);
      const resolved = await this.paymentVoucherDisputeRepository.resolve(
        disputeId,
        parsed.data.outcome,
        parsed.data.resolutionNote?.trim() || null,
        actor,
      );
      if (!resolved) {
        return res.status(400).json({
          success: false,
          message: 'This dispute has already been resolved or withdrawn',
          data: null,
        });
      }

      // Hand the voucher back once nothing on it is still contested.
      const stillOpen = await this.paymentVoucherDisputeRepository.listOpenForVoucher(voucher.id);
      if (stillOpen.length === 0 && voucher.status === 'disputed') {
        await this.paymentVoucherRepository.update(voucher.id, {
          status: 'sent',
          disputeReason: null,
          disputeNote: null,
          disputedAt: null,
          updatedBy: actor,
        });
      }

      // Tell the PR. This is the whole point of recording outcomes: previously
      // "resolve" erased the complaint and the PR was never told anything.
      if (voucher.prId) {
        const pr = await this.prRepository.getById(voucher.prId);
        if (pr?.userId) {
          await notify({
            userId: pr.userId,
            kind: 'payment_voucher_dispute_resolved',
            title:
              parsed.data.outcome === 'accepted'
                ? 'Your dispute was accepted'
                : 'Your dispute was rejected',
            body: `${resolved.component} on ${resolved.disputeDate}${
              resolved.resolutionNote ? ` — ${resolved.resolutionNote}` : ''
            }`,
            payload: { voucherId: voucher.id, disputeId: resolved.id, outcome: resolved.outcome },
            actor,
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `Dispute ${parsed.data.outcome}`,
        data: { dispute: resolved, openDisputes: stillOpen.length },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.resolveDispute] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
