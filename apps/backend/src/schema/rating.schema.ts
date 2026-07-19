import { z } from 'zod';

export const CreateRatingSchema = z.object({
  outletId: z.uuid(),
  prId: z.string().min(1).max(100),
  prName: z.string().max(255).default(''),
  stars: z.coerce.number().int().min(0).max(5).default(0),
  note: z.string().max(2000).default(''),
  tags: z.array(z.string().max(50)).default([]),
});

export type CreateRatingInput = z.infer<typeof CreateRatingSchema>;
