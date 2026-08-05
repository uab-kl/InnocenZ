-- OTP purpose: signup | forgot_password | change_phone.
-- Same phone can hold independent challenges per purpose.
ALTER TABLE "main"."phone_verification"
  ADD COLUMN IF NOT EXISTS "purpose" varchar(32) NOT NULL DEFAULT 'signup';
--> statement-breakpoint

COMMENT ON COLUMN "main"."phone_verification"."purpose" IS
  'Why this OTP was issued: signup | forgot_password | change_phone';
--> statement-breakpoint

DROP INDEX IF EXISTS "main"."phone_verification_phone_status_expires_idx";
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "phone_verification_phone_purpose_status_expires_idx"
  ON "main"."phone_verification" ("phone_num", "purpose", "status", "expires_at");
