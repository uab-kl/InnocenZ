import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletById,
	type GeocodeCandidate,
	geocodeOutletAddress,
	geocodeOutletFreeText,
	setOutletGeoFence,
} from "@/services/outlet";

/** A committed pin. Radius is metres; the server defaults it to 50. */
export interface OutletPin {
	lat: number;
	lng: number;
	radius: number;
}

export const DEFAULT_GEO_FENCE_RADIUS = 50;

/**
 * `lat`/`lng` are nullable decimal columns, so they arrive as strings or null.
 * Anything unparseable is treated as "no pin" rather than a 0,0 pin — 0,0 is a
 * real coordinate in the Atlantic and would fence every PR out of the venue.
 */
function pinFromOutlet(
	lat: string | null,
	lng: string | null,
	radius: number | null,
): OutletPin | null {
	if (lat === null || lng === null) return null;
	const parsedLat = Number(lat);
	const parsedLng = Number(lng);
	if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
	return {
		lat: parsedLat,
		lng: parsedLng,
		radius: radius ?? DEFAULT_GEO_FENCE_RADIUS,
	};
}

/**
 * The backend distinguishes "no address matched" (404) from "lookup is not
 * configured / upstream failed" (503) precisely so the form can say which, and
 * puts the operator-facing sentence in `message`.
 */
function messageFromError(err: unknown, fallback: string): string {
	if (axios.isAxiosError(err)) {
		const message = (err.response?.data as { message?: string } | undefined)
			?.message;
		if (message) return message;
	}
	return fallback;
}

/**
 * The outlet's check-in pin: read the current one, look up candidates from an
 * address, commit one.
 *
 * Gated on a real session (`getOutletIdentity()`); demo sessions get
 * `backed: false` and the card stays hidden. Saving is owner-only server-side
 * (`outletOwnerOnly` on PATCH /outlet/:id/geo-fence), so callers must gate the
 * save UI on `outletCan(subRole, 'editSettings')` to match.
 *
 * Committing a pin is what turns hard geofencing on for the venue — until one
 * exists no PR can be distance-checked, and a wrong one locks the whole night's
 * staff out. Hence lookup and save are separate steps with a human in between.
 */
export function useOutletGeoFence() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletId = identity?.outletId ?? null;

	const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
	const [lookupError, setLookupError] = useState<string | null>(null);
	const [searchedAddress, setSearchedAddress] = useState<string | null>(null);

	// Shares use-outlet-profile's key so a committed pin refreshes both screens.
	const query = useQuery({
		queryKey: ["outlet", "profile", outletId ?? "none"],
		queryFn: () => fetchOutletById(outletId as string, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const outlet = query.data?.data ?? null;

	const pin = useMemo<OutletPin | null>(() => {
		if (!outlet) return null;
		return pinFromOutlet(outlet.lat, outlet.lng, outlet.geoFenceRadius);
	}, [outlet]);

	const lookupMut = useMutation({
		mutationFn: async (address?: string) => {
			const trimmed = address?.trim() ?? "";
			if (trimmed) {
				const response = await geocodeOutletFreeText(trimmed, logout);
				return { query: trimmed, candidates: response.data };
			}
			const response = await geocodeOutletAddress(outletId as string, logout);
			// `data` is null on the controller's error paths; axios rejects those
			// first, so this is belt-and-braces rather than a live case.
			return response.data ?? { query: "", candidates: [] };
		},
		onSuccess: (result) => {
			setCandidates(result.candidates ?? []);
			setSearchedAddress(result.query ?? null);
			setLookupError(null);
		},
		onError: (err) => {
			setCandidates([]);
			setLookupError(
				messageFromError(err, "Address lookup failed. Try again."),
			);
		},
	});

	const saveMut = useMutation({
		mutationFn: (next: OutletPin) =>
			setOutletGeoFence(
				outletId as string,
				{ lat: next.lat, lng: next.lng, geoFenceRadius: next.radius },
				logout,
			),
		onSuccess: () => {
			setCandidates([]);
			setSearchedAddress(null);
			queryClient.invalidateQueries({ queryKey: ["outlet", "profile"] });
		},
	});

	return {
		backed,
		outlet,
		pin,
		isLoading: backed && query.isLoading,
		candidates,
		searchedAddress,
		lookupError,
		isLookingUp: lookupMut.isPending,
		isSaving: saveMut.isPending,
		lookup: (address?: string) => lookupMut.mutateAsync(address),
		clearCandidates: () => {
			setCandidates([]);
			setSearchedAddress(null);
			setLookupError(null);
		},
		save: (next: OutletPin) => saveMut.mutateAsync(next),
		saveError: saveMut.error
			? messageFromError(saveMut.error, "Could not save the pin.")
			: null,
	};
}
