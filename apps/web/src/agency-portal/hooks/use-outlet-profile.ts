import {
	EMPTY_ORG_ADDRESS,
	joinOrgAddress,
	type OrgAddress,
	orgAddressFromRow,
	resolveOrgAddressForSave,
} from "@agency-portal/lib/org-address";
import {
	BLANK_OUTLET_FINANCE_HEAD,
	BLANK_OUTLET_OPS_HEAD,
	BLANK_OUTLET_OWNER,
	BLANK_OUTLET_SETTINGS,
	type OutletSettings,
} from "@agency-portal/lib/outlet-demo";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiAssetUrl } from "@/components/organization/details-sheet-parts";
import { updateMyDisplayName } from "@/lib/auth/profile-api";
import { profileQueryKey, useProfile } from "@/lib/auth/use-profile";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletById,
	fetchOutletMembers,
	type OutletMember,
	updateOutlet,
} from "@/services/outlet";

/** Backend-backed subset of the demo owner settings shown on Settings/Profile. */
export interface OutletProfileOwnerOverlay {
	ownerName?: string;
	orgName?: string;
	mobile?: string;
	email?: string;
	avatarPhoto?: string | null;
	accountActivated?: boolean;
}

/** Backend-backed subset of a demo finance/ops head. */
export interface OutletProfileMemberOverlay {
	name?: string;
	email?: string;
}

/** Backend-backed venue + address (each column, not a single Location blob). */
export interface OutletProfileSettingsOverlay extends Partial<OrgAddress> {
	venueName?: string;
	/** Joined display for read-only surfaces (outlet profile card). */
	location?: string;
}

/** @deprecated Prefer BLANK_OUTLET_OWNER from outlet-demo — kept as alias. */
export const REAL_OUTLET_OWNER_BLANK = BLANK_OUTLET_OWNER;
/** @deprecated Prefer BLANK_OUTLET_FINANCE_HEAD from outlet-demo. */
export const REAL_OUTLET_FINANCE_BLANK = BLANK_OUTLET_FINANCE_HEAD;
/** @deprecated Prefer BLANK_OUTLET_OPS_HEAD from outlet-demo. */
export const REAL_OUTLET_OPS_BLANK = BLANK_OUTLET_OPS_HEAD;
/** @deprecated Prefer BLANK_OUTLET_SETTINGS from outlet-demo. */
export const REAL_OUTLET_SETTINGS_BLANK: Pick<
	OutletSettings,
	"venueName" | "location"
> = {
	venueName: BLANK_OUTLET_SETTINGS.venueName,
	location: BLANK_OUTLET_SETTINGS.location,
};

/** Backend-backed subset of one finance/ops member, or `null` when absent. */
function memberOverlay(
	members: OutletMember[],
	subRole: "finance" | "operations_head",
): OutletProfileMemberOverlay | null {
	const member = members.find((m) => m.subRole === subRole);
	if (!member) return null;
	const overlay: OutletProfileMemberOverlay = {};
	// Finance/ops display name is also `user.username` from the members join.
	if (member.username) overlay.name = member.username;
	if (member.email) overlay.email = member.email;
	return overlay;
}

/**
 * Real identity for the outlet Settings/Profile screens — all fields from DB.
 *
 * - Owner name / mobile / email → `user` (`username`, `phone_num`, `email`) via
 *   `GET /outlet/:id/members` join, with `/auth/me` as fallback for the signed-in
 *   owner (same columns).
 * - Org name / address / logo / status → `outlet` row via `GET /outlet/:id`.
 *
 * Demo sessions get `backed: false`. When `backed`, callers merge onto
 * {@link BLANK_OUTLET_OWNER} — never Velvet defaults.
 */
