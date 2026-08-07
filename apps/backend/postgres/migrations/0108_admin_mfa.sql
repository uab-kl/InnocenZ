-- 0108 — admin_mfa (TOTP enrolment).
--
-- The table lived only on the old shared DB (never CREATEd in this journal).
-- Login always calls AdminMfaRepository.getByUserId after a correct password;
-- on a fresh migrate that query raised "relation admin_mfa does not exist" → 500.
-- Shape matches admin-mfa.model.ts (no created_by/updated_by — credential table).

CREATE TABLE IF NOT EXISTS "main"."admin_mfa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"secret" varchar NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "main"."admin_mfa"
		ADD CONSTRAINT "admin_mfa_user_id_user_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "admin_mfa_user_id_unique" ON "main"."admin_mfa" USING btree ("user_id");
