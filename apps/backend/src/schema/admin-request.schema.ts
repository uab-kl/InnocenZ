import { z } from 'zod';
import { subscriberTypeValues } from '@/features/member-subscription/member-subscription.model.js';
import { adminRequestTypeValues } from '@/features/admin-request/admin-request.model.js';

export const CreateAdminRequestSchema = z.object({
  type: z.enum(adminRequestTypeValues).default('contact'),
  subscriberType: z.enum(subscriberTypeValues).optional().nullable(),
  subscriberId: z.uuid().optional().nullable(),
  subscriberName: z.string().min(1).max(255),
  contactName: z.string().max(100).optional().nullable(),
  contactEmail: z.email().max(255).optional().nullable(),
  contactPhone: z.string().max(50).optional().nullable(),
  currentPlanId: z.uuid().optional().nullable(),
  /** Plan-change only: the tier the subscriber is switching to. */
  requestedPlanId: z.uuid().optional().nullable(),
  message: z.string().max(2000).optional().nullable(),
});

// Resolving a request may record the price the admin negotiated/quoted.
export const ResolveAdminRequestSchema = z.object({
  quotedAmount: z.coerce.number().nonnegative().optional(),
});

/** Admin edits on an open inbox row (who / role / type / message). */
export const UpdateAdminRequestSchema = z.object({
  type: z.enum(adminRequestTypeValues).optional(),
  subscriberType: z.enum(subscriberTypeValues).optional().nullable(),
  subscriberName: z.string().min(1).max(255).optional(),
  message: z.string().max(2000).optional().nullable(),
  remarks: z.string().max(2000).optional().nullable(),
  quotedAmount: z.coerce.number().nonnegative().optional().nullable(),
});
