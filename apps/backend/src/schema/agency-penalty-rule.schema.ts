import { z } from 'zod';
import {
  type PenaltyRuleType,
  penaltyRuleTypeValues,
} from '@/features/agency/agency-penalty-rule.model.js';

// Storage limits, not policy: past these the insert fails inside Postgres and the
// owner gets an opaque 500 instead of a sentence. `integer` is int4 and the RM
// columns are numeric(12, 2).
const INT4_MAX = 2_147_483_647;
const RM_MAX = 9_999_999_999.99;
const TOO_LARGE = 'A penalty rule number is too large to store.';

const whole = () =>
  z.coerce.number().int().max(INT4_MAX, TOO_LARGE).optional().nullable();

/**
 * One rule as sent. Deliberately UNREFINED: zod 4 throws at import when
 * `.partial()`/`.pick()`/`.omit()` meets a refined object, so the rules that
 * need several fields at once live on the array in SaveAgencyPenaltyRulesSchema.
 */
export const PenaltyRuleSchema = z.object({
  ruleType: z.enum(penaltyRuleTypeValues),
  enabled: z.boolean().default(true),
  fineRm: z.coerce.number().max(RM_MAX, TOO_LARGE).default(0),
  minShiftsPerWeek: whole(),
  maxMcPerMonth: whole(),
  finePerExcessRm: z.coerce.number().max(RM_MAX, TOO_LARGE).optional().nullable(),
  maxLatePerWeek: whole(),
  graceMinutes: whole(),
  // cancellation — hours are notice bands, pcts are % of the shift's daily wage.
  freeCancelHours: whole(),
  shortNoticeHours: whole(),
  shortNoticePct: whole(),
  lateCancelPct: whole(),
});

export type PenaltyRuleInput = z.infer<typeof PenaltyRuleSchema>;
type RuleField = Exclude<keyof PenaltyRuleInput, 'ruleType' | 'enabled'>;

/** The editor's own row titles, so a refusal names the row the owner is looking at. */
const RULE_TITLE: Record<PenaltyRuleType, string> = {
  min_shifts_per_week: 'Minimum shifts per week',
  max_mc_per_month: 'MC cap per month',
  late_per_week: 'Lateness per week',
  cancellation: 'Shift cancellation',
};

const FIELD_WORDS: Record<RuleField, string> = {
  fineRm: 'the fine',
  finePerExcessRm: 'the fine per extra MC',
  minShiftsPerWeek: 'the minimum shifts per week',
  maxMcPerMonth: 'the MC cap per month',
  maxLatePerWeek: 'the late limit per week',
  graceMinutes: 'the grace minutes',
  freeCancelHours: 'the free-cancel hours',
  shortNoticeHours: 'the short-notice hours',
  shortNoticePct: 'the short-notice charge',
  lateCancelPct: 'the late charge',
};

/**
 * The threshold each rule cannot fire without. Grace is NOT here: a blank grace
 * already means 0 minutes on the server (`graceMinutesFor(...) ?? 0`), and the
 * cancellation bands are all four here because cancel-fee reads every one.
 */
const REQUIRED: Record<PenaltyRuleType, RuleField[]> = {
  min_shifts_per_week: ['minShiftsPerWeek'],
  max_mc_per_month: ['maxMcPerMonth'],
  late_per_week: ['maxLatePerWeek'],
  cancellation: [
    'freeCancelHours',
    'shortNoticeHours',
    'shortNoticePct',
    'lateCancelPct',
  ],
};

const NON_NEGATIVE: RuleField[] = [
  'fineRm',
  'finePerExcessRm',
  'minShiftsPerWeek',
  'maxMcPerMonth',
  'graceMinutes',
  'freeCancelHours',
  'shortNoticeHours',
];

/**
 * Why this rule cannot be saved, as the sentence the editor shows — or null.
 *
 * ONLY AN ENABLED RULE IS CHECKED. The editor always sends all four rules and
 * an emptied box used to become 0, so an owner who switched lateness off and
 * left 0 in it would otherwise have the WHOLE set refused, the three rules they
 * did mean to change included. A disabled rule fines nobody; it must pass the
 * moment it is switched on, which is a save of its own and is checked then.
 */
export function penaltyRuleRefusal(rule: PenaltyRuleInput): string | null {
  if (!rule.enabled) return null;
  const title = RULE_TITLE[rule.ruleType];

  for (const field of REQUIRED[rule.ruleType]) {
    if (rule[field] == null) {
      return `${title} is switched on but has no value for ${FIELD_WORDS[field]}. Enter it, or switch the rule off.`;
    }
  }

  for (const field of NON_NEGATIVE) {
    const value = rule[field];
    if (value != null && value < 0) {
      return `${title}: ${FIELD_WORDS[field]} cannot be negative.`;
    }
  }

  // `>=` is how lateness fires (pr-penalty.ts), so a limit of 0 is reached by
  // every PR on the roster every week, and the Sunday job records each one.
  if (rule.maxLatePerWeek != null && rule.maxLatePerWeek < 1) {
    return `${title}: the late limit must be at least 1. A limit of 0 would count every rostered PR as late every week.`;
  }

  for (const field of ['shortNoticePct', 'lateCancelPct'] as const) {
    const value = rule[field];
    if (value != null && (value < 0 || value > 100)) {
      return `${title}: ${FIELD_WORDS[field]} must be between 0 and 100% of the shift's daily wage.`;
    }
  }

  // Equal is allowed (the short-notice band is simply empty, and the editor
  // warns); LONGER is refused — a short-notice boundary past the free window
  // describes a band that cannot exist.
  if (
    rule.ruleType === 'cancellation' &&
    rule.shortNoticeHours != null &&
    rule.freeCancelHours != null &&
    rule.shortNoticeHours > rule.freeCancelHours
  ) {
    return `${title}: short notice (${rule.shortNoticeHours}h) cannot be longer than free cancel (${rule.freeCancelHours}h). Lower short notice or raise free cancel.`;
  }

  return null;
}

/**
 * A save is the agency's WHOLE rule set. `penaltyRules` has no default: an
 * omitted key would otherwise parse as `[]` and wipe every rule the agency had,
 * turning a malformed request into a silent policy deletion.
 *
 * Because the set is replaced as one, ONE refused rule refuses the save — the
 * controller returns the first issue's message as the 400 sentence.
 */
export const SaveAgencyPenaltyRulesSchema = z.object({
  penaltyRules: z.array(PenaltyRuleSchema).superRefine((rules, ctx) => {
    rules.forEach((rule, index) => {
      const message = penaltyRuleRefusal(rule);
      if (message) ctx.addIssue({ code: 'custom', message, path: [index] });
    });
  }),
});

export type SaveAgencyPenaltyRulesInput = z.infer<
  typeof SaveAgencyPenaltyRulesSchema
>;
