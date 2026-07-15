CREATE TYPE "main"."billing_cycle" AS ENUM('monthly', 'annually');--> statement-breakpoint
CREATE TYPE "main"."user_profile_id_type" AS ENUM('NRIC', 'Passport', 'Work permit');--> statement-breakpoint
CREATE TYPE "main"."user_profile_verification_status" AS ENUM('draft', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "main"."limit_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" varchar(255),
	"config_schema" jsonb,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "limit_type_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "main"."subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"billing_cycle" "main"."billing_cycle" DEFAULT 'monthly' NOT NULL,
	"status" varchar DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."user_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" varchar(100),
	"last_name" varchar(100),
	"nationality" varchar(100),
	"id_type" "main"."user_profile_id_type",
	"id_no" varchar(32),
	"dob" date,
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"postcode" varchar(20),
	"state" varchar(100),
	"country" varchar(100),
	"under_agency" boolean,
	"agency_id" varchar(64),
	"id_photo_front" varchar,
	"id_photo_back" varchar,
	"accept_privacy" boolean,
	"accept_truth" boolean,
	"accept_agency_share" boolean,
	"accept_terms" boolean,
	"verification_status" "main"."user_profile_verification_status" DEFAULT 'draft',
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar,
	"updated_by" varchar,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "main"."user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE no action ON UPDATE no action;