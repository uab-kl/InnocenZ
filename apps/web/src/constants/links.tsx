import type { LucideIcon } from "lucide-react";
import {
	ArrowRightLeft,
	CreditCard,
	FileText,
	Handshake,
	LayoutDashboard,
	// LayoutGrid,
	// only used by the hidden Jobs & Special Services entry below
	ReceiptText,
	Settings,
	Shield,
	Users,
	UsersRound,
} from "lucide-react";
import { z } from "zod";
import { businessSections } from "@/constants/business-sections";
import { sidebarRbacSections } from "@/constants/rbac-sections";
import { userTypes } from "@/constants/user-types";

const ChildNavLinkSchema = z.object({
	key: z.string(),
	title: z.string(),
	label: z.string().optional(),
	icon: z.any(),
	variant: z.enum(["default", "ghost"]),
	href: z.string(),
	allowedPermission: z.array(z.string()),
});

type NavLinkSchemaType = z.infer<typeof ChildNavLinkSchema> & {
	children?: NavLinkSchemaType[];
};

const NavLinkSchema: z.ZodType<NavLinkSchemaType[]> = z.array(
	ChildNavLinkSchema.extend({
		children: z.lazy(() => NavLinkSchema.optional()),
	}),
);

export { NavLinkSchema, type NavLinkSchemaType };

export type SidebarNavItem = {
	key: string;
	title: string;
	href: string;
	icon: LucideIcon;
	allowedPermission: string[];
	badge?: number;
};

export type SidebarSection = {
	key: string;
	label: string;
	items: SidebarNavItem[];
};

/**
 * The cross-organisation operator list belonging to each user type, keyed by the
 * `userTypes` key so the spread below stays one expression. A type with no entry
 * contributes nothing.
 */
const TEAM_ENTRIES: Record<string, SidebarNavItem[] | undefined> = {
	agency: [
		{
			key: "sidebar-team-agency",
			title: "PR Agency Team",
			href: "/admin/user-management/agency-team",
			icon: UsersRound,
			allowedPermission: ["*"],
		},
	],
	outlet: [
		{
			key: "sidebar-team-outlet",
			title: "Outlet Team",
			href: "/admin/user-management/outlet-team",
			icon: UsersRound,
			allowedPermission: ["*"],
		},
	],
};

export const sidebarSections: SidebarSection[] = [
	{
		key: "overview",
		label: "Overview",
		items: [
			{
				key: "sidebar-dashboard",
				title: "Dashboard",
				href: "/admin/dashboard",
				icon: LayoutDashboard,
				allowedPermission: ["*"],
			},
			{
				key: "sidebar-settings",
				title: "Settings",
				href: "/admin/settings",
				icon: Settings,
				allowedPermission: ["*"],
			},
		],
	},
	{
		key: "operation",
		label: "Operation",
		items: [
			...sidebarRbacSections.map((section) => ({
				key: `sidebar-rbac-${section.key}`,
				title: section.title,
				href: section.href,
				icon: section.icon,
				allowedPermission: ["*"],
			})),
			/*
			 * Each organisation type, followed immediately by its own cross-org team
			 * list — flatMap rather than a second spread, so "PR Agency Team" cannot
			 * drift away from "PR Agency" the next time a user type is added.
			 *
			 * The team hrefs are SIBLINGS of the org pages (`agency-team`, not
			 * `agency/team`) and must stay that way: `isActive` and the breadcrumb
			 * resolver are both trailing-slash prefix matches over this same array,
			 * so a child path would highlight two rows and crumb as "PR Agency".
			 */
			...userTypes.flatMap((type) => [
				{
					key: `sidebar-user-${type.key}`,
					title: type.title,
					href: type.href,
					icon: type.icon,
					allowedPermission: ["*"],
				},
				...(TEAM_ENTRIES[type.key] ?? []),
			]),
		],
	},
	{
		key: "service",
		label: "Service",
		items: [
			{
				key: "sidebar-service-requests",
				title: "Plan Request",
				href: "/admin/service/requests",
				icon: Handshake,
				allowedPermission: ["*"],
			},
			{
				key: "sidebar-service-plan-changes",
				title: "Plan Change",
				href: "/admin/service/plan-changes",
				icon: ArrowRightLeft,
				allowedPermission: ["*"],
			},
			// Sits under Plan Change on purpose: the same subscription, one screen
			// later. Plan Change is what an org asked to be on; Plan Payment is
			// whether it has paid for the periods it was on.
			{
				key: "sidebar-service-plan-payment",
				title: "Plan Payment",
				href: "/admin/service/plan-payment",
				icon: CreditCard,
				allowedPermission: ["*"],
			},
			// Hidden on request (30 Jul 2026): Jobs & Special Services no longer
			// shows in the admin sidebar. The route and page code still exist —
			// uncomment this entry (and the LayoutGrid import above) to restore it.
			// {
			// 	key: "sidebar-service-other",
			// 	title: "Jobs & Special Services",
			// 	href: "/admin/service/other",
			// 	icon: LayoutGrid,
			// 	allowedPermission: ["*"],
			// },
			{
				key: "sidebar-service-payment-voucher",
				title: "Payment Vouchers",
				href: "/admin/service/payment-voucher",
				icon: ReceiptText,
				allowedPermission: ["*"],
			},
		],
	},
	{
		key: "subscription",
		label: "Subscription",
		items: businessSections.map((section) => ({
			key: `sidebar-business-${section.key}`,
			title: section.title,
			href: section.href,
			icon: section.icon,
			allowedPermission: ["*"],
		})),
	},
	{
		key: "security",
		label: "Security",
		items: [
			{
				key: "sidebar-audit-log",
				title: "Audit Log",
				href: "/admin/audit-log",
				icon: FileText,
				allowedPermission: ["*"],
			},
		],
	},
];

export const allNavigationItems: NavLinkSchemaType[] = [
	{
		key: "sidebar-dashboard",
		title: "Dashboard",
		href: "/admin/dashboard",
		icon: LayoutDashboard,
		allowedPermission: ["*"],
		variant: "default",
	},
	{
		key: "sidebar-user-management",
		title: "User",
		href: "/admin/user-management/admin",
		icon: Users,
		allowedPermission: ["*"],
		variant: "default",
		children: userTypes.map((type) => ({
			key: `sidebar-user-${type.key}`,
			title: type.title,
			href: type.href,
			icon: type.icon,
			allowedPermission: ["*"],
			variant: "default" as const,
		})),
	},
	{
		key: "sidebar-rbac",
		title: "RBAC",
		href: "/admin/rbac/role",
		icon: Shield,
		allowedPermission: ["*"],
		variant: "default",
		children: sidebarRbacSections.map((section) => ({
			key: `sidebar-rbac-${section.key}`,
			title: section.title,
			href: section.href,
			icon: section.icon,
			allowedPermission: ["*"],
			variant: "default" as const,
		})),
	},
	{
		key: "sidebar-audit-log",
		title: "Audit Log",
		href: "/admin/audit-log",
		icon: FileText,
		allowedPermission: ["*"],
		variant: "default",
	},
];
