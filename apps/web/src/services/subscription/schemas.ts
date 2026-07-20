import { z } from "zod";

export const billingCycleValues = ["weekly", "monthly", "annually"] as const;

export const SubscriptionSchema = z.object({
	name: z.string().min(1, "Name is required").max(255),
	price: z.coerce.number().nonnegative("Price must be 0 or more"),
	billingCycle: z.enum(billingCycleValues).default("monthly"),
	status: z.enum(["active", "inactive"]).default("active"),
	coverage: z.string().max(100).optional().nullable(),
});

export type CreateSubscriptionInput = z.infer<typeof SubscriptionSchema>;
export type UpdateSubscriptionInput = Partial<CreateSubscriptionInput>;
