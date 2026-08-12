import { z } from 'zod';
import { penaltyRuleTypeValues } from '@/features/agency/agency-penalty-rule.model.js';

export const PenaltyRuleSchema = z.object({
  ruleType: z.enum(penaltyRuleTypeValues),
  enabled: z.boolean().default(true),
  fineRm: z.coerce.number().default(0),
  minShiftsPerWeek: z.coerce.number().int().optional().nullable(),
  maxMcPerMonth: z.coerce.number().int().optional().nullable(),
  finePerExcessRm: z.coerce.number().optional().nullable(),
  maxLatePerWeek: z.coerce.number().int().optional().nullable(),
  graceMinutes: z.coerce.number().int().optional().nullable(),
  // cancellation — hours are notice bands, pcts are % of the shift's daily wage.
  freeCancelHours: z.coerce.number().int().optional().nullable(),
  shortNoticeHours: z.coerce.number().int().optional().nullable(),
  shortNoticePct: z.coerce.number().int().optional().nullable(),
  lateCancelPct: z.coerce.number().int().optional().nullable(),
});

/**
 * A save is the agency's WHOLE rule set. `penaltyRules` has no default: an
 * omitted key would otherwise parse as `[]` and wipe every rule the agency had,
 * turning a malformed request into a silent policy deletion.
 */
export const SaveAgencyPenaltyRulesSchema = z.object({
  penaltyRules: z.array(PenaltyRuleSchema),
});

export type SaveAgencyPenaltyRulesInput = z.infer<
  typeof SaveAgencyPenaltyRulesSchema
>;
