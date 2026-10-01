import { describe, expect, it } from "vitest";
import { monthTotals } from "./OutletOperationsCalendar";

/**
 * The strip's from-today totals. `ISO_DATE_RE` was written `/^d{4}-d{2}-d{2}$/`
 * (letter d's) on 20 Aug 2026, so no real date ever counted as "from today" and
 * demand, supplied and unfilled all read 0 for six weeks.
 */
type Events = Parameters<typeof monthTotals>[0];

function events(...days: Array<[string, number, number]>): Events {
	return days.map(([dateIso, demand, supplied]) => ({
		dateIso,
		demand,
		supplied,
	})) as unknown as Events;
}

describe("monthTotals — the calendar strip", () => {
	it("counts demand and supply from today onwards, and every shift in the month", () => {
		const totals = monthTotals(
			events(["2026-09-01", 5, 5], ["2026-09-30", 4, 1], ["2026-10-02", 3, 0]),
			"2026-09-30",
		);
		expect(totals).toEqual({ shifts: 3, demand: 7, supplied: 1, unfilled: 6 });
	});

	it("a value that is not a YYYY-MM-DD date is never counted as upcoming", () => {
		expect(
			monthTotals(
				events(["dddd-dd-dd", 9, 0], ["30/09/2026", 9, 0]),
				"2026-01-01",
			),
		).toEqual({
			shifts: 2,
			demand: 0,
			supplied: 0,
			unfilled: 0,
		});
	});
});
