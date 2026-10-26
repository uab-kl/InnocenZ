import {
	EMPTY_ROSTER_SHIFT_FILTERS,
	EMPTY_ROSTER_TIMETABLE_FILTERS,
} from "@agency-portal/lib/roster-shift-filters";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import { RosterShiftFilters } from "./RosterShiftFilters";
import { RosterTimetableFilters } from "./RosterTimetableFilters";

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return { usePortalLocale: () => ({ t: translations.en, locale: "en" }) };
});

afterEach(cleanup);

function LiveFilters() {
	const [filters, setFilters] = useState(EMPTY_ROSTER_SHIFT_FILTERS);
	return (
		<RosterShiftFilters
			filters={filters}
			onChange={(patch) =>
				setFilters((previous) => ({ ...previous, ...patch }))
			}
			resultCount={2}
			totalCount={4}
			outletNames={["Registered venue"]}
		/>
	);
}

function PlanningFilters() {
	const [filters, setFilters] = useState(EMPTY_ROSTER_TIMETABLE_FILTERS);
	return (
		<RosterTimetableFilters
			filters={filters}
			onChange={(patch) =>
				setFilters((previous) => ({ ...previous, ...patch }))
			}
			prCount={2}
			totalPrs={4}
			shiftCount={3}
			totalShifts={5}
			outletNames={["Registered venue"]}
		/>
	);
}

describe("Roster phone filter disclosures", () => {
	for (const [name, Filters, label] of [
		["Live", LiveFilters, translations.en.filters.filterShifts],
		["Planning", PlanningFilters, translations.en.filters.filters],
	] as const) {
		it(`${name} preserves actual filter values through close/reopen and still clears them`, () => {
			const view = render(<Filters />);
			const toggle = view.getByRole("button", { name: label });
			const panelId = toggle.getAttribute("aria-controls");
			expect(panelId).toBeTruthy();
			expect(document.getElementById(panelId!)).toBeTruthy();
			expect(toggle.getAttribute("aria-expanded")).toBe("false");
			fireEvent.click(toggle);
			expect(toggle.getAttribute("aria-expanded")).toBe("true");
			const search = view.getByRole("searchbox") as HTMLInputElement;
			const outlet = view.getByLabelText(
				translations.en.filters.outlet,
			) as HTMLSelectElement;
			fireEvent.change(search, { target: { value: "Mei" } });
			fireEvent.change(outlet, { target: { value: "Registered venue" } });
			fireEvent.click(toggle);
			expect(toggle.getAttribute("aria-expanded")).toBe("false");
			fireEvent.click(toggle);
			expect(search.value).toBe("Mei");
			expect(outlet.value).toBe("Registered venue");
			fireEvent.click(view.getByRole("button", { name: /Clear filters/ }));
			expect(search.value).toBe("");
			expect(outlet.value).toBe("");
			expect(toggle.getAttribute("aria-expanded")).toBe("true");
		});
	}
});
