CREATE TABLE IF NOT EXISTS "main"."rating" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"pr_id" varchar(100) NOT NULL,
	"pr_name" varchar(255) DEFAULT '' NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"note" varchar(2000) DEFAULT '' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "rating_outlet_pr_unique" UNIQUE("outlet_id","pr_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "main"."rating" ADD CONSTRAINT "rating_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
