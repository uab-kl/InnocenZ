import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { prPoolEmptyHint } from "./use-outlet-pr-pool";

/**
 * What Post Job's Select PRs picker says while it has nobody to show (1 Oct
 * 2026). A failed read of the pool used to fall through to "No PRs to name
 * yet", which tells a venue with a full roster that it has nobody — the server
 * now answers 500 for that failure, and the picker says the list did not load.
 */

const copy = {
	loading: "Loading your PRs…",
	failed: "Could not load your PRs — refresh the page to try again.",
	none: "No PRs to name yet",
};

describe("prPoolEmptyHint", () => {
	it("a demo session says nothing — it draws its own store", () => {
		expect(
			prPoolEmptyHint({ backed: false, isLoading: false, isError: true }, copy),
		).toBeUndefined();
	});

	it("while the pool loads, it says so", () => {
		expect(
			prPoolEmptyHint({ backed: true, isLoading: true, isError: false }, copy),
		).toBe(copy.loading);
	});

	it("a FAILED read says the list did not load — never that there is nobody", () => {
		const hint = prPoolEmptyHint(
			{ backed: true, isLoading: false, isError: true },
			copy,
		);
		expect(hint).toBe(copy.failed);
		expect(hint).not.toBe(copy.none);
	});

	it("a venue that genuinely has nobody to name yet is told that", () => {
		expect(
			prPoolEmptyHint({ backed: true, isLoading: false, isError: false }, copy),
		).toBe(copy.none);
	});

	it("both languages carry the failed sentence, apart from the empty one", () => {
		for (const locale of ["en", "zh"] as const) {
			const { couldNotLoadPrs, noPrsToNameYet } = translations[locale].postJob;
			expect(couldNotLoadPrs.length).toBeGreaterThan(0);
			expect(couldNotLoadPrs).not.toBe(noPrsToNameYet);
		}
	});
});
