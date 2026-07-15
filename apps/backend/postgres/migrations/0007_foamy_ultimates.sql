CREATE TYPE "main"."agency_member_sub_role" AS ENUM('owner', 'finance');--> statement-breakpoint
CREATE TYPE "main"."agency_status" AS ENUM('pending_review', 'active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TYPE "main"."outlet_member_sub_role" AS ENUM('owner', 'finance', 'operations_head');--> statement-breakpoint
CREATE TYPE "main"."outlet_status" AS ENUM('pending_review', 'active', 'inactive', 'suspended');--> statement-breakpoint
CREATE TABLE "main"."agency_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agency_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sub_role" "main"."agency_member_sub_role" NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."agency" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"agency_code" varchar(6) NOT NULL,
	"ssm_no" varchar(100) NOT NULL,
	"contact_name" varchar(100),
	"contact_email" varchar(255),
	"contact_phone" varchar(50),
	"status" "main"."agency_status" DEFAULT 'pending_review' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "agency_agency_code_unique" UNIQUE("agency_code")
);
--> statement-breakpoint
CREATE TABLE "main"."commission_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"agency_id" uuid NOT NULL,
	"item_type" varchar(100) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"commission_rate" numeric(5, 4) NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."outlet_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"outlet_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sub_role" "main"."outlet_member_sub_role" NOT NULL,
	"status" varchar(50) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."outlet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"address_line_1" varchar(255),
	"address_line_2" varchar(255),
	"postcode" varchar(20),
	"state" varchar(100),
	"country" varchar(100) DEFAULT 'Malaysia',
	"business_license" varchar(100),
	"ssm_no" varchar(100),
	"lat" numeric(10, 8),
	"lng" numeric(11, 8),
	"geo_fence_radius" integer DEFAULT 50,
	"status" "main"."outlet_status" DEFAULT 'pending_review' NOT NULL,
	"onboarded_by_agency_id" uuid,
	"subscription_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL
);
--> statement-breakpoint
CREATE TABLE "main"."subscription_feature" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"role_id" uuid,
	"limit_type_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "subscription_feature_unique" UNIQUE("subscription_id","role_id","limit_type_id")
);
--> statement-breakpoint
CREATE TABLE "main"."subscription_role" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"updated_by" varchar NOT NULL,
	CONSTRAINT "subscription_role_subscription_id_role_id_unique" UNIQUE("subscription_id","role_id")
);
--> statement-breakpoint
ALTER TABLE "main"."agency_member" ADD CONSTRAINT "agency_member_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."agency_member" ADD CONSTRAINT "agency_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."commission_config" ADD CONSTRAINT "commission_config_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."commission_config" ADD CONSTRAINT "commission_config_agency_id_agency_id_fk" FOREIGN KEY ("agency_id") REFERENCES "main"."agency"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlet_member" ADD CONSTRAINT "outlet_member_outlet_id_outlet_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "main"."outlet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlet_member" ADD CONSTRAINT "outlet_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "main"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlet" ADD CONSTRAINT "outlet_onboarded_by_agency_id_agency_id_fk" FOREIGN KEY ("onboarded_by_agency_id") REFERENCES "main"."agency"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."outlet" ADD CONSTRAINT "outlet_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "main"."subscription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."subscription_feature" ADD CONSTRAINT "subscription_feature_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "main"."subscription"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."subscription_feature" ADD CONSTRAINT "subscription_feature_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "main"."role"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."subscription_feature" ADD CONSTRAINT "subscription_feature_limit_type_id_limit_type_id_fk" FOREIGN KEY ("limit_type_id") REFERENCES "main"."limit_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."subscription_role" ADD CONSTRAINT "subscription_role_subscription_id_subscription_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "main"."subscription"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main"."subscription_role" ADD CONSTRAINT "subscription_role_role_id_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "main"."role"("id") ON DELETE cascade ON UPDATE no action;