import { z } from 'zod';
import { outletStatusValues, outletUserSubRoleValues } from '@/features/outlet/outlet.model';
import { MEMBERSHIP_STATUSES } from '@/util/membership-status';

export const CreateOutletSchema = z.object({
  /**
   * The catalog plan (`main.subscription.id`) this venue is created on.
   *
   * REQUIRED, and required here rather than left to the caller's goodwill: an
   * admin-created outlet used to get no `member_subscription` row at all, which
   * is one of the ways venues came to exist that could not be billed — and
   * since the posting gate now refuses a venue with no plan, such an outlet
   * would be created unable to work. There is no UI behind this endpoint, so
   * tightening it breaks no form.
   */
  packageId: z.string().uuid('A subscription package is required'),
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
});

export const UpdateOutletSchema = CreateOutletSchema.partial().extend({
  /**
   * Re-declared WITHOUT the create-time `.default(50)`, and that is the whole
   * point of the line.
   *
   * `.partial()` makes a key optional but leaves any `.default()` underneath it
   * intact, so `UpdateOutletSchema.parse({ name })` used to answer
   * `{ name, geoFenceRadius: 50 }` — a radius the caller never sent, which the
   * controller spreads straight onto the row. A venue fenced at 999 m silently
   * went back to 50 m every time somebody saved its name, address or logo,
   * locking out staff who were standing on the site. 50 m is right for a NEW
   * outlet, which has no radius to preserve; on a PATCH there is one.
   */
  geoFenceRadius: z.number().int().min(10).max(1000).optional(),
  status: z.enum(outletStatusValues).optional(),
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

/**
 * PUBLIC team-member sign-up (owner, 10 Sep 2026).
 *
 * The web sign-up page registers ORGANISATIONS; this registers a PERSON who
 * wants to work in one. `join` is OPTIONAL on purpose — owner: *"if no, any
 * outlet or agency send link to that user via email also can invite to their
 * orgs team"*. Registering with no organisation leaves an account any org can
 * later invite; registering with one raises a request that org approves.
 *
 * ⚠️ `subRole` here is what the person ASKS FOR, never what they get. The
 * membership is written `status: 'pending'`, which every guard and scope
 * resolver already treats as no access at all, and the owner names the real
 * title when approving. Owner and Guarantor are refused for the same reason
 * they cannot be invited: nobody outside an organisation may hand themselves
 * its top lane.
 */
export const RegisterOrgMemberSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    email: z.string().trim().email('Invalid email'),
    phoneNum: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(6, 'Confirm your password'),
    join: z
      .object({
        kind: z.enum(['agency', 'outlet']),
        orgId: z.string().uuid('Choose an organisation'),
        subRole: z.string().trim().min(1).max(50),
      })
      .optional(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => !d.join || !['owner', 'guarantor'].includes(d.join.subRole), {
    message: 'Choose Finance, Director or Ops Head — Owner is set by the organisation',
    path: ['join', 'subRole'],
  });

export type RegisterOrgMemberInput = z.infer<typeof RegisterOrgMemberSchema>;

export const AcceptOrgMemberInviteSchema = z
  .object({
    /**
     * The emailed link's raw token. OPTIONAL since the profile-settings panel
     * exists: the database stores only the token's HASH, so a signed-in person
     * looking at their own pending invitations has no raw token to send and
     * names the invitation by id instead.
     *
     * `inviteId` is safe to accept on: it identifies an invitation but
     * authorises nothing. `accept` independently requires a session whose
     * email IS the invited address, so an id belonging to somebody else is
     * refused exactly as a stolen link would be.
     */
    token: z.string().trim().min(16).max(128).optional(),
    inviteId: z.string().uuid().optional(),
    /** Display name — no longer written anywhere; kept so older clients that
        still send it are not rejected. */
    name: z.string().trim().min(1).max(100).optional(),
    /** Defaults to the invited email when omitted. */
    email: z.string().trim().email('Invalid email').optional(),
    phoneNum: z
      .string()
      .trim()
      .max(32)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
    /**
     * OPTIONAL, because an invite can now be accepted two ways and only one
     * of them involves a credential.
     *
     * A stranger accepting from the emailed link is creating an account, so
     * they must choose a password. Somebody who ALREADY has an InnocenZ
     * account accepts while signed in, from their profile settings — and that
     * path must never write a password, because writing one is how an invite
     * addressed to an existing address became a way to overwrite that
     * account's credentials. The controller enforces which case is which; the
     * schema only stops requiring a password the second case has no business
     * supplying.
     */
    password: z
      .string()
      .min(6, 'Password must be at least 6 characters')
      .optional(),
    confirmPassword: z.string().min(6, 'Confirm your password').optional(),
  })
  .refine((d) => !d.password || d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((d) => Boolean(d.token || d.inviteId), {
    message: 'Which invitation? Send a token or an inviteId.',
    path: ['token'],
  });

export type SetOutletOnboardingAgencyInput = z.infer<typeof SetOutletOnboardingAgencySchema>;
export type CreateOutletInput = z.infer<typeof CreateOutletSchema>;
export type UpdateOutletInput = z.infer<typeof UpdateOutletSchema>;
export type AddOutletMemberInput = z.infer<typeof AddOutletMemberSchema>;
