import { LayoutGrid, Shield } from "lucide-react";

/**
 * Tabs under /admin/rbac (RBAC | Modules | Pending).
 * Sidebar only links to RBAC — see `sidebarRbacSections`.
 */
export const rbacSections = [
	{
		key: "role",
		title: "RBAC",
		description: "Portal-scoped roles and module C/R/U matrix.",
		href: "/admin/rbac/role",
		icon: Shield,
	},
	{
		key: "module",
		title: "Modules",
		description:
			"Portal-scoped feature modules (each creates C/R/U automatically).",
		href: "/admin/rbac/module",
		icon: LayoutGrid,
	},
] as const;

/** Single Operation-sidebar entry — Modules lives as a tab on the RBAC page. */
export const sidebarRbacSections = rbacSections.filter((s) => s.key === "role");

export type RbacSection = (typeof rbacSections)[number];
export type RbacSectionKey = RbacSection["key"];

export function getRbacSectionByKey(key: string) {
	return rbacSections.find((section) => section.key === key);
}
