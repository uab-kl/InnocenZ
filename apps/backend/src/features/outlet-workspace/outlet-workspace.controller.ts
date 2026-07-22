import { Request, Response } from 'express';
import { OutletWorkspaceRepositoryClass } from './outlet-workspace.repository.js';
import { UpsertOutletWorkspaceSchema } from '@/schema/outlet-workspace.schema.js';
import { Error } from '@/error/index.js';
import { getActor } from '@/util/actor.js';
import { paramId } from '@/util/params.js';
import { logger } from '@/util/logger.js';

// drizzle `numeric` columns round-trip as strings.
const num = (v: number): string => v.toFixed(2);
const numOrNull = (v: number | null | undefined): string | null =>
  v == null ? null : v.toFixed(2);

export class OutletWorkspaceControllerClass {
  constructor(private repository: OutletWorkspaceRepositoryClass) {}

  async getByOutletId(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.outletId);
      const record = await this.repository.getByOutletId(outletId);
      if (!record) {
        return res
          .status(404)
          .json({ success: false, message: Error.NOT_FOUND, data: null });
      }
      res.status(200).json({ success: true, message: 'OK', data: record });
    } catch (error) {
      logger.error('[OutletWorkspaceController.getByOutletId] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }

  async upsert(req: Request, res: Response) {
    try {
      const outletId = paramId(req.params.outletId);
      const parsed = UpsertOutletWorkspaceSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ success: false, message: parsed.error.issues[0]?.message, data: null });
      }
      const actor = getActor(req);
      const d = parsed.data;

      const parent = {
        basePayPerHour: num(d.basePayPerHour),
        drinkPct: num(d.drinkPct),
        tipPct: num(d.tipPct),
        otAfterHours: num(d.otAfterHours),
        perDrinkRm: num(d.perDrinkRm),
        happyHourStart: d.happyHourStart,
        happyHourEnd: d.happyHourEnd,
        happyHourDrinkDiscountPct: d.happyHourDrinkDiscountPct,
      };

      const children = {
        tierRates: d.tierRates.map((t) => ({
          kind: t.kind,
          tier: t.tier ?? null,
          wagePerHour: numOrNull(t.wagePerHour),
          drinkPct: num(t.drinkPct),
          happyHourDrinkPct: numOrNull(t.happyHourDrinkPct),
          tipPct: num(t.tipPct),
          otAfterHours: numOrNull(t.otAfterHours),
          targetSalesRm: numOrNull(t.targetSalesRm),
          sortOrder: t.sortOrder,
        })),
        drinkMenu: d.drinkMenu.map((m) => ({
          slug: m.slug,
          name: m.name,
          priceRm: num(m.priceRm),
          category: m.category,
          sortOrder: m.sortOrder,
        })),
        penaltyRules: d.penaltyRules.map((p) => ({
          ruleType: p.ruleType,
          enabled: p.enabled,
          appliesTo: p.appliesTo,
          fineRm: num(p.fineRm),
          minShiftsPerWeek: p.minShiftsPerWeek ?? null,
          maxMcPerMonth: p.maxMcPerMonth ?? null,
          finePerExcessRm: numOrNull(p.finePerExcessRm),
          maxLatePerWeek: p.maxLatePerWeek ?? null,
          graceMinutes: p.graceMinutes ?? null,
        })),
      };

      const record = await this.repository.upsertByOutletId(
        outletId,
        parent,
        children,
        actor,
      );
      if (!record) {
        return res
          .status(500)
          .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
      }
      res.status(200).json({ success: true, message: 'Workspace saved', data: record });
    } catch (error) {
      logger.error('[OutletWorkspaceController.upsert] Error:', error);
      res
        .status(500)
        .json({ success: false, message: Error.INTERNAL_SERVER_ERROR, data: null });
    }
  }
}
