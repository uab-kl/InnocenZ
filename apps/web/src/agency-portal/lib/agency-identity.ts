import {
	AGENCY_LEAST_PRIVILEGE,
	type AgencySubRole,
} from "@agency-portal/lib/agency-rbac";
import {
	readTabScoped,
	removeTabScoped,
	writeTabScoped,
} from "@/lib/auth/tab-scoped-storage";
import type { AgencyMembership, AgencyUserSubRole } from "@/services/agency";

/**
 * Real agency identity for a signed-in operator, resolved from their backend
 * membership at session start and persisted so the portal shell can re-apply it
 * after every blank reset (buildBlankPortalReset wipes agencyOwner on mount).
 */
export interface AgencySessionIdentity {
	/**
	 * WHO this identity was derived for — the signed-in `user.id`. Same reason as
	 * the outlet twin: the cache is tab-scoped but seeded from localStorage, so a
	 * new tab can inherit another account's agency and lane, and the mount path
	 * prefers the cache over re-deriving. See `OutletSessionIdentity.userId`.
	 */
	userId: string;
	agencyId: string;
	orgName: string;
	agencyCode: string;
	subRole: AgencySubRole;
	/** Organisation status — `pending_review` / `suspended` → profile only. */
	agencyStatus: string;
}

const IDENTITY_KEY = "iz-agency-identity";

/** Lanes a persisted identity may name — see `getAgencyIdentity` for why. */
const KNOWN_AGENCY_SUB_ROLES: ReadonlySet<AgencySubRole> =
	new Set<AgencySubRole>([
		"agency_owner",
		"agency_finance",
		"agency_director",
		"agency_guarantor",
	]);

/**
 * Backend agency-member sub-role → portal sub-role (drives nav + the agencyCan
 * permission matrix). A `pr` never signs into the agency console as an operator,
 * so it falls back to owner.
 */
export function agencySubRoleFromBackend(
	subRole: AgencyUserSubRole,
): AgencySubRole {
	// EVERY KNOWN LANE IS NAMED, the owner included — the same miss as the outlet
	// twin: this comment describes a fallback of "agency_owner" that an `owner`
	// membership used to ride to the right answer, and once the fallback became
	// least privilege every OWNER was quietly resolved as a view-only Director.
	// Module grants hide it on almost every screen, so it does not fail loudly.
	if (subRole === "owner") return "agency_owner";
	if (subRole === "finance") return "agency_finance";
	if (subRole === "director") return "agency_director";
	if (subRole === "guarantor") return "agency_guarantor";
	// An unrecognised lane is NOT an owner — see AGENCY_LEAST_PRIVILEGE.
	return AGENCY_LEAST_PRIVILEGE;
}

/**
 * Choose the membership that should drive the console: prefer an active owner,
 * then active finance, then any active row, then the first row.
 */
export function pickPrimaryMembership(
	memberships: AgencyMembership[],
): AgencyMembership | null {
	if (memberships.length === 0) return null;
	const active = memberships.filter(
		(m) => m.status?.toLowerCase() === "active",
	);
	const pool = active.length > 0 ? active : memberships;
	return (
		pool.find((m) => m.subRole === "owner") ??
		pool.find((m) => m.subRole === "guarantor") ??
		pool.find((m) => m.subRole === "finance") ??
		pool.find((m) => m.subRole === "director") ??
		pool[0]
	);
}

export function identityFromMembership(
	m: AgencyMembership,
): AgencySessionIdentity {
	return {
		// Straight off the membership row, so the stamp cannot disagree with the
		// lane beside it: both describe the same `agency_user` record.
		userId: m.userId,
		agencyId: m.agencyId,
		orgName: m.agencyName,
		agencyCode: m.agencyCode,
		subRole: agencySubRoleFromBackend(m.subRole),
		// Prefer the org status from the API; missing field (older backend) →
		// do not lock the portal — only explicit pending/suspended restrict.
		agencyStatus: m.agencyStatus || "active",
	};
}

export function saveAgencyIdentity(identity: AgencySessionIdentity): void {
	writeTabScoped(IDENTITY_KEY, JSON.stringify(identity));
}

/**
 * The cached identity, or null when it cannot be trusted — the outlet twin's
 * rule, applied to the console: pass `expectedUserId` wherever the signed-in
 * account is known, and a cache naming a different user (or naming nobody, as
 * every cache written before this stamp existed does) is refused so the caller
 * re-derives from that account's own memberships.
 */
export function getAgencyIdentity(
	expectedUserId?: string,
): AgencySessionIdentity | null {
	try {
		const raw = readTabScoped(IDENTITY_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<AgencySessionIdentity>;
		if (
			typeof parsed.agencyId !== "string" ||
			typeof parsed.orgName !== "string"
		) {
			return null;
		}
		// An unstamped cache is an ANONYMOUS one, not a valid one.
		if (typeof parsed.userId !== "string" || parsed.userId === "") return null;
		if (expectedUserId && parsed.userId !== expectedUserId) return null;
		return {
			userId: parsed.userId,
			agencyId: parsed.agencyId,
			orgName: parsed.orgName,
			agencyCode:
				typeof parsed.agencyCode === "string" ? parsed.agencyCode : "",
			// A set, not a ternary chain: this expression ends on "agency_owner",
			// so anything unlisted is restored from storage as a full owner. A
			// Director would have come back from a page refresh able to pay PRs.
			subRole: KNOWN_AGENCY_SUB_ROLES.has(parsed.subRole as AgencySubRole)
				? (parsed.subRole as AgencySubRole)
				: AGENCY_LEAST_PRIVILEGE,
			agencyStatus:
				typeof parsed.agencyStatus === "string"
					? parsed.agencyStatus
					: "active",
		};
	} catch {
		return null;
	}
}

export function clearAgencyIdentity(): void {
	removeTabScoped(IDENTITY_KEY);
}
