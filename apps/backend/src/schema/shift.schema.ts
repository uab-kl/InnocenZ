import { z } from 'zod';
import { shiftStatusValues, shiftEventKindValues } from '@/features/shift/shift.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) columns.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));

export const CreateShiftSchema = z.object({
  // Optional: derived from the caller's agency for agency users; required for admin.
  agencyId: z.string().uuid('Invalid agency ID').optional(),
  outletId: z.string().uuid('Invalid outlet ID'),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be yyyy-MM-dd'),
  slot: z.string().max(100, 'Slot is too long').optional(),
  eventName: z.string().max(255, 'Event name is too long').optional(),
  eventKind: z.enum(shiftEventKindValues).optional(),
  languages: z.string().max(255, 'Languages is too long').optional(),
  quantity: z.number().int().nonnegative().optional(),
  filled: z.number().int().nonnegative().optional(),
  preferredRating: z.number().int().min(0).max(5).optional(),
  payPerHour: money.optional(),
  estimatedCost: money.optional(),
  liveSales: money.optional(),
});

export const UpdateShiftSchema = CreateShiftSchema.partial().extend({
  status: z.enum(shiftStatusValues).optional(),
});

export type CreateShiftInput = z.infer<typeof CreateShiftSchema>;
export type UpdateShiftInput = z.infer<typeof UpdateShiftSchema>;
