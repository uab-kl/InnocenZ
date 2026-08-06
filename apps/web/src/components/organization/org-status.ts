import type { AgencyStatus } from "@/services/agency";
import type { OutletStatus } from "@/services/outlet";

export type OrgStatus = AgencyStatus | OutletStatus;

export type OrgStatusFilter = "all" | OrgStatus;

export const ORG_STATUSES: OrgStatus[] = [
	"pending_review",
	"active",
	"suspended",
	"inactive",
];

export const orgStatusLabels: Record<OrgStatus, string> = {
	pending_review: "Pending review",
	active: "Active",
	suspended: "Suspended",
	inactive: "Inactive",
};

export const orgStatusBadgeColors: Record<OrgStatus, string> = {
	pending_review:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	active:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	suspended:
		"border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
	inactive: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

/** True when the organisation is awaiting admin approval (login OK, portal limited). */
export function isOrgPendingReview(
	status: string | null | undefined,
): boolean {
	return (status ?? "").toLowerCase() === "pending_review";
}

/** True when the organisation is suspended (login OK, portal limited, red UI). */
export function isOrgSuspended(status: string | null | undefined): boolean {
	return (status ?? "").toLowerCase() === "suspended";
}

/**
 * Pending review or suspended — may sign in, but portal is profile/settings only.
 * Inactive orgs are refused at login (backend `suspendedOrgBlock`).
 */
export function isOrgProfileOnly(status: string | null | undefined): boolean {
	return isOrgPendingReview(status) || isOrgSuspended(status);
}

export function formatSubRole(subRole: string): string {
	return subRole
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}
