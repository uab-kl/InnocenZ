import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display copy for a subscription plan's capacity band and one-line
 * description.
 *
 * Both plan catalogues (`AGENCY_SUBSCRIPTION_PLANS`, `OUTLET_SUBSCRIPTION_PLANS`)
 * carry `capacityLabel` and `description` as English prose on the record, and
 * both plan-card grids rendered them straight through — so the cards stayed
 * English in a Chinese session even though everything around them switched.
 *
 * Keyed on the plan `id` rather than the label: the id is the stable identity,
 * whereas the label is the plan NAME, which stays English by the owner's
 * instruction and is deliberately absent from the dictionary.
 *
 * `fallback` is the record's own English string. A plan id this map has never
 * seen — a catalogue entry added later — still reaches the screen in English
 * rather than blanking a card, the same contract as `portalRoleLabel`.
 *
 * Display only: nothing here is stored, compared or sent.
 */

type PlanOrg = "agency" | "outlet";

const CAPACITY: Record<
	PlanOrg,
	Record<string, keyof PortalTranslations["plans"]>
> = {
	agency: {
		starter: "agencyStarterCapacity",
		plus: "agencyPlusCapacity",
		growth: "agencyGrowthCapacity",
		enterprise: "agencyEnterpriseCapacity",
		scale: "agencyScaleCapacity",
		renego: "agencyRenegoCapacity",
	},
	outlet: {
		starter: "outletStarterCapacity",
		plus: "outletPlusCapacity",
		pro: "outletProCapacity",
		enterprise: "outletEnterpriseCapacity",
		scale: "outletScaleCapacity",
		premier: "outletPremierCapacity",
	},
};

const DESCRIPTION: Record<
	PlanOrg,
	Record<string, keyof PortalTranslations["plans"]>
> = {
	agency: {
		starter: "agencyStarterDesc",
		plus: "agencyPlusDesc",
		growth: "agencyGrowthDesc",
		enterprise: "agencyEnterpriseDesc",
		scale: "agencyScaleDesc",
		renego: "agencyRenegoDesc",
	},
	outlet: {
		starter: "outletStarterDesc",
		plus: "outletPlusDesc",
		pro: "outletProDesc",
		enterprise: "outletEnterpriseDesc",
		scale: "outletScaleDesc",
		premier: "outletPremierDesc",
	},
};

export function planCapacityLabel(
	org: PlanOrg,
	id: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const key = CAPACITY[org][id];
	return key ? t.plans[key] : fallback;
}

export function planDescription(
	org: PlanOrg,
	id: string,
	fallback: string,
	t: PortalTranslations,
): string {
	const key = DESCRIPTION[org][id];
	return key ? t.plans[key] : fallback;
}

/**
 * Display copy for a subscription ADD-ON, same contract as the plans above.
 *
 * Takes the catalogue record as its own fallback so an add-on this map has
 * never seen renders its own English text. Resolving `pos_integration` inline
 * at the call site would have been shorter, but the card is generic — it is
 * rendered from `OUTLET_SUBSCRIPTION_ADDONS.map` — so a second add-on would
 * then have shown POS wording under its own name.
 */
export function addonCopy(
	id: string,
	fallback: {
		label: string;
		priceLabel: string;
		capacityLabel: string;
		description: string;
	},
	t: PortalTranslations,
): {
	label: string;
	priceLabel: string;
	capacityLabel: string;
	description: string;
} {
	if (id !== "pos_integration") return fallback;
	return {
		label: t.plans.posAddon,
		priceLabel: t.plans.posAddonPrice,
		capacityLabel: t.plans.posAddonCapacity,
		description: t.plans.posAddonDesc,
	};
}
