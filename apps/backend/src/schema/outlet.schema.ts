import { z } from 'zod';
import { outletStatusValues, outletMemberSubRoleValues } from '@/features/outlet/outlet.model';

export const CreateOutletSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  postcode: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  businessLicense: z.string().optional(),
  ssmNo: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geoFenceRadius: z.number().int().min(10).max(1000).default(50),
  onboardedByAgencyId: z.string().uuid().optional(),
  subscriptionId: z.string().uuid().optional(),
});

export const UpdateOutletSchema = CreateOutletSchema.partial().extend({
  status: z.enum(outletStatusValues).optional(),
});

export const UpdateGeoFenceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geoFenceRadius: z.number().int().min(10).max(1000).optional(),
});

export const AddOutletMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  subRole: z.enum(outletMemberSubRoleValues),
});

export const UpdateOutletMemberSchema = z.object({
  subRole: z.enum(outletMemberSubRoleValues).optional(),
  status: z.string().optional(),
});

export type CreateOutletInput = z.infer<typeof CreateOutletSchema>;
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;
export type AddOutletMemberInput = z.infer<typeof AddOutletMemberSchema>;
