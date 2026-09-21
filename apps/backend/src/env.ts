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
    /**
     * Extra browser origins allowed to call the API (comma-separated).
     * Always includes FRONTEND_URL + localhost + known staging/live hosts.
     * Example: https://preview.example.com
     */
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    /**
     * Express `trust proxy`. UNSET = today's behaviour exactly (no trust), so
     * this changes nothing until a deployment opts in.
     *
     * Set it wherever the API sits behind a reverse proxy or CDN, or the rate
     * limiter sees the PROXY's address on every request and throttles the whole
     * platform as a single caller. Prefer the narrowest value that works — the
     * hop count (`1`) or the proxy's address — over `true`, which trusts any
     * `X-Forwarded-For` a client cares to invent and hands an attacker an
     * unlimited supply of fresh rate-limit buckets.
     *
     * Accepts: `1` (hops) · `true` · `loopback` · a comma-separated IP/CIDR list.
     */
    TRUST_PROXY: z.string().optional(),
    // SERVER key for the Geocoding API (address -> pin on the outlet form).
    // Optional: without it the lookup endpoint returns a plain "not configured"
    // message and the operator drops the pin by hand. NOT the same key as the
    // one in apps/mobile/app.json — that one is restricted to the app bundle.
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    // Cloudflare R2 (S3-compatible). Optional at boot — profile-image upload
    // requires them and returns a clear 503 when missing.
    R2_ACCOUNT_ID: z.string().min(1).optional(),
    R2_BUCKET_NAME: z.string().min(1).optional(),
    R2_ENDPOINT: z.string().url().optional(),
    R2_ACCESS_KEY_ID: z.string().min(1).optional(),
    R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
    /*
     * PAYOUT PROVIDER (flow 2 — the agency pays its PRs). All optional: the
     * bank-file export path is fully functional with none of them set, and
     * `payoutProviderConfigured()` returning false is a normal state, not an
     * error.
     *
     * ⚠️ SINGLE-ACCOUNT FALLBACK ONLY. These configure ONE provider account for
     * the whole deployment. Per-agency credentials live on
     * `agency_payout_account` (migration 0143) and take precedence — because an
     * agency must pay from an account IT owns. One shared key paying many
     * agencies' PRs would make InnocenZ the payer of third-party funds, which
     * is e-money / remittance activity under FSA 2013 and MSBA 2011.
     *
     * ⚠️ Setting PAYOUT_PROVIDER to a name with no registered adapter THROWS on
     * use, deliberately — see payout-provider.ts. Register and sandbox-test an
     * adapter before setting these anywhere.
     */
    /**
     * AUTOMATIC SUBSCRIPTION CHARGES (auto-charge.job.ts). UNSET = off.
     *
     * Every backend process starts every job, and developers' backends share the
     * innocenz-test database — so charging a saved card must be switched on in
     * exactly ONE process (production's), never by merely registering a gateway.
     */
    AUTO_CHARGE_ENABLED: z.enum(['true', 'false']).optional(),
    PAYOUT_PROVIDER: z.string().min(1).optional(),
    PAYOUT_API_KEY: z.string().min(1).optional(),
    PAYOUT_API_SECRET: z.string().min(1).optional(),
    PAYOUT_ACCOUNT_ID: z.string().min(1).optional(),
    // Brevo SMTP (optional at boot — sendEmail returns a clear error when missing).
    // Prefer BREVO_* names; legacy SMTP_* still accepted via runtimeEnv mapping.
    SENDER_EMAIL: z.string().email().optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    BREVO_SMTP_HOST: z.string().min(1).optional(),
    BREVO_SMTP_USER: z.string().min(1).optional(),
    BREVO_SMTP_KEY: z.string().min(1).optional(),
    BREVO_SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    /**
     * SMS sender for account codes (features/sms). UNSET = no SMS provider:
     * outside production the SMS text is logged, in production the SMS is
     * skipped with a warning and the code still goes by WhatsApp and email.
     *
     * ⚠️ Naming a provider with no registered adapter does NOT fall back to
     * logging — that SMS reports `failed`, so a typo is visible, never silent.
     */
    SMS_PROVIDER: z.string().min(1).optional(),
    /**
     * WHICH CHANNELS LOG THE CODE INSTEAD OF SENDING IT. Per channel since
     * 21 Sep 2026 — it used to be all or nothing.
     *
     *   unset / `false`  nothing held back; every configured channel sends
     *   `true`           WhatsApp, SMS and email all log instead
     *   `sms`            only SMS logs — WhatsApp and email really send
     *   `sms,email`      a comma list, in any order
     *
     * Honoured ONLY when NODE_ENV !== 'production' — a production process
     * ignores it, so it can never switch real delivery off for a customer.
     * Exists because developers share the innocenz-test database and real
     * accounts: testing a code flow should not message a real person.
     *
     * ⚠️ Not an enum, because the value is a LIST. An unrecognised word is
     * ignored by `logOnlyChannels()` rather than read as "hold everything" — a
     * typo here must never silently stop codes from reaching people.
     */
    OTP_DELIVERY_LOG_ONLY: z.string().optional(),
  },
  runtimeEnv: {
    ...process.env,
    // Map legacy SMTP_* → BREVO_* so older .env.example keys still work.
    BREVO_SMTP_HOST: process.env.BREVO_SMTP_HOST || process.env.SMTP_HOST,
    BREVO_SMTP_USER: process.env.BREVO_SMTP_USER || process.env.SMTP_USER,
    BREVO_SMTP_KEY:
      process.env.BREVO_SMTP_KEY ||
      process.env.SMTP_KEY ||
      process.env.SMTP_PASSWORD,
    BREVO_SMTP_PORT: process.env.BREVO_SMTP_PORT || process.env.SMTP_PORT || '587',
  },
  emptyStringAsUndefined: true,
});
