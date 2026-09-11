import { z } from 'zod';
import { agencyStatusValues, agencyUserSubRoleValues } from '@/features/agency/agency.model';
import { MEMBERSHIP_STATUSES } from '@/util/membership-status';

export const CreateAgencySchema = z.object({
  /**
   * The catalog plan (`main.subscription.id`) this agency is created on.
   *
   * REQUIRED — see the twin on `CreateOutletSchema`. An agency with no plan is
   * invisible to the Sunday tier rule, which reads FROM `member_subscription`,
   * so it can never be re-priced and works unbilled indefinitely.
   */
  packageId: z.string().uuid('A subscription package is required'),
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
  /**
   * The ORIGINAL picked image and where the crop frame was left — stored beside
   * the logo in R2 so "Adjust crop" survives a reload. Optional: an older
   * client sends neither and simply gets no sidecar.
   */
  logoSourceDataUrl: z.string().min(1).optional(),
  logoCropState: z
    .object({ zoom: z.number(), fx: z.number(), fy: z.number() })
    .optional(),
  /** Clear `logo_image` without uploading a replacement. */
  clearLogo: z.boolean().optional(),
});

/**
 * An agency broadcasting a free-text notice to PRs on its own roster.
 *
 * `title` is capped at 200 to match `notification.title` varchar(200) — the
 * column would otherwise decide it, and a DB truncation error surfaces as a 500
 * on a request that was merely too long. `body` is capped well under the text
 * column so one caller cannot fan a megabyte out across 200 rows.
 *
 * MAX_BROADCAST_RECIPIENTS bounds the fan-out: notifyMany writes sequentially,
 * so an unbounded list is an unbounded request.
 */
export const MAX_BROADCAST_RECIPIENTS = 200;

export const BroadcastToPrsSchema = z.object({
  prIds: z
    .array(z.string().uuid('Invalid PR user ID'))
    .min(1, 'Select at least one PR')
    .max(MAX_BROADCAST_RECIPIENTS, `Select at most ${MAX_BROADCAST_RECIPIENTS} PRs`),
  title: z.string().trim().min(1, 'Subject is required').max(200, 'Subject is too long'),
  body: z.string().trim().min(1, 'Message is required').max(4000, 'Message is too long'),
});

export const AddAgencyMemberSchema = z.object({
  /** Preferred — invite by email; invitee sets up account on accept if new. */
  email: z.string().email('Invalid email').optional(),
  userId: z.string().uuid('Invalid user ID').optional(),
  /** Membership lane (owner / finance). Inferred from roleId when omitted. */
  subRole: z.enum(agencyUserSubRoleValues).optional(),
  /** Portal RBAC role to grant on accept (must belong to the agency portal). */
  roleId: z.string().uuid('Invalid role ID').optional(),
}).refine((d) => Boolean(d.email?.trim() || d.userId), {
  message: 'email or userId is required',
}).refine((d) => Boolean(d.subRole || d.roleId), {
  message: 'subRole or roleId is required',
});

export const UpdateAgencyMemberSchema = z.object({
  subRole: z.enum(agencyUserSubRoleValues).optional(),
  /*
   * ⚠️ AN ENUM, NOT A FREE STRING (0162).
   *
   * The column is `varchar(50)` with no CHECK constraint, so the database
   * accepts any word — and every access check in the codebase asks "is it
   * `active`?", which means a typo like `"Rejected"` or `"inactve"` would be
   * stored happily and then read as "not active" EVERYWHERE, silently
   * denying that person while no screen could explain why. Since 0162 the
   * four words carry real meaning apart from each other, so this is the
   * layer that has to hold the vocabulary.
   */
  status: z.enum(MEMBERSHIP_STATUSES).optional(),
});

export type CreateAgencyInput = z.infer<typeof CreateAgencySchema>;
export type UpdateAgencyInput = z.infer<typeof UpdateAgencySchema>;
export type AddAgencyMemberInput = z.infer<typeof AddAgencyMemberSchema>;
