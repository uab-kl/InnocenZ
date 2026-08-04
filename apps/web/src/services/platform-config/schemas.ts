import { z } from "zod";

export const updatePlatformConfigSchema = z.object({
	platformFeePercent: z.coerce.number().min(0).max(100).optional(),
	geofenceRadiusMeters: z.coerce.number().int().min(0).max(100000).optional(),
	subscriptionMonthlyFee: z.coerce.number().min(0).optional(),
	duplicatePaymentWindowHours: z.coerce
		.number()
		.int()
		.min(0)
		.max(8760)
		.optional(),
	currency: z.string().min(1).max(8).optional(),
});

export type UpdatePlatformConfigInput = z.infer<
	typeof updatePlatformConfigSchema
>;
