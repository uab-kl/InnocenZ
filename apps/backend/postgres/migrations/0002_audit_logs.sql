-- Duplicate of 0002_far_sauron (journal idx 2). Kept in the journal (idx 9) so
-- databases that already recorded this tag stay valid. Idempotent so a fresh DB
-- that already created audit_logs in far_sauron does not fail here.
CREATE TABLE IF NOT EXISTS "main"."audit_logs" (
	"audit_log_id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "main"."audit_logs_audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid,
	"role" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"batch_id" uuid,
	"old_data" jsonb,
	"new_data" jsonb,
	"ip_address" varchar NOT NULL,
	"user_agent" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_user_idx" ON "main"."audit_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entity_idx" ON "main"."audit_logs" USING btree ("entity","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_created_idx" ON "main"."audit_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_role_idx" ON "main"."audit_logs" USING btree ("role");
