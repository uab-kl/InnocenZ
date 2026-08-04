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

const ForgotPasswordSchema = z.object({
  email: z.string().optional(),
  phoneNum: z.string().optional(),
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
  languages: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
};

const RegisterSchema = z.object({
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