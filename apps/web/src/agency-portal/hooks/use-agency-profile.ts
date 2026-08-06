import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	BLANK_AGENCY_FINANCE_HEAD,
	BLANK_AGENCY_OWNER,
} from "@agency-portal/lib/agency-demo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { useAuth } from "@/lib/auth-context";
import { useProfile } from "@/lib/auth/use-profile";
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
	avatarPhoto?: string | null;
	accountActivated?: boolean;
}

/** Backend-backed subset of the demo finance head. */
export interface AgencyProfileFinanceOverlay {
	name?: string;
	email?: string;
}

/** @deprecated Prefer BLANK_AGENCY_OWNER from agency-demo. */
export const REAL_AGENCY_OWNER_BLANK = BLANK_AGENCY_OWNER;
/** @deprecated Prefer BLANK_AGENCY_FINANCE_HEAD from agency-demo. */
export const REAL_AGENCY_FINANCE_BLANK = BLANK_AGENCY_FINANCE_HEAD;

/**
 * Real identity for the agency Settings/Profile screen — all fields from DB.
 *
 * - Owner name / mobile / email → `user.username` / phone / email via members
 *   join, with `/auth/me` fallback (same columns).
 * - Org name / logo / status → `agency` row.
 */
export function useAgencyProfile() {
	const { logout } = useAuth();
	const { data: me } = useProfile();
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
		// Same cache key as `useOrgMembers` — store the array, not the envelope.
		queryFn: async () => {
			const res = await fetchAgencyMembers(
				agencyId as string,
				{ status: "active" },
				logout,
			);
			return res.data ?? [];
		},
		enabled: backed,
		staleTime: 60_000,
	});

	const owner = useMemo<AgencyProfileOwnerOverlay | null>(() => {
		if (!backed) return null;
		const agency = agencyQuery.data?.data;
		const members = membersQuery.data ?? [];
		const ownerMember = members.find((m) => m.subRole === "owner");

		const overlay: AgencyProfileOwnerOverlay = {};

		const orgName = agency?.name?.trim() || identity?.orgName?.trim();
		if (orgName) overlay.orgName = orgName;

		// Owner name is always `user.username` (not contactName alone).
		const ownerName =
			ownerMember?.username?.trim() ||
			me?.username?.trim() ||
			agency?.contactName?.trim() ||
			undefined;
		if (ownerName) overlay.ownerName = ownerName;

		const mobile =
			ownerMember?.phoneNum?.trim() ||
			me?.contactNo?.trim() ||
			agency?.contactPhone?.trim() ||
			undefined;
		if (mobile) overlay.mobile = mobile;

		const email =
			ownerMember?.email?.trim() ||
			me?.email?.trim() ||
			agency?.contactEmail?.trim() ||
			undefined;
		if (email) overlay.email = email;

		const logoUrl = apiAssetUrl(agency?.logoImage);
		if (logoUrl) overlay.avatarPhoto = logoUrl;
		else if (agency) overlay.avatarPhoto = null;

		if (agency?.status) {
			overlay.accountActivated = agency.status === "active";
		} else if (identity?.agencyStatus) {
			overlay.accountActivated = identity.agencyStatus === "active";
		}
		return overlay;
	}, [backed, agencyQuery.data, membersQuery.data, identity, me]);

	const finance = useMemo<AgencyProfileFinanceOverlay | null>(() => {
		if (!backed) return null;
		if (!membersQuery.data) return null;
		const members = membersQuery.data;
		const financeMember = members.find((m) => m.subRole === "finance");
		if (!financeMember) return null;

		const overlay: AgencyProfileFinanceOverlay = {};
		if (financeMember.username) overlay.name = financeMember.username;
		if (financeMember.email) overlay.email = financeMember.email;
		return overlay;
	}, [backed, membersQuery.data]);

	const queryClient = useQueryClient();
	const saveMutation = useMutation({
		mutationFn: async (payload: {
			orgName?: string;
			ownerName?: string;
			ic?: string;
			logoDataUrl?: string | null;
			logoFileName?: string;
			logoContentType?: string;
			clearLogo?: boolean;
		}) => {
			if (!agencyId) throw new Error("No real agency session");
			return updateAgency(
				agencyId,
				{
					...(payload.orgName ? { name: payload.orgName } : {}),
					...(payload.ownerName ? { contactName: payload.ownerName } : {}),
					...(payload.clearLogo ? { clearLogo: true } : {}),
					...(payload.logoDataUrl?.startsWith("data:")
						? {
								logoBase64: payload.logoDataUrl,
								logoFileName: payload.logoFileName || "logo.png",
								logoContentType: payload.logoContentType || "image/png",
							}
						: {}),
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
		agencyId,
		agency: agencyQuery.data?.data ?? null,
		owner,
		finance,
		isLoading:
			agencyQuery.isLoading || membersQuery.isLoading || (backed && !me),
		save: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
}
