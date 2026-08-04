-- WhatsApp OTP proof for PR phone sign-up.
--
-- An older stub table already exists on the shared DB with a different shape
-- (`code` plaintext + `used` boolean). The live model stores only `code_hash`
-- and a status machine (pending → verified → consumed / expired). OTP rows are
-- short-lived, so drop + recreate is safe and avoids half-migrated columns.
DROP TABLE IF EXISTS "main"."phone_verification";
--> statement-breakpoint

CREATE TABLE "main"."phone_verification" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "phone_num" varchar NOT NULL,
  "code_hash" varchar(64) NOT NULL,
  "channel" varchar(20) NOT NULL DEFAULT 'whatsapp',
  "status" varchar(20) NOT NULL DEFAULT 'pending',
  "attempts" integer NOT NULL DEFAULT 0,
  "expires_at" timestamptz NOT NULL,
  "verified_at" timestamptz,
  "wa_message_id" varchar(128),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "created_by" varchar NOT NULL,
  "updated_by" varchar NOT NULL
);
--> statement-breakpoint

COMMENT ON TABLE "main"."phone_verification" IS
  'Short-lived WhatsApp OTP proof for PR sign-up. Stores code_hash only, never the plaintext code.';
--> statement-breakpoint

CREATE INDEX "phone_verification_phone_status_expires_idx"
  ON "main"."phone_verification" ("phone_num", "status", "expires_at");
