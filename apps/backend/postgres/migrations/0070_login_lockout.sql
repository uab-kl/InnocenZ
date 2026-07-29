-- Failed-login lockout. There is no rate limiting anywhere in this backend, so
-- until now a password could be guessed at whatever rate the network allowed.
--
-- Counters live on `user` rather than in a new table: the check happens on every
-- login, and a join for two integers on the hottest auth path is not worth the
-- normalisation. A separate attempt LOG would be a different feature — useful
-- for forensics, not needed to stop guessing.
--
-- NOTE: admin_mfa is deliberately NOT altered. It already holds a confirmed
-- enrolment whose secret is bound to someone's authenticator app; reshaping or
-- re-seeding it would lock that person out of an admin account. The model added
-- alongside this migration maps the table exactly as it stands.
ALTER TABLE "main"."user" ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "main"."user" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
