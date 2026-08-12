import { Request, Response } from 'express';
import { AgencyPenaltyRuleRepositoryClass } from './agency-penalty-rule.repository.js';
import { SaveAgencyPenaltyRulesSchema } from '@/schema/agency-penalty-rule.schema.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { paramId } from '@/util/params.js';
import { logger } from '@/util/logger.js';
import { ShiftAssignmentRepositoryClass } from '@/features/shift-assignment/shift-assignment.repository.js';
import { PaymentVoucherRepositoryClass } from '@/features/payment-voucher/payment-voucher.repository.js';
import { PrRepositoryClass } from '@/features/pr-personnel/pr.repository.js';
import { buildPenaltyLine, penaltyDedupeRef } from '@/features/payment-voucher/penalty-line.js';
import { weekOfDate } from '@/features/payment-voucher/payment-voucher-week.js';
import {
  PenaltyChargeRepositoryClass,
  type PenaltyChargeSeed,
} from '@/features/agency/penalty-charge.repository.js';
import {
  evaluatePrPenalties,
  graceMinutesFor,
  WEEK_END_ONLY_RULES,
} from '@/features/pr-personnel/pr-penalty.js';

/** Shift a yyyy-MM-dd date by whole days, staying in ISO. */
function shiftIsoDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// drizzle `numeric` columns round-trip as strings.
const num = (v: number): string => v.toFixed(2);
const numOrNull = (v: number | null | undefined): string | null =>
  v == null ? null : v.toFixed(2);

/**
 * The agency's attendance & discipline policy (migration 0113 moved it here
 * from the outlet workspace).
 *
 * Read and write are both scoped to `:id` by the router, not merely gated on
 * the `agency` role — a bare role check passes every agency owner for EVERY
 * agency, which is what let one org rewrite another's settings before.
 */
export class AgencyPenaltyRuleControllerClass {
  constructor(
    private repository: AgencyPenaltyRuleRepositoryClass,
    private shiftAssignmentRepository: ShiftAssignmentRepositoryClass,
    private penaltyChargeRepository: PenaltyChargeRepositoryClass,
    private paymentVoucherRepository: PaymentVoucherRepositoryClass,
    private prRepository: PrRepositoryClass,
  ) {}

  /**
   * Accept this week's weekly breaches as owed — one row each in penalty_charge.
   *
   * A deliberate act, not a side effect of reading. The three weekly rules can
   * be recomputed at any time, so if merely opening a screen sealed them, simply
   * looking at Manage PR would start billing people.
   *
   * Idempotent by the (agency, pr, rule, week) unique index: re-sealing a week
   * inserts nothing new and, importantly, never REVISES an existing charge. An
   * amount the agency already accepted is not restated because the fine has
   * been edited since — that figure is theirs, sealed at acceptance.
   */
  /**
   * Evaluate a week for every PR the agency rostered — the shared engine behind
   * both the proposal list and the seal.
   *
   * One implementation on purpose: Manage PR previously computed its own
   * breaches in the BROWSER from `pr.shiftsThisWeek` and friends, which only
   * exist on demo PRs. On a real roster those are undefined, every window read
   * empty, and the panel reported "No active penalties this week" while the
   * backend could see the breaches perfectly well. Two evaluators, one of them
   * fed by data that does not exist.
   */
  private async evaluateWeek(
    agencyId: string,
    weekStart: string,
    weekEnd: string,
    /** Restrict to (or exclude) the rules that are only final at week end. */
    only?: 'week-end-only' | 'live-only',
  ) {
    const rules = await this.repository.listByAgencyId(agencyId);
    if (rules.length === 0) return { rules, proposals: [] as PenaltyChargeSeed[] };
    const grace = graceMinutesFor(rules);
    const prIds = await this.shiftAssignmentRepository.listPrIdsForWeek(
      agencyId,
      weekStart,
      weekEnd,
    );
    const proposals: PenaltyChargeSeed[] = [];
    for (const prId of prIds) {
      const window = await this.shiftAssignmentRepository.attendanceWindow({
        prId,
        weekStart,
        weekEnd,
        graceMinutes: grace ?? 0,
      });
      for (const breach of evaluatePrPenalties(window, rules).breaches) {
        if (breach.fineCents <= 0) continue;
        const weekEndOnly = WEEK_END_ONLY_RULES.has(breach.ruleType);
        if (only === 'week-end-only' && !weekEndOnly) continue;
        if (only === 'live-only' && weekEndOnly) continue;
        proposals.push({
          prId,
          ruleType: breach.ruleType,
          weekStart,
          weekEnd,
          fineRm: (breach.fineCents / 100).toFixed(2),
          detail: breach.detail.slice(0, 255),
        });
      }
    }
    return { rules, proposals };
  }

