import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchAgencyById,
	fetchAgencyMembers,
	updateAgency,
} from "@/services/agency";

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
 * false` and no overlays, keeping the pure demo form. Overlays carry only
 * defined fields so a spread never clobbers a demo value with `undefined`.
 *
 * `save` persists the owner-editable fields through `PUT /agency/:id`.
 * ⚠️ The note that used to sit here — "has NO agency-update endpoint (only admin
 * approve/suspend), so the save does NOT persist" — was STALE, and it is why
 * this screen was filed as unwired for weeks. The endpoint has existed since the
 * ungated-write hole was closed; nothing was missing but the call. It is
 * owner-gated, and as of the same commit that added this it is scoped to the
 * agency in `:id` rather than to owner-of-anything.
 *
 * A demo session still saves to the store only — there is no agency id to PUT to.
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

	const queryClient = useQueryClient();
	const saveMutation = useMutation({
		mutationFn: (payload: {
			orgName?: string;
			ownerName?: string;
			ic?: string;
		}) => {
			if (!agencyId) throw new Error("No real agency session");
			// Only the fields the agency record actually has a column for. `ic`
			// stays demo-only: there is no column behind it, and this project's
			// most repeated defect is a surface reporting a value nothing stores.
			return updateAgency(
				agencyId,
				{
					...(payload.orgName ? { name: payload.orgName } : {}),
					...(payload.ownerName ? { contactName: payload.ownerName } : {}),
				},
				logout,
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agency", "profile"] });
			queryClient.invalidateQueries({ queryKey: ["agency", "members"] });
		},
	});

	return {
		backed,
		// Exposed for the Team panel, mirroring `useOutletProfile`'s `outletId`.
		agencyId,
		/**
		 * The raw agency row, for surfaces that need the ORGANISATION rather than
		 * the owner's editable overlay — the payment voucher's letterhead, which
		 * must print the agency the voucher belongs to, exactly as the PR's own
		 * copy of that voucher does. Null on a demo session.
		 */
		agency: agencyQuery.data?.data ?? null,
		owner,
		finance,
		isLoading: agencyQuery.isLoading || membersQuery.isLoading,
		save: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
}
