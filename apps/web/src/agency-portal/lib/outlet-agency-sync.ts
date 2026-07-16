import {
  OUTLET_BASE_TIER,
  OUTLET_PR_TIERS,
  buildDefaultTierRates,
  cloneTierRates,
  deriveTierMultipliersFromRates,
  getOutletRule,
  migrateCommissionRuleToTierIBase,
  normalizeTierRates,
  type OutletCommissionRule,
  type OutletPrTier,
  type OutletTierRateSettings,
} from '@agency-portal/lib/agency-demo';
import type { OutletWorkspaceSettings } from '@agency-portal/lib/outlet-demo';
import { workspaceBaseRates } from '@agency-portal/lib/outlet-demo';
import { outletMatches } from '@agency-portal/lib/portal-sync';

export function rulesMatchOutlet(
  rule: OutletCommissionRule,
  outletName: string,
): boolean {
  return outletMatches(rule.outlet, outletName) || rule.outlet === outletName;
}

/** Push outlet workspace wage + commission fields into agency per-outlet rules. */
export function syncCommissionRulesFromWorkspace(
  workspace: OutletWorkspaceSettings,
  rules: OutletCommissionRule[],
): OutletCommissionRule[] {
  const baseTier = workspace.tierRates[OUTLET_BASE_TIER];
  const tierRates = cloneTierRates(workspace.tierRates);
  const tierMultipliers = deriveTierMultipliersFromRates(tierRates);
  return rules.map((r) =>
    rulesMatchOutlet(r, workspace.outletName)
      ? {
          ...r,
          outlet: workspace.outletName,
          wagePerHour: baseTier.wagePerHour,
          drinkPct: baseTier.drinkPct,
          tipPct: baseTier.tipPct,
          tablePct: baseTier.tablePct,
          otAfterHours: baseTier.otAfterHours,
          tierRates,
          tierMultipliers,
        }
      : r,
  );
}

function tierBaseFromRule(rule: OutletCommissionRule): OutletTierRateSettings {
  return {
    wagePerHour: rule.wagePerHour,
    drinkPct: rule.drinkPct,
    tipPct: rule.tipPct,
    tablePct: rule.tablePct,
    otAfterHours: rule.otAfterHours,
  };
}

/** Tier rates for an outlet — workspace wins for the logged-in outlet, else commission rules. */
export function resolveOutletTierRates(
  outlet: string,
  rules: OutletCommissionRule[],
  workspace?: Pick<
    OutletWorkspaceSettings,
    'outletName' | 'tierRates' | 'otAfterHours'
  >,
): Record<OutletPrTier, OutletTierRateSettings> {
  if (
    workspace &&
    outletMatches(outlet, workspace.outletName) &&
    workspace.tierRates
  ) {
    const baseTier = workspace.tierRates[OUTLET_BASE_TIER];
    return normalizeTierRates(
      {
        ...baseTier,
        otAfterHours: baseTier.otAfterHours ?? workspace.otAfterHours ?? 6,
      },
      workspace.tierRates,
    );
  }
  const rule = migrateCommissionRuleToTierIBase(getOutletRule(outlet, rules));
  const tierBase = tierBaseFromRule(rule);
  if (!rule.tierRates) return buildDefaultTierRates(tierBase);
  return normalizeTierRates(tierBase, rule.tierRates);
}

/** Pull agency commission rule for this outlet back into workspace settings. */
export function syncWorkspaceFromCommissionRules(
  workspace: OutletWorkspaceSettings,
  rules: OutletCommissionRule[],
): OutletWorkspaceSettings {
  const rule = rules.find((r) => rulesMatchOutlet(r, workspace.outletName));
  if (!rule) return workspace;
  const tierRates = normalizeTierRates(
    workspaceBaseRates({
      basePayPerHour: rule.wagePerHour,
      drinkPct: rule.drinkPct,
      tipPct: rule.tipPct,
      tablePct: rule.tablePct,
      otAfterHours: rule.otAfterHours,
    }),
    rule.tierRates,
  );
  const baseTier = tierRates[OUTLET_BASE_TIER];
  return {
    ...workspace,
    tierRates,
    basePayPerHour: baseTier.wagePerHour,
    drinkPct: baseTier.drinkPct,
    tipPct: baseTier.tipPct,
    tablePct: baseTier.tablePct,
    otAfterHours: baseTier.otAfterHours,
  };
}
