import { z } from 'zod';
import { shiftStatusValues, shiftEventKindValues } from '@/features/shift/shift.model';
import { tierRateKindValues } from '@/features/outlet-workspace/outlet-workspace.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) columns.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));

// Nullable numeric → fixed(2) string or null (for columns that may be unset).
const optionalNumeric = z
  .number()
  .min(0)
  .nullish()
  .transform((n) => (n == null ? null : n.toFixed(2)));

// Required percentage → fixed(2) string, defaulting to '0' (numeric(6,2) NOT NULL).
const requiredPct = z
  .number()
  .min(0)
  .optional()
  .default(0)
  .transform((n) => n.toFixed(2));

/**
 * One per-shift pay-tier override the outlet composes at post time. Mirrors an
 * `outlet_tier_rate` row plus the requested `prCount`; the output shape matches
 * the repo's `ShiftPayTierInput` (numeric columns as fixed(2) strings).
 */
const ShiftPayTierSchema = z.object({
  kind: z.enum(tierRateKindValues).default('tier'),
  tier: z
    .string()
    .max(50)
    .nullish()
    .transform((v) => v ?? null),
  wagePerHour: optionalNumeric,
  drinkPct: requiredPct,
  happyHourDrinkPct: optionalNumeric,
  tipPct: requiredPct,
  otAfterHours: optionalNumeric,
  targetSalesRm: optionalNumeric,
  prCount: z.number().int().nonnegative().optional().default(0),
  sortOrder: z.number().int().nonnegative().optional().default(0),
});

export const CreateShiftSchema = z.object({
  // Optional: derived from the caller's agency for agency users; required for admin.
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  /**
   * Which of the outlet's APPROVED agencies this job goes to (0124).
   *
   * Omitted or empty means "all of them" — the same thing the old single-agency
   * behaviour meant when a venue had one link, so an existing client that never
   * sends this keeps working unchanged.
   *
   * Advisory, not authoritative: the controller intersects it with the outlet's
   * approved links, so naming an unapproved agency cannot create an invitation.
   */
  agencyIds: z.array(z.string().uuid('Invalid agency ID')).max(20).optional(),
  outletId: z.string().uuid('Invalid outlet ID'),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  slot: z.string().max(100, 'Slot is too long').optional(),
  eventName: z.string().max(255, 'Event name is too long').optional(),
  eventKind: z.enum(shiftEventKindValues).optional(),
  /** The event template this shift was posted from (0128) — optional. */
  templateId: z.string().uuid('Invalid template ID').optional(),
  languages: z.string().max(255, 'Languages is too long').optional(),
  // 60 to match the column AND `shift_template.dress_code` — see 0132.
  dressCode: z.string().max(60, 'Dress code is too long').optional(),
  quantity: z.number().int().nonnegative().optional(),
  filled: z.number().int().nonnegative().optional(),
  preferredRating: z.number().int().min(0).max(5).optional(),
  payPerHour: money.optional(),
  estimatedCost: money.optional(),
  liveSales: money.optional(),
  // Per-shift rate overrides (Post Job pay-tier rows). Omit to keep the outlet's
  // workspace defaults; an empty array clears any existing overrides on update.
  payTiers: z.array(ShiftPayTierSchema).optional(),
  // Named-PR requests from the venue's SELECT PRS picker (0131). Each pick
  // names the person AND the membership its card came from, because a PR can
  // belong to several agencies and only the addressed agency may see the ask.
  // Capped at the largest plan's named-slot allowance.
  requestedPrs: z
    .array(
      z.object({
        userId: z.string().uuid(),
        agencyId: z.string().uuid(),
      }),
    )
    .max(100)
    .optional(),
});

export const UpdateShiftSchema = CreateShiftSchema.partial().extend({
  status: z.enum(shiftStatusValues).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;
