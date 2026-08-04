import { Request, Response } from 'express';
import {
  DuplicateDisputeError,
  PaymentVoucherDisputeRepositoryClass,
} from './payment-voucher-dispute.repository.js';
import { PaymentVoucherRepositoryClass } from './payment-voucher.repository';
import {
  buildVoucherPrintHtml,
  buildVoucherWorkbook,
  voucherRef,
} from './payment-voucher-excel.js';
import { issueExportTicket, redeemExportTicket } from './payment-voucher-export-ticket.js';
import { buildVoucherPdf } from './payment-voucher-pdf.js';
import { checkLineAgainstWeek, LineDateConflictError } from './payment-voucher-audit.js';

/**
 * Turns the repository's line-vs-shift refusal into a 400.
 *
 * The check itself lives in the repository so all four insert paths get it,
 * including the weekly generator, which never touches a controller. What HTTP
 * owns is only the status code: this is the caller's fault, not a fault, so it
 * must not fall through to the 500 every catch block otherwise returns — a
 * client told "internal server error" will retry the same bad date forever.
 *
 * Returns true when it has answered, so a catch block reads as one line.
 */
function respondIfLineDateConflict(res: Response, error: unknown): boolean {
  if (!(error instanceof LineDateConflictError)) return false;
  res.status(400).json({ success: false, message: error.reason, data: null });
  return true;
}
import {
  allDaysReviewed,
  buildDayReviewView,
  dayTotalsCents,
  voucherSendGate,
} from './payment-voucher-day-review.js';
import { klToday } from './payment-voucher-week.js';
import { kindFromComponent, refPacksKind } from './payment-voucher-component.js';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository';
import { PrRepositoryClass } from '@/features/pr/pr.repository';
import { AgencyMemberRepositoryClass } from '@/features/agency/agency-member.repository';
import { AuthRepositoryClass } from '@/features/auth/auth.repository';
import { Error } from '@/error/index';
import { paramId, uuidParam } from '@/util/params';
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
  FinanceSignVoucherSchema,
  PrSignVoucherSchema,
  ReviewVoucherDaySchema,
  ReviewReceiptSchema,
  AgencyEditReceiptLineSchema,
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
  PaymentVoucherReceiptStatus,
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
    // Passed through rather than dropped. Omitting them here is what let an
    // agency line edit sever every receipt link and delete the PR's proof
    // photos. Left `undefined` (not null) when absent, so the repository's
    // ref-match can still carry the existing values forward.
    receiptId: line.receiptId,
    proofPhotos: line.proofPhotos,
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

/**
 * The Sun–Sat window (yyyy-MM-dd) containing `now`, matching the PV cycle.
 *
 * Sunday-anchored on the owner's instruction (3 Aug 2026). It was Monday-
 * anchored, which put the backend and the PR app one day out from the agency
 * portal — the same money read `27 Jul – 02 Aug` on the phone and
 * `26 Jul – 01 Aug` on the web, and the agency could only find its vouchers via
 * a containment match written to paper over the gap.
 *
 * The anchor is the whole payroll cycle, so it must agree with
 * `previousCompleteWeek()` and `weekOfDate()` in payment-voucher-week.ts and
 * with the weekly payout cron. Change one, change all four.
 */
function weekBounds(now = new Date()): { weekStart: string; weekEnd: string } {
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysSinceSunday = base.getUTCDay(); // Sun=0 → 0, Sat=6 → 6
  const sunday = new Date(base);
  sunday.setUTCDate(base.getUTCDate() - daysSinceSunday);
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { weekStart: iso(sunday), weekEnd: iso(saturday) };
}

/** The Sun–Sat window immediately before the one containing `now`. */
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
  /** Still waiting on the agency: the parent receipt has not been approved. */
  pending: boolean;
  /** Proof photo(s) attached to the self-log — [] when none. */
  proofPhotos: string[];
  /**
   * The parent receipt's review state, or null when this line has no receipt
   * behind it (a wages seal, a bare self-logged line, a legacy row).
   */
  receiptStatus: PaymentVoucherReceiptStatus | null;
  /**
   * The parent receipt's running number (`RCP-000007`), or null when this line
   * has no receipt behind it.
   *
   * It rides on the LINE because `payment_voucher_line` has no such column and
   * never should — the number belongs to the receipt, and copying it onto the
   * line would break the one-fact-one-table rule. Before this the PR's own
   * receipt detail could show everything about a receipt EXCEPT the identifier
   * the server uses when it refuses them: "RCP-000007 has already been reviewed
   * by the agency" named something the PR had no way to see.
   */
  receiptNo: string | null;
  /**
   * May the PR contest this money yet?
   *
   * ADVISORY — it exists so the app can grey a button instead of offering an
   * action that will 409. The authoritative refusal lives in `raiseMyDispute`;
   * a client copy of a rule is never the rule.
   *
   * Wages are always disputable: they are sealed at check-out with no receipt to
   * approve, and making approval a precondition there would mean a wage error
   * could never be contested (owner's decision, 30 Jul 2026).
   */
  disputable: boolean;
};

/**
 * Maps a stored line back to the clean receipt shape the mobile app renders.
 *
 * `receiptStatusById` is optional: callers that have loaded the voucher's
 * receipts pass it, and the line then reports the REAL review state. Without it
 * `pending` falls back to the old source-based guess, which is why every
 * PR-facing read passes the map — a line that says "pending" on one screen and
 * "approved" on another is worse than either.
 */
