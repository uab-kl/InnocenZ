CREATE TYPE "main"."admin_request_status" AS ENUM('pending', 'contacted', 'resolved');--> statement-breakpoint
CREATE TYPE "main"."admin_request_type" AS ENUM('pos_integration_quote', 'plan_change', 'contact', 'other');--> statement-breakpoint
CREATE TYPE "main"."member_subscription_status" AS ENUM('active', 'cancelled', 'expired', 'past_due');--> statement-breakpoint
CREATE TYPE "main"."subscriber_type" AS ENUM('outlet', 'agency');--> statement-breakpoint
CREATE TYPE "main"."outlet_transaction_status" AS ENUM('completed', 'pending', 'refunded', 'cancelled');--> statement-breakpoint
CREATE TABLE "main"."admin_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "main"."admin_request_type" DEFAULT 'contact' NOT NULL,
	"subscriber_type" "main"."subscriber_type",
	"subscriber_id" uuid,
	"subscriber_name" varchar(255) NOT NULL,
	"contact_name" varchar(100),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"current_plan_id" uuid,
	"message" text,
	"status" "main"."admin_request_status" DEFAULT 'pending' NOT NULL,
	"quoted_amount" numeric(12, 2),
	"contacted_at" timestamp with time zone,
	"contacted_by" varchar,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."member_subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_type" "main"."subscriber_type" NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"subscriber_name" varchar(255) NOT NULL,
	"subscription_id" uuid,
	"plan_name" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"billing_cycle" "main"."billing_cycle" DEFAULT 'monthly' NOT NULL,
	"currency" varchar(8) DEFAULT 'MYR' NOT NULL,
	"status" "main"."member_subscription_status" DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."outlet_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"outlet_name" varchar(255) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"currency" varchar(8) DEFAULT 'MYR' NOT NULL,
	"type" varchar(50) DEFAULT 'payment_voucher' NOT NULL,
	"status" "main"."outlet_transaction_status" DEFAULT 'completed' NOT NULL,
	"reference" varchar(100),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
ALTER TABLE "main"."admin_request" ADD CONSTRAINT "admin_request_current_plan_id_subscription_id_fk" FOREIGN KEY ("current_plan_id") REFERENCES "main"."subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."member_subscription" ADD CONSTRAINT "member_subscription_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "main"."subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlet_transaction" ADD CONSTRAINT "outlet_transaction_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;