  /**
   * Who is in breach this week — proposals, not debts.
   *
   * Read-only: nothing is written, so opening Manage PR cannot start billing
   * anyone. Each row carries `sealed`, so the panel can show what has already
   * been accepted as owed versus what is still just a finding.
   */
  async listProposals(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const weekStart = typeof req.query.weekStart === 'string' ? req.query.weekStart : '';
      const weekEnd = typeof req.query.weekEnd === 'string' ? req.query.weekEnd : '';
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(weekStart) || !isDate(weekEnd)) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd (yyyy-MM-dd) are required',
          data: null,
        });
      }

      // Two windows, one list. Lateness and the MC cap are final the moment
      // they happen, so they come from the week asked for. Minimum-shifts is
      // only true once a week has closed, so it comes from the PREVIOUS week —
      // otherwise a PR mid-week is shown "1 of 3" as though it were a verdict.
      const prevStart = shiftIsoDays(weekStart, -7);
      const prevEnd = shiftIsoDays(weekStart, -1);
      const [live, closed] = await Promise.all([
        this.evaluateWeek(agencyId, weekStart, weekEnd, 'live-only'),
        this.evaluateWeek(agencyId, prevStart, prevEnd, 'week-end-only'),
      ]);
      const proposals = [...closed.proposals, ...live.proposals];

      const sealedRows = await Promise.all([
        this.penaltyChargeRepository.listForWeek(agencyId, weekStart),
        this.penaltyChargeRepository.listForWeek(agencyId, prevStart),
      ]);
      const sealed = sealedRows.flat();
      // One lookup per distinct PR, not per breach — a PR with three breaches
      // is still one person.
      const names = new Map<string, string | null>();
      for (const id of new Set(proposals.map((p) => p.prId))) {
        names.set(id, (await this.prRepository.getById(id))?.name ?? null);
      }

      const rows = proposals.map((p) => ({
        ...p,
        prName: names.get(p.prId) ?? null,
        // Match on the WEEK too — the list now spans two, so ignoring it would
        // mark last week's min-shifts as sealed because this week's lateness is.
        sealed: sealed.some(
          (s) =>
            s.prId === p.prId &&
            s.ruleType === p.ruleType &&
            String(s.weekStart).slice(0, 10) === p.weekStart,
        ),
      }));
      const totalRm = rows
        .reduce((n, r) => n + Number(r.fineRm ?? 0), 0)
        .toFixed(2);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: { proposals: rows, totalRm, count: rows.length },
      });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.listProposals] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async sealWeek(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const weekStart = typeof req.body?.weekStart === 'string' ? req.body.weekStart : '';
      const weekEnd = typeof req.body?.weekEnd === 'string' ? req.body.weekEnd : '';
      const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (!isDate(weekStart) || !isDate(weekEnd)) {
        return res.status(400).json({
          success: false,
          message: 'weekStart and weekEnd (yyyy-MM-dd) are required',
          data: null,
        });
      }

      // A still-running week may be sealed, but ONLY for the rules that are
      // already final.
      //
      // A proposal is recomputed on every read, so it corrects itself: a PR on
      // 1 of 3 shifts on Tuesday stops breaching the moment they work the
      // third. A SEALED charge does not — it is a snapshot, deliberately, so an
      // edited rule cannot restate an accepted figure. Sealing minimum-shifts
      // mid-week collides those two: the breach leaves the proposal list while
      // the charge stays owed, and the PR is billed for a minimum they met.
      //
      // Lateness and the MC cap have already happened, so they seal any time.
      const today = new Date().toISOString().slice(0, 10);
      const weekClosed = weekEnd < today;

      // Same engine the proposal list uses — one evaluator, so what Manage PR
      // shows and what the seal records cannot disagree.
      const { rules, proposals: seeds } = await this.evaluateWeek(
        agencyId,
        weekStart,
        weekEnd,
        weekClosed ? undefined : 'live-only',
      );
      if (rules.length === 0) {
        return res.status(200).json({
          success: true,
          message: 'No penalty rules configured — nothing to seal',
          data: { sealed: 0, evaluated: 0 },
        });
      }

      const sealed = await this.penaltyChargeRepository.seal(
        agencyId,
        seeds,
        getActor(req),
      );
      res.status(200).json({
        success: true,
        message: [
          sealed === seeds.length
            ? `${sealed} penalty charge(s) recorded`
            : `${sealed} recorded · ${seeds.length - sealed} already sealed for this week`,
          // Say what was held back, or a Finance user reads "0 recorded" on a
          // week they can see a min-shifts breach in and assumes it is broken.
          weekClosed
            ? ''
            : ` · minimum-shifts held until the week closes on ${weekEnd}`,
        ].join(''),
        data: { sealed, evaluated: seeds.length, weekClosed },
      });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.sealWeek] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * What this agency has sealed and NOT yet collected — the Finance reference.
   *
   * Two kinds, both answering the same question from a stored `charged_at`:
   * per-shift cancellation fees (sealed on cancel) and weekly penalty charges
   * (sealed when the agency accepts them). Neither is recomputed here — a list
   * of debts that re-derives itself would re-list what was already settled.
   */
  async listUncharged(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const [cancellations, penalties] = await Promise.all([
        this.shiftAssignmentRepository.listUnchargedCancelFees(agencyId),
        this.penaltyChargeRepository.listUncharged(agencyId),
      ]);
      const sum = (n: number, v: string | null) => n + Number(v ?? 0);
      const cancellationsRm = cancellations.reduce((n, c) => sum(n, c.feeRm), 0);
      const penaltiesRm = penalties.reduce((n, p) => sum(n, p.fineRm), 0);
      res.status(200).json({
        success: true,
        message: 'OK',
        data: {
          cancellations,
          penalties,
          cancellationsRm: cancellationsRm.toFixed(2),
          penaltiesRm: penaltiesRm.toFixed(2),
          totalRm: (cancellationsRm + penaltiesRm).toFixed(2),
          count: cancellations.length + penalties.length,
        },
      });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.listUncharged] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  /**
   * Put each charge on the PR's voucher for the week it BELONGS to, then stamp
   * it charged against that voucher.
   *
   * The week is the breach's own, never today's. A fine for 2–8 Aug lands on the
   * 2–8 Aug voucher even if it is settled in September, because a PR reading
   * their payslip has to find the deduction beside the week that caused it —
   * and because the alternative silently moves money between pay periods.
   *
   * Per item, not in one transaction, on purpose: one PR's voucher being closed
   * must not stop the other four from being charged. A failure leaves that row
   * UNCHARGED and returns it in `failed`, so it stays on the Finance list rather
   * than vanishing as if it had been collected. The stamp happens only after the
   * line lands — the opposite order would drain the list while collecting
   * nothing, which is exactly the failure the list exists to expose.
   */
  private async applyChargesToVouchers(
    agencyId: string,
    assignmentIds: string[],
    chargeIds: string[],
    actor: string,
  ): Promise<{
    charged: number;
    vouchers: number;
    failed: { id: string; reason: string }[];
  }> {
    const failed: { id: string; reason: string }[] = [];
    const touched = new Set<string>();
    let charged = 0;

    type Item = {
      id: string;
      kind: 'fee' | 'penalty';
      prId: string;
      userId: string | null;
      label: string;
      detail: string;
      fineRm: string;
      lineDate: string;
      weekStart: string;
      weekEnd: string;
      outlet: string;
    };
    const items: Item[] = [];

    // Only UNCHARGED fees are eligible; the repository read already filters to
    // those, so a double submit finds nothing to add rather than adding twice.
    const fees = (await this.shiftAssignmentRepository.listUnchargedCancelFees(agencyId))
      .filter((f) => assignmentIds.includes(f.assignmentId));
    for (const f of fees) {
      const date = String(f.shiftDate ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        failed.push({ id: f.assignmentId, reason: 'shift has no usable date' });
        continue;
      }
      const week = weekOfDate(date);
      if (!week) {
        failed.push({ id: f.assignmentId, reason: 'shift date resolves to no payroll week' });
        continue;
      }
      items.push({
        id: f.assignmentId,
        kind: 'fee',
        prId: f.prId,
        userId: f.userId,
        label: 'Cancelled shift',
        detail: `${f.feePct ?? 0}% of RM ${Number(f.dailyWageRm ?? 0).toFixed(2)}`,
        fineRm: String(f.feeRm ?? '0'),
        lineDate: date,
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        outlet: f.outletName ?? '',
      });
    }

    const charges = (await this.penaltyChargeRepository.listByIds(agencyId, chargeIds))
      .filter((c) => c.chargedAt == null);
    for (const c of charges) {
      items.push({
        id: c.id,
        kind: 'penalty',
        prId: c.prId,
        userId: c.prId, // `pr_id` IS the user id — see penalty-charge.repository.
        label: c.ruleType.replace(/_/g, ' '),
        detail: c.detail,
        fineRm: c.fineRm,
        // The week's first day, so the line sits inside the voucher's own range.
        lineDate: c.weekStart,
        weekStart: c.weekStart,
        weekEnd: c.weekEnd,
        outlet: '',
      });
    }

    for (const item of items) {
      try {
        const pr = await this.prRepository.getById(item.prId);
        const result = await this.paymentVoucherRepository.getOrCreateCurrentWeekDraft({
          prId: item.prId,
          userId: item.userId ?? pr?.userId,
          agencyId,
          prName: pr?.name ?? 'PR',
          prIc: pr?.icNo,
          outlet: item.outlet,
          weekStart: item.weekStart,
          weekEnd: item.weekEnd,
          actor,
        });
        if (!result.ok) {
          // A signed/sent week cannot take a new deduction. Leaving it uncharged
          // is the honest outcome — the agency has to decide whether to carry it
          // forward, and a silent stamp would hide that decision.
          failed.push({ id: item.id, reason: result.reason });
          continue;
        }
        const vId = result.voucher.id;

        const { line } = buildPenaltyLine({
          chargeId: item.id,
          label: item.label,
          detail: item.detail,
          fineRm: item.fineRm,
          lineDate: item.lineDate,
        });
        const full = await this.paymentVoucherRepository.getById(vId);
        const dedupe = penaltyDedupeRef(item.id);
        if (!full?.lines.some((l) => (l.ref ?? '').includes(dedupe))) {
          await this.paymentVoucherRepository.addLine(vId, line);
        }

        // Always the voucher the line actually landed on. A caller-supplied
        // voucherId used to win here, which would stamp `charged_voucher_id`
        // with one voucher while the deduction sat on another — the audit trail
        // would then point at a document that never carried the charge.
        const target = vId;
        const n =
          item.kind === 'fee'
            ? await this.shiftAssignmentRepository.markCancelFeesCharged(
                agencyId,
                [item.id],
                target,
                actor,
              )
            : await this.penaltyChargeRepository.markCharged(
                agencyId,
                [item.id],
                target,
                actor,
              );
        if (n > 0) {
          charged += n;
          touched.add(vId);
        }
      } catch (error) {
        logger.error('[AgencyPenaltyRuleController.applyCharges] Error:', error);
        failed.push({ id: item.id, reason: 'could not write the voucher line' });
      }
    }

    return { charged, vouchers: touched.size, failed };
  }

  /**
   * Mark sealed fees as charged, against the voucher that took them.
   *
   * This records a decision; it does NOT write the deduction. Applying money to
   * a voucher stays the deliberate act it already is (PUT /payment-voucher/:id),
   * for the reason the whole penalty lane exists: a charge that takes pay away
   * from a worker gets a human signature. Stamping here without the agency
   * having actually edited the voucher would drain this list while collecting
   * nothing — the exact failure the list was built to expose.
   */
  async markCharged(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const clean = (raw: unknown): string[] =>
        Array.isArray(raw)
          ? [
              ...new Set(
                raw.filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
              ),
            ]
          : [];
      const assignmentIds = clean(req.body?.assignmentIds);
      const chargeIds = clean(req.body?.chargeIds);
      if (assignmentIds.length + chargeIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'assignmentIds and/or chargeIds must contain at least one id',
          data: null,
        });
      }
      if (assignmentIds.length > 200 || chargeIds.length > 200) {
        return res.status(400).json({
          success: false,
          message: 'At most 200 ids of each kind',
          data: null,
        });
      }
      const voucherId =
        typeof req.body?.voucherId === 'string' && req.body.voucherId.trim()
          ? req.body.voucherId.trim()
          : null;

      const actor = getActor(req);
      const applied = await this.applyChargesToVouchers(
        agencyId,
        assignmentIds,
        chargeIds,
        actor,
      );

      res.status(200).json({
        success: true,
        message:
          applied.failed.length === 0
            ? `${applied.charged} item(s) charged to ${applied.vouchers} voucher(s)`
            : `${applied.charged} charged · ${applied.failed.length} could not be placed on a voucher`,
        data: applied,
      });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.markCharged] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async list(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const rules = await this.repository.listByAgencyId(agencyId);
      // An agency with no rules is not a 404: "nothing is enforced" is a real
      // answer, and 404 would make the editor look broken on a fresh agency.
      res.status(200).json({ success: true, message: 'OK', data: rules });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.list] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async save(req: Request, res: Response) {
    try {
      const agencyId = paramId(req.params.id);
      const parsed = SaveAgencyPenaltyRulesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }

      // One row per rule type is a database constraint; rejecting a duplicated
      // type here turns what would be an opaque 500 from the unique index into
      // a message the editor can show.
      const seen = new Set<string>();
      for (const rule of parsed.data.penaltyRules) {
        if (seen.has(rule.ruleType)) {
          return res.status(400).json({
            success: false,
            message: `Duplicate penalty rule: ${rule.ruleType}`,
            data: null,
          });
        }
        seen.add(rule.ruleType);
      }

      const rules = parsed.data.penaltyRules.map((p) => ({
        ruleType: p.ruleType,
        enabled: p.enabled,
        fineRm: num(p.fineRm),
        minShiftsPerWeek: p.minShiftsPerWeek ?? null,
        maxMcPerMonth: p.maxMcPerMonth ?? null,
        finePerExcessRm: numOrNull(p.finePerExcessRm),
        maxLatePerWeek: p.maxLatePerWeek ?? null,
        graceMinutes: p.graceMinutes ?? null,
        freeCancelHours: p.freeCancelHours ?? null,
        shortNoticeHours: p.shortNoticeHours ?? null,
        shortNoticePct: p.shortNoticePct ?? null,
        lateCancelPct: p.lateCancelPct ?? null,
      }));

      const saved = await this.repository.replaceForAgency(
        agencyId,
        rules,
        getActor(req),
      );
      res
        .status(200)
        .json({ success: true, message: 'Penalty rules saved', data: saved });
    } catch (error) {
      logger.error('[AgencyPenaltyRuleController.save] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
