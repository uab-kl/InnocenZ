import type { AgencySubRole } from "@agency-portal/lib/agency-rbac";
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
	// Every lane must be named. This function ENDS on "agency_owner", so a lane
	// it does not recognise is handed the owner's rights — a view-only Director
	// arriving as `director` would have been able to raise payment vouchers.
	if (subRole === "finance") return "agency_finance";
	if (subRole === "director") return "agency_director";
	if (subRole === "guarantor") return "agency_guarantor";
	return "agency_owner";
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

export function getAgencyIdentity(): AgencySessionIdentity | null {
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
		return {
			agencyId: parsed.agencyId,
			orgName: parsed.orgName,
			agencyCode:
				typeof parsed.agencyCode === "string" ? parsed.agencyCode : "",
			// A set, not a ternary chain: this expression ends on "agency_owner",
			// so anything unlisted is restored from storage as a full owner. A
			// Director would have come back from a page refresh able to pay PRs.
			subRole: KNOWN_AGENCY_SUB_ROLES.has(parsed.subRole as AgencySubRole)
				? (parsed.subRole as AgencySubRole)
				: "agency_owner",
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
