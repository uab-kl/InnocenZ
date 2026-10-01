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

/**
 * Is Google's address for this match thinner than an address a person typed?
 *
 * A named place can be found while its address is not: UAB Emhub's own
 * "Kompleks Perindustrian EmHub, Persiaran Surian, Seksyen 3…" answers the
 * EmHub complex — the right pin — addressed only "Kota Damansara, 47810
 * Petaling Jaya", and flagged a partial match. Offered as "also update the
 * venue address", that replaced the typed street with the suburb (29 Sep
 * 2026). Such a match may move the pin; it must not rewrite the address
 * unless the operator asks. Unknown (an older backend) reads as not thin.
 */
export function geocodeLosesDetail(candidate: GeocodeCandidate): boolean {
	return candidate.partialMatch === true || candidate.hasStreet === false;
}

const ADDRESS_FIELDS = [
	"addressLine1",
	"addressLine2",
	"city",
	"postcode",
	"state",
	"country",
] as const;

/** A Malaysian postcode, alone or leading its city: "47810 Petaling Jaya". */
const POSTCODE_CITY = /^(\d{5})(?:\s+(.+))?$/;

const norm = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * The address the operator TYPED, as the six columns — "Use the address you
 * entered" (owner, 29 Sep 2026), for a place Google finds but addresses too
 * thinly. The street lines are the operator's own words; a typed postcode
 * (and its city) wins; state and country come from the match, whose spelling
 * the state picker resolves. The first two segments go on line 1 and the rest
 * on line 2 — the split UAB Emhub's own row used. Null when everything typed
 * is area, not street: there is nothing of theirs to keep.
 */
export function typedAddressSync(
	typed: string,
	candidate: GeocodeCandidate,
	savedRow: AddressRow | null | undefined,
): GeoFenceAddressSync | null {
	const parts = candidate.components;
	const segments = typed
		.split(",")
		.map((segment) => segment.trim())
		.filter(Boolean);
	const known = new Set(
		[parts?.city, parts?.state, parts?.country]
			.filter((part): part is string => Boolean(part?.trim()))
			.map(norm),
	);

	let postcode = parts?.postcode ?? "";
	let city = parts?.city ?? "";
	let end = segments.length;
	while (end > 0) {
		const segment = segments[end - 1] as string;
		const postal = segment.match(POSTCODE_CITY);
		if (postal) {
			postcode = postal[1] as string;
			if (postal[2]) city = postal[2].trim();
		} else if (!known.has(norm(segment))) {
			break;
		}
		end -= 1;
	}
	const street = segments.slice(0, end);
	if (street.length === 0) return null;

	const next = orgAddressFromRow({
		addressLine1: street.slice(0, 2).join(", "),
		addressLine2: street.slice(2).join(", "),
		city,
		postcode,
		state: parts?.state ?? "",
		country: parts?.country ?? "",
	});
	const resolved = resolveOrgAddressForSave(next);
	const saved = orgAddressFromRow(savedRow);
	return {
		next: { ...next, ...resolved, stateCode: next.stateCode },
		nextLabel: joinOrgAddress(resolved),
		savedLabel: joinOrgAddress(saved),
		differs: ADDRESS_FIELDS.some((field) => !same(resolved[field], saved[field])),
	};
}
