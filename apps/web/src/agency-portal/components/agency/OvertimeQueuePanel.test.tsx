import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * THE ONE BEHAVIOUR THIS PANEL MUST NOT LOSE AGAIN: AN UNDECIDED CLAIM IS
 * REACHABLE FROM SOME TAB.
 *
 * Reported 7 Sep 2026. Two claims worked on 20 and 22 Aug — the week of 16–22
 * Aug — blocked their voucher's send, and the voucher was still listed on the
 * payment week by that tab's own catch-all. Every Overtime tab, though, tested
 * strict containment, so all three read 0 and the panel's amber line told the
 * agency to "switch weeks above" to a week the strip did not offer. The money
 * was stuck with no control anywhere in the product to unstick it.
 *
 * Asserted at the component, not only on `dayBelongsToWeekTab`: the helper
 * being right is no use if the panel forgets to pass the flag.
 *
 * The data hook, the store, the permission and the locale are mocked — this is
 * about which claims the panel SHOWS, not about react-query or the dictionary.
 */

const mockUseAgencyOvertime = vi.fn();

vi.mock("@agency-portal/hooks/use-agency-overtime", () => ({
	useAgencyOvertime: () => mockUseAgencyOvertime(),
}));

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (selector: (s: { toast: () => void }) => unknown) =>
		selector({ toast: vi.fn() }),
}));

vi.mock("@agency-portal/lib/use-portal-can", () => ({
	useAgencyCan: () => () => true,
}));

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({
		// Echo the key back so an assertion cannot pass on a missing string.
		t: new Proxy(
			{},
			{
				get: (_t, section: string) =>
					new Proxy({}, { get: (_s, key: string) => `${section}.${key}` }),
			},
		),
	}),
}));

import { OvertimeQueuePanel } from "./OvertimeQueuePanel";

/** The payment week as it stood on Mon 7 Sep 2026 — the oldest tab there is. */
const PAYMENT_WEEK = { start: "2026-08-23", end: "2026-08-29" };

const claim = (over: Record<string, unknown> = {}) => ({
	assignmentId: "a1",
	prId: "pr1",
	prName: "Victoria Tan",
	shiftDate: "2026-08-20",
	slot: "21:00–03:00",
	outletName: "Velvet 23",
	overtimeMinutes: 90,
	payAmount: "250.00",
	week: { weekStart: "2026-08-16", weekEnd: "2026-08-22" },
	amount: "46.88",
	...over,
});

function renderPanel(claims: unknown[], includesOlder: boolean) {
	mockUseAgencyOvertime.mockReturnValue({
		claims,
		isLoading: false,
		decide: vi.fn(),
		isDeciding: false,
	});
	render(
		<OvertimeQueuePanel
			weekStartIso={PAYMENT_WEEK.start}
			weekEndIso={PAYMENT_WEEK.end}
			includesOlder={includesOlder}
		/>,
	);
}

const AGED = [
	claim(),
	claim({ assignmentId: "a2", prName: "Alice Wong", shiftDate: "2026-08-22" }),
];

describe("OvertimeQueuePanel week scoping", () => {
	it("shows a claim worked inside the selected week", () => {
		renderPanel([claim({ shiftDate: "2026-08-25" })], false);
		expect(screen.getByText(/Victoria Tan/)).toBeTruthy();
	});

	it("hides aged claims on an ordinary week, and says how many are elsewhere", () => {
		renderPanel(AGED, false);
		expect(screen.queryByText(/Victoria Tan/)).toBeNull();
		expect(screen.queryByText(/Alice Wong/)).toBeNull();
		expect(screen.getByText("payroll.noOvertimeThisWeek")).toBeTruthy();
		expect(screen.getByText(/agencyQueues.overtimeElsewhereMany/)).toBeTruthy();
	});

	it("LISTS those same aged claims on the catch-all payment week", () => {
		renderPanel(AGED, true);
		expect(screen.getByText(/Victoria Tan/)).toBeTruthy();
		expect(screen.getByText(/Alice Wong/)).toBeTruthy();
		expect(screen.queryByText("payroll.noOvertimeThisWeek")).toBeNull();
		// Nothing is stranded any more, so there is no "elsewhere" line to show.
		expect(screen.queryByText(/agencyQueues.overtimeElsewhere/)).toBeNull();
	});

	it("does not drag a LATER week's claim onto the catch-all week", () => {
		// Last Week still has a tab of its own to hold it; showing it here too
		// would put one claim under two tabs.
		renderPanel([claim({ prName: "Zara Lim", shiftDate: "2026-09-01" })], true);
		expect(screen.queryByText(/Zara Lim/)).toBeNull();
		expect(screen.getByText("payroll.noOvertimeThisWeek")).toBeTruthy();
	});
});
