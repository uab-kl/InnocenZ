import type { SignupAccountType } from "@/constants/signup-types";
import { getPublicClient } from "@/lib/axios-v1";

export interface SignupPackageOption {
	id: string;
	name: string;
	capacity: string;
	detail: string;
	priceLabel: string;
	period: string;
}

type SignupPackageApi = {
	id: string;
	name: string;
	price: string;
	billingCycle: "weekly" | "monthly" | "annually";
	coverage: string | null;
	subscriptionType: "agency" | "outlet";
};

function periodLabel(cycle: SignupPackageApi["billingCycle"]): string {
	if (cycle === "weekly") return "/week";
	if (cycle === "annually") return "/year";
	return "/month";
}

function toOption(plan: SignupPackageApi): SignupPackageOption {
	const price = Number(plan.price);
	const priceLabel = Number.isFinite(price)
		? `RM ${price.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
		: `RM ${plan.price}`;
	const period = periodLabel(plan.billingCycle);
	const capacity = plan.coverage?.trim() || plan.billingCycle;
	return {
		id: plan.id,
		name: plan.name,
		capacity,
		detail: `${capacity} · ${priceLabel}${period}`,
		priceLabel,
		period,
	};
}

/** Active plans from `main.subscription` for Package enrollment. */
export async function fetchSignupPackages(
	accountType: SignupAccountType,
): Promise<SignupPackageOption[]> {
	const client = getPublicClient();
	const response = await client.get<{
		success: boolean;
		data: SignupPackageApi[];
	}>("/auth/signup-packages", {
		params: { accountType },
	});
	const rows = response.data.data ?? [];
	return rows.map(toOption);
}
