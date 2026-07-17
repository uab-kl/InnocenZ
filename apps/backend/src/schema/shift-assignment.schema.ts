import { z } from 'zod';
import { shiftAssignmentStatusValues } from '@/features/shift-assignment/shift-assignment.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) column.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));

export const CreateShiftAssignmentSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  prId: z.string().uuid('Invalid PR ID'),
  status: z.enum(shiftAssignmentStatusValues).optional(),
  payAmount: money.optional(),
  checkInAt: z.string().datetime({ message: 'Invalid check-in timestamp' }).optional(),
  checkOutAt: z.string().datetime({ message: 'Invalid check-out timestamp' }).optional(),
  notes: z.string().max(500, 'Notes is too long').optional(),
});

// shiftId/prId are immutable after assignment — only status/pay/times/notes change.
export const UpdateShiftAssignmentSchema = z.object({
  status: z.enum(shiftAssignmentStatusValues).optional(),
  payAmount: money.optional(),
  checkInAt: z.string().datetime({ message: 'Invalid check-in timestamp' }).optional(),
  checkOutAt: z.string().datetime({ message: 'Invalid check-out timestamp' }).optional(),
  notes: z.string().max(500, 'Notes is too long').optional(),
});

export type CreateShiftAssignmentInput = z.infer<typeof CreateShiftAssignmentSchema>;
export type UpdateShiftAssignmentInput = z.infer<typeof UpdateShiftAssignmentSchema>;
