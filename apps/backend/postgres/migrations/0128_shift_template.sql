-- 0128 — event templates: the picker step BEFORE the Post Job form.
--
-- An outlet keeps a gallery of reusable event cards — "Friday Lounge",
-- "Chinese New Year", "Merdeka Celebration" — each carrying a cover picture,
-- the event kind (normal/special), the special sub-type, and the form
-- defaults (slot, headcount, languages, dress code). Picking a card
-- pre-fills the composer; the outlet edits and posts as before.
--
-- Why a NEW table (checked against the database rules):
--   * `outlet_workspace` is UNIQUE per outlet — one row, no gallery.
--   * `shift` requires an agency and a date NOT NULL, and its rows are
--     counted by the plan-limit and calendar queries — a template row there
--     would be billed and rendered as a night that never existed.
--
-- One fact, one place: the cover picture lives HERE. A shift does not copy
-- it — it records WHICH template it was posted from (`shift.template_id`,
-- SET NULL on template delete so history survives gallery housekeeping),
-- and readers join. This also finally PERSISTS the special sub-type
-- (vip / launch / private_table / brand_activation / corporate / other),
-- which until now died in browser state — only normal/special reached disk.
CREATE TABLE "main"."shift_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"event_kind" "main"."shift_event_kind" DEFAULT 'normal' NOT NULL,
	"special_event_type" varchar(30),
	"custom_special_event_name" varchar(120),
	"cover_image" varchar,
	"slot" varchar(100),
	"quantity" integer,
	"languages" varchar(255),
	"dress_code" varchar(60),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "shift_template_outlet_id_name_unique" UNIQUE("outlet_id","name")
);
--> statement-breakpoint
ALTER TABLE "main"."shift_template" ADD CONSTRAINT "shift_template_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "shift_template_outlet_id_idx" ON "main"."shift_template" ("outlet_id");
--> statement-breakpoint
ALTER TABLE "main"."shift" ADD COLUMN "template_id" uuid;
--> statement-breakpoint
ALTER TABLE "main"."shift" ADD CONSTRAINT "shift_template_id_shift_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "main"."shift_template"("id") ON DELETE set null ON UPDATE no action;
