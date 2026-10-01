import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * RATING SUBMIT DID NOTHING ON A REAL SESSION (29 Sep 2026 audit).
 *
 * The Today sheet handed Submit to the demo store's `ratePr`, which starts by
 * finding the PR in the demo `prs` slice — blanked on every real login — and
 * returns when it is not there. No request, no toast; the sheet just closed.
 * The sheet now posts through this hook, which must carry the venue, the PR's
 * name as the card shows it, and the shift being rated.
 */

const OUTLET = "11111111-1111-4111-8111-111111111111";
const submitRating = vi.fn();
const fetchRatings = vi.fn(async () => ({
	success: true,
	message: "OK",
	data: [],
}));

vi.mock("@/services/rating", () => ({
	submitRating: (...args: unknown[]) => submitRating(...args),
	fetchRatings: () => fetchRatings(),
}));
vi.mock("@agency-portal/lib/outlet-identity", () => ({
	getOutletIdentity: () => ({ outletId: OUTLET, outletName: "Emhub" }),
}));
vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: vi.fn() }),
}));

import { useSubmitOutletRating } from "./use-outlet-ratings";

function setup() {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	const invalidate = vi.fn();
	client.invalidateQueries = ((filters: unknown) => {
		invalidate(filters);
		return Promise.resolve();
	}) as QueryClient["invalidateQueries"];
	const wrapper = ({ children }: { children: ReactNode }) => (
		<QueryClientProvider client={client}>{children}</QueryClientProvider>
	);
	return {
		invalidate,
		...renderHook(() => useSubmitOutletRating(), { wrapper }),
	};
}

describe("useSubmitOutletRating", () => {
	it("posts the rating for this venue, with the PR's name and the rated shift", async () => {
		submitRating.mockResolvedValue({ success: true, message: "Rating saved" });
		const { result, invalidate } = setup();
		expect(result.current.backed).toBe(true);

		await act(async () => {
			await result.current.submit({
				prId: "pr-1",
				prName: "Vicky",
				stars: 4,
				note: "Great upsell",
				tags: ["Great upsell"],
				shiftId: "shift-1",
			});
		});

		expect(submitRating).toHaveBeenCalledWith(
			{
				outletId: OUTLET,
				prId: "pr-1",
				prName: "Vicky",
				stars: 4,
				note: "Great upsell",
				tags: ["Great upsell"],
				shiftId: "shift-1",
			},
			expect.any(Function),
		);
		// The venue's list (and the Post Job pool averaging it) re-reads.
		expect(invalidate).toHaveBeenCalledWith({
			queryKey: ["outlet", "ratings", OUTLET],
		});
	});

	it("lets a refusal reach the caller instead of swallowing it", async () => {
		submitRating.mockImplementation(() =>
			Promise.reject(new Error("Forbidden")),
		);
		const { result } = setup();
		// The sheet keeps itself open on exactly this rejection, so it must arrive.
		await expect(
			result.current.submit({ prId: "pr-1", stars: 2, note: "", tags: [] }),
		).rejects.toThrow("Forbidden");
	});
});
