import { z } from 'zod';

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
    roleId: z.string().min(1, 'Role is required'),
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