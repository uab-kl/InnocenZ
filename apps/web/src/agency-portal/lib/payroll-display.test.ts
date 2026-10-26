import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	formatPayrollDay,
	formatPayrollStampDay,
	formatPayrollWeekRange,
	listedWeekSpan,
	memberDisplayName,
	olderStripDays,
	pvRefLabel,
	pvVoucherRef,
	withReadableLines,
} from "./payroll-display";

/**
 * What the payroll screens PRINT for values the database stores in its own
 * shape. Every case is one a live screen showed raw (22 Oct 2026): a uuid as
 * the paid voucher's heading, packed refs in the breakdown, ISO days, a user id
 * after "Reviewed by", and a Payment Week heading naming a week its list was
 * not in.
 */

const t = translations.en;
const zh = translations.zh;
const UUID = "7bf3962e-591e-452f-b781-edbe1cbe6ef0";

describe("formatPayrollDay", () => {
	it("prints a stored day in the portal's shape", () => {
		expect(formatPayrollDay("2026-08-16", t)).toBe("16 Aug 2026");
	});

	it("follows the language switch for the month word", () => {
		expect(formatPayrollDay("2026-08-16", zh)).toBe(
			`16 ${zh.dates.monShortAug} 2026`,
		);
	});

	it("never shifts the day through a timezone", () => {
		// A UTC-midnight parse would print 31 Jul west of Greenwich.
		expect(formatPayrollDay("2026-08-01", t)).toBe("1 Aug 2026");
	});

	it("says nothing is there rather than printing a blank", () => {
		expect(formatPayrollDay(null, t)).toBe("—");
	});

	it("hands back anything that is not a plain day untouched", () => {
		expect(formatPayrollDay("16 May", t)).toBe("16 May");
	});
});

describe("formatPayrollStampDay", () => {
	it("prints the local day a timestamp fell on", () => {
		const at = new Date(2026, 8, 14, 15, 30).toISOString();
		expect(formatPayrollStampDay(at, t)).toBe("14 Sep 2026");
	});

	it("is null when there is no usable stamp", () => {
		expect(formatPayrollStampDay(null, t)).toBeNull();
		expect(formatPayrollStampDay("not a date", t)).toBeNull();
	});
});

describe("formatPayrollWeekRange", () => {
	it("prints one year when the range stays inside it", () => {
		expect(formatPayrollWeekRange("2026-08-02", "2026-08-08", t)).toBe(
			"2 Aug – 8 Aug 2026",
		);
	});

	it("names both years when the range crosses one", () => {
		expect(formatPayrollWeekRange("2025-12-28", "2026-01-03", t)).toBe(
			"28 Dec 2025 – 3 Jan 2026",
		);
	});
});

describe("pvVoucherRef", () => {
	it("leads with the printed voucher number", () => {
		expect(pvVoucherRef({ id: UUID, voucherNo: " PV-000003 " })).toBe(
			"PV-000003",
		);
	});

	it("never offers a uuid as the voucher's name", () => {
		expect(pvVoucherRef({ id: UUID })).toBe("");
	});

	it("keeps a demo voucher's readable id", () => {
		expect(pvVoucherRef({ id: "PV-2026-0012" })).toBe("PV-2026-0012");
	});
});

describe("pvRefLabel", () => {
	it("names a scanned receipt line by its order number", () => {
		expect(pvRefLabel("drinks|scan|600.00|ORD1145:0|drink", t)).toBe("ORD1145");
	});

	it("names a wage line by where it came from, never by its assignment id", () => {
		expect(pvRefLabel(`wages|checkin|16.67|${UUID}|`, t)).toBe(
			t.receipts.checkIn,
		);
	});

	it("names overtime and penalty lines by their suffix", () => {
		expect(pvRefLabel(`others|checkin|0.00|${UUID}-ot|`, t)).toBe(
			t.payroll.overtimeShort,
		);
		expect(pvRefLabel(`others|penalty|0.00|${UUID}-pen|`, t)).toBe(
			t.payroll.refPenalty,
		);
	});

	it("falls back to the source when a receipt line carries no order", () => {
		expect(pvRefLabel("tips|manual|0.00||tip", t)).toBe(t.receipts.selfLogged);
		expect(pvRefLabel("drinks|scan|10.00||drink", t)).toBe(t.receipts.scanned);
	});

	it("shows a hand-typed reference as it is, but never a bare key", () => {
		expect(pvRefLabel("RCP-0042", t)).toBe("RCP-0042");
		expect(pvRefLabel(UUID, t)).toBe("—");
		expect(pvRefLabel("", t)).toBe("—");
	});
});

describe("withReadableLines", () => {
	it("returns a readable COPY and leaves the voucher's own rows packed", () => {
		const pv = {
			id: "x",
			rows: [{ date: "2026-09-13", ref: "drinks|scan|600.00|ORD1145:0|drink" }],
		};
		const shown = withReadableLines(pv, t);
		expect(shown.rows[0]).toEqual({ date: "13 Sep 2026", ref: "ORD1145" });
		// A line edit writes `rows` back — the packed ref must survive.
		expect(pv.rows[0].ref).toBe("drinks|scan|600.00|ORD1145:0|drink");
		expect(pv.rows[0].date).toBe("2026-09-13");
	});
});

describe("Payment Week: heading and day strip follow what is LISTED", () => {
	/** The live case: window 4–10 Oct, every listed voucher months older. */
	const WINDOW = { start: "2026-10-04", end: "2026-10-10" };

	it("spans the oldest listed week to the newest, not the tab's own window", () => {
		const span = listedWeekSpan([
			{ weekStartIso: "2026-09-13", weekEndIso: "2026-09-19" },
			{ weekStartIso: "2026-07-26", weekEndIso: "2026-08-01" },
			{ weekStartIso: "2026-08-16", weekEndIso: "2026-08-22" },
		]);
		expect(span).toEqual({ startIso: "2026-07-26", endIso: "2026-09-19" });
		expect(formatPayrollWeekRange(span?.startIso, span?.endIso, t)).toBe(
			"26 Jul – 19 Sep 2026",
		);
	});

	it("has no span to offer when nothing listed carries a week", () => {
		expect(listedWeekSpan([])).toBeNull();
		expect(listedWeekSpan([{}])).toBeNull();
	});

	it("offers a chip for every older day the list holds, oldest first, once", () => {
		expect(
			olderStripDays(
				[
					"2026-09-13",
					"2026-07-26",
					"2026-09-13",
					"2026-10-05", // inside the window — the week row already has it
				],
				WINDOW.start,
			),
		).toEqual(["2026-07-26", "2026-09-13"]);
	});

	it("adds nothing when the list is all inside the week", () => {
		expect(olderStripDays(["2026-10-04", "2026-10-10"], WINDOW.start)).toEqual(
			[],
		);
	});
});

describe("memberDisplayName", () => {
	const members = [
		{ userId: "u1", username: "Jane Lee" },
		{ userId: "u2", username: "  " },
	];

	it("names the reviewer by their user id", () => {
		expect(memberDisplayName(members, "u1")).toBe("Jane Lee");
	});

	it("is null — never the id — for anyone it cannot name", () => {
		expect(memberDisplayName(members, "someone-else")).toBeNull();
		expect(memberDisplayName(members, "u2")).toBeNull();
		expect(memberDisplayName(undefined, "u1")).toBeNull();
		expect(memberDisplayName(members, null)).toBeNull();
	});
});
