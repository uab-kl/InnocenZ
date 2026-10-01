import type { OutletShiftPostItem } from "@agency-portal/lib/backend-shift-map";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST JOB POSTS ALL OR NOTHING (30 Sep 2026).
 *
 * The hook used to send one `POST /shift` per composed shift. A refusal halfway
 * left the earlier ones written while the form still held every one of them,
 * and `onSuccess` never ran, so the posted ones did not even appear until a
 * refetch. It now sends the whole composer as ONE `POST /shift/batch`, which the
 * server writes in one transaction or not at all — pinned here: one request,
 * the server's own sentence back, the same caches refreshed on success, and
 * nothing refreshed on a refusal (nothing was posted).
 */

const OUTLET = "11111111-1111-4111-8111-111111111111";
const ATLAS = "44444444-4444-4444-8444-444444444444";
const createShiftsBatch = vi.fn();

vi.mock("@/services/shift", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/services/shift")>()),
	createShiftsBatch: (...args: unknown[]) => createShiftsBatch(...args),
}));
vi.mock("@agency-portal/hooks/use-outlet-shared-queries", () => ({
	outletAssignmentsKey: ["outlet", "today", "assignments"],
	fetchAllOutletShifts: async () => ({ data: [] }),
	fetchAllOutletAssignments: async () => ({ data: [] }),
}));
vi.mock("@agency-portal/lib/outlet-identity", () => ({
	getOutletIdentity: () => ({ outletId: OUTLET, outletName: "Emhub" }),
}));
vi.mock("@/lib/auth-context", () => ({
	useAuth: () => ({ logout: vi.fn() }),
}));

import { useOutletPostJob } from "./use-outlet-post-job";

function setup() {
	const client = new QueryClient({
		defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
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
		...renderHook(() => useOutletPostJob(), { wrapper }),
	};
}

/** One composed shift, as Post Job hands it over. */
function composed(dateIso: string): OutletShiftPostItem {
	return {
		dateIso,
		shift: "22:00 - 04:00",
		quantity: 4,
		languages: "",
		event: "Ladies Night",
		preferredRating: 4,
		estimatedCost: 0,
		payPerHour: 0,
	};
}

beforeEach(() => {
	createShiftsBatch.mockReset();
});

describe("useOutletPostJob — postShifts", () => {
	it("posts every composed shift in ONE request and answers with the server's sentence", async () => {
		createShiftsBatch.mockResolvedValue({
			message: "Posted 2 shifts",
			shifts: [],
		});
		const { result, invalidate } = setup();
		expect(result.current.backed).toBe(true);

		let message: string | undefined;
		await act(async () => {
			message = await result.current.postShifts(
				[composed("2026-10-10"), composed("2026-10-11")],
				[ATLAS],
			);
		});

		expect(createShiftsBatch).toHaveBeenCalledTimes(1);
		const [inputs] = createShiftsBatch.mock.calls[0] as [unknown[]];
		// Each item is exactly what a single post would have sent.
		expect(inputs).toEqual([
			expect.objectContaining({
				outletId: OUTLET,
				shiftDate: "2026-10-10",
				slot: "22:00 - 04:00",
				eventName: "Ladies Night",
				quantity: 4,
				agencyIds: [ATLAS],
			}),
			expect.objectContaining({ outletId: OUTLET, shiftDate: "2026-10-11" }),
		]);
		expect(message).toBe("Posted 2 shifts");
		// Today / History / Calendar and the roster grids re-read the new shifts.
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["outlet"] });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: ["roster"] });
	});

	it("lets a refusal reach the screen, and refreshes nothing — nothing was posted", async () => {
		createShiftsBatch.mockImplementation(() =>
			Promise.reject(new Error("refused")),
		);
		const { result, invalidate } = setup();

		await expect(
			result.current.postShifts([
				composed("2026-10-10"),
				composed("2026-10-11"),
			]),
		).rejects.toThrow("refused");

		// Still ONE request — the old loop stopped part-way, after writing some.
		expect(createShiftsBatch).toHaveBeenCalledTimes(1);
		expect(invalidate).not.toHaveBeenCalled();
	});
});
