import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import {
	findAgencyManagedPr,
	resolveAgencyPrPhoto,
	scopeToAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useStore } from "@agency-portal/lib/store";
import { useMemo } from "react";

/**
 * A PR's photo, looked up by id — from the roster that actually has one.
 *
 * 🔴 THE DEMO STORE IS EMPTY ON A REAL LOGIN. `buildBlankPortalReset` sets
 * `store.agencyPRs` to [] for every backed session, so a lookup against it
 * returns undefined for every real PR and the caller silently falls back to a
 * letter. That is precisely how Approvals and the attendance panel ended up
 * showing coloured initials while History — which passes its own backend
 * roster in — showed the same people's faces. The roster page carries the same
 * warning at the top of its own PR resolution; this is the second surface to
 * hit it, which is why the resolution now lives in one place.
 *
 * `useAgencyPrs` owns the very `["roster","prs"]` cache entry the roster
 * already fills, so this costs no extra network — the same rows, put through
 * `managedPrFromBackend` rather than thrown away. It is disabled outright on a
 * demo session, which has no backend identity and whose PRs exist only in the
 * store.
 *
 * Returns the photo UNRESOLVED as far as callers are concerned — hand it to
 * `PrFaceBubble`/`prPhotoSrc`. (`managedPrFromBackend` has already run it
 * through `apiAssetUrl`, and re-resolving an `https://` URL is a no-op, so
 * both a backend row and a demo row can go down the same path.)
 *
 * Null means "no photo we can show", never "guess" — the caller renders the
 * name's initial, which is a fallback and not a failure.
 */
/**
 * A SIGN-UP's own face — best available.
 *
 * An applicant is not on the roster yet, so `usePrPhotoById` cannot find them
 * and they have no `avatarPhoto`. The order mirrors `resolveAgencyPrPhoto`:
 * the selfie they submitted, then the comcard, then the first portfolio slot.
 */
export function pendingPrPhoto(signup: {
	selfiePhoto?: string | null;
	comcardImageUrl?: string | null;
	portfolioPhotos?: (string | null)[];
}): string | null {
	return (
		signup.selfiePhoto ??
		signup.comcardImageUrl ??
		signup.portfolioPhotos?.find(Boolean) ??
		null
	);
}

export function usePrPhotoById() {
	const backed = useMemo(() => getAgencyIdentity() !== null, []);
	const { prs: backendPRs } = useAgencyPrs({ enabled: backed });
	const demoPRs = useStore((s) => s.agencyPRs);
	const activeAgencyId = useStore((s) => s.activeAgencyId);

	const roster = useMemo(
		() => (backed ? backendPRs : scopeToAgency(demoPRs, activeAgencyId)),
		[backed, backendPRs, demoPRs, activeAgencyId],
	);

	return useMemo(() => {
		return (prId: string | null | undefined, prName?: string | null) => {
			if (!prId && !prName) return null;
			// Name is the second key on purpose: ids join exactly, names only
			// usually. findAgencyManagedPr tries the id first.
			const pr = findAgencyManagedPr(roster, prId ?? "", prName ?? undefined);
			return pr ? resolveAgencyPrPhoto(pr) : null;
		};
	}, [roster]);
}
