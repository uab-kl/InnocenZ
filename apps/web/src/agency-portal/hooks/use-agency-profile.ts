import {
	BLANK_AGENCY_FINANCE_HEAD,
	BLANK_AGENCY_OWNER,
} from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import {
	EMPTY_ORG_ADDRESS,
	joinOrgAddress,
	type OrgAddress,
	orgAddressFromRow,
	resolveOrgAddressForSave,
} from "@agency-portal/lib/org-address";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { updateMyDisplayName } from "@/lib/auth/profile-api";
import { profileQueryKey, useProfile } from "@/lib/auth/use-profile";
import { useAuth } from "@/lib/auth-context";
import { fetchAgencyById, updateAgency } from "@/services/agency";
import { useOrgMembersQuery } from "./use-org-members";

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
 * - Org name / logo / status / address → `agency` row.
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

	/**
	 * The SHARED member list — literally the same query the Team panel further
	 * down this same screen mounts.
	 *
	 * It used to be a second `useQuery` on the identical key that asked the server
	 * for `{ status: "active" }` while `useOrgMembers` asked for everything. React
	 * Query stores one value per key, so whichever of the two resolved first
	 * decided what BOTH read: the Team count and the owner's name on Settings
	 * changed with mount order. The active filter now happens at the reader,
	 * below, over one fetched list.
	 */
	const membersQuery = useOrgMembersQuery("agency", agencyId);

	const owner = useMemo<AgencyProfileOwnerOverlay | null>(() => {
		if (!backed) return null;
		const agency = agencyQuery.data?.data;
		// ACTIVE only. The shared query fetches every member so the Team panel can
		// list suspended rows too; the owner OF RECORD is an active one, and a
		// deactivated ex-owner must never supply the name on this screen.
		const members = (membersQuery.data ?? []).filter(
			(m) => m.status === "active",
		);
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

	const address = useMemo<OrgAddress>(() => {
		if (!backed) return { ...EMPTY_ORG_ADDRESS };
		return orgAddressFromRow(agencyQuery.data?.data);
	}, [backed, agencyQuery.data]);

	const finance = useMemo<AgencyProfileFinanceOverlay | null>(() => {
		if (!backed) return null;
		if (!membersQuery.data) return null;
		// ACTIVE only, same reason as the owner above.
		const members = membersQuery.data.filter((m) => m.status === "active");
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
			address?: OrgAddress;
			logoDataUrl?: string | null;
			/** The ORIGINAL behind `logoDataUrl`, and where the frame was left —
			 * stored beside the logo so "Adjust crop" survives a reload. */
			logoSourceDataUrl?: string | null;
			logoCropState?: { zoom: number; fx: number; fy: number } | null;
			logoFileName?: string;
			logoContentType?: string;
			clearLogo?: boolean;
		}) => {
			if (!agencyId) throw new Error("No real agency session");

			const agencyPromise = updateAgency(
				agencyId,
				{
					...(payload.orgName ? { name: payload.orgName } : {}),
					...(payload.ownerName ? { contactName: payload.ownerName } : {}),
					...(payload.address ? resolveOrgAddressForSave(payload.address) : {}),
					...(payload.clearLogo ? { clearLogo: true } : {}),
					...(payload.logoDataUrl?.startsWith("data:")
						? {
								logoBase64: payload.logoDataUrl,
								logoFileName: payload.logoFileName || "logo.png",
								logoContentType: payload.logoContentType || "image/png",
								// Only alongside a new logo — the sidecar describes THIS
								// image, so sending it without one would leave a stored
								// source that no longer matches what is on screen.
								...(payload.logoSourceDataUrl?.startsWith("data:")
									? { logoSourceDataUrl: payload.logoSourceDataUrl }
									: {}),
								...(payload.logoCropState
									? { logoCropState: payload.logoCropState }
									: {}),
							}
						: {}),
				},
				logout,
			);

			// Owner name is read back from `user.username` (members join), so the
			// `agency.contactName` write above alone would never show. Same second
			// write the outlet Settings screen makes.
			const ownerPromise =
				payload.ownerName?.trim() && me?.id
					? updateMyDisplayName(me.id, payload.ownerName.trim())
					: Promise.resolve(null);

			const [agencyResult] = await Promise.all([agencyPromise, ownerPromise]);
			return agencyResult;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["agency", "profile"] });
			queryClient.invalidateQueries({ queryKey: ["agency", "members"] });
			queryClient.invalidateQueries({ queryKey: profileQueryKey });
		},
	});

	return {
		backed,
		agencyId,
		agency: agencyQuery.data?.data ?? null,
		owner,
		address,
		location: joinOrgAddress(address),
		finance,
		isLoading:
			agencyQuery.isLoading || membersQuery.isLoading || (backed && !me),
		save: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
}
