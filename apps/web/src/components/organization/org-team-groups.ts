import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * The department lanes an organisation issues, and the labels for them.
 *
 * Lifted out of the old in-sheet team tab when that tab became a doorway to the
 * full Team members page: the LISTS outlived the component that first rendered
 * them, and both the member page and the members list read them.
 */
/** Which organisation table the member row came from. */
export type OrgKind = "agency" | "outlet";

export interface OrgTeamMember {
	id: string;
	userId: string;
	subRole: string;
	status: string;
	createdAt: string;
	/** INNATAGY0001 — issued per membership, absent only until the backfill runs. */
	memberCode?: string | null;
	username?: string;
	email?: string | null;
	phoneNum?: string | null;
	/*
	 * The audit trail. Both service DTOs carry these as required strings — they
	 * are optional HERE so a caller with a thinner row still satisfies the type;
	 * the member page renders them and the card does not.
	 */
	updatedAt?: string;
	createdBy?: string;
	updatedBy?: string;
}

/**
 * `subRole` is the STORED code and is what the filter below compares on; only
 * `title` / `description` are rendered, so they are functions of the dictionary
 * rather than strings — a module-scope map cannot read `t`.
 *
 * A member whose lane is missing from a list is NOT dropped: it falls into the
 * "other members" section underneath, because this is the admin's view of who
 * is in the organisation, not a legend.
 */
export interface OrgTeamGroup {
	subRole: string;
	title: (t: PortalTranslations) => string;
	description: (t: PortalTranslations) => string;
}

/**
 * The two lanes that carry OWNER-LEVEL authority over an organisation.
 *
 * `guarantor` belongs here beside `owner`, and that is not obvious from the
 * word: `agency.model.ts` defines it as "stands in for the owner, at owner
 * level — including paying PRs". It is a peer of the owner, not a senior
 * director, so a screen that lists it as an ordinary lane understates what
 * picking it hands over.
 *
 * ⚠️ A LABELLING aid, never a permission check. The server decides who may
 * assign what (`canWriteMembers` + `guardMemberChange`), and by the owner's
 * decision of 14 Sep 2026 an admin may still assign BOTH — deliberately, as a
 * failsafe for an outlet or agency that has asked them to. Marking them keeps
 * that a considered act rather than a casual pick from a menu. It must not grow
 * into a second, quieter copy of the access rule: RBAC comes from the database.
 */
export const OWNER_LEVEL_SUB_ROLES: ReadonlySet<string> = new Set([
	"owner",
	"guarantor",
]);

/*
 * Titles come from `profile.role*` for BOTH organisations — the one list the
 * portal already uses, so a lane cannot be called "Finance Head" on one sheet
 * and "Financial Head" on the other. Only the OWNER hint differs, because a
 * venue owner and an agency owner sign up different things.
 */
export const OUTLET_TEAM_GROUPS: OrgTeamGroup[] = [
	{
		subRole: "owner",
		title: (t) => t.profile.roleOwner,
		description: (t) => t.adminOrg.teamOwnerHint,
	},
	{
		subRole: "finance",
		title: (t) => t.profile.roleFinance,
		description: (t) => t.adminOrg.teamFinanceHint,
	},
	{
		subRole: "operations_head",
		title: (t) => t.profile.roleOps,
		description: (t) => t.outletSettings.opsHeadHint,
	},
	{
		subRole: "guarantor",
		title: (t) => t.profile.roleGuarantor,
		description: (t) => t.adminOrg.teamGuarantorHint,
	},
	{
		subRole: "director",
		title: (t) => t.profile.roleDirector,
		description: (t) => t.adminOrg.teamDirectorHint,
	},
];

/** `AgencyUserSubRole` has no `operations_head` — the agency lane never had one. */
export const AGENCY_TEAM_GROUPS: OrgTeamGroup[] = [
	{
		subRole: "owner",
		title: (t) => t.profile.roleOwner,
		description: (t) => t.adminOrg.teamAgencyOwnerHint,
	},
	{
		subRole: "finance",
		title: (t) => t.profile.roleFinance,
		description: (t) => t.adminOrg.teamFinanceHint,
	},
	{
		subRole: "guarantor",
		title: (t) => t.profile.roleGuarantor,
		description: (t) => t.adminOrg.teamGuarantorHint,
	},
	{
		subRole: "director",
		title: (t) => t.profile.roleDirector,
		description: (t) => t.adminOrg.teamDirectorHint,
	},
];
