import { z } from 'zod';
import { shiftAssignmentStatusValues } from '@/features/shift-assignment/shift-assignment.model';

// Accept a non-negative number from the client and store it as a fixed(2) string,
// matching the numeric(12,2) column.
const money = z.number().nonnegative().transform((n) => n.toFixed(2));

export const CreateShiftAssignmentSchema = z
  .object({
    shiftId: z.string().uuid('Invalid shift ID'),
    /** Preferred ops key — resolved to a temporary pr bridge until Phase C. */
    userId: z.string().uuid('Invalid user ID').optional(),
    /** @deprecated Prefer userId. Kept for roster UI during dual-write. */
    prId: z.string().uuid('Invalid PR ID').optional(),
    status: z.enum(shiftAssignmentStatusValues).optional(),
    payAmount: money.optional(),
    checkInAt: z.string().datetime({ message: 'Invalid check-in timestamp' }).optional(),
    checkOutAt: z.string().datetime({ message: 'Invalid check-out timestamp' }).optional(),
    notes: z.string().max(500, 'Notes is too long').optional(),
  })
  .refine((v) => Boolean(v.userId || v.prId), {
    message: 'userId or prId is required',
    path: ['userId'],
  });

// shiftId/prId are immutable after assignment — only status/pay/times/notes change.
export const UpdateShiftAssignmentSchema = z.object({
  status: z.enum(shiftAssignmentStatusValues).optional(),
  payAmount: money.optional(),
  checkInAt: z.string().datetime({ message: 'Invalid check-in timestamp' }).optional(),
  checkOutAt: z.string().datetime({ message: 'Invalid check-out timestamp' }).optional(),
  notes: z.string().max(500, 'Notes is too long').optional(),
});

/**
 * The optional GPS fix a PR's phone attaches to its own check-in / check-out.
 * Optional on purpose: an outlet that has not dropped its map pin yet cannot be
 * fenced, so those stamps still go through. The moment a pin exists the server
 * REFUSES a stamp with no fix (see check-in-geofence.ts) — there is deliberately
 * no relax flag on this side. `accuracyM` is the device's own confidence radius,
 * kept for audit; the distance is never taken from the client.
 */
export const CheckInMineSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracyM: z.number().nonnegative().max(10000).optional(),
  // Android reports whether the fix came from a mock-location provider. The
  // phone volunteering this is not a security control on its own (a patched
  // client can omit it), but a stock phone running a GPS-spoofing app does set
  // it, and that is the cheap, common case worth catching.
  mocked: z.boolean().optional(),
});

export type CheckInMineInput = z.infer<typeof CheckInMineSchema>;

export type CreateShiftAssignmentInput = z.infer<typeof CreateShiftAssignmentSchema>;
export type UpdateShiftAssignmentInput = z.infer<typeof UpdateShiftAssignmentSchema>;
