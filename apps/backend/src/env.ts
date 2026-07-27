import './load-env';

import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    // Local dev + the shared convention use BACKEND_PORT (see .env.example);
    // 7777 is the standard port the web app's axios/proxy target. PORT is kept
    // optional as a fallback for container/cloud platforms that inject it.
    BACKEND_PORT: z
      .string()
      .transform((val) => Number(val))
      .pipe(z.number().min(1).max(65535))
      .default(7777),
    PORT: z
      .string()
      .transform((val) => Number(val))
      .pipe(z.number().min(1).max(65535))
      .optional(),
    NODE_ENV: z
      .string()
      .trim()
      .pipe(z.enum(['development', 'production', 'test'])),
    JWT_ALGORITHM: z
      .enum(['HS256', 'RS256', 'ES256', 'PS256', 'ES384', 'PS384', 'ES512', 'PS512'])
      .default('RS256'),
    JWT_PRIVATE_KEY: z.string(),
    JWT_PUBLIC_KEY: z.string(),
    JWT_ACCESS_TOKEN_EXPIRATION: z.string().default('15m'),
    JWT_REFRESH_TOKEN_EXPIRATION: z.string().default('7d'),
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: z
      .string()
      .transform((val) => Number(val))
      .pipe(z.number().min(1).max(65535)),
    POSTGRES_DB: z.string().min(1),
    DATABASE_URL: z.string(),
    LOGGING_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    FRONTEND_URL: z.string().url().default('http://localhost:3000'),
    // SERVER key for the Geocoding API (address -> pin on the outlet form).
    // Optional: without it the lookup endpoint returns a plain "not configured"
    // message and the operator drops the pin by hand. NOT the same key as the
    // one in apps/mobile/app.json — that one is restricted to the app bundle.
    GOOGLE_MAPS_API_KEY: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
