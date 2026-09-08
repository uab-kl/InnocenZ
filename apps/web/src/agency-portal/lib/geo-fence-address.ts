import {
	joinOrgAddress,
	type OrgAddress,
	orgAddressFromRow,
	resolveOrgAddressForSave,
} from "@agency-portal/lib/org-address";
import type { GeocodeCandidate } from "@/services/outlet";

/** The six address columns, as stored on the outlet row. */
type AddressRow = {
	addressLine1?: string | null;
	addressLine2?: string | null;
	city?: string | null;
	postcode?: string | null;
	state?: string | null;
	country?: string | null;
};

/** What committing one geocode candidate would do to the venue's address. */
export interface GeoFenceAddressSync {
	/** The address the pick would write, resolved exactly as Settings saves it. */
	next: OrgAddress;
	/** One-line display of what would be written. */
	nextLabel: string;
	/** One-line display of what the venue says today ("" when it says nothing). */
	savedLabel: string;
	/** False when the pin's address is already what the venue stores. */
	differs: boolean;
}

const same = (a: string, b: string) =>
	a.trim().toLowerCase().replace(/\s+/g, " ") ===
	b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Pairs a geocode candidate with the venue's stored address, so the operator
 * can see — before committing — that moving the pin also moves the address.
 *
 * The two halves used to drift apart in exactly one direction: "Find from
 * venue address" derives the pin FROM the address, but a free-text search
 * moved the pin alone and left the address describing the old venue. Nothing
 * downstream reconciles them, and the fence is measured from the pin, so the
 * address on screen could quietly stop being the place staff must stand in.
 *
 * Returns `null` when there is nothing to write — an older candidate with no
 * components, or a match so vague it has no street line. Blanking a real
 * address to "match" a pin would be worse than leaving it alone.
 */
export function geoFenceAddressSync(
	candidate: GeocodeCandidate,
	savedRow: AddressRow | null | undefined,
): GeoFenceAddressSync | null {
	const components = candidate.components;
	if (!components?.addressLine1?.trim()) return null;

	const next = orgAddressFromRow(components);
	const resolved = resolveOrgAddressForSave(next);
	const saved = orgAddressFromRow(savedRow);

	const differs = (
		[
			"addressLine1",
			"addressLine2",
			"city",
			"postcode",
			"state",
			"country",
		] as const
	).some((field) => !same(resolved[field], saved[field]));

	return {
		next: { ...next, ...resolved, stateCode: next.stateCode },
		nextLabel: joinOrgAddress(resolved),
		savedLabel: joinOrgAddress(saved),
		differs,
	};
}
