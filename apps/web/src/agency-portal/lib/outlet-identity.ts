import type { OutletSubRole } from "@agency-portal/lib/outlet-rbac";
import type { OutletMemberSubRole, OutletMembership } from "@/services/outlet";

/**
 * Real outlet identity for a signed-in operator, resolved from their backend
 * membership at session start and persisted so the portal shell can re-apply it
 * after every blank reset (buildBlankPortalReset wipes outletOwner on mount).
 */
export interface OutletSessionIdentity {
	outletId: string;
	outletName: string;
	subRole: OutletSubRole;
}

const IDENTITY_KEY = "iz-outlet-identity";

/**
 * Backend outlet-member sub-role → portal sub-role (drives nav + the outletCan
 * permission matrix).
 */
export function outletSubRoleFromBackend(
	subRole: OutletMemberSubRole,
): OutletSubRole {
	if (subRole === "finance") return "outlet_finance";
	if (subRole === "operations_head") return "outlet_ops";
	return "outlet_owner";
}

/**
 * Choose the membership that should drive the portal: prefer an active owner,
 * then active finance, then active ops, then any active row, then the first row.
 */
export function pickPrimaryMembership(
	memberships: OutletMembership[],
): OutletMembership | null {
	if (memberships.length === 0) return null;
	const active = memberships.filter(
		(m) => m.status?.toLowerCase() === "active",
	);
	const pool = active.length > 0 ? active : memberships;
	return (
		pool.find((m) => m.subRole === "owner") ??
		pool.find((m) => m.subRole === "finance") ??
		pool.find((m) => m.subRole === "operations_head") ??
		pool[0]
	);
}

export function identityFromMembership(
	m: OutletMembership,
): OutletSessionIdentity {
	return {
		outletId: m.outletId,
		outletName: m.outletName,
		subRole: outletSubRoleFromBackend(m.subRole),
	};
}

export function saveOutletIdentity(identity: OutletSessionIdentity): void {
	try {
		localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
	} catch {
		// localStorage unavailable (SSR / privacy mode) — nothing to persist.
	}
}

export function getOutletIdentity(): OutletSessionIdentity | null {
	try {
		const raw = localStorage.getItem(IDENTITY_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<OutletSessionIdentity>;
		if (
			typeof parsed.outletId !== "string" ||
			typeof parsed.outletName !== "string"
		) {
			return null;
		}
		return {
			outletId: parsed.outletId,
			outletName: parsed.outletName,
			subRole:
				parsed.subRole === "outlet_finance"
					? "outlet_finance"
					: parsed.subRole === "outlet_ops"
						? "outlet_ops"
						: "outlet_owner",
		};
	} catch {
		return null;
	}
}

export function clearOutletIdentity(): void {
	try {
		localStorage.removeItem(IDENTITY_KEY);
	} catch {
		// localStorage unavailable — nothing to clear.
	}
}
