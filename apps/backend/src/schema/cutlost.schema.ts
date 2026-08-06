import { z } from 'zod';
import { cutlostRequestKindValues } from '@/features/cutlost/cutlost.model';

const money = z.number().nonnegative().transform((n) => n.toFixed(2));

/**
 * What an outlet submits. Mirrors the web prototype's
 * `requestOutletCutlostReduction` payload so the existing UI needs no reshaping.
 *
 * `assignmentIds` name the PRs to release. The CONTROLLER — not this schema —
 * proves they belong to `shiftId`: a zod rule cannot reach the database, and a
 * caller naming another venue's assignment is a scope violation rather than a
 * malformed body.
 */
export const CreateCutlostRequestSchema = z
  .object({
    shiftId: z.string().uuid('Invalid shift ID'),
    kind: z.enum(cutlostRequestKindValues),
    assignmentIds: z.array(z.string().uuid('Invalid assignment ID')).max(50).optional(),
    /**
     * The PRs to release, by user id — what the outlet UI actually holds.
     *
     * Resolved to assignments server-side against `shiftId`. Safe because a PR
     * holds at most ONE assignment per shift
     * (`shift_assignment_shift_pr_unique`), so the pair is unambiguous. Callers
     * may send either list; `assignmentIds` wins when both are present.
     */
    prIds: z.array(z.string().uuid('Invalid PR ID')).max(50).optional(),
    slotsCut: z.number().int().nonnegative().max(500).optional(),
    /** What the outlet was shown, frozen so both parties approve one figure. */
    estimatedSavings: money.optional(),
    rationale: z.array(z.string().max(300)).max(20).optional(),
  })
  .refine(
    (v) =>
      v.kind !== 'release_prs' ||
      (v.assignmentIds?.length ?? 0) > 0 ||
      (v.prIds?.length ?? 0) > 0,
    { message: 'Releasing PRs requires at least one PR', path: ['prIds'] },
  )
  .refine((v) => v.kind !== 'cut_slots' || (v.slotsCut ?? 0) > 0, {
    message: 'Cutting slots requires a positive slot count',
    path: ['slotsCut'],
  })
  .refine(
    // A best-effort plan that neither releases anyone nor cuts a slot is asking
    // for nothing, and would sit in the agency's queue meaning nothing.
    (v) =>
      v.kind !== 'best_effort' ||
      (v.assignmentIds?.length ?? 0) > 0 ||
      (v.prIds?.length ?? 0) > 0 ||
      (v.slotsCut ?? 0) > 0,
    { message: 'A best-effort plan must release a PR or cut a slot', path: ['kind'] },
  );

export const DecideCutlostRequestSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  /** Shown to the outlet on a rejection; ignored on an approval. */
  reason: z.string().max(500).optional(),
});

export type CreateCutlostRequestInput = z.infer<typeof CreateCutlostRequestSchema>;
export type DecideCutlostRequestInput = z.infer<typeof DecideCutlostRequestSchema>;
