import type { SignupAccountType } from "@/constants/signup-types";
import type { LandingLocale } from "@/lib/landing-i18n/translations";
import {
	AGENCY_TIER_PRICES,
	OUTLET_TIER_PRICES,
	translations,
} from "@/lib/landing-i18n/translations";

export interface SignupPackageOption {
	id: string;
	name: string;
	capacity: string;
	detail: string;
	priceLabel: string;
	period: string;
}

function buildPackageOptions(
	accountType: SignupAccountType,
	locale: LandingLocale,
): SignupPackageOption[] {
	const pricing = translations[locale].pricing;
	const tiers =
		accountType === "outlet" ? pricing.outletTiers : pricing.agencyTiers;
	const prices =
		accountType === "outlet" ? OUTLET_TIER_PRICES : AGENCY_TIER_PRICES;

	return tiers.map((tier, index) => {
		const customPrice = "price" in tier ? tier.price : undefined;
		const price = customPrice ?? prices[index as keyof typeof prices];

		return {
			id: `${accountType}-${tier.name.toLowerCase().replace(/\s+/g, "-")}`,
			name: tier.name,
			capacity: tier.capacity,
			detail: tier.detail,
			priceLabel: customPrice ? price : `RM ${price}`,
			period: tier.period,
		};
	});
}

export function getSignupPackages(
	accountType: SignupAccountType,
	locale: LandingLocale = "en",
): SignupPackageOption[] {
	return buildPackageOptions(accountType, locale);
}
