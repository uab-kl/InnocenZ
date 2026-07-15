ALTER TABLE "main"."special_service" ALTER COLUMN "category" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "main"."special_service_category" RENAME TO "special_service_category_old";--> statement-breakpoint
CREATE TYPE "main"."special_service_category" AS ENUM('transportation', 'delivery', 'wardrobe', 'makeup', 'vip_escort', 'uniform', 'emergency_cover', 'training', 'others');--> statement-breakpoint
ALTER TABLE "main"."special_service" ALTER COLUMN "category" TYPE "main"."special_service_category" USING ('others'::"main"."special_service_category");--> statement-breakpoint
ALTER TABLE "main"."special_service" ALTER COLUMN "category" SET DEFAULT 'others';--> statement-breakpoint
DROP TYPE "main"."special_service_category_old";
