-- 0167_shift_special_type_and_event_prices
--
-- POST JOB COLLECTED TWO THINGS IT HAD NOWHERE TO STORE (28 Sep 2026 audit).
-- Owner OK'd this migration on 29 Sep 2026: "also handle these migrations".
--
-- 1. The special SUB-TYPE (VIP night, launch, private table, …) and the custom
--    name typed for "Other". `shift` had no column for either, so a special
--    shift posted from a BLANK composer came back a bare "Special" with an
--    empty label. A shift posted from an event card already recovers the
--    card's type through `template_id` (the 29 Sep read-side join); a blank
--    post has no card, so the fact needs its own home on the shift. Spelled
--    exactly as on `shift_template` (0128): varchar(30) / varchar(120), values
--    from `specialEventTypeValues`.
--
-- 2. The EVENT'S OWN PRICE LIST. A special event may charge different drink
--    and service prices from the venue's everyday list, and Post Job has an
--    editor for exactly that — whose output was dropped on post.
--
--    WHY A NEW TABLE, not `outlet_drink_menu` with a shift column: that table
--    IS the everyday list. Every reader takes it by outlet (Workspace, Post
--    Job, the voucher line edit's name check, the drinks/services split) and
--    the Workspace save REPLACES its rows, so event rows there would either
--    leak into the everyday list or be wiped by the next Workspace save. This
--    mirrors `shift_pay_tier`, the per-shift twin of `outlet_tier_rate`: a
--    posted event's prices must not move when the everyday list is edited
--    later, so each row carries its own name and price. The price FOR THIS
--    EVENT is a different fact from the everyday price, not a copy of it.
--
-- No FK on the `_by` audit columns: they hold actor strings, as on every
-- sibling (see 0130). Hand-written and idempotent because `drizzle-kit
-- generate` cannot run in this repo (see 0131 / migration-journal-corrupt).

ALTER TABLE "main"."shift" ADD COLUMN IF NOT EXISTS "special_event_type" varchar(30);
--> statement-breakpoint

ALTER TABLE "main"."shift" ADD COLUMN IF NOT EXISTS "custom_special_event_name" varchar(120);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "main"."shift_drink_menu" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL REFERENCES "main"."shift"("id") ON DELETE CASCADE,
  "slug" varchar(100) NOT NULL,
  "name" varchar(255) NOT NULL,
  "price_rm" numeric(12, 2) DEFAULT '0' NOT NULL,
  "category" varchar(20) DEFAULT 'service' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" varchar DEFAULT 'system' NOT NULL,
  "updated_by" varchar DEFAULT 'system' NOT NULL
);
--> statement-breakpoint

-- The one read: "this shift's prices" (the shift sheet, the list fan-out).
CREATE INDEX IF NOT EXISTS "shift_drink_menu_shift_idx"
  ON "main"."shift_drink_menu" ("shift_id");
