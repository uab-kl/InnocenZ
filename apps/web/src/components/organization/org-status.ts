import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import type { AgencyStatus } from "@/services/agency";
import type { AgencyOutletApproveStatus } from "@/services/agency-outlet";
import type { OutletStatus } from "@/services/outlet";

export type OrgStatus = AgencyStatus | OutletStatus;

export type OrgStatusFilter = "all" | OrgStatus;

export const ORG_STATUSES: OrgStatus[] = [
	"pending_review",
	"active",
	"suspended",
	"inactive",
];

/**
 * English source copy for the four org states. NOT the render path — use
 * `orgStatusLabel(status, t)` so a badge follows the reader's locale. Kept
 * because the strings are the reference wording the dictionary entries were
 * written from.
 */
export const orgStatusLabels: Record<OrgStatus, string> = {
	pending_review: "Pending review",
	active: "Active",
	suspended: "Suspended",
	inactive: "Inactive",
};

/**
 * The label rendered for an organisation's stored status.
 *
 * The VALUE is never touched: `ORG_STATUSES`, every status filter, every query
 * param and `orgStatusBadgeColors` keep reading the raw code. `active` /
 * `inactive` are the same two values every admin record list shows, so they
 * come from `recordStatusLabel` rather than a second translation of one word;
 * only the two organisation-specific states resolve here. An unrecognised
 * status falls through to itself, so a state added server-side keeps rendering
 * instead of blanking a badge.
 */
export function orgStatusLabel(status: string, t: PortalTranslations): string {
	if (status === "pending_review") return t.adminService.pendingReview;
	if (status === "suspended") return t.admin.statusSuspended;
	return recordStatusLabel(status, t);
}

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
export function isOrgPendingReview(status: string | null | undefined): boolean {
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

/**
 * Humanise a sub-role code the UI has no named group for ("operations_head" →
 * "Operations Head"). Deliberately NOT translated: it is a stored code made
 * readable, and the only rows that reach it are lanes nobody has named yet — a
 * translation would have to invent a term for a value the product has not
 * defined. The five known lanes render their dictionary labels instead.
 */
export function formatSubRole(subRole: string): string {
	return subRole
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/*
 * One agency↔outlet link, as a word and a colour. Read by BOTH admin sheets —
 * the venue's list of agencies and the agency's list of venues are the same
 * row seen from two sides, so they must not describe it differently.
 *
 * Record KEYS are the stored `agency_outlet.approve_status` values and never
 * move; the entries are functions because a module-scope map cannot read `t`.
 */
export const LINK_STATUS_LABEL: Record<
	AgencyOutletApproveStatus,
	(t: PortalTranslations) => string
> = {
	approved: (t) => t.adminOrg.linkWorkingWithVenue,
	pending: (t) => t.adminOrg.linkAwaitingAgency,
	rejected: (t) => t.adminOrg.linkDeclinedByAgency,
	// Past tense, and kept distinct from "declined": ended means the two DID
	// work together and the arrangement is over. An admin reading a support
	// ticket has to tell those apart — "they never accepted us" and "we stopped
	// working together" lead to completely different next questions.
	ended: (t) => t.adminOrg.linkPartnershipEnded,
};

export const LINK_STATUS_CLASS: Record<AgencyOutletApproveStatus, string> = {
	approved: "text-emerald-600 dark:text-emerald-400",
	pending: "text-amber-600 dark:text-amber-400",
	rejected: "text-rose-600 dark:text-rose-400",
	// Grey, not red — nothing went wrong here.
	ended: "text-muted-foreground",
};
