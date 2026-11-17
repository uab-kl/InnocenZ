import type { PrPaymentVoucher } from "@agency-portal/lib/pr-demo";
import { describe, expect, it } from "vitest";
import { ariaSortFor, nextSortState } from "@/lib/table-sort-state";
import { sortAgencyPvs } from "./pv-table-sort";

/** Just the fields the comparator reads: issued (display date), rows, deduct. */
function pv(
	id: string,
	name: string,
	issued: string,
	net: number,
): PrPaymentVoucher {
	return {
		id,
		prName: name,
		issued,
		deduct: 0,
		rows: [{ desc: "wage", amt: net }],
	} as unknown as PrPaymentVoucher;
}

const nameOf = (p: PrPaymentVoucher) =>
	(p as unknown as { prName: string }).prName;

const ROWS = [
	pv("a", "Vicky", "29 Sep 2026", 150),
	pv("b", "alice", "8 Sep 2026", 68.33),
	pv("c", "Bob", "14 Sep 2026", 216.67),
];

const ids = (list: PrPaymentVoucher[]) => list.map((p) => p.id);

describe("sortAgencyPvs", () => {
	it("leaves the list alone when nothing is sorted", () => {
		expect(sortAgencyPvs(ROWS, null, nameOf)).toBe(ROWS);
	});

	// Case-blind: "alice" must not sort after "Bob" just for being lower case.
	it("sorts names A–Z ignoring case, and Z–A", () => {
		expect(
			ids(sortAgencyPvs(ROWS, { field: "pr", direction: "asc" }, nameOf)),
		).toEqual(["b", "c", "a"]);
		expect(
			ids(sortAgencyPvs(ROWS, { field: "pr", direction: "desc" }, nameOf)),
		).toEqual(["a", "c", "b"]);
	});

	/*
	 * By DATE, not by the words: as strings "29 Sep" < "8 Sep" because "2" < "8",
	 * which would put the 29th before the 8th in an ascending sort.
	 */
	it("sorts issued by the calendar, not alphabetically", () => {
		expect(
			ids(sortAgencyPvs(ROWS, { field: "issued", direction: "asc" }, nameOf)),
		).toEqual(["b", "c", "a"]);
		expect(
			ids(sortAgencyPvs(ROWS, { field: "issued", direction: "desc" }, nameOf)),
		).toEqual(["a", "c", "b"]);
	});

	it("sorts net by amount", () => {
		expect(
			ids(sortAgencyPvs(ROWS, { field: "net", direction: "desc" }, nameOf)),
		).toEqual(["c", "a", "b"]);
	});

	// An unreadable date is MISSING, not 1 Jan 1970 — it must not lead.
	it("puts an unreadable issue date last in both directions", () => {
		const rows = [pv("x", "X", "not a date", 1), ...ROWS];
		for (const direction of ["asc", "desc"] as const) {
			const out = ids(
				sortAgencyPvs(rows, { field: "issued", direction }, nameOf),
			);
			expect(out[out.length - 1]).toBe("x");
		}
	});

	it("does not mutate the list it was given", () => {
		const copy = [...ROWS];
		sortAgencyPvs(ROWS, { field: "net", direction: "asc" }, nameOf);
		expect(ROWS).toEqual(copy);
	});

	it("keeps ties in one stable order", () => {
		const tied = [
			pv("2", "Same", "1 Oct 2026", 50),
			pv("1", "Same", "1 Oct 2026", 50),
		];
		const a = ids(
			sortAgencyPvs(tied, { field: "net", direction: "asc" }, nameOf),
		);
		const b = ids(
			sortAgencyPvs(
				[...tied].reverse(),
				{ field: "net", direction: "asc" },
				nameOf,
			),
		);
		expect(a).toEqual(b);
	});
});

describe("nextSortState / ariaSortFor", () => {
	it("starts a new column at the given direction and reverses on re-click", () => {
		const first = nextSortState(null, "issued");
		expect(first).toEqual({ field: "issued", direction: "desc" });
		expect(nextSortState(first, "issued")).toEqual({
			field: "issued",
			direction: "asc",
		});
		expect(nextSortState(first, "pr", "asc")).toEqual({
			field: "pr",
			direction: "asc",
		});
	});

	it("reports aria-sort only for the active column", () => {
		const s = { field: "net" as const, direction: "asc" as const };
		expect(ariaSortFor(s, "net")).toBe("ascending");
		expect(ariaSortFor(s, "pr" as "net")).toBe("none");
		expect(ariaSortFor(null, "net")).toBe("none");
	});
});
