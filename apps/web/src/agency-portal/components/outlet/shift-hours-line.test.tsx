import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * THE HOURS LINE ON A HISTORY NIGHT (outlet and agency History both render it).
 *
 * Velvet 23's 23 Jul 22:00–04:00 night was stamped 23 Jul 10:48 → 28 Jul 09:56
 * and History printed "119.13h shift" as if it were a shift. Over 16 h the line
 * now says the check-out looks wrong, in both languages, and an ordinary night
 * is untouched. Rendered with the REAL dictionaries.
 */

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));

vi.mock("@/lib/portal-i18n/context", async () => {
	const { translations } = await import("@/lib/portal-i18n/translations");
	return {
		usePortalLocale: () => ({
			t: translations[localeState.locale],
			locale: localeState.locale,
		}),
	};
});

vi.mock("@agency-portal/lib/store", () => ({
	useStore: (select: (s: unknown) => unknown) =>
		select({
			agencyPRs: [],
			outletCommissionRules: [],
			outletWorkspace: { perDrinkRm: 150 },
		}),
}));

import { fill } from "@/lib/portal-i18n/fill";
import { translations } from "@/lib/portal-i18n/translations";
import { ShiftHoursLine } from "./outlet-history-ui";

afterEach(() => {
	cleanup();
	localeState.locale = "en";
});

describe("ShiftHoursLine", () => {
	it("prints an ordinary night as its hours", () => {
		render(
			<ShiftHoursLine
				className="iz-tiny"
				hours={6}
				label={fill(translations.en.izPv.hoursShift, { n: 6 })}
			/>,
		);
		expect(screen.getByText("6h shift")).toBeTruthy();
		expect(screen.queryByText(/Check-out looks wrong/)).toBeNull();
	});

	it("says the check-out looks wrong instead of a 119.13h shift", () => {
		render(
			<ShiftHoursLine
				className="iz-tiny"
				hours={119.13}
				label={fill(translations.en.izPv.hoursShift, { n: 119.13 })}
			/>,
		);
		const note = screen.getByText("Check-out looks wrong · 119.13h clocked");
		expect(note.getAttribute("title")).toBe(
			translations.en.history.checkOutLooksWrongHint,
		);
		expect(screen.queryByText("119.13h shift")).toBeNull();
	});

	it("says it in 中文 too", () => {
		localeState.locale = "zh";
		render(
			<ShiftHoursLine
				className="iz-tiny"
				hours={23.61}
				label={fill(translations.zh.izPv.hoursShift, { n: 23.61 })}
			/>,
		);
		expect(
			screen.getByText("签退时间似乎有误 · 已打卡 23.61 小时"),
		).toBeTruthy();
	});
});
