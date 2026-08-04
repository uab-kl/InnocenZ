import { z } from 'zod';
import { SIGNUP_ACCOUNT_TYPES } from '@/features/auth/signup-roles.js';

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

const RegisterSchema = z.object({
    email: z.email('Invalid email format').optional(),
    phoneNum: z.string(),
    username: z.string().min(1, 'Username is required'),
    password: z.string().min(6, 'Password must be at least 6 characters long').optional(),
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
    RegisterSchema,
    FirstTimeLoginSchema
};