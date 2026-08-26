import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * Display labels for the two stored values the plan catalogue renders in more
 * than one place: a plan's audience (`subscriptionType`) and its billing cycle.
 *
 * Both take the RAW stored value and fall through to it when unrecognised, so
 * a cycle or an audience added server-side keeps rendering instead of blanking
 * a cell. Display only — every `<SelectItem value>`, filter value and request
 * body still carries the stored code.
 *
 * The plan NAME is deliberately absent. It is a record the admin types and
 * renames on this very screen, and stays English in both locales by the
 * owner's standing decision.
 */

const AUDIENCE: Record<string, keyof PortalTranslations["adminSubscription"]> =
	{
		agency: "audienceAgency",
		outlet: "audienceOutlet",
	};

export function planAudienceLabel(
	audience: string,
	t: PortalTranslations,
): string {
	const key = AUDIENCE[audience];
	return key ? t.adminSubscription[key] : audience;
}

/**
 * Keyed on the stored cycle, resolved against the `subscription` section so the
 * admin catalogue and the agency's own billing screen name a cycle the same
 * way. The coverage PERIOD in the plan editor is a different fact — it stores
 * `day`/`week`/`month`/`year` — and has its own map there.
 */
const BILLING_CYCLE: Record<string, keyof PortalTranslations["subscription"]> =
	{
		weekly: "billedWeekly",
		monthly: "billedMonthly",
		annually: "billedAnnually",
	};

export function billingCycleLabel(
	cycle: string,
	t: PortalTranslations,
): string {
	const key = BILLING_CYCLE[cycle];
	return key ? t.subscription[key] : cycle;
}
