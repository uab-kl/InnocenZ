import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAgencyById, fetchAgencyMembers } from "@/services/agency";

/** Backend-backed subset of the demo owner settings shown on the Profile screen. */
export interface AgencyProfileOwnerOverlay {
	ownerName?: string;
	orgName?: string;
	mobile?: string;
	email?: string;
}

/** Backend-backed subset of the demo finance head. */
export interface AgencyProfileFinanceOverlay {
	name?: string;
	email?: string;
}

/**
 * Read-only real identity for the agency Settings/Profile screen.
 *
 * Gated on a real session (`getAgencyIdentity()`); demo sessions get `backed:
 * false` and no overlays, keeping the pure demo form. `services/agency` can READ
 * the agency record + its members but has NO agency-update endpoint (only admin
 * approve/suspend), so this only surfaces real values in read mode — the demo
 * edit/save flow stays as-is and does NOT persist to the backend (the accepted
 * hybrid tradeoff for this screen). Overlays carry only defined fields so a
 * spread never clobbers a demo value with `undefined`.
 */
export function useAgencyProfile() {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const agencyId = identity?.agencyId ?? null;

	const agencyQuery = useQuery({
		queryKey: ["agency", "profile", agencyId ?? "none"],
		queryFn: () => fetchAgencyById(agencyId as string, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const membersQuery = useQuery({
		queryKey: ["agency", "members", agencyId ?? "none"],
		queryFn: () =>
			fetchAgencyMembers(agencyId as string, { status: "active" }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const owner = useMemo<AgencyProfileOwnerOverlay | null>(() => {
		if (!backed) return null;
		const agency = agencyQuery.data?.data;
		const members = membersQuery.data?.data ?? [];
		const ownerMember = members.find((m) => m.subRole === "owner");

		const overlay: AgencyProfileOwnerOverlay = {};
		const orgName = identity?.orgName || agency?.name;
		if (orgName) overlay.orgName = orgName;
		const ownerName = ownerMember?.username ?? agency?.contactName ?? undefined;
		if (ownerName) overlay.ownerName = ownerName;
		const mobile = ownerMember?.phoneNum ?? agency?.contactPhone ?? undefined;
		if (mobile) overlay.mobile = mobile;
		const email = ownerMember?.email ?? agency?.contactEmail ?? undefined;
		if (email) overlay.email = email;
		return overlay;
	}, [backed, agencyQuery.data, membersQuery.data, identity]);

	const finance = useMemo<AgencyProfileFinanceOverlay | null>(() => {
		if (!backed) return null;
		const members = membersQuery.data?.data ?? [];
		const financeMember = members.find((m) => m.subRole === "finance");
		if (!financeMember) return {};

		const overlay: AgencyProfileFinanceOverlay = {};
		if (financeMember.username) overlay.name = financeMember.username;
		if (financeMember.email) overlay.email = financeMember.email;
		return overlay;
	}, [backed, membersQuery.data]);

	return {
		backed,
		owner,
		finance,
		isLoading: agencyQuery.isLoading || membersQuery.isLoading,
	};
}
