import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE OUTLET LISTS STOP AT 100 NO MORE (29 Sep 2026 audit: Post Job "caps its
 * fetches at 100 rows").
 *
 * Every list controller clamps `pageSize` to 100 and returns the short page
 * with no error, so the old `pageSize: 500` request read one page and stopped.
 * These helpers are what every shared outlet key now fetches through; they
 * must ask for the server's real page size and keep going to the last page.
 */

const fetchShiftAssignments = vi.fn();
vi.mock("@/services/shift-assignment", () => ({
	fetchShiftAssignments: (...args: unknown[]) => fetchShiftAssignments(...args),
}));
vi.mock("@/services/shift", () => ({ fetchShifts: vi.fn() }));
vi.mock("@/services/pr-personnel", () => ({ fetchPrPersonnel: vi.fn() }));

import { fetchAllOutletAssignments } from "./use-outlet-shared-queries";

function page(n: number, rows: number, hasNextPage: boolean) {
	return {
		success: true,
		message: "OK",
		data: Array.from({ length: rows }, (_, i) => ({ id: `a-${n}-${i}` })),
		pagination: { page: n, pageSize: 100, hasNextPage },
	};
}

beforeEach(() => fetchShiftAssignments.mockReset());

describe("fetchAllOutletAssignments", () => {
	it("pages past the server's 100-row ceiling", async () => {
		fetchShiftAssignments
			.mockResolvedValueOnce(page(1, 100, true))
			.mockResolvedValueOnce(page(2, 37, false));

		const result = await fetchAllOutletAssignments(
			{ status: "completed" },
			() => {},
		);

		expect(result.data).toHaveLength(137);
		// Asks for what the server will actually give, and keeps the caller's filter.
		expect(fetchShiftAssignments).toHaveBeenNthCalledWith(
			1,
			{ status: "completed", page: 1, pageSize: 100 },
			expect.any(Function),
		);
		expect(fetchShiftAssignments).toHaveBeenNthCalledWith(
			2,
			{ status: "completed", page: 2, pageSize: 100 },
			expect.any(Function),
		);
	});

	it("keeps the { data } envelope every shared-key reader expects", async () => {
		fetchShiftAssignments.mockResolvedValueOnce(page(1, 3, false));
		const result = await fetchAllOutletAssignments({}, () => {});
		expect(Object.keys(result)).toEqual(["data"]);
	});
});
