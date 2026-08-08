import { z } from 'zod';
import { outletStatusValues, outletUserSubRoleValues } from '@/features/outlet/outlet.model';

export const CreateOutletSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  postcode: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  businessLicense: z.string().optional(),
  ssmNo: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  geoFenceRadius: z.number().int().min(10).max(1000).default(50),
  onboardedByAgencyId: z.string().uuid().optional(),
});

export const UpdateOutletSchema = CreateOutletSchema.partial().extend({
  status: z.enum(outletStatusValues).optional(),
  /** Base64 (or data-URL) logo — uploaded to R2; not a DB column. */
  logoBase64: z.string().min(1).optional(),
  logoFileName: z.string().trim().min(1).max(255).optional(),
  logoContentType: z.string().trim().min(1).max(100).optional(),
  /** Clear `logo_image` without uploading a replacement. */
  clearLogo: z.boolean().optional(),
});

/**
 * Admin links a venue to the agency that fulfils its PR requests.
 *
 * `outlet.onboarded_by_agency_id` is what POST /shift routes a posted job
 * through, and until this endpoint existed NOTHING in the running product ever
 * wrote it — signup leaves it null, approve only flips status — so every
 * self-signed-up outlet was permanently unable to post a shift. `null` unlinks.
 */
export const SetOutletOnboardingAgencySchema = z.object({
  agencyId: z.string().uuid('Invalid agency ID').nullable(),
});

export const UpdateGeoFenceSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  geoFenceRadius: z.number().int().min(10).max(1000).optional(),
});

/**
 * Free-text address lookup. Read-only: the result is a SUGGESTION the operator
 * confirms via PATCH /outlet/:id/geo-fence. Nothing here saves a pin, because
 * saving a pin is what switches hard geofencing on for that venue.
 */
export const GeocodeQuerySchema = z.object({
  address: z.string().trim().min(3, 'Enter at least 3 characters to search').max(500),
});

export const AddOutletMemberSchema = z.object({
  /** Preferred — invite by email; invitee sets up account on accept if new. */
  email: z.string().email('Invalid email').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  /** Membership lane (owner / finance / ops). Inferred from roleId when omitted. */
  subRole: z.enum(outletUserSubRoleValues).optional(),
  /** Portal RBAC role to grant on accept (must belong to the outlet portal). */
  roleId: z.string().uuid('Invalid role ID').optional(),
}).refine((d) => Boolean(d.email?.trim() || d.userId), {
  message: 'email or userId is required',
}).refine((d) => Boolean(d.subRole || d.roleId), {
  message: 'subRole or roleId is required',
});

export const UpdateOutletMemberSchema = z.object({
  subRole: z.enum(outletUserSubRoleValues).optional(),
  status: z.string().optional(),
});

export const AcceptOrgMemberInviteSchema = z
  .object({
    token: z.string().trim().min(16).max(128),
    /** Display name — stored as username + user_profile.full_name. */
    name: z.string().trim().min(1, 'Name is required').max(100),
    /** Defaults to the invited email when omitted. */
    email: z.string().trim().email('Invalid email').optional(),
    phoneNum: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SetOutletOnboardingAgencyInput = z.infer<typeof SetOutletOnboardingAgencySchema>;
export type CreateOutletInput = z.infer<typeof CreateOutletSchema>;
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;
export type AddOutletMemberInput = z.infer<typeof AddOutletMemberSchema>;
