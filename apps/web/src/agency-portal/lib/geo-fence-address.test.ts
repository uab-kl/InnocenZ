import { describe, expect, it } from "vitest";
import type { GeocodeCandidate } from "@/services/outlet";
import { geoFenceAddressSync } from "./geo-fence-address";

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
