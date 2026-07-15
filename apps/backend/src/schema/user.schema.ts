import { z } from 'zod';

export const CreateUserSchema = z.object({
  username: z.string(),
  email: z.email().optional(),
  phoneNum: z.string().optional(),
  profileImage: z.string().optional(),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
