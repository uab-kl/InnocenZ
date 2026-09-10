import { z } from 'zod';
import { shiftEventKindValues } from '@/features/shift/shift.model';

/**
 * The special sub-types the Post Job composer offers. Kept as a plain list —
 * the web's SHIFT_SPECIAL_EVENT_OPTIONS ids — so a stored template names the
 * same fact the chips do.
 */
export const specialEventTypeValues = [
  'vip',
  'launch',
  'private_table',
  'brand_activation',
  'corporate',
  'other',
] as const;

const coverUpload = {
  /** Raw or data-URL base64; decoded and size-checked server-side (5 MB). */
  coverBase64: z.string().min(1).optional(),
  coverFileName: z.string().max(200).optional(),
  coverContentType: z.string().max(100).optional(),
};

export const CreateShiftTemplateSchema = z.object({
  /** Optional for outlet callers (defaults to their own venue); admin must send it. */
  outletId: z.string().uuid('Invalid outlet ID').optional(),
  name: z.string().trim().min(1, 'Name the template').max(120),
  eventKind: z.enum(shiftEventKindValues).default('normal'),
  specialEventType: z.enum(specialEventTypeValues).optional(),
  customSpecialEventName: z.string().trim().max(120).optional(),
  slot: z.string().max(100).optional(),
  quantity: z.number().int().min(0).max(500).optional(),
  languages: z.string().max(255).optional(),
  dressCode: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).optional(),
  ...coverUpload,
});

export const UpdateShiftTemplateSchema = CreateShiftTemplateSchema.omit({
  outletId: true,
})
  .partial()
  .extend({
    /**
     * Re-declared WITHOUT the create-time `.default('normal')`: `.partial()`
     * leaves a default in place, so renaming a template — or just replacing its
     * cover — used to send `eventKind: 'normal'` and quietly demote a special
     * event back to an ordinary one. See the note on `UpdateOutletSchema`.
     */
    eventKind: z.enum(shiftEventKindValues).optional(),
    /** True removes the current cover picture (and its R2 object). */
    removeCover: z.boolean().optional(),
  });

export type CreateShiftTemplateInput = z.infer<typeof CreateShiftTemplateSchema>;
export type UpdateShiftTemplateInput = z.infer<typeof UpdateShiftTemplateSchema>;
