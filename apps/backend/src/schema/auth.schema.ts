import { z } from 'zod';
import { SIGNUP_ACCOUNT_TYPES } from '@/features/auth/signup-roles.js';
import { idTypeValues } from '@/features/user/user-profile/user-profile.model.js';

const LoginSchema = z
  .object({
    email: z.email('Invalid email format').optional(),
    phoneNum: z.string().min(1).optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .refine((data) => Boolean(data.email || data.phoneNum), {
    message: 'Please provide an email or phone number',
    path: ['email'],
  });

/**
 * Web portal (outlet + agency) forgot-password. Email is REQUIRED and must
 * parse — the old `z.string().optional()` let `{}` through, and the handler
 * then looked the account up by the empty string.
 *
 * PRs reset by WhatsApp OTP instead — see ResetPasswordWithOtpSchema.
 */
const ForgotPasswordSchema = z.object({
  email: z.email('Enter a valid email address'),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

/** WhatsApp OTP password reset (PR mobile) — after POST /auth/otp/verify purpose=forgot_password. */
const ResetPasswordWithOtpSchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  verificationId: z.string().uuid('Phone verification is required'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
});

/** Signed-in password change — current password, no OTP. */
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters long'),
});

/** Signed-in phone change — OTP on the NEW number (purpose=change_phone). */
const ChangePhoneWithOtpSchema = z.object({
  phoneNum: z.string().min(8, 'Phone number is required'),
  verificationId: z.string().uuid('Phone verification is required'),
});

/** Comcard size integers — coerce so JSON numbers or digit strings both work. */
const comcardCm = z.coerce.number().int().min(40).max(250);
const comcardKg = z.coerce.number().int().min(25).max(250);

/** Optional `user_profile` fields — mobile PR signup fills these on register. */
const registerProfileFields = {
  fullName: z.string().trim().min(1).max(255).optional(),
  nationality: z.string().trim().min(1).max(100).optional(),
  idType: z.enum(idTypeValues).optional(),
  idNo: z.string().trim().min(1).max(32).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD').optional(),
  addressLine1: z.string().trim().min(1).max(255).optional(),
  addressLine2: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((value) => (value === '' ? undefined : value)),
  city: z.string().trim().min(1).max(100).optional(),
  postcode: z.string().trim().min(1).max(20).optional(),
  state: z.string().trim().min(1).max(100).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  comcardHeightCm: comcardCm.optional(),
  comcardWeightKg: comcardKg.optional(),
  /** Bust / waist / hip — standard comcard 3-size. */
  comcardBustCm: comcardCm.optional(),
  comcardWaistCm: comcardCm.optional(),
  comcardHipCm: comcardCm.optional(),
  /** Spoken / preferred languages → user_profile.languages. */
  languages: z.preprocess((value) => {
    // Multipart register can send a JSON-stringified array.
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      try {
        return JSON.parse(trimmed) as unknown;
      } catch {
        return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return value;
  }, z.array(z.string().trim().min(1).max(50)).max(20).optional()),
};

/**
 * Web outlet/agency signup fields. Zod used to strip these (unknown keys), so
 * register created a user + role and never an organisation row.
 *
 * Company address uses the same field names as PR profile address, but they are
 * written to `agency` / `outlet` — not `user_profile`. Portal owners do not
 * need a home address on signup.
 */
const registerOrgFields = {
  companyName: z.string().trim().min(1).max(150).optional(),
  /** Optional legacy SSM number — empty string cleared to undefined. */
  companyRegistrationOld: z
    .string()
    .trim()
    .max(50)
    .optional()
    .transform((value) => (value ? value : undefined)),
  companyRegistrationNew: z.string().trim().min(1).max(50).optional(),
  companyAddress: z.string().trim().min(1).max(500).optional(),
  personInCharge: z.string().trim().min(1).max(100).optional(),
  /** PIC contact email (may differ from login `email`). */
  contactEmail: z.email('Invalid contact email').optional(),
  /** Landing-page package id (e.g. `outlet-basic`) — not a catalog UUID yet. */
  /** Catalog plan id (`main.subscription.id`) chosen at Package enrollment. */
  packageId: z.string().uuid().optional(),
  // `onboardedByAgencyId` was here until the multi-agency cutover (0123/0124).
  // A venue now works with SEVERAL agencies, each one approved by that agency,
  // so naming a single one at sign-up asked the wrong question — and answered
  // it with a value no agency had agreed to. The venue picks its agencies in
  // outlet Settings and each agency accepts or declines; sign-up no longer
  // touches `outlet.onboarded_by_agency_id` at all.
  ackPersonalInfo: z.boolean().optional(),
  ackDeclarationOfTruth: z.boolean().optional(),
  ackInformationSharing: z.boolean().optional(),
  acceptTerms: z.boolean().optional(),
  logoFileName: z.string().trim().min(1).max(255).optional(),
  logoContentType: z.string().trim().min(1).max(100).optional(),
  logoBase64: z.string().min(1).optional(),
};

const RegisterSchema = z
  .object({
    email: z.email('Invalid email format').optional(),
    phoneNum: z.string(),
    username: z.string().min(1, 'Username is required'),
    // Empty string is not "optional" in Zod — treat "" as missing so public
    // clients that omit a password don't get a misleading min-length error.
    password: z
      .union([
        z.string().min(6, 'Password must be at least 6 characters long'),
        z.literal(''),
      ])
      .optional()
      .transform((value) => (value === '' ? undefined : value)),
    /**
     * What kind of account is signing up. This is what a PUBLIC caller gets to
     * choose; the server turns it into a role (features/auth/signup-roles.ts).
     * 'admin' is not one of the options.
     */
    accountType: z.enum(SIGNUP_ACCOUNT_TYPES).optional(),
    /**
     * Honoured ONLY for an authenticated admin creating another account. A
     * public caller sending this is ignored — it used to be the whole hole:
     * required, unvalidated, and passed straight to createUserWithRole.
     */
    roleId: z.string().min(1).optional(),
    /** Receipt from POST /auth/otp/verify — required for public PR sign-up. */
    verificationId: z.string().uuid().optional(),
    /**
     * Optional agency the PR is joining / was referred by. Public PR sign-up
     * writes `agency_pr` keyed by user_id (pending until the agency approves).
     */
    agencyId: z.string().uuid().optional(),
    ...registerProfileFields,
    ...registerOrgFields,
  })
  .superRefine((data, ctx) => {
    if (data.idType === 'NRIC') {
      const nationality = data.nationality?.trim().toLowerCase() ?? '';
      if (nationality !== 'malaysian') {
        ctx.addIssue({
          code: 'custom',
          message: 'NRIC is only for Malaysian nationality',
          path: ['idType'],
        });
      }
    }
    if (data.accountType !== 'agency' && data.accountType !== 'outlet') return;
    const required: Array<[keyof typeof data, string]> = [
      ['companyName', 'Company name is required'],
      ['companyRegistrationNew', 'Company registration (new) is required'],
      ['personInCharge', 'Person in charge is required'],
      ['password', 'Password must be at least 6 characters long'],
    ];
    for (const [key, message] of required) {
      if (!data[key]) {
        ctx.addIssue({ code: 'custom', message, path: [key] });
      }
    }
    // The outlet-must-name-an-agency rule lived here. It existed because
    // `ShiftController.create` used to read `onboarded_by_agency_id`, so a venue
    // without one was inert. That is no longer true: posting resolves the
    // agencies from APPROVED `agency_outlet` links, and a venue with none gets a
    // clear refusal telling it to link one in Settings. Requiring a choice at
    // sign-up would now record a partnership the agency has not agreed to.
    if (
      data.ackPersonalInfo !== true ||
      data.ackDeclarationOfTruth !== true ||
      data.ackInformationSharing !== true ||
      data.acceptTerms !== true
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'All declarations and terms must be accepted',
        path: ['acceptTerms'],
      });
    }
  });
const FirstTimeLoginSchema = z.object({
    email: z.email('Invalid email format').optional(),
    phoneNum: z.string(),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    token: z.string().min(1, 'Token is required'),
});

export {
    LoginSchema,
    ForgotPasswordSchema,
    ResetPasswordSchema,
    ResetPasswordWithOtpSchema,
    ChangePasswordSchema,
    ChangePhoneWithOtpSchema,
    RegisterSchema,
    FirstTimeLoginSchema,
};