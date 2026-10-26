import { describe, expect, it } from "vitest";
import { translations } from "@/lib/portal-i18n/translations";
import {
	pvLinesReady,
	pvLinesStateOf,
	receiptDayIso,
	signerDisplayName,
	withLinesStateNote,
	withReadableHeader,
	withRowNumbersFromOne,
} from "./payroll-display";

/**
 * The paid-voucher detail as the agency READS it (22 Oct 2026 walkthrough):
 * History never loaded a voucher's lines, its "Week" said "Weekly", "Agency
 * signed" printed an email, the "#" column counted from 0, and RCP-000036's
 * date was "—" with two dated lines under it. Each case below is one of those
 * rows as the live database holds it.
 */

const t = translations.en;
const zh = translations.zh;

describe("pvLinesStateOf — which rows are on screen", () => {
	it("a demo voucher's rows are already its lines", () => {
		expect(
			pvLinesStateOf({ isBacked: false, hasDetail: false, isError: false }),
		).toBe("demo");
	});

	it("a backed voucher is loading until the detail answers", () => {
		expect(
			pvLinesStateOf({ isBacked: true, hasDetail: false, isError: false }),
		).toBe("loading");
		expect(
			pvLinesStateOf({ isBacked: true, hasDetail: true, isError: false }),
		).toBe("ready");
	});

	it("a FAILED detail is an error, never an empty voucher", () => {
		expect(
			pvLinesStateOf({ isBacked: true, hasDetail: false, isError: true }),
		).toBe("error");
	});

	it("only demo and ready count as real lines", () => {
		expect(pvLinesReady("demo")).toBe(true);
		expect(pvLinesReady("ready")).toBe(true);
		expect(pvLinesReady("loading")).toBe(false);
		expect(pvLinesReady("error")).toBe(false);
	});
});

describe("withLinesStateNote — the stand-in row says what is happening", () => {
	const listRow = {
		rows: [{ desc: "Weekly earnings — open voucher for line items" }],
	};

	it("leaves real lines alone", () => {
		expect(withLinesStateNote(listRow, "ready", t)).toBe(listRow);
		expect(withLinesStateNote(listRow, "demo", t)).toBe(listRow);
	});

	it("replaces the fixed English sentence while loading and after a failure", () => {
		expect(withLinesStateNote(listRow, "loading", t).rows[0].desc).toBe(
			t.agencyPv.weekTotalLinesLoading,
		);
		expect(withLinesStateNote(listRow, "error", t).rows[0].desc).toBe(
			t.agencyPv.weekTotalLinesFailed,
		);
	});

	it("follows the language switch", () => {
		expect(withLinesStateNote(listRow, "loading", zh).rows[0].desc).toBe(
			zh.agencyPv.weekTotalLinesLoading,
		);
		expect(zh.agencyPv.weekTotalLinesLoading).not.toBe(
			t.agencyPv.weekTotalLinesLoading,
		);
	});
});

describe("withRowNumbersFromOne — the # column counts like a person", () => {
	it("numbers sort_order 0, 1, 2 as 1, 2, 3 on a copy", () => {
		const pv = { rows: [{ i: 0 }, { i: 1 }, { i: 2 }] };
		expect(withRowNumbersFromOne(pv).rows.map((r) => r.i)).toEqual([1, 2, 3]);
		expect(pv.rows.map((r) => r.i)).toEqual([0, 1, 2]);
	});

	it("keeps numbers unique when two lines share a sort order", () => {
		const pv = { rows: [{ i: 0 }, { i: 0 }] };
		expect(withRowNumbersFromOne(pv).rows.map((r) => r.i)).toEqual([1, 2]);
	});
});

describe("signerDisplayName — a person's name, never an email or a key", () => {
	const members = [
		{ userId: "u-1", username: "Jin Kang", email: "jin@example.com" },
		{ userId: "u-2", username: "owner@atlas.my", email: "owner@atlas.my" },
	];

	it("passes a real name straight through", () => {
		expect(signerDisplayName("Siaw Long", members)).toBe("Siaw Long");
	});

	it("resolves a stored email to the member's name", () => {
		expect(signerDisplayName("JIN@example.com", members)).toBe("Jin Kang");
	});

	it("resolves an old stored user id to the member's name", () => {
		expect(
			signerDisplayName("7bf3962e-591e-452f-b781-edbe1cbe6ef0", [
				{
					userId: "7bf3962e-591e-452f-b781-edbe1cbe6ef0",
					username: "Mei Ling",
				},
			]),
		).toBe("Mei Ling");
	});

	it("returns null rather than an email when the member has no name either", () => {
		expect(signerDisplayName("owner@atlas.my", members)).toBeNull();
		expect(signerDisplayName("someone@else.my", members)).toBeNull();
		expect(signerDisplayName("someone@else.my", null)).toBeNull();
	});

	it("is null for no signer", () => {
		expect(signerDisplayName(null, members)).toBeNull();
		expect(signerDisplayName("  ", members)).toBeNull();
	});
});

describe("withReadableHeader — Week and Agency signed", () => {
	const paid = {
		cycle: "Weekly",
		weekStartIso: "2026-07-26",
		weekEndIso: "2026-08-01",
		financeHeadName: "owner@atlas.my",
		financeHeadRole: null as string | null,
		financeHeadSignedAt: "3 Aug 2026 · 11:41",
	};

	it("prints the voucher's own week, not the literal 'Weekly'", () => {
		expect(withReadableHeader(paid, null, t).cycle).toBe("26 Jul – 1 Aug 2026");
	});

	it("keeps `cycle` for a voucher with no week", () => {
		const noWeek = { ...paid, weekStartIso: undefined, weekEndIso: undefined };
		expect(withReadableHeader(noWeek, null, t).cycle).toBe("Weekly");
	});

	it("never prints the stored email as the signer", () => {
		const shown = withReadableHeader(paid, null, t);
		expect(shown.financeHeadName).toBe(t.agencyPv.agencySignatory);
		expect(shown.financeHeadName).not.toContain("@");
	});

	it("uses the resolved name, or lets the capacity stand alone", () => {
		expect(withReadableHeader(paid, "Jin Kang", t).financeHeadName).toBe(
			"Jin Kang",
		);
		expect(
			withReadableHeader({ ...paid, financeHeadRole: "Owner" }, null, t)
				.financeHeadName,
		).toBe("");
	});

	it("leaves an unsigned voucher's signer alone", () => {
		const unsigned = { ...paid, financeHeadName: "", financeHeadSignedAt: "" };
		expect(withReadableHeader(unsigned, null, t).financeHeadName).toBe("");
	});
});

describe("receiptDayIso — the same working day the Receipts feed reads", () => {
	it("RCP-000036: no receipt_date, lines on 14 Sep → 14 Sep", () => {
		expect(
			receiptDayIso(null, [{ lineDate: "2026-09-14" }, { lineDate: null }]),
		).toBe("2026-09-14");
	});

	it("a line's date wins over a junk printed date", () => {
		expect(receiptDayIso("2026-06-16", [{ lineDate: "2026-08-06" }])).toBe(
			"2026-08-06",
		);
	});

	it("falls back to the printed date, then to nothing", () => {
		expect(receiptDayIso("2026-09-01", [{ lineDate: null }])).toBe(
			"2026-09-01",
		);
		expect(receiptDayIso(null, [])).toBeNull();
	});
});
