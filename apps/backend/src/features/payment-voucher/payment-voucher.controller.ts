import { Request, Response } from 'express';
import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';
import { PrRepositoryClass } from '@/features/pr/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId } from '@/util/params';
import { getActor } from '@/util/actor';
import { logger } from '@/util/logger';
import {
  CreatePaymentVoucherSchema,
  UpdatePaymentVoucherSchema,
  PaymentVoucherLineInput,
  CreatePrReceiptLineSchema,
  UpdatePrReceiptLineSchema,
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
function encodeRef(kind: PrReceiptKind, source: PrReceiptSource, sales: number, dedupe?: string): string {
  return [kind, source, sales.toFixed(2), dedupe ?? ''].join(REF_SEP);
}
function decodeRef(ref: string | null): {
  kind: PrReceiptKind;
  source: PrReceiptSource;
  sales: number;
  dedupe: string;
} {
  const [kind, source, sales, dedupe] = (ref ?? '').split(REF_SEP);
  return {
    kind: (prReceiptKindValues as readonly string[]).includes(kind) ? (kind as PrReceiptKind) : 'others',
    source: (prReceiptSourceValues as readonly string[]).includes(source)
      ? (source as PrReceiptSource)
      : 'manual',
    sales: Number(sales) || 0,
    dedupe: dedupe ?? '',
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

      res.status(200).json({ success: true, message: 'OK', data: voucher });
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
        createdBy: actor,
        updatedBy: actor,
      });
      res.status(201).json({ success: true, message: 'Logged', data: toReceiptLineDTO(line) });
    } catch (error) {
      logger.error('[PaymentVoucherController.addMyLine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Edits one of the PR's own pending receipt lines. */
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
        updatedBy: string;
      } = { updatedBy: getActor(req) };
      if (parsed.data.item !== undefined) patch.description = parsed.data.item;
      if (parsed.data.quantity !== undefined) patch.quantity = parsed.data.quantity;
      if (parsed.data.commission !== undefined) patch.amount = parsed.data.commission.toFixed(2);
      if (parsed.data.lineDate !== undefined) patch.lineDate = parsed.data.lineDate;
      if (parsed.data.outlet !== undefined) patch.outlet = parsed.data.outlet;
      patch.ref = encodeRef(
        parsed.data.kind ?? cur.kind,
        parsed.data.source ?? cur.source,
        parsed.data.sales ?? cur.sales,
        cur.dedupe || undefined,
      );

      const line = await this.paymentVoucherRepository.updateLine(lineId, patch);
      if (!line) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
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
      res.status(200).json({ success: true, message: 'Removed', data: null });
    } catch (error) {
      logger.error('[PaymentVoucherController.deleteMyLine] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
