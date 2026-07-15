import { z } from 'zod';
import { agencyStatusValues, agencyMemberSubRoleValues } from '@/features/agency/agency.model';

export const CreateAgencySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ssmNo: z.string().min(1, 'SSM registration number is required'),
  contactName: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional(),
  contactPhone: z.string().optional(),
});

export const UpdateAgencySchema = CreateAgencySchema.partial().extend({
  status: z.enum(agencyStatusValues).optional(),
});

export const AddAgencyMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  subRole: z.enum(agencyMemberSubRoleValues),
});

export const UpdateAgencyMemberSchema = z.object({
  subRole: z.enum(agencyMemberSubRoleValues).optional(),
  status: z.string().optional(),
});

export type CreateAgencyInput = z.infer<typeof CreateAgencySchema>;
export type UpdateAgencyInput = z.infer<typeof UpdateAgencySchema>;
export type AddAgencyMemberInput = z.infer<typeof AddAgencyMemberSchema>;
