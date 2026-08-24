import { describe, expect, it } from "vitest";
import {
	createShiftInputFromPost,
	type OutletShiftPostItem,
} from "./backend-shift-map";

/**
 * THE LINK THAT WAS BROKEN.
 *
 * Dress code was collected in the composer and VALIDATED there (posting refuses
 * an "Other" with no text), and then this mapper dropped it on the floor — its
 * own comment used to say the field was "demo-only". Three screens rendered
 * `shift.dressCode` and never once drew the row, because on a real session the
 * value was always undefined.
 *
 * A green tsc cannot catch that: the type says the field exists, only a test
 * says the mapper COPIES it. Same reason `languages` is asserted alongside —
 * the two travel together and one silently going missing is the whole bug.
 */
const OUTLET_ID = "11111111-1111-4111-8111-111111111111";

function postItem(dressCode?: string): OutletShiftPostItem {
	return {
		dateIso: "2026-08-24",
		shift: "11:00 - 12:00",
		quantity: 6,
		languages: "Cantonese / English / Hokkien",
		dressCode,
		event: "Friday lounge",
		preferredRating: 0,
		estimatedCost: 3000,
		payPerHour: 500,
	};
}

describe("createShiftInputFromPost — the venue's asks", () => {
	it("carries a picked dress code through to the request body", () => {
		expect(
			createShiftInputFromPost(postItem("Black elegant"), OUTLET_ID).dressCode,
		).toBe("Black elegant");
	});

	it("carries the preferred languages alongside it", () => {
		expect(
			createShiftInputFromPost(postItem("Black elegant"), OUTLET_ID).languages,
		).toBe("Cantonese / English / Hokkien");
	});

	it("trims a venue's own Other text rather than dropping it", () => {
		expect(
			createShiftInputFromPost(postItem("  Heels and black tie  "), OUTLET_ID)
				.dressCode,
		).toBe("Heels and black tie");
	});

	it("clips an over-long dress code to the column's 60, so a post cannot 400", () => {
		// The server refuses 61 (zod), and losing a whole shift over a long dress
		// code would be a worse answer than a clipped one.
		expect(
			createShiftInputFromPost(postItem("x".repeat(80)), OUTLET_ID).dressCode,
		).toHaveLength(60);
	});

	it("omits the field entirely when no dress code was given", () => {
		// ABSENT, never "" — an empty string is a value, and every reader gates on
		// truthiness to decide whether to draw a labelled row at all.
		expect(
			createShiftInputFromPost(postItem(undefined), OUTLET_ID).dressCode,
		).toBeUndefined();
		expect(
			createShiftInputFromPost(postItem("   "), OUTLET_ID).dressCode,
		).toBeUndefined();
	});
});
