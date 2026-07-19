import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletById,
	fetchOutletMembers,
	type Outlet,
	type OutletMember,
} from "@/services/outlet";

/** Backend-backed subset of the demo owner settings shown on Settings/Profile. */
export interface OutletProfileOwnerOverlay {
	ownerName?: string;
	orgName?: string;
	mobile?: string;
	email?: string;
}

/** Backend-backed subset of a demo finance/ops head. */
export interface OutletProfileMemberOverlay {
	name?: string;
	email?: string;
}

/** Backend-backed subset of the demo outlet settings (venue + location). */
export interface OutletProfileSettingsOverlay {
	venueName?: string;
	location?: string;
}

/** Backend-backed subset of one finance/ops member, or `{}` when absent. */
function memberOverlay(
	members: OutletMember[],
	subRole: "finance" | "operations_head",
): OutletProfileMemberOverlay {
	const member = members.find((m) => m.subRole === subRole);
	if (!member) return {};
	const overlay: OutletProfileMemberOverlay = {};
	if (member.username) overlay.name = member.username;
	if (member.email) overlay.email = member.email;
	return overlay;
}

/** Join the outlet's address parts into one display line, skipping blanks. */
function joinAddress(outlet: Outlet): string {
	return [
		outlet.addressLine1,
		outlet.addressLine2,
		outlet.postcode,
		outlet.state,
		outlet.country,
	]
		.map((p) => p?.trim())
		.filter((p): p is string => !!p)
		.join(", ");
}

/**
 * Read-only real identity for the outlet Settings/Profile screens.
 *
 * Gated on a real session (`getOutletIdentity()`); demo sessions get `backed:
 * false` and no overlays, keeping the pure demo form. Reads the real outlet
 * record + its members. The backend DOES expose PUT /outlet/:id, but this wire
 * is read-only by design (matching the agency Profile) — the demo edit/save flow
 * stays as-is and does NOT persist. Overlays carry only defined fields so a
 * spread never clobbers a demo value with `undefined`.
 */
export function useOutletProfile() {
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId ?? null;

	const outletQuery = useQuery({
		queryKey: ["outlet", "profile", outletId ?? "none"],
		queryFn: () => fetchOutletById(outletId as string, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const membersQuery = useQuery({
		queryKey: ["outlet", "members", outletId ?? "none"],
		queryFn: () => fetchOutletMembers(outletId as string, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const owner = useMemo<OutletProfileOwnerOverlay | null>(() => {
		if (!backed) return null;
		const outlet = outletQuery.data?.data;
		const members = membersQuery.data?.data ?? [];
		const ownerMember = members.find((m) => m.subRole === "owner");

		const overlay: OutletProfileOwnerOverlay = {};
		const orgName = identity?.outletName || outlet?.name;
		if (orgName) overlay.orgName = orgName;
		if (ownerMember?.username) overlay.ownerName = ownerMember.username;
		if (ownerMember?.phoneNum) overlay.mobile = ownerMember.phoneNum;
		if (ownerMember?.email) overlay.email = ownerMember.email;
		return overlay;
	}, [backed, outletQuery.data, membersQuery.data, identity]);

	const finance = useMemo<OutletProfileMemberOverlay | null>(() => {
		if (!backed) return null;
		return memberOverlay(membersQuery.data?.data ?? [], "finance");
	}, [backed, membersQuery.data]);
	const ops = useMemo<OutletProfileMemberOverlay | null>(() => {
		if (!backed) return null;
		return memberOverlay(membersQuery.data?.data ?? [], "operations_head");
	}, [backed, membersQuery.data]);

	const settings = useMemo<OutletProfileSettingsOverlay | null>(() => {
		if (!backed) return null;
		const outlet = outletQuery.data?.data;
		const overlay: OutletProfileSettingsOverlay = {};
		const venueName = identity?.outletName || outlet?.name;
		if (venueName) overlay.venueName = venueName;
		if (outlet) {
			const location = joinAddress(outlet);
			if (location) overlay.location = location;
		}
		return overlay;
	}, [backed, outletQuery.data, identity]);

	return {
		backed,
		owner,
		finance,
		ops,
		settings,
		isLoading: outletQuery.isLoading || membersQuery.isLoading,
	};
}