export function useOutletProfile() {
	const { logout } = useAuth();
	const { data: me } = useProfile();
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
		// Must return the array — same cache key as `useOrgMembers`, which calls
		// `.map` on the cached value. Caching the full `{ data: [...] }` envelope
		// made `members.map` throw after Settings save invalidated this key.
		queryFn: async () => {
			const res = await fetchOutletMembers(outletId as string, logout);
			return res.data ?? [];
		},
		enabled: backed,
		staleTime: 60_000,
	});

	const owner = useMemo<OutletProfileOwnerOverlay | null>(() => {
		if (!backed) return null;
		const outlet = outletQuery.data?.data;
		const members = membersQuery.data ?? [];
		const ownerMember = members.find((m) => m.subRole === "owner");

		const overlay: OutletProfileOwnerOverlay = {};

		// Org fields from `outlet` first; identity is only a bootstrap cache.
		const orgName = outlet?.name?.trim() || identity?.outletName?.trim();
		if (orgName) overlay.orgName = orgName;

		// Owner name is always `user.username` (never user_profile.full_name).
		const ownerName =
			ownerMember?.username?.trim() || me?.username?.trim() || undefined;
		if (ownerName) overlay.ownerName = ownerName;

		const mobile =
			ownerMember?.phoneNum?.trim() || me?.contactNo?.trim() || undefined;
		if (mobile) overlay.mobile = mobile;

		const email = ownerMember?.email?.trim() || me?.email?.trim() || undefined;
		if (email) overlay.email = email;

		const logoUrl = apiAssetUrl(outlet?.logoImage);
		if (logoUrl) overlay.avatarPhoto = logoUrl;
		else if (outlet) overlay.avatarPhoto = null;

		if (outlet?.status) {
			overlay.accountActivated = outlet.status === "active";
		} else if (identity?.outletStatus) {
			overlay.accountActivated = identity.outletStatus === "active";
		}
		return overlay;
	}, [backed, outletQuery.data, membersQuery.data, identity, me]);

	const finance = useMemo<OutletProfileMemberOverlay | null>(() => {
		if (!backed) return null;
		if (!membersQuery.data) return null;
		return memberOverlay(membersQuery.data, "finance");
	}, [backed, membersQuery.data]);

	const ops = useMemo<OutletProfileMemberOverlay | null>(() => {
		if (!backed) return null;
		if (!membersQuery.data) return null;
		return memberOverlay(membersQuery.data, "operations_head");
	}, [backed, membersQuery.data]);

	const geo = useMemo(() => {
		if (!backed) return null;
		const outlet = outletQuery.data?.data;
		if (!outlet) return null;
		const lat = outlet.lat === null ? null : Number(outlet.lat);
		const lng = outlet.lng === null ? null : Number(outlet.lng);
		return {
			lat: lat !== null && Number.isFinite(lat) ? lat : null,
			lng: lng !== null && Number.isFinite(lng) ? lng : null,
			radiusM: outlet.geoFenceRadius ?? 50,
		};
	}, [backed, outletQuery.data]);

	const settings = useMemo<OutletProfileSettingsOverlay | null>(() => {
		if (!backed) return null;
		const outlet = outletQuery.data?.data;
		const overlay: OutletProfileSettingsOverlay = {};
		const venueName = outlet?.name?.trim() || identity?.outletName?.trim();
		if (venueName) overlay.venueName = venueName;
		if (outlet) {
			const address = orgAddressFromRow(outlet);
			Object.assign(overlay, address);
			overlay.location = joinOrgAddress(address);
		}
		return overlay;
	}, [backed, outletQuery.data, identity]);

	const queryClient = useQueryClient();
	const saveMutation = useMutation({
		mutationFn: async (payload: {
			venueName?: string;
			ownerName?: string;
			address?: OrgAddress;
			/** @deprecated Prefer `address` — maps only to address_line_1. */
			location?: string;
			/** New logo as a data URL (`data:image/…;base64,…`). */
			logoDataUrl?: string | null;
			/** The ORIGINAL behind `logoDataUrl`, and where the frame was left —
			 * stored beside the logo so "Adjust crop" survives a reload. */
			logoSourceDataUrl?: string | null;
			logoCropState?: { zoom: number; fx: number; fy: number } | null;
			logoFileName?: string;
			logoContentType?: string;
			/** True when the owner cleared the logo. */
			clearLogo?: boolean;
		}) => {
			if (!outletId) throw new Error("No real outlet session");

			const outletPatch: Parameters<typeof updateOutlet>[1] = {};
			if (payload.venueName?.trim()) {
				outletPatch.name = payload.venueName.trim();
			}
			if (payload.address) {
				const resolved = resolveOrgAddressForSave(payload.address);
				outletPatch.addressLine1 = resolved.addressLine1;
				outletPatch.addressLine2 = resolved.addressLine2;
				outletPatch.city = resolved.city;
				outletPatch.postcode = resolved.postcode;
				outletPatch.state = resolved.state;
				outletPatch.country = resolved.country;
			} else if (payload.location !== undefined) {
				outletPatch.addressLine1 = payload.location.trim();
			}
			if (payload.clearLogo) {
				outletPatch.clearLogo = true;
			} else if (payload.logoDataUrl?.startsWith("data:")) {
				outletPatch.logoBase64 = payload.logoDataUrl;
				outletPatch.logoFileName = payload.logoFileName || "logo.png";
				outletPatch.logoContentType = payload.logoContentType || "image/png";
				// Only alongside a new logo — the sidecar describes THIS image, so
				// sending it without one would leave a source that no longer
				// matches what is on screen.
				if (payload.logoSourceDataUrl?.startsWith("data:")) {
					outletPatch.logoSourceDataUrl = payload.logoSourceDataUrl;
				}
				if (payload.logoCropState) {
					outletPatch.logoCropState = payload.logoCropState;
				}
			}

			const outletPromise =
				Object.keys(outletPatch).length > 0
					? updateOutlet(outletId, outletPatch, logout)
					: Promise.resolve(null);

			const ownerPromise =
				payload.ownerName?.trim() && me?.id
					? updateMyDisplayName(me.id, payload.ownerName.trim())
					: Promise.resolve(null);

			const [outletResult] = await Promise.all([outletPromise, ownerPromise]);
			return outletResult;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["outlet", "profile"] });
			queryClient.invalidateQueries({ queryKey: ["outlet", "members"] });
			queryClient.invalidateQueries({ queryKey: profileQueryKey });
		},
	});

	return {
		backed,
		outletId,
		geo,
		refreshOutlet: () => {
			void outletQuery.refetch();
		},
		owner,
		finance,
		ops,
		settings,
		address: settings ? orgAddressFromRow(settings) : { ...EMPTY_ORG_ADDRESS },
		isLoading:
			outletQuery.isLoading || membersQuery.isLoading || (backed && !me),
		save: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
}
