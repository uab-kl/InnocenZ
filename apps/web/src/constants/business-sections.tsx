import { CreditCard, History } from "lucide-react";

export const businessSections = [
	{
		key: "plan",
		title: "Plan",
		description: "Manage agency plans, limit types, and billing.",
		href: "/admin/business/plan",
		icon: CreditCard,
	},
	{
		// The route path stays /business/history (deep links and the route tree),
		// but the page shows the CURRENT plan per subscriber, so it is named for
		// what it shows.
		key: "history",
		title: "Current Plan",
		description: "The plan each outlet and agency is on now.",
		href: "/admin/business/history",
		icon: History,
	},
] as const;

export type BusinessSection = (typeof businessSections)[number];
export type BusinessSectionKey = BusinessSection["key"];

export function getBusinessSectionByKey(key: string) {
	return businessSections.find((section) => section.key === key);
}
