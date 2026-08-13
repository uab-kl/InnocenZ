import { z } from 'zod';

/** `YYYY-MM-DD`, the same calendar-date form `shift.shift_date` stores. */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')
  // `2026-02-31` matches the regex but is not a day. Date.parse on the bare ISO
  // form is UTC-anchored and rolls invalid days forward, so round-trip it and
  // insist the string comes back unchanged.
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'Not a real date');

/**
 * The PR blocks one day. The person is never in the body — it comes from the
 * token — so a caller cannot block someone else's calendar.
 */
export const BlockPrDaySchema = z.object({
  date: IsoDate,
  reason: z.string().max(200, 'Reason is too long').optional(),
});

/** Optional window for a list read. Both ends inclusive. */
export const PrAvailabilityRangeSchema = z.object({
  from: IsoDate.optional(),
  to: IsoDate.optional(),
});

export type BlockPrDayInput = z.infer<typeof BlockPrDaySchema>;
export type PrAvailabilityRangeInput = z.infer<typeof PrAvailabilityRangeSchema>;
