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

/**
 * Backend agency-member sub-role → portal sub-role (drives nav + the agencyCan
 * permission matrix). A `pr` never signs into the agency console as an operator,
 * so it falls back to owner.
 */
export function agencySubRoleFromBackend(
	subRole: AgencyUserSubRole,
): AgencySubRole {
	return subRole === "finance" ? "agency_finance" : "agency_owner";
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
		pool.find((m) => m.subRole === "finance") ??
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
			subRole:
				parsed.subRole === "agency_finance" ? "agency_finance" : "agency_owner",
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