/**
 * Which of the PR's four buckets this line belongs in.
 *
 * A packed ref wins — a self-log or receipt line states its own kind and is the
 * authority on itself. Only when the ref carries NO packed kind does the typed
 * `component` column answer, which is the weekly generator's case: it writes
 * `ref = <shift assignment id>` and sets `component: 'wages'` explicitly.
 *
 * Reading the ref alone was why every generated wage line showed under **Others**
 * and every "daily wages" figure the PR saw read RM 0.00 — the money was
 * classified correctly in the database the whole time, on a column this never
 * looked at. `decodeRef`'s own 'others' stays the last resort, for a line with
 * neither a packed ref nor a classified column.
 */
function lineKind(line: PaymentVoucherLineType, refKind: PrReceiptKind): PrReceiptKind {
  if (refPacksKind(line.ref)) return refKind;
  const fromColumn = kindFromComponent(line.component);
  return (prReceiptKindValues as readonly string[]).includes(fromColumn ?? '')
    ? (fromColumn as PrReceiptKind)
    : refKind;
}

function toReceiptLineDTO(
  line: PaymentVoucherLineType,
  receiptInfoById?: Map<string, { status: PaymentVoucherReceiptStatus; receiptNo: string }>,
): PrReceiptLineDTO {
  const { kind: refKind, source, sales } = decodeRef(line.ref);
  const kind = lineKind(line, refKind);
  const info = line.receiptId ? (receiptInfoById?.get(line.receiptId) ?? null) : null;
  const receiptStatus = info?.status ?? null;
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
    pending: receiptStatus ? receiptStatus === 'pending' : source === 'manual',
    proofPhotos: line.proofPhotos ?? [],
    receiptStatus,
    receiptNo: info?.receiptNo ?? null,
    disputable: kind === 'wages' || receiptStatus === null || receiptStatus !== 'pending',
  };
}

/** receipt id -> review state, for the DTO mapper above. */
function receiptInfoMap(
  receipts: { id: string; status: PaymentVoucherReceiptStatus; receiptNo: string }[],
): Map<string, { status: PaymentVoucherReceiptStatus; receiptNo: string }> {
  return new Map(receipts.map((r) => [r.id, { status: r.status, receiptNo: r.receiptNo }]));
}

/**
 * Wage lines only — History summary "RM X wages" beside net.
 *
 * Goes through `lineKind` for the same reason the DTO does: reading the ref alone
 * made this return 0.00 for every generated wage line, so History showed a week's
 * net beside RM 0.00 of wages.
 */
