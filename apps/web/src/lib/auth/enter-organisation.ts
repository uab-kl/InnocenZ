/**
 * Open the portal FOR ONE NAMED ORGANISATION.
 *
 * Signing in and choosing an organisation are two different questions, and
 * until 10 Sep 2026 only the first was ever asked: whoever staffed two agencies
 * silently got the one the server happened to resolve — after its ordering, the
 * oldest — and the other was unreachable from the browser. The chooser asks the
 * second question; this is what carries the answer through.
 *
 * ⚠️ ORDER MATTERS. `setActiveOrg` must run BEFORE the session starts, because
 * starting it re-derives the portal identity from the account's memberships and
 * that resolver reads the choice. Set it afterwards and the console header names
 * one organisation on the first page load and another on the next.
 *
 * Both callers — the login form and the chooser — come through here, so the
 * pending-profile detour and the deep-link handling cannot drift into two
 * versions that disagree.
 */

import { setActiveOrg } from "@/lib/active-org";
import type { User, UserOrganisation } from "@/lib/auth";
import { pickHomePortal } from "@/lib/auth/pick-home-portal";
import { hardNavigate } from "@/lib/hard-navigate";

/** The identity fields the portal session starters need. */
export interface EnteringUser {
	id: string;
	email: string;
	displayName: string;
	username?: string;
}

export async function enterOrganisation(
	user: EnteringUser,
	/**
	 * The organisation to open, or null when this account holds the portal
	 * without a membership row we could read. Null is NOT a refusal: it opens
	 * the portal with no choice recorded, which is exactly the behaviour that
	 * existed before the chooser — the alternative would be a new way to be
	 * locked out of a portal that worked yesterday.
	 */
	org: UserOrganisation | null,
	kind: "agency" | "outlet",
	next?: string | null,
): Promise<void> {
	if (org) setActiveOrg({ kind: org.kind, id: org.id });
	const portal = org?.kind ?? kind;

	const { startAgencyRealSession, startOutletRealSession } = await import(
		"@/lib/auth/agency-demo-session"
	);
	const { isOrgProfileOnly } = await import(
		"@/components/organization/org-status"
	);

	if (portal === "agency") {
		await startAgencyRealSession(user);
		const { getAgencyIdentity } = await import(
			"@agency-portal/lib/agency-identity"
		);
		const { AGENCY_PENDING_PROFILE_PATH } = await import(
			"@agency-portal/lib/agency-rbac"
		);
		const identity = getAgencyIdentity();
		hardNavigate(
			isOrgProfileOnly(identity?.agencyStatus)
				? AGENCY_PENDING_PROFILE_PATH
				: (next ?? "/agency"),
		);
		return;
	}

	await startOutletRealSession(user);
	const { getOutletIdentity } = await import(
		"@agency-portal/lib/outlet-identity"
	);
	const { OUTLET_PENDING_PROFILE_PATH } = await import(
		"@agency-portal/lib/outlet-rbac"
	);
	const identity = getOutletIdentity();
	hardNavigate(
		isOrgProfileOnly(identity?.outletStatus)
			? OUTLET_PENDING_PROFILE_PATH
			: (next ?? "/outlet"),
	);
}

/**
 * Should this account be ASKED which organisation to open?
 *
 * Only when there is a real choice to make. Two rules, both deliberate:
 *
 *  * TWO OR MORE organisations — one membership is not a choice, it is an
 *    answer, and a screen offering a single button is a step for nothing
 *    (owner: *"only apply to people who are under 2 or more agencies/outlets"*).
 *  * THE ADMIN CONSOLE IS ONE OF THE CHOICES (owner, 11 Sep 2026, having
 *    accepted an agency invite on an admin account and landed straight on the
 *    admin dashboard: "i have send invite team member, when i sign in jump out
 *    to select the account to log in sign in with").
 *
 *    This used to return false for an admin outright, on the reasoning that
 *    the console belongs to no organisation so the screen had nothing to do
 *    with it. That was true while admins could not be team members. Now they
 *    can — the owner lifted that rule — so an admin who is also Finance at an
 *    agency holds TWO places to be, and `pickHomePortal` silently picks one
 *    of them. Which is exactly the "decide for me" the chooser exists to
 *    replace.
 */
export function shouldChooseOrganisation(profile: User): boolean {
	const home = pickHomePortal(profile.portals, profile.roles);
	if (home !== "agency" && home !== "outlet" && home !== "admin") return false;
	/*
	 * ⚠️ ENTERABLE ones only. `organisations` now carries deactivated
	 * memberships too, so counting the raw list would send somebody who works
	 * at exactly ONE organisation to a chooser listing that one plus a greyed
	 * card they cannot pick — a decision with only one possible answer.
	 * The chooser is for a real choice; the archive belongs on their profile.
	 */
	return countPortalChoices(profile) > 1;
}

/**
 * HOW MANY PLACES THIS ACCOUNT COULD OPEN — the test for whether there is a
 * choice to make at all.
 *
 * Every organisation they may actually enter, plus the admin console if they
 * hold it. One is not a choice and must never produce a screen; two or more is
 * a question only the person can answer.
 */
export function countPortalChoices(profile: User): number {
	const orgs = profile.organisations.filter((o) => o.enterable).length;
	return orgs + (holdsAdminConsole(profile) ? 1 : 0);
}

/**
 * Does this account hold the platform admin console?
 *
 * Read from the same two fields `pickHomePortal` reads, so the chooser cannot
 * offer a console the router would then refuse — or hide one it would allow.
 */
export function holdsAdminConsole(profile: User): boolean {
	const portals = (profile.portals ?? []).map((x) => x.toLowerCase());
	const roles = (profile.roles ?? []).map((r) =>
		typeof r === "string" ? r.toLowerCase() : String(r ?? "").toLowerCase(),
	);
	return portals.includes("admin") || roles.includes("admin");
}

/**
 * Where an account lands when nothing was chosen — the pre-existing behaviour,
 * unchanged, for admins and for anyone whose memberships could not be read.
 */
export function defaultLandingPath(profile: User): string {
	const home = pickHomePortal(profile.portals, profile.roles);
	if (home === "agency") return "/agency";
	if (home === "outlet") return "/outlet";
	if (home === "admin") return "/admin/dashboard";
	return "/no-access";
}
