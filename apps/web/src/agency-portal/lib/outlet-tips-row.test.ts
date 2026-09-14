import type { OutletDrinkPrice } from "@agency-portal/lib/outlet-demo";
import { isOutletTipsRow } from "@agency-portal/lib/outlet-demo";
import { describe, expect, it } from "vitest";

/**
 * `isOutletTipsRow` decides whether the Workspace editor LOCKS a row — fixed
 * name, no Delete, no Move. `OutletDrinkMenuEditor` recomputes it on every
 * render, and the name field writes on every keystroke, so anything this
 * function reads from the row's live text becomes a trap: the row freezes
 * mid-word, and a readOnly input refuses backspace, so it can be neither
 * finished nor removed without discarding the draft.
 *
 * Hence identity only. These tests exist to stop a name test being added back.
 */
const row = (r: Partial<OutletDrinkPrice>): OutletDrinkPrice => ({
	id: "service-1789349832636",
	name: "",
	priceRm: 0,
	category: "service",
	...r,
});

describe("isOutletTipsRow", () => {
	it("locks the seeded row by its id", () => {
		expect(isOutletTipsRow(row({ id: "tips", name: "Tips" }))).toBe(true);
	});

	it("locks a venue's own row by its stored tip category", () => {
		expect(isOutletTipsRow(row({ name: "Tips", category: "tip" }))).toBe(true);
	});

	it("does NOT lock a row a venue is still typing a name into", () => {
		// Every prefix of "Tipsy" — including the exact word "Tips", which a name
		// test would have frozen on, leaving the row unfinishable.
		for (const name of ["T", "Ti", "Tip", "Tips", "Tipsy"]) {
			expect(isOutletTipsRow(row({ name })), name).toBe(false);
		}
	});

	it("does NOT lock a service a venue chose to call Tips", () => {
		expect(isOutletTipsRow(row({ name: "Tips & extras" }))).toBe(false);
		expect(isOutletTipsRow(row({ name: "tips" }))).toBe(false);
	});

	it("leaves ordinary rows alone", () => {
		expect(isOutletTipsRow(row({ id: "havoc", name: "Havoc" }))).toBe(false);
		expect(
			isOutletTipsRow(row({ id: "cosmo", name: "Cosmo", category: "drink" })),
		).toBe(false);
	});
});
