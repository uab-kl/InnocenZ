import { z } from 'zod';
import {
  specialServiceAdminAcceptedValues,
  specialServiceCategoryValues,
  specialServiceInitiatedByValues,
  specialServiceStatusValues,
} from '@/features/special-service/special-service.model.js';

export const CreateSpecialServiceSchema = z
  .object({
    outletId: z.uuid().optional().nullable(),
    outletName: z.string().min(1).max(255),
    title: z.string().min(1).max(255),
    category: z.enum(specialServiceCategoryValues).default('others'),
    description: z.string().max(2000).optional().nullable(),
    budget: z.coerce.number().nonnegative().optional(),
    scheduledFor: z.coerce.date().optional().nullable(),
    initiatedBy: z.enum(specialServiceInitiatedByValues).default('outlet'),
    postingAgencyId: z.uuid().optional().nullable(),
    postingAgencyName: z.string().min(1).max(255).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.initiatedBy === 'agency' && !data.postingAgencyName) {
      ctx.addIssue({
        code: 'custom',
        path: ['postingAgencyName'],
        message: 'postingAgencyName is required when initiatedBy is agency',
      });
    }
  });

export const AssignSpecialServiceSchema = z.object({
  assignedAgencyId: z.uuid(),
  assignedAgencyName: z.string().min(1).max(255),
});

export const UpdateStatusSchema = z.object({
  status: z.enum(specialServiceStatusValues),
});

/** Admin/portal edits on an existing order (budget, schedule, title, source, category). */
export const UpdateSpecialServiceSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).optional().nullable(),
  category: z.enum(specialServiceCategoryValues).optional(),
  outletName: z.string().min(1).max(255).optional(),
  postingAgencyName: z.string().min(1).max(255).optional().nullable(),
  initiatedBy: z.enum(specialServiceInitiatedByValues).optional(),
  budget: z.coerce.number().nonnegative().optional().nullable(),
  scheduledFor: z.coerce.date().optional().nullable(),
});

export const SpecialServiceFilterQuerySchema = z.object({
  initiatedBy: z.enum(specialServiceInitiatedByValues).optional(),
  adminAccepted: z.enum(specialServiceAdminAcceptedValues).optional(),
});
