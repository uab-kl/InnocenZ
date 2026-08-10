/**
 * Derives a portal identity from the SIGNED-IN ACCOUNT, not from storage.
 *
 * Storage is a cache; the token is the truth. Identity used to be written only
 * at login, so whatever sat in storage was believed forever — which is how a
 * second portal login in another tab left the first tab rendering someone
 * else's org name and sub-role. Re-deriving from the caller's own memberships
 * makes the identity correct by construction: it cannot disagree with the token
 * it was fetched with.
 *
 * Both the login path and the portal mount path call these, so there is one
 * resolution rule rather than two that can drift.
 *
 * Returns null on any failure — the caller decides what an unresolvable
 * identity means, and must NOT treat it as "this account has no org".
 */
import type { AgencySessionIdentity } from "@agency-portal/lib/agency-identity";
import type { OutletSessionIdentity } from "@agency-portal/lib/outlet-identity";
import { kickToLogin } from "@/lib/auth/guards";

export async function resolveOutletIdentityForUser(
	userId: string,
): Promise<OutletSessionIdentity | null> {
	try {
		const [identityLib, outletSvc] = await Promise.all([
			import("@agency-portal/lib/outlet-identity"),
			import("@/services/outlet"),
		]);
		const res = await outletSvc.fetchOutletMembershipsForUser(
			userId,
			kickToLogin,
		);
		const primary = identityLib.pickPrimaryMembership(res.data);
		return primary ? identityLib.identityFromMembership(primary) : null;
	} catch {
		return null;
	}
}

export async function resolveAgencyIdentityForUser(
	userId: string,
): Promise<AgencySessionIdentity | null> {
	try {
		const [identityLib, agencySvc] = await Promise.all([
			import("@agency-portal/lib/agency-identity"),
			import("@/services/agency"),
		]);
		const res = await agencySvc.fetchAgencyMembershipsForUser(
			userId,
			kickToLogin,
		);
		const primary = identityLib.pickPrimaryMembership(res.data);
		return primary ? identityLib.identityFromMembership(primary) : null;
	} catch {
		return null;
	}
}