function sumWages(lines: PaymentVoucherLineType[]): string {
  const total = lines.reduce((sum, line) => {
    const kind = lineKind(line, decodeRef(line.ref).kind);
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
    // Needed by the send gate: overtime lives on the shift assignment, and an
    // undecided claim must block its own week from going out (owner's rule —
    // overtime is paid on the voucher of the week it was worked). The line-date
    // check solved the same missing-repository problem by moving into the
    // payment-voucher repository, which worked because every insert path passes
    // through it. This one cannot: the gate is a controller-level decision about
    // a request, not an invariant of a write.
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
  ) {}

  /**
   * The line's parent receipt when it is past PENDING — i.e. no longer the PR's
   * to change.
   *
   * Once the agency has approved a receipt, the numbers on it are a figure
   * somebody attested to. A PR who could still edit them would be able to move
   * money after the attestation, and the approval would quietly stop describing
   * what it approved. The route back is the dispute, which is exactly what
   * approval unlocks. Returns null when there is nothing to protect (no receipt,
   * or still pending).
   */
  private async lockedReceiptFor(line: PaymentVoucherLineType) {
    if (!line.receiptId) return null;
    const owned = await this.paymentVoucherRepository.getReceiptWithVoucher(line.receiptId);
    return owned && owned.receipt.status !== 'pending' ? owned.receipt : null;
  }

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
      // A non-uuid cannot match a row, and handing one to Postgres 500s — so it
      // is answered as what it is: not found. See uuidParam().
      const voucherId = uuidParam(req.params.id);
      const voucher = voucherId ? await this.paymentVoucherRepository.getById(voucherId) : null;
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

      // The day-by-day review state rides along for the same reason receipts do:
      // the panel that shows a week needs the decisions with it, and a second
      // round trip is a second chance for the two to disagree.
      const reviews = await this.paymentVoucherRepository.listDayReviews(voucher.id);
      const dayReviews = buildDayReviewView(voucher.lines, reviews);

      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          ...voucher,
          receipts,
          dayReviews,
          allDaysReviewed: allDaysReviewed(dayReviews),
          hasHeldDay: dayReviews.some((d) => d.status === 'held'),
          // Convenience for a header count. The send button must gate on the
          // receipts' own statuses (and each day's own status), not on these
          // roll-ups — a summary flag is one refactor away from disagreeing
          // with the rows it summarises.
          pendingReceiptCount: receipts.filter((r) => r.status === 'pending').length,
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.getById] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The agency's decision on ONE day of a voucher: approved, held, or (with no
   * status) un-reviewed again.
   *
   * The day's total is recomputed here from the lines and stored with the
   * decision — never taken from the client. It is the baseline that lets a later
   * regeneration be detected as stale, so accepting it from the caller would let
   * them approve a figure the voucher never had.
   */
  async reviewDay(req: Request, res: Response) {
    try {
      const parsed = ReviewVoucherDaySchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // A non-uuid cannot match a row, and handing one to Postgres 500s — so it
      // is answered as what it is: not found. See uuidParam().
      const voucherId = uuidParam(req.params.id);
      const voucher = voucherId ? await this.paymentVoucherRepository.getById(voucherId) : null;
      if (!voucher) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && voucher.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      // Reviewing a voucher the PR has already signed is backwards — they would
      // have signed figures nobody had checked. Refuse rather than record a
      // decision that arrives after the fact.
      if (voucher.prSignedAt) {
        return res.status(409).json({
          success: false,
          message: 'This voucher is already signed by the PR — day review happens before it is sent.',
          data: null,
        });
      }

      const date = String(req.params.date ?? '');
      const totals = dayTotalsCents(voucher.lines);
      if (!totals.has(date)) {
        return res.status(404).json({
          success: false,
          message: 'No lines on this voucher for that day',
          data: null,
        });
      }

      const actor = getActor(req);
      if (parsed.data.status === null) {
        await this.paymentVoucherRepository.deleteDayReview(voucher.id, date);
      } else {
        const saved = await this.paymentVoucherRepository.upsertDayReview({
          voucherId: voucher.id,
          reviewDate: date,
          status: parsed.data.status,
          approvedTotalCents: totals.get(date) ?? 0,
          note: parsed.data.note ?? null,
          bulk: false,
          actor,
        });
        if (!saved) {
          return res
            .status(500)
            .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
        }
      }

      const reviews = await this.paymentVoucherRepository.listDayReviews(voucher.id);
      const dayReviews = buildDayReviewView(voucher.lines, reviews);
      return res.status(200).json({
        success: true,
        message: 'Day review saved',
        data: { dayReviews, allDaysReviewed: allDaysReviewed(dayReviews) },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.reviewDay] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Clear every unreviewed day in one action.
   *
   * Recorded with `bulk: true` so it stays distinguishable from days opened and
   * approved individually — the convenience is honest, but a reviewer should be
   * able to tell later which claim they actually made. Days already HELD are
   * skipped: a bulk approve must not quietly overturn a deliberate refusal.
   */
  async approveAllDays(req: Request, res: Response) {
    try {
      // A non-uuid cannot match a row, and handing one to Postgres 500s — so it
      // is answered as what it is: not found. See uuidParam().
      const voucherId = uuidParam(req.params.id);
      const voucher = voucherId ? await this.paymentVoucherRepository.getById(voucherId) : null;
      if (!voucher) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && voucher.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (voucher.prSignedAt) {
        return res.status(409).json({
          success: false,
          message: 'This voucher is already signed by the PR — day review happens before it is sent.',
          data: null,
        });
      }

      const existing = await this.paymentVoucherRepository.listDayReviews(voucher.id);
      const view = buildDayReviewView(voucher.lines, existing);
      const actor = getActor(req);

      let approved = 0;
      for (const day of view) {
        // Leave live approvals alone, and never overturn a held day.
        if (day.status !== null) continue;
        const saved = await this.paymentVoucherRepository.upsertDayReview({
          voucherId: voucher.id,
          reviewDate: day.date,
          status: 'approved',
          approvedTotalCents: day.totalCents,
          note: null,
          bulk: true,
          actor,
        });
        if (saved) approved += 1;
      }

      const reviews = await this.paymentVoucherRepository.listDayReviews(voucher.id);
      const dayReviews = buildDayReviewView(voucher.lines, reviews);
      const held = dayReviews.filter((d) => d.status === 'held').length;
      return res.status(200).json({
        success: true,
        message:
          held > 0
            ? `${approved} day(s) approved · ${held} held day(s) left untouched`
            : `${approved} day(s) approved`,
        data: { dayReviews, allDaysReviewed: allDaysReviewed(dayReviews) },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.approveAllDays] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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

      // The SAME two money rules the PR self-log path enforces, on the agency
      // door. Closing only the PR side left this one wide open, and this is the
      // likelier origin of the live duplicate: PV-000002 was created and set
      // 'sent' mid-week from the agency side, not by a self-log.
      //
      // Both are conditional because `prId`, `weekStart` and `weekEnd` are all
      // OPTIONAL on this schema — a voucher may legitimately be raised before
      // it is attached to a PR or a week. Absent facts cannot be checked; they
      // are caught later by auditVoucher, which treats a dateless line as
      // outside the week.
      if (header.prId && header.weekStart) {
        const clash = await this.paymentVoucherRepository.existsForPrWeek(
          agencyId,
          header.prId,
          header.weekStart,
          // Optional on this schema; absent, the check degrades to "is this day
          // inside a week the PR already has a voucher for" — still an overlap.
          header.weekEnd ?? header.weekStart,
        );
        if (clash) {
          return res.status(409).json({
            success: false,
            message:
              `A payment voucher already exists for this PR and the week of ${header.weekStart}. ` +
              'Edit that one rather than raising a second — two vouchers for one week is a double payment.',
            data: null,
          });
        }
      }
      if (header.weekStart && header.weekEnd) {
        for (const line of lines ?? []) {
          // Only dates that were actually supplied: a line with no date is a
          // different (pre-existing) concern and refusing it here would be a
          // behaviour change beyond this guard's remit.
          if (!line.lineDate) continue;
          const outOfWeek = checkLineAgainstWeek(line.lineDate, {
            weekStart: header.weekStart,
            weekEnd: header.weekEnd,
          });
          if (outOfWeek) {
            return res.status(400).json({ success: false, message: outOfWeek, data: null });
          }
        }
      }

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
      if (respondIfLineDateConflict(res, error)) return;
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

      // Sending the voucher to the PR is the moment the day-by-day review is
      // for. Gated ONLY on the pending_review -> sent transition: the dispute
      // paths also write 'sent', but that is a voucher coming BACK from a
      // dispute, and re-gating it would strand a PR's own complaint.
      if (data.status === 'sent' && existing.status === 'pending_review') {
        // Rewriting the lines in the same call would have the gate judge the OLD
        // day totals and then send the NEW ones — the exact substitution
        // `approved_total_cents` exists to catch. Split the two steps so the
        // rewritten days come back as stale and are reviewed again.
        if (lines) {
          return res.status(409).json({
            success: false,
            message:
              'Change the lines and send in two steps — rewriting a voucher re-opens every day for review.',
            data: null,
          });
        }
        // The agency's OWN signature is the first thing the gate asks for.
        // Sending a voucher is an attestation — "this is what we owe you" — and
        // the workflow rail has always shown "Finance sign" ahead of "Sent to
        // PR". Until 3 Aug 2026 nothing enforced that and no column could even
        // hold the mark, so every voucher reached its PR unattested while the
        // PR's own screen claimed the finance head had already signed.
        if (!existing.financeHeadSignedAt) {
          return res.status(409).json({
            success: false,
            message:
              'Sign this voucher first — the finance signature is what the PR is asked to counter-sign.',
            data: null,
          });
        }

        const reviews = await this.paymentVoucherRepository.listDayReviews(id);
        // Receipts too: a PENDING receipt blocks the send through the SAME gate
        // (owner's decision #2), so the send has one refusal path rather than
        // two that can disagree about whether a week may go out.
        const receipts = await this.paymentVoucherRepository.listReceipts(id);
        // Judged against the week the voucher will HAVE after this update — the
        // same reasoning the line-date check below uses: an agency correcting a
        // voucher's week and sending it in one call must be measured against the
        // corrected week, not the stale one.
        // Undecided overtime blocks its own week, so the claim is always settled
        // BEFORE the voucher it belongs to goes out. Only queryable when the
        // voucher names a PR and a week; a week-less or PR-less voucher has no
        // shifts to ask about, and an empty list correctly blocks nothing.
        const weekStart = data.weekStart ?? existing.weekStart;
        const weekEnd = data.weekEnd ?? existing.weekEnd;
        const prId = existing.prId;
        const pendingOvertime =
          prId && weekStart && weekEnd
            ? await this.shiftAssignmentRepository.listPendingOvertimeForPrWeek({
                prId,
                fromDate: weekStart,
                toDate: weekEnd,
              })
            : [];
        const gate = voucherSendGate(
          buildDayReviewView(existing.lines, reviews),
          receipts,
          { weekEnd, today: klToday() },
          pendingOvertime,
        );
        if (!gate.allowed) {
          return res.status(409).json({
            success: false,
            message: gate.message,
            data: {
              heldDays: gate.heldDays,
              unreviewedDays: gate.unreviewedDays,
              pendingReceipts: gate.pendingReceipts,
              weekEndsOn: gate.weekEndsOn ?? null,
              pendingOvertime: gate.pendingOvertime ?? [],
            },
          });
        }
      }

      // A line rewrite can carry a stray date just as easily as a fresh create,
      // so the week rule applies here too. Checked against the week the voucher
      // will HAVE after this update, not the one it had before — otherwise
      // moving a voucher's week and its lines in one call would be judged
      // against the old window and wrongly refused.
      const effectiveWeekStart = data.weekStart ?? existing.weekStart;
      const effectiveWeekEnd = data.weekEnd ?? existing.weekEnd;
      if (lines && effectiveWeekStart && effectiveWeekEnd) {
        for (const line of lines) {
          if (!line.lineDate) continue;
          const outOfWeek = checkLineAgainstWeek(line.lineDate, {
            weekStart: effectiveWeekStart,
            weekEnd: effectiveWeekEnd,
          });
          if (outOfWeek) {
            return res.status(400).json({ success: false, message: outOfWeek, data: null });
          }
        }
      }

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
      if (respondIfLineDateConflict(res, error)) return;
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
      // This is the THIS-WEEK section, where the PR watches the agency approve
      // what they logged — so the receipt states have to come with the lines.
      const statuses = draft
        ? receiptInfoMap(await this.paymentVoucherRepository.listReceipts(draft.id))
        : undefined;
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          voucherId: draft?.id ?? null,
          // The stored number (0075). Sent so the app can print the same string
          // as the paper voucher instead of deriving its own from the week.
          voucherNo: draft?.voucherNo ?? null,
          weekStart,
          weekEnd,
          net: draft?.net ?? '0.00',
          status: draft?.status ?? null,
          lines: (draft?.lines ?? []).map((l) => toReceiptLineDTO(l, statuses)),
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
      // The LAST-WEEK section is where disputes are raised, and whether a line
      // may be disputed depends on its receipt's state — so this read carries
      // the same statuses as this-week rather than guessing from `source`.
      const statuses = voucher
        ? receiptInfoMap(await this.paymentVoucherRepository.listReceipts(voucher.id))
        : undefined;
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          voucherId: voucher?.id ?? null,
          voucherNo: voucher?.voucherNo ?? null,
          weekStart,
          weekEnd,
          net: voucher?.net ?? '0.00',
          status: voucher?.status ?? null,
          // A PR can dispute this issued voucher; surface the persisted dispute
          // so the "Last week" grid reflects it after a reload (§3 F).
          disputeReason: voucher?.disputeReason ?? null,
          disputeNote: voucher?.disputeNote ?? null,
          disputedAt: voucher?.disputedAt ?? null,
          lines: (voucher?.lines ?? []).map((l) => toReceiptLineDTO(l, statuses)),
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.getMyLastWeek] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The AGENCY's signature on one voucher — the "Finance sign" step of the rail.
   *
   * Deliberately its own endpoint rather than a field on `PUT /:id`. That route
   * rewrites the whole voucher (and deletes and re-inserts every line), so
   * signing through it would make an attestation a side effect of an edit — and
   * the one thing a signature must not be is something that happened while you
   * were changing the numbers.
   *
   * The name comes from the signed-in account, never the client. A caller-typed
   * name on a signature is how a signature stops meaning anything.
   *
   * Refuses once the voucher has left review: after it is sent, the PR may
   * already have counter-signed, and re-signing underneath them would change the
   * document they agreed to.
   */
  async financeSignVoucher(req: Request, res: Response) {
    try {
      const parsed = FinanceSignVoucherSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const id = paramId(req.params.id);
      const existing = await this.paymentVoucherRepository.getById(id);
      if (!existing) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Cross-tenant reads 404 rather than 403 — never confirm a record exists.
      if (!scope.isAdmin && existing.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      if (existing.status !== 'pending_review') {
        return res.status(409).json({
          success: false,
          message:
            'This voucher has already been sent — the finance signature belongs before it goes to the PR.',
          data: null,
        });
      }

      const actor = getActor(req);
      const voucher = await this.paymentVoucherRepository.update(id, {
        financeHeadName: parsed.data.financeHeadName ?? actor,
        financeHeadSignedAt: new Date(),
        financeHeadSignature: JSON.stringify(parsed.data.signature),
        updatedBy: actor,
      });

      res.status(200).json({ success: true, message: 'Voucher signed', data: voucher });
    } catch (error) {
      logger.error('[PaymentVoucherController.financeSignVoucher] Error:', error);
      res.status(500).json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Every CLOSED payroll week's voucher, for History → Payment and the past
   * weeks on History → Shifts. Sourced only from payment_voucher — never demo
   * seed.
   *
   * Deliberately NOT restricted to signed/paid. That was the filter, and it made
   * both History tabs read "No payments yet" for a PR whose Payment screen was
   * showing RM 700.00 for the very same week: a voucher sits in `pending_review`
   * from the moment the week closes until the agency issues it, which is exactly
   * the window in which a PR goes looking for it. A week the PR has finished
   * working is history whatever the agency has done with it yet.
   *
   * The current week is still excluded (`excludeWeekStart`), so the live draft
   * that is still accruing never appears here — it belongs to the Payment tab,
   * the screen that can still change it.
   *
   * The client renders anything not `paid` as "Signed"; only a genuinely paid
   * voucher reads "Paid".
   */
  async getMyHistory(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) return res.status(403).json({ success: false, message: 'No PR profile for this account', data: null });

      const { weekStart: currentWeekStart } = weekBounds();
      const vouchers = await this.paymentVoucherRepository.listHistoryForPr(pr.id, {
        statuses: ['pending_review', 'sent', 'signed', 'paid', 'disputed'],
        excludeWeekStart: currentWeekStart,
      });

      // One receipt read per week, so a past line reports the state it actually
      // ended in. Without it a settled week would still badge a self-log
      // "pending" purely because it was self-logged — the same failure as a
      // cancelled subscription rendering "Paid".
      const weeks = [];
      for (const v of vouchers) {
        const statuses = receiptInfoMap(await this.paymentVoucherRepository.listReceipts(v.id));
        weeks.push({
          voucherId: v.id,
          voucherNo: v.voucherNo,
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
          lines: v.lines.map((l) => toReceiptLineDTO(l, statuses)),
        });
      }

      res.status(200).json({ success: true, message: 'OK', data: weeks });
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

      // The date is the CLIENT's, so it is checked before anything is written.
      // This is the guard whose absence put a 2026-06-16 drink on a week-of-27
      // July voucher: the weekly generator's own query is date-bounded, so the
      // only way a stray date reaches a voucher is through this path.
      const lineDate = parsed.data.lineDate ?? todayIso();
      const outOfWeek = checkLineAgainstWeek(lineDate, { weekStart, weekEnd });
      if (outOfWeek) {
        return res.status(400).json({ success: false, message: outOfWeek, data: null });
      }

      const draftResult = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
        prId: pr.id,
        agencyId: pr.agencyId,
        prName: pr.name,
        prIc: pr.icNo,
        outlet: parsed.data.outlet ?? null,
        weekStart,
        weekEnd,
        actor,
      });
      // 409, not 500: a closed week is a legitimate state the PR has to be told
      // about, not a fault. Refusing here is what stops a second voucher being
      // minted for a week that has already been sent.
      if (!draftResult.ok) {
        return res.status(409).json({ success: false, message: draftResult.reason, data: null });
      }
      const draft = draftResult.voucher;

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
        lineDate,
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
      if (respondIfLineDateConflict(res, error)) return;
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

      // Same client-supplied date, same guard as addMyLine. Note this bounds the
      // PAY LINES only: `receiptDate` below is the paper's own printed date and
      // is deliberately free to differ — a receipt printed at 01:00 belongs to
      // the shift that just ended, and re-dating it would be a lie about the
      // paper rather than a fix.
      const lineDate = parsed.data.lineDate ?? todayIso();
      const outOfWeek = checkLineAgainstWeek(lineDate, { weekStart, weekEnd });
      if (outOfWeek) {
        return res.status(400).json({ success: false, message: outOfWeek, data: null });
      }

      const draftResult = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
        prId: pr.id,
        agencyId: pr.agencyId,
        prName: pr.name,
        prIc: pr.icNo,
        outlet: parsed.data.outlet ?? null,
        weekStart,
        weekEnd,
        actor,
      });
      if (!draftResult.ok) {
        return res.status(409).json({ success: false, message: draftResult.reason, data: null });
      }
      const draft = draftResult.voucher;

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
      // when the paper is dated differently. `lineDate` is resolved and
      // week-checked above, before the draft is touched.
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
          // Only a MANUAL self-log waits on the agency (owner's decision #3):
          // an OCR scan and a check-in seal were not self-declared, so holding
          // them would block a week on evidence nobody disputes. The PR can
          // still contest either once the voucher is issued.
          status: parsed.data.source === 'manual' ? 'pending' : 'approved',
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
          status: receipt.status,
          lines: lines.map((l) => toReceiptLineDTO(l, receiptInfoMap([receipt]))),
        },
      });
    } catch (error) {
      if (respondIfLineDateConflict(res, error)) return;
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
          // The review state, and who set it. A NULL reviewedAt beside
          // status='approved' means the row predates the review flow (0074's
          // backfill), not that someone approved it at epoch.
          status: r.receipt.status,
          reviewedAt: r.receipt.reviewedAt,
          reviewedBy: r.receipt.reviewedBy,
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

  /**
   * The agency's decision on ONE receipt: approved, or back to pending.
   *
   * Approving is a money attestation — the same authority as approving a day —
   * so the route carries `agencyOwnerOrFinance`. What it attests to is the photo
   * and the note against the numbers on the lines, which is why the correction
   * endpoint below exists beside it rather than after it.
   *
   * A VERIFIED receipt is refused. Verification means the week closed or a
   * dispute settled; reopening it would put a decided record back in play, and
   * the send gate would then hold a voucher whose money has already moved.
   */
  async reviewReceipt(req: Request, res: Response) {
    try {
      const parsed = ReviewReceiptSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const receiptId = paramId(req.params.receiptId);
      const owned = await this.paymentVoucherRepository.getReceiptWithVoucher(receiptId);
      if (!owned) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      // Cross-tenant reads 404 rather than 403 — never confirm a record exists.
      if (!scope.isAdmin && owned.voucher.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      if (owned.receipt.status === 'verified') {
        return res.status(409).json({
          success: false,
          message: `${owned.receipt.receiptNo} is already verified — that week is closed.`,
          data: null,
        });
      }
      // Same rule as day review: the decision belongs BEFORE the PR signs.
      if (owned.voucher.prSignedAt) {
        return res.status(409).json({
          success: false,
          message: 'This voucher is already signed by the PR — receipt review happens before it is sent.',
          data: null,
        });
      }

      const receipt = await this.paymentVoucherRepository.setReceiptStatus(
        receiptId,
        parsed.data.status,
        getActor(req),
      );
      if (!receipt) {
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }

      return res.status(200).json({
        success: true,
        message: parsed.data.status === 'approved' ? 'Receipt approved' : 'Approval withdrawn',
        data: receipt,
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.reviewReceipt] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The agency correcting ONE line of a receipt it is reviewing — the quantity,
   * the commission, or both.
   *
   * Targeted rather than done through `PUT /:id`, deliberately: that path deletes
   * and re-inserts every line on the voucher, which is how an agency price edit
   * once severed every receipt link and deleted the PR's proof photos. Editing
   * one row by id cannot do that.
   *
   * Two consequences are intended, not side effects:
   *  - the day's total changes, so `approved_total_cents` flips that day STALE
   *    and the agency must re-approve the day before the voucher can be sent;
   *  - an APPROVED receipt drops back to PENDING. The receipt table stores no
   *    amount, so staleness there cannot be DETECTED later — it has to be
   *    recorded at the moment of the edit or the approval silently starts
   *    describing numbers it never saw.
   */
  async editReceiptLine(req: Request, res: Response) {
    try {
      const parsed = AgencyEditReceiptLineSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      const receiptId = paramId(req.params.receiptId);
      const lineId = paramId(req.params.lineId);
      const owned = await this.paymentVoucherRepository.getReceiptWithVoucher(receiptId);
      if (!owned) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      const scope = await this.resolveScope(req);
      if (!scope.isAdmin && owned.voucher.agencyId !== scope.agencyId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      if (owned.receipt.status === 'verified') {
        return res.status(409).json({
          success: false,
          message: `${owned.receipt.receiptNo} is already verified — that week is closed.`,
          data: null,
        });
      }
      if (owned.voucher.prSignedAt) {
        return res.status(409).json({
          success: false,
          message: 'This voucher is already signed by the PR — correct it before it is sent.',
          data: null,
        });
      }

      // The line must belong to THIS receipt. Without the check, a valid receipt
      // id would authorize editing any line on any voucher in the agency.
      const line = await this.paymentVoucherRepository.getLineWithVoucher(lineId);
      if (!line || line.line.receiptId !== receiptId) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const actor = getActor(req);
      const updated = await this.paymentVoucherRepository.updateLine(lineId, {
        ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
        ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount.toFixed(2) } : {}),
        updatedBy: actor,
      });
      if (!updated) return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });

      // See the docstring: the approval described the old figure, and nothing
      // stored would let a reader notice that later.
      const receipt =
        owned.receipt.status === 'approved'
          ? await this.paymentVoucherRepository.setReceiptStatus(receiptId, 'pending', actor)
          : owned.receipt;

      return res.status(200).json({
        success: true,
        message:
          owned.receipt.status === 'approved'
            ? 'Line corrected — approve the receipt again to confirm the new figure'
            : 'Line corrected',
        data: {
          receipt,
          line: toReceiptLineDTO(updated, receiptInfoMap(receipt ? [receipt] : [])),
        },
      });
    } catch (error) {
      if (respondIfLineDateConflict(res, error)) return;
      logger.error('[PaymentVoucherController.editReceiptLine] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
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
      const locked = await this.lockedReceiptFor(owned.line);
      if (locked) {
        return res.status(409).json({
          success: false,
          message: `${locked.receiptNo} has already been reviewed by the agency — raise a dispute if the figure is wrong.`,
          data: null,
        });
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
      if (parsed.data.lineDate !== undefined) {
        // THE THIRD DOOR. `addMyLine` and `addMyReceipt` now refuse an
        // out-of-week date on the way in — but this endpoint could move an
        // already-accepted line to ANY date afterwards, which reaches the same
        // end by two steps instead of one. Guarding only the create paths would
        // have looked complete and closed nothing.
        //
        // Checked against the voucher this line actually belongs to, not the
        // current week: an old draft is still editable while it is
        // `pending_review`, and judging it against today's week would refuse a
        // legitimate correction to last week's own voucher.
        const outOfWeek =
          owned.voucher.weekStart && owned.voucher.weekEnd
            ? checkLineAgainstWeek(parsed.data.lineDate, {
                weekStart: owned.voucher.weekStart,
                weekEnd: owned.voucher.weekEnd,
              })
            : null;
        if (outOfWeek) {
          return res.status(400).json({ success: false, message: outOfWeek, data: null });
        }
        patch.lineDate = parsed.data.lineDate;
      }
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
      // Re-read the receipt statuses so the row the app puts back on screen
      // reports the REAL review state. Without this the write response fell back
      // to the source-based guess and answered `pending: false` /
      // `disputable: true` for a line whose receipt is genuinely pending — so the
      // app would offer a dispute button the server then refuses.
      const statuses = receiptInfoMap(
        await this.paymentVoucherRepository.listReceipts(owned.voucher.id),
      );
      res
        .status(200)
        .json({ success: true, message: 'Updated', data: toReceiptLineDTO(line, statuses) });
    } catch (error) {
      if (respondIfLineDateConflict(res, error)) return;
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
      // Deleting is the sharper case: it would take the reviewed evidence away
      // along with the money, leaving the agency's approval pointing at nothing.
      const locked = await this.lockedReceiptFor(owned.line);
      if (locked) {
        return res.status(409).json({
          success: false,
          message: `${locked.receiptNo} has already been reviewed by the agency — raise a dispute instead of removing it.`,
          data: null,
        });
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

      // The finger-drawn signature. Optional (an older app build signs
      // without one) — but ink the PR actually drew is either stored or the
      // whole sign is refused, never silently dropped.
      const parsedSign = PrSignVoucherSchema.safeParse(req.body ?? {});
      if (!parsedSign.success) {
        return res.status(400).json({
          success: false,
          message: parsedSign.error.issues[0]?.message ?? 'Invalid signature',
          data: null,
        });
      }
      const signature = parsedSign.data.signature;

      const actor = getActor(req);
      // No `lines` argument on purpose: update() wipes and reinserts lines when
      // given them, and this route has no business touching the money.
      const signed = await this.paymentVoucherRepository.update(voucherId, {
        status: 'signed',
        prSignedAt: new Date(),
        ...(signature ? { prSignature: JSON.stringify(signature) } : {}),
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

      return await this.sendVoucherExcel(res, bundle);
    } catch (error) {
      logger.error('[PaymentVoucherController.exportMyVoucherExcel] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Shared by the authenticated /mine export and the ticket download. */
  private voucherExportLines(bundle: { voucher: { lines: PaymentVoucherLineType[] } }) {
    // No receipt-status map on purpose: the printed document shows kind, date,
    // outlet, quantity and commission, none of which depend on the review state.
    return bundle.voucher.lines.map((line) => toReceiptLineDTO(line)).map((l) => ({
      kind: l.kind,
      lineDate: l.lineDate,
      outlet: l.outlet,
      quantity: l.quantity,
      commission: l.commission,
    }));
  }

  private async sendVoucherExcel(
    res: Response,
    bundle: NonNullable<
      Awaited<ReturnType<PaymentVoucherRepositoryClass['getExportBundle']>>
    >,
  ) {
    const buffer = await buildVoucherWorkbook({
      voucher: bundle.voucher,
      agency: bundle.agency,
      pr: bundle.pr,
      lines: this.voucherExportLines(bundle),
    });
    const filename = `${voucherRef(bundle.voucher)}-payment-voucher.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(Buffer.from(buffer as ArrayBuffer));
  }

  /**
   * The PR downloads their OWN voucher as the boxed PDF — same renderer as
   * the phone's ticket download, so web and phone can never diverge. Served
   * inline: the browser's PDF viewer opens it for viewing/printing/saving.
   */
  async exportMyVoucherPdf(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) {
        return res
          .status(403)
          .json({ success: false, message: 'No PR profile for this account', data: null });
      }

      const voucherId = paramId(req.params.voucherId);
      const bundle = await this.paymentVoucherRepository.getExportBundle(voucherId);
      if (!bundle || bundle.voucher.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const pdf = await buildVoucherPdf({
        voucher: bundle.voucher,
        agency: bundle.agency,
        pr: bundle.pr,
        lines: this.voucherExportLines(bundle),
      });
      const filename = `${voucherRef(bundle.voucher)}-payment-voucher.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.status(200).send(pdf);
    } catch (error) {
      logger.error('[PaymentVoucherController.exportMyVoucherPdf] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * The PR asks for a short-lived download link for their OWN voucher. The
   * phone then hands the link to the system browser, which cannot attach the
   * Bearer header — the 5-minute voucher-scoped ticket in the path is the
   * whole credential, so the session token never enters a URL.
   */
  async createMyVoucherExportTicket(req: Request, res: Response) {
    try {
      const pr = await this.resolvePr(req);
      if (!pr) {
        return res
          .status(403)
          .json({ success: false, message: 'No PR profile for this account', data: null });
      }

      const voucherId = paramId(req.params.voucherId);
      const existing = await this.paymentVoucherRepository.getById(voucherId);
      if (!existing || existing.prId !== pr.id) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }

      const ticket = issueExportTicket(voucherId);
      return res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          xlsxPath: `/payment-voucher/export/${ticket}/voucher.xlsx`,
          pdfPath: `/payment-voucher/export/${ticket}/voucher.pdf`,
          printPath: `/payment-voucher/export/${ticket}/print`,
          expiresInSeconds: 300,
        },
      });
    } catch (error) {
      logger.error('[PaymentVoucherController.createMyVoucherExportTicket] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Ticket download — reached by the phone's browser, no JWT. */
  async exportTicketExcel(req: Request, res: Response) {
    try {
      const voucherId = redeemExportTicket(String(req.params.ticket ?? ''));
      if (!voucherId) {
        return res
          .status(404)
          .send('This download link has expired — open the app and tap Excel again.');
      }
      const bundle = await this.paymentVoucherRepository.getExportBundle(voucherId);
      if (!bundle) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      return await this.sendVoucherExcel(res, bundle);
    } catch (error) {
      logger.error('[PaymentVoucherController.exportTicketExcel] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Ticket download — the actual PDF file, saved in one tap like the Excel. */
  async exportTicketPdf(req: Request, res: Response) {
    try {
      const voucherId = redeemExportTicket(String(req.params.ticket ?? ''));
      if (!voucherId) {
        return res
          .status(404)
          .send('This download link has expired — open the app and tap PDF again.');
      }
      const bundle = await this.paymentVoucherRepository.getExportBundle(voucherId);
      if (!bundle) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const pdf = await buildVoucherPdf({
        voucher: bundle.voucher,
        agency: bundle.agency,
        pr: bundle.pr,
        lines: this.voucherExportLines(bundle),
      });
      const filename = `${voucherRef(bundle.voucher)}-payment-voucher.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(pdf);
    } catch (error) {
      logger.error('[PaymentVoucherController.exportTicketPdf] Error:', error);
      return res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /** Ticket print view — the browser renders the voucher and offers Save as PDF. */
  async exportTicketPrint(req: Request, res: Response) {
    try {
      const voucherId = redeemExportTicket(String(req.params.ticket ?? ''));
      if (!voucherId) {
        return res
          .status(404)
          .send('This link has expired — open the app and tap PDF again.');
      }
      const bundle = await this.paymentVoucherRepository.getExportBundle(voucherId);
      if (!bundle) {
        return res.status(404).json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      const html = buildVoucherPrintHtml({
        voucher: bundle.voucher,
        agency: bundle.agency,
        pr: bundle.pr,
        lines: this.voucherExportLines(bundle),
      });
      return res.status(200).type('html').send(html);
    } catch (error) {
      logger.error('[PaymentVoucherController.exportTicketPrint] Error:', error);
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

      // APPROVAL IS THE PRECONDITION for contesting receipt-backed money
      // (owner's decision #1). Until the agency has reviewed a receipt there is
      // no stated figure to argue with — the PR would be disputing their own
      // submission. Approval is what turns it into the agency's number.
      //
      // WAGES ARE EXEMPT and always disputable: they are sealed at check-out
      // with no receipt to approve, so requiring approval there would make a
      // wage error the one thing that could never be contested.
      //
      // Structurally this rarely fires — a pending receipt blocks the send, so
      // an issued voucher has none. It fires on the week still at
      // pending_review, which a PR can also dispute.
      if (component !== 'wages') {
        const receipts = await this.paymentVoucherRepository.listReceipts(voucherId);
        const statuses = receiptInfoMap(receipts);
        const waiting = existing.lines
          .filter((l) => l.lineDate === disputeDate && decodeRef(l.ref).kind === component)
          .map((l) => (l.receiptId ? receipts.find((r) => r.id === l.receiptId) : null))
          .filter((r) => r && statuses.get(r.id)?.status === 'pending');
        if (waiting.length > 0) {
          const numbers = [...new Set(waiting.map((r) => r!.receiptNo))].join(', ');
          return res.status(409).json({
            success: false,
            message: `The agency has not finished reviewing ${numbers} — you can dispute ${component} on ${disputeDate} once it is approved.`,
            data: null,
          });
        }
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
      if (stillOpen.length === 0) {
        if (voucher.status === 'disputed') {
          await this.paymentVoucherRepository.update(voucher.id, {
            status: 'sent',
            disputeReason: null,
            disputeNote: null,
            disputedAt: null,
            updatedBy: actor,
          });
        }
        // APPROVED -> VERIFIED, the resolved-dispute arm of the lifecycle. Only
        // when the LAST open claim is decided: verifying while another dispute
        // is live would close the evidence under a claim still being heard. The
        // sweep itself skips vouchers with open disputes for the same reason, so
        // the two arms cannot contradict each other.
        const closed = await this.paymentVoucherRepository.verifyApprovedReceipts({
          voucherId: voucher.id,
          actor,
        });
        if (closed.length > 0) {
          logger.info(
            `[PaymentVoucherController.resolveDispute] verified ${closed.length} receipt(s) on ${voucher.id}: ${closed.join(', ')}`,
          );
        }
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
