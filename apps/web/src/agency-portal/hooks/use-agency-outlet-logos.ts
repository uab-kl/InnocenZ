import { useAgencyOutlets } from "@agency-portal/hooks/use-agency-outlets";
import { useMemo } from "react";

/** `(outletName) => logo reference | null` — never a guess. */
export type AgencyOutletLogoLookup = (
	outletName: string | null | undefined,
) => string | null;

/**
 * Each venue's logo, by name.
 *
 * By NAME because that is all the caller holds: `AgencyOutletSummary` is derived
 * from posted shifts and rostered slots, and it identifies its venue as
 * `outlet: string` — there is no outlet id anywhere on it. The logo lives on the
 * outlet registry (`outlet.logo_image`), which `useAgencyOutlets` already reads
 * and scopes to this agency by `onboardedByAgencyId`.
 *
 * A name two of this agency's outlets share resolves to nothing rather than to
 * whichever row came back first: one venue's mark on another venue's card is
 * worse than the map pin, and the pin is already a correct answer here — most
 * outlets have uploaded no logo at all.
 *
 * Shares the `["agency","outlets",agencyId]` query key with the rest of the
 * portal, so this adds no request of its own.
 */
export function useAgencyOutletLogos(): AgencyOutletLogoLookup {
	const { outlets } = useAgencyOutlets();

	return useMemo(() => {
		// `null` marks a name more than one outlet answers to.
		const byName = new Map<
			string,
			{ id: string; logo: string | null } | null
		>();
		for (const outlet of outlets) {
			const key = outlet.name?.trim().toLowerCase();
			if (!key) continue;
			const seen = byName.get(key);
			if (seen === undefined) {
				byName.set(key, { id: outlet.id, logo: outlet.logoImage });
			} else if (seen === null || seen.id !== outlet.id) {
				byName.set(key, null);
			}
		}

		return (outletName) => {
			const key = outletName?.trim().toLowerCase();
			if (!key) return null;
			// `undefined` (no such venue — a demo session has none) and `null` (two
			// venues share the name) both mean there is no logo we can stand behind.
			return byName.get(key)?.logo ?? null;
		};
	}, [outlets]);
}
