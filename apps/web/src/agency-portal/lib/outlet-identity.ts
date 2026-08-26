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
	/**
	 * WHO this identity was derived for — the signed-in `user.id`.
	 *
	 * The cache is tab-scoped but SEEDED from localStorage, so a brand-new tab
	 * inherits whatever the last portal sign-in on this machine wrote, which may
	 * be a different account entirely. Without the owner's id on it there is
	 * nothing to check the cache against, and the mount path prefers the cache
	 * over re-deriving — which is how an Owner ended up running on the Director
	 * lane an earlier tab had cached. Every read that knows who is signed in now
	 * demands a match; see `getOutletIdentity`.
	 */
	userId: string;
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
	// EVERY KNOWN LANE IS NAMED, the owner included.
	//
	// It was not, and the comment below still described the old fallback: when
	// that fallback was `outlet_owner`, an `owner` membership could fall through
	// to it and land correctly. Changing the fallback to least privilege — right
	// on its own terms — silently re-routed every OWNER to `outlet_director`.
	//
	// Nothing failed loudly, because a real session's module grants answer for
	// almost everything: Post Job, Workspace, Settings and the rest kept working
	// off the backend grants, and only the permissions with no module mapping
	// went missing. On this portal that is exactly one — `requestCutLoss` — so
	// the whole symptom was "Reduce cutlost vanished from Today" for owners.
	if (subRole === "owner") return "outlet_owner";
	if (subRole === "finance") return "outlet_finance";
	if (subRole === "operations_head") return "outlet_ops";
	// Ahead of the fallback for as long as the fallback is a WRITE lane: a
	// Director dropping through would be able to write everything it is defined
	// not to.
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
		// Straight off the membership row, so the stamp cannot disagree with the
		// lane beside it: both describe the same `outlet_user` record.
		userId: m.userId,
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

/**
 * The cached identity, or null when it cannot be trusted.
 *
 * Pass `expectedUserId` wherever the signed-in account is known — the mount and
 * login paths always know it. A cache that names a DIFFERENT user is refused,
 * and so is one that names nobody: an identity written before this stamp
 * existed could have come from any account, so it is discarded rather than
 * believed, and the caller re-derives from the account's own memberships.
 *
 * Both refusals return null, which every caller already handles as "no cache" —
 * so a stale lane self-heals on the next mount with no re-login. Reads that
 * only want "is this a real session, and which venue" may still omit the id;
 * the layout has corrected the cache before any of them runs.
 */
export function getOutletIdentity(
	expectedUserId?: string,
): OutletSessionIdentity | null {
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
		// An unstamped cache is an ANONYMOUS one, not a valid one.
		if (typeof parsed.userId !== "string" || parsed.userId === "") return null;
		if (expectedUserId && parsed.userId !== expectedUserId) return null;
		return {
			userId: parsed.userId,
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
