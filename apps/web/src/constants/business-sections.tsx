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
		key: "history",
		title: "History",
		description: "Who subscribed and when — outlets and agencies, by date.",
		href: "/admin/business/history",
		icon: History,
	},
] as const;

export type BusinessSection = (typeof businessSections)[number];
export type BusinessSectionKey = BusinessSection["key"];

export function getBusinessSectionByKey(key: string) {
	return businessSections.find((section) => section.key === key);
}
