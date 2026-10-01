import { describe, expect, it } from "vitest";
import type { GeocodeCandidate } from "@/services/outlet";
import {
	geocodeLosesDetail,
	geoFenceAddressSync,
	typedAddressSync,
} from "./geo-fence-address";

const candidate = (
	components: GeocodeCandidate["components"],
): GeocodeCandidate => ({
	formattedAddress: "somewhere",
	lat: 3.1,
	lng: 101.6,
	precision: "ROOFTOP",
	placeId: "p1",
	components,
});

const emHub = {
	addressLine1: "Kompleks Perindustrian EmHub, 3 Persiaran Surian",
	addressLine2: "Kota Damansara",
	city: "Petaling Jaya",
	postcode: "47810",
	state: "Selangor",
	country: "Malaysia",
};

describe("geoFenceAddressSync", () => {
	it("returns null when the candidate carries no address components", () => {
		expect(geoFenceAddressSync(candidate(undefined), emHub)).toBeNull();
	});

	it("returns null rather than blanking line 1 when the match has no street", () => {
		const sync = geoFenceAddressSync(
			candidate({ ...emHub, addressLine1: "  " }),
			emHub,
		);

		expect(sync).toBeNull();
	});

	it("reports no change when the pin's address is what the venue already stores", () => {
		const sync = geoFenceAddressSync(candidate(emHub), emHub);

		expect(sync?.differs).toBe(false);
	});

	it("reports a change, and resolves the state code, for a different venue", () => {
		const sync = geoFenceAddressSync(candidate(emHub), {
			addressLine1: "Jalan Bukit Bintang",
			addressLine2: "",
			city: "Kuala Lumpur",
			postcode: "55100",
			state: "Kuala Lumpur",
			country: "Malaysia",
		});

		expect(sync?.differs).toBe(true);
		expect(sync?.next.city).toBe("Petaling Jaya");
		expect(sync?.next.stateCode).toBeTruthy();
		expect(sync?.nextLabel).toContain("47810");
		expect(sync?.savedLabel).toContain("Bukit Bintang");
	});

	it("treats an outlet with no address on file as a change worth writing", () => {
		const sync = geoFenceAddressSync(candidate(emHub), null);

		expect(sync?.differs).toBe(true);
		expect(sync?.savedLabel).toBe("");
	});

	it("ignores case and padding when comparing — a re-search of the same venue is not a change", () => {
		const sync = geoFenceAddressSync(candidate(emHub), {
			...emHub,
			city: "  petaling jaya ",
		});

		expect(sync?.differs).toBe(false);
	});
});

describe("geocodeLosesDetail", () => {
	it("is true for a partial match, or a place Google knows without a street", () => {
		// UAB Emhub, 29 Sep 2026: the complex, addressed only by its suburb.
		expect(
			geocodeLosesDetail({ ...candidate(emHub), partialMatch: true, hasStreet: false }),
		).toBe(true);
		expect(geocodeLosesDetail({ ...candidate(emHub), hasStreet: false })).toBe(true);
		expect(geocodeLosesDetail({ ...candidate(emHub), partialMatch: true })).toBe(true);
	});

	it("is false for a full street-level match, and when an older backend says nothing", () => {
		expect(
			geocodeLosesDetail({ ...candidate(emHub), partialMatch: false, hasStreet: true }),
		).toBe(false);
		expect(geocodeLosesDetail(candidate(emHub))).toBe(false);
	});
});

describe("typedAddressSync", () => {
	const thinRow = {
		addressLine1: "Kota Damansara",
		addressLine2: "",
		city: "Petaling Jaya",
		postcode: "47810",
		state: "Selangor",
		country: "Malaysia",
	};
	// What Google answered for UAB Emhub on 29 Sep 2026.
	const emHubMatch = {
		...candidate(thinRow),
		partialMatch: true,
		hasStreet: false,
	};

	it("keeps the street the operator typed and takes the area from the match", () => {
		const sync = typedAddressSync(
			"Kompleks Perindustrian EmHub, Persiaran Surian, Seksyen 3, Taman Sains Selangor, Kota Damansara, 47810 Petaling Jaya, Selangor, Malaysia",
			emHubMatch,
			thinRow,
		);
		expect(sync?.next).toMatchObject({
			addressLine1: "Kompleks Perindustrian EmHub, Persiaran Surian",
			addressLine2: "Seksyen 3, Taman Sains Selangor, Kota Damansara",
			city: "Petaling Jaya",
			postcode: "47810",
			state: "Selangor",
			country: "Malaysia",
		});
		expect(sync?.differs).toBe(true);
	});

	it("puts a short name on line 1 and fills the rest from the match", () => {
		const oneUtama = candidate({
			addressLine1: "1, Lebuh Bandar Utama",
			addressLine2: "Bandar Utama",
			city: "Petaling Jaya",
			postcode: "47800",
			state: "Selangor",
			country: "Malaysia",
		});
		expect(typedAddressSync("1 Utama", oneUtama, null)?.next).toMatchObject({
			addressLine1: "1 Utama",
			addressLine2: "",
			city: "Petaling Jaya",
			postcode: "47800",
			state: "Selangor",
		});
	});

	it("lets a typed postcode and city win over the match's", () => {
		const elsewhere = candidate({ ...thinRow, postcode: "47800" });
		expect(
			typedAddressSync("Lot 5, Jalan Surian, 47810 Petaling Jaya", elsewhere, null)
				?.next,
		).toMatchObject({ addressLine1: "Lot 5, Jalan Surian", postcode: "47810" });
	});

	it("returns null when everything typed is area, not street", () => {
		expect(
			typedAddressSync("Petaling Jaya, Selangor, Malaysia", emHubMatch, thinRow),
		).toBeNull();
	});
});
