import { describe, expect, it } from "vitest";
import { outletProfileCard } from "./outlet-profile-card";

/**
 * THE OUTLET PROFILE SHOWED THE DEMO IDENTITY (29 Sep 2026 audit, live).
 *
 * The card read the demo store's `user`, which is not persisted — after any
 * reload a real operator saw "Manager · guest@innocenz.app" under a constant
 * "Verified", with the store's venue standing in until the row loaded.
 */
const demo = {
	user: null,
	venueName: "Velvet 23",
	location: "Bukit Bintang, KL",
	fallbackName: "Manager",
};

describe("outletProfileCard", () => {
	it("a real session shows the signed-in account and the venue row", () => {
		const card = outletProfileCard({
			backed: true,
			me: { username: "siaw long", email: "ops@emhub.my", contactNo: "" },
			settings: { venueName: "UAB Emhub", location: "Jalan Ampang, KL" },
			orgStatus: "active",
			demo,
		});
		expect(card).toEqual({
			name: "siaw long",
			email: "ops@emhub.my",
			initial: "S",
			venue: "UAB Emhub",
			location: "Jalan Ampang, KL",
			status: "verified",
		});
	});

	it("never falls back to the demo identity or venue on a real session", () => {
		const card = outletProfileCard({
			backed: true,
			me: null,
			settings: null,
			orgStatus: "active",
			demo: {
				...demo,
				user: { name: "Velvet 23", email: "demo@velvet23.invalid" },
			},
		});
		expect(card.name).toBe("—");
		expect(card.email).toBe("—");
		expect(card.venue).toBe("—");
		expect(card.location).toBe("—");
		expect(JSON.stringify(card)).not.toMatch(/Velvet|guest@innocenz|Manager/);
	});

	it("the shield says what is true of the venue", () => {
		const base = { backed: true, me: null, settings: null, demo };
		expect(
			outletProfileCard({ ...base, orgStatus: "pending_review" }).status,
		).toBe("pending");
		expect(outletProfileCard({ ...base, orgStatus: "suspended" }).status).toBe(
			"suspended",
		);
	});

	it("uses one letter for the avatar, not the whole name upper-cased", () => {
		const card = outletProfileCard({
			backed: false,
			demo: { ...demo, user: { name: "alex", email: "a@x.my" } },
		});
		expect(card.initial).toBe("A");
		expect(card.name).toBe("alex");
	});

	it("a demo session keeps the demo store", () => {
		const card = outletProfileCard({ backed: false, demo });
		expect(card.name).toBe("Manager");
		expect(card.venue).toBe("Velvet 23");
	});
});
