import { z } from 'zod';

// The destination is a concrete shift, not an outlet: approving repoints the
// assignment at this row. The origin is read from the assignment, never from
// the client, so a caller cannot claim a shift the PR isn't actually on.
export const CreateOutletSwapSchema = z.object({
  assignmentId: z.string().uuid('Invalid assignment ID'),
  toShiftId: z.string().uuid('Invalid destination shift ID'),
  agencyNote: z.string().max(500, 'Note is too long').optional(),
});

// Shared by the PR's approve/decline and the agency's cancel — all three carry
// nothing but an optional note.
export const RespondOutletSwapSchema = z.object({
  note: z.string().max(500, 'Note is too long').optional(),
});

export type CreateOutletSwapInput = z.infer<typeof CreateOutletSwapSchema>;
export type RespondOutletSwapInput = z.infer<typeof RespondOutletSwapSchema>;
