import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletById,
	fetchOutletMembers,
	type Outlet,
	type OutletMember,
	updateOutlet,
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
 * record + its members. Overlays carry only defined fields so a spread never
 * clobbers a demo value with `undefined`.
 *
 * `save` persists the venue NAME through `PUT /outlet/:id`, and nothing else.
 *
 * ⚠️ `location` is deliberately NOT saved. The screen shows one address line,
 * but that line is DERIVED — `joinAddress()` above concatenates five columns
 * (addressLine1/2, postcode, state, country). Writing the edited string back
 * would have to pick a column to put it in, flattening five fields into one and
 * silently emptying the other four. Splitting a free-text address is a parsing
 * problem, not a wiring one, so the location input stays store-only until the
 * form itself has five fields.
 *
 * The map pin is not here either: moving it is `PATCH /outlet/:id/geo-fence`,
 * its own endpoint because saving a pin switches hard geofencing on.
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

	// The venue's saved map pin, parsed to numbers (columns store strings).
	// null coords = pin never dropped = check-in fence OFF for this venue.
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
		const venueName = identity?.outletName || outlet?.name;
		if (venueName) overlay.venueName = venueName;
		if (outlet) {
			const location = joinAddress(outlet);
			if (location) overlay.location = location;
		}
		return overlay;
	}, [backed, outletQuery.data, identity]);

	const queryClient = useQueryClient();
	const saveMutation = useMutation({
		mutationFn: (payload: { venueName?: string }) => {
			if (!outletId) throw new Error("No real outlet session");
			return updateOutlet(
				outletId,
				payload.venueName ? { name: payload.venueName } : {},
				logout,
			);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["outlet", "profile"] });
			queryClient.invalidateQueries({ queryKey: ["outlet", "members"] });
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
		isLoading: outletQuery.isLoading || membersQuery.isLoading,
		save: saveMutation.mutateAsync,
		isSaving: saveMutation.isPending,
	};
}
