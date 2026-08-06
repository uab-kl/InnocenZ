import { z } from 'zod';
import { agencyStatusValues, agencyUserSubRoleValues } from '@/features/agency/agency.model';

export const CreateAgencySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  ssmNo: z.string().min(1, 'SSM registration number is required'),
  contactName: z.string().optional(),
  contactEmail: z.string().email('Invalid email').optional(),
  contactPhone: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
});

export const UpdateAgencySchema = CreateAgencySchema.partial().extend({
  status: z.enum(agencyStatusValues).optional(),
  /** Base64 (or data-URL) logo — uploaded to R2; not a DB column. */
  logoBase64: z.string().min(1).optional(),
  logoFileName: z.string().trim().min(1).max(255).optional(),
  logoContentType: z.string().trim().min(1).max(100).optional(),
  /** Clear `logo_image` without uploading a replacement. */
  clearLogo: z.boolean().optional(),
});

export const AddAgencyMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  subRole: z.enum(agencyUserSubRoleValues),
});

export const UpdateAgencyMemberSchema = z.object({
  subRole: z.enum(agencyUserSubRoleValues).optional(),
  status: z.string().optional(),
});

export type CreateAgencyInput = z.infer<typeof CreateAgencySchema>;
export type UpdateAgencyInput = z.infer<typeof UpdateAgencySchema>;
export type AddAgencyMemberInput = z.infer<typeof AddAgencyMemberSchema>;
