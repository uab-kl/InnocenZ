import { useAgencyOutletLinks } from "@agency-portal/hooks/use-agency-outlet-links";
import { useMemo } from "react";

/** `(outletName) => is this partnership over` — never a guess. */
export type AgencyEndedOutletLookup = (
	outletName: string | null | undefined,
) => boolean;

/**
 * Which of the venues on screen are ENDED partnerships (0127).
 *
 * An ended link deliberately stays visible to the agency while it still has a
 * shift to come, so the PRs already rostered there can be worked — see the
 * `linkedToAgencyId` filter in `outlet.repository`. The consequence is that this
 * grid renders a former partner identically to a current one, which is the half
 * of that design that was missing: the agency keeps the access it needs and gets
 * no hint the relationship is over.
 *
 * By NAME because that is all the caller holds — `AgencyOutletSummary` is
 * derived from posted shifts and identifies its venue as `outlet: string`, with
 * no outlet id anywhere on it. The same constraint, and the same resolution, as
 * `useAgencyOutletLogos`.
 *
 * A name that more than one ended link answers to resolves to FALSE rather than
 * true: badging a live partnership as over would be a lie about a commercial
 * relationship, while a missing badge is only the status quo. Where the two
 * errors are not symmetric, the guess goes to the recoverable one.
 */
export function useAgencyEndedOutlets(): AgencyEndedOutletLookup {
	// ⚠️ Mounting this fires TWO requests, not one. `useAgencyOutletLinks` runs an
	// unconditional second query for the pending COUNT — the badge on the
	// Outlet-Linking tab has to stay correct while the operator reads a different
	// filter — and that query is not gated on the filter passed here. The
	// "ended" half shares its key with the Outlet-Linking tab, so only the
	// pending half is genuinely extra on this page.
	const { links } = useAgencyOutletLinks("ended");

	return useMemo(() => {
		// `false` marks a name that more than one ended link answers to.
		const byName = new Map<string, boolean>();
		for (const link of links) {
			const key = link.outletName?.trim().toLowerCase();
			if (!key) continue;
			byName.set(key, !byName.has(key));
		}
		return (outletName) => {
			const key = outletName?.trim().toLowerCase();
			if (!key) return false;
			return byName.get(key) ?? false;
		};
	}, [links]);
}
