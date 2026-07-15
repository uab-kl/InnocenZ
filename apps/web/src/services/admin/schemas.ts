import { z } from 'zod'

export const CreateAdminSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  status: z.enum(['active', 'inactive']),
})

export type CreateAdminInput = z.infer<typeof CreateAdminSchema>
