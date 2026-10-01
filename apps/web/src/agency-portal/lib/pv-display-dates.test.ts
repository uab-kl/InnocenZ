import { describe, expect, it } from "vitest";
import { pvDisplayDates } from "@agency-portal/lib/pv-display-dates";
import { translations } from "@/lib/portal-i18n/translations";

const en = translations.en;
const zh = translations.zh;

describe("pvDisplayDates — a real voucher's stored dates, readable", () => {
	it("prints the backend's issued and pay-by dates", () => {
		expect(
			pvDisplayDates({ issued: "2026-09-20", due: "2026-09-26" }, en),
		).toEqual({
			issued: "20 Sep 2026",
			payBy: "26 Sep 2026",
		});
	});

	it("follows the language switch for the month", () => {
		expect(
			pvDisplayDates({ issued: "2026-09-20", due: "2026-09-26" }, zh).issued,
		).toBe(`20 ${zh.dates.monShortSep} 2026`);
	});

	it("says '—' for a date the voucher does not carry, never a blank or a guess", () => {
		// The shape PV-000005 had: raised, never sent — no pay-by stored.
		expect(pvDisplayDates({ issued: "2026-09-03", due: "" }, en)).toEqual({
			issued: "3 Sep 2026",
			payBy: "—",
		});
		expect(pvDisplayDates({ issued: "", due: "" }, en)).toEqual({
			issued: "—",
			payBy: "—",
		});
	});

	it("keeps a demo voucher's own strings and pay-by rule", () => {
		const demo = pvDisplayDates({ issued: "10 May 2026", due: "" }, en);
		expect(demo.issued).toBe("10 May 2026");
		// The demo formula: 14 days after issue, on that week's Wednesday.
		expect(demo.payBy).not.toBe("—");
	});
});
