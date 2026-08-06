import { LayoutGrid, Shield } from "lucide-react";

export const rbacSections = [
	{
		key: "role",
		title: "Roles",
		description: "Portal-scoped roles and module C/R/U matrix.",
		href: "/admin/rbac/role",
		icon: Shield,
	},
	{
		key: "module",
		title: "Modules",
		description: "Portal-scoped feature modules (each creates C/R/U automatically).",
		href: "/admin/rbac/module",
		icon: LayoutGrid,
	},
] as const;

export type RbacSection = (typeof rbacSections)[number];
export type RbacSectionKey = RbacSection["key"];

export function getRbacSectionByKey(key: string) {
	return rbacSections.find((section) => section.key === key);
}
