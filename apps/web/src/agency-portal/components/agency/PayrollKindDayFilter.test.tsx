import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";

/**
 * THE PAYMENT WEEK'S DAY STRIP MUST REACH THE ROWS IT SITS ABOVE.
 *
 * Reported 22 Oct 2026: the payment week (window 4–10 Oct) listed aged pending
 * receipts from 26 Jul–19 Sep, while its strip offered only Sun 4 … Sat 10 —
 * every chip greyed, none able to select a row actually on screen. The older
 * nights now get "Earlier" rows of their own; the week row is unchanged.
 */

vi.mock("@/lib/portal-i18n/context", () => ({
	usePortalLocale: () => ({ t: translations.en, locale: "en" }),
}));

import { PayrollKindDayFilter } from "./PayrollKindDayFilter";

const WINDOW = { start: "2026-10-04", end: "2026-10-10" };

function renderStrip(olderDays?: string[], onDayChange = vi.fn()) {
	render(
		<PayrollKindDayFilter
			weekStartIso={WINDOW.start}
			weekEndIso={WINDOW.end}
			olderDays={olderDays}
			kinds={[]}
			day={null}
			onKindsChange={vi.fn()}
			onDayChange={onDayChange}
			kindCounts={{ drinks: 0, tips: 0 }}
			dayCounts={{ "2026-07-26": 1, "2026-09-13": 2 }}
			allDaysCount={3}
		/>,
	);
	return onDayChange;
}

describe("PayrollKindDayFilter on the payment week", () => {
	it("offers a selectable chip, month included, for each older listed night", () => {
		const onDayChange = renderStrip(["2026-07-26", "2026-09-13"]);
		expect(screen.getByText(translations.en.payroll.earlierDays)).toBeTruthy();

		const july = screen.getByRole("button", { name: /26 Jul/ });
		expect((july as HTMLButtonElement).disabled).toBe(false);
		fireEvent.click(july);
		expect(onDayChange).toHaveBeenCalledWith("2026-07-26");

		const sept = screen.getByRole("button", { name: /13 Sep/ });
		expect((sept as HTMLButtonElement).disabled).toBe(false);
	});

	it("keeps the week's own nights, greyed where nothing was logged", () => {
		renderStrip(["2026-07-26"]);
		const sunday = screen.getByRole("button", { name: /Sun 4\b/ });
		expect((sunday as HTMLButtonElement).disabled).toBe(true);
	});

	it("draws no Earlier row on an ordinary week", () => {
		renderStrip();
		expect(screen.queryByText(translations.en.payroll.earlierDays)).toBeNull();
		expect(screen.queryByRole("button", { name: /Jul/ })).toBeNull();
	});
});
