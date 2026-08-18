import {
	OUTLET_LEAST_PRIVILEGE,
	type OutletSubRole,
} from "@agency-portal/lib/outlet-rbac";
import {
	readTabScoped,
	removeTabScoped,
	writeTabScoped,
} from "@/lib/auth/tab-scoped-storage";
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
	/** Organisation status — `pending_review` / `suspended` → profile only. */
	outletStatus: string;
}

const IDENTITY_KEY = "iz-outlet-identity";

/** Lanes a persisted identity may name — see `getOutletIdentity` for why. */
const KNOWN_SUB_ROLES: ReadonlySet<OutletSubRole> = new Set<OutletSubRole>([
	"outlet_owner",
	"outlet_finance",
	"outlet_ops",
	"outlet_director",
	"outlet_guarantor",
]);

/**
 * Backend outlet-member sub-role → portal sub-role (drives nav + the outletCan
 * permission matrix).
 */
export function outletSubRoleFromBackend(
	subRole: OutletMemberSubRole,
): OutletSubRole {
	if (subRole === "finance") return "outlet_finance";
	if (subRole === "operations_head") return "outlet_ops";
	// Ahead of the fallback, which is "outlet_owner": a lane this function does
	// not recognise is handed full venue rights. A Director dropping through here
	// would be able to write everything it is defined not to.
	if (subRole === "director") return "outlet_director";
	if (subRole === "guarantor") return "outlet_guarantor";
	// An unrecognised lane is NOT an owner — see OUTLET_LEAST_PRIVILEGE.
	return OUTLET_LEAST_PRIVILEGE;
}

/**
 * Choose the membership that should drive the portal: prefer an active owner,
 * then guarantor, finance, ops, director, then any active row, then the first.
 *
 * Ordered by power, so someone holding two memberships lands on the stronger.
 * Director is last for the same reason it is the weakest — it should never
 * shadow a lane that can actually act.
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
		pool.find((m) => m.subRole === "guarantor") ??
		pool.find((m) => m.subRole === "finance") ??
		pool.find((m) => m.subRole === "operations_head") ??
		pool.find((m) => m.subRole === "director") ??
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
		// Prefer the org status from the API; missing field (older backend) →
		// do not lock the portal — only explicit pending/suspended restrict.
		outletStatus: m.outletStatus || "active",
	};
}

export function saveOutletIdentity(identity: OutletSessionIdentity): void {
	writeTabScoped(IDENTITY_KEY, JSON.stringify(identity));
}

export function getOutletIdentity(): OutletSessionIdentity | null {
	try {
		const raw = readTabScoped(IDENTITY_KEY);
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
			// Every non-owner lane must be named here. This expression ends on
			// "outlet_owner", so anything unlisted is restored from storage as a
			// full owner — before this, a Director came back from a page refresh
			// able to write. A set beats a ternary chain precisely because adding
			// a role cannot silently miss it.
			subRole: KNOWN_SUB_ROLES.has(parsed.subRole as OutletSubRole)
				? (parsed.subRole as OutletSubRole)
				: OUTLET_LEAST_PRIVILEGE,
			outletStatus:
				typeof parsed.outletStatus === "string"
					? parsed.outletStatus
					: "active",
		};
	} catch {
		return null;
	}
}

export function clearOutletIdentity(): void {
	removeTabScoped(IDENTITY_KEY);
}
