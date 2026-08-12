import { useAgencyPrs } from "@agency-portal/hooks/use-agency-prs";
import { resolveAgencyPrPhoto } from "@agency-portal/lib/agency-demo";
import { useMemo } from "react";

/** `(prId, prName) => photo reference | null` — never a guess. */
export type AgencyPrPhotoLookup = (
	prId: string | null | undefined,
	prName?: string | null,
) => string | null;

/**
 * One photo per PR, for the rows that carry a `pr_id` but no picture.
 *
 * A voucher, a dispute, a receipt and an overtime claim all name their PR by id
 * and name only — the photo lives on `user_profile`, which those endpoints do
 * not join. `GET /pr-personnel` already returns it (mapped by
 * `managedPrFromBackend`), so this reads that one list rather than widening four
 * payloads.
 *
 * The BACKEND roster, not `useStore(s => s.agencyPRs)`: the demo slice boots
 * empty on a real login, so a store-backed lookup would have found no photo for
 * anybody who actually signed in — the same wrong-source mistake the counts on
 * this hub used to have.
 *
 * Shares the `["roster", "prs"]` query key with the Roster and Manage-PR
 * screens, so react-query dedupes rather than fetching the roster twice.
 */
export function useAgencyPrPhotos({
	enabled = true,
}: {
	enabled?: boolean;
} = {}): AgencyPrPhotoLookup {
	const { prs } = useAgencyPrs({ enabled });

	return useMemo(() => {
		const known = new Set<string>();
		const byId = new Map<string, string>();
		/**
		 * A name is usable only while exactly ONE PR answers to it. `null` marks a
		 * name two people share: a plain map would silently keep whichever came
		 * first and put one PR's face on another's row, so ambiguity refuses instead.
		 */
		const byName = new Map<
			string,
			{ prId: string; photo: string | null } | null
		>();

		for (const pr of prs) {
			known.add(pr.id);
			// Profile photo, then the comcard, then a portfolio still — the same
			// order every other PR card in the portal resolves in.
			const photo = resolveAgencyPrPhoto(pr);
			if (photo) byId.set(pr.id, photo);
			// Both spellings a row might print: the floor name and the legal name.
			for (const raw of [pr.name, pr.icName]) {
				const key = raw?.trim().toLowerCase();
				if (!key) continue;
				const seen = byName.get(key);
				if (seen === undefined) {
					byName.set(key, { prId: pr.id, photo });
				} else if (seen === null || seen.prId !== pr.id) {
					byName.set(key, null);
				}
			}
		}

		return (prId, prName) => {
			// An id we hold is the whole answer, including "this PR has no photo".
			// Falling through to the name here is what would let a namesake's face
			// stand in for a PR whose profile is genuinely blank.
			if (prId && known.has(prId)) return byId.get(prId) ?? null;
			const key = prName?.trim().toLowerCase();
			if (!key) return null;
			// `undefined` (nobody by that name) and `null` (two people) both mean
			// there is no photo we can stand behind.
			return byName.get(key)?.photo ?? null;
		};
	}, [prs]);
}
