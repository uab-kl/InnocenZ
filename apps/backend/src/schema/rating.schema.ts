import { z } from 'zod';

export const CreateRatingSchema = z.object({
  outletId: z.uuid(),
  prId: z.string().min(1).max(100),
  prName: z.string().max(255).default(''),
  stars: z.coerce.number().int().min(0).max(5).default(0),
  note: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).default([]),
  /**
   * The shift this verdict is about (0120). Optional because the current rate UI
   * fires from a post-seal prompt that carries no shift; the controller then
   * derives the PR's latest assignment at that venue, which is the shift that
   * prompt was raised for. Sent explicitly, it is verified to belong to this
   * (outlet, PR) before it is stored — a client may not attribute a rating to
   * another agency's shift.
   */
  shiftAssignmentId: z.uuid().optional(),
  /**
   * The shift being rated, when the client knows the SHIFT but not the
   * assignment — which is the post-seal prompt's case: it already carries the
   * sealed `shiftId`, and the outlet has no reason to know assignment ids.
   *
   * Loosely typed on purpose. This id comes from a demo-seeded store, so a value
   * that is not a real uuid is a MISS to be fallen back from, not a 400 that
   * loses the venue's rating. `shiftAssignmentId` is the strict field; this is
   * the hint.
   */
  shiftId: z.string().max(100).optional(),
});

export type CreateRatingInput = z.infer<typeof CreateRatingSchema>;
