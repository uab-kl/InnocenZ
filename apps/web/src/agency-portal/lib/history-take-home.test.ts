import { describe, expect, it } from "vitest";
import {
	approvedOvertimeSenByAssignment,
	historyExtrasInputsDigest,
	historyTakeHome,
	historyTakeHomeByPr,
	historyWagesRm,
	withNightExtras,
} from "./history-take-home";

// Commission per night and penalty per voucher are computed by the server now
// (`GET /payment-voucher/history-extras`). Their cases moved with the code to
// apps/backend history-extras.test.ts, and history-extras.parity.test.ts pins
// the server against a frozen copy of the functions that used to live here.
import type { ShiftHistoryRow } from "./shift-history-utils";

const night = (
	prId: string,
	dateIso: string,
	wage: number,
	wagesRm: number | undefined = wage,
	id = `${prId}-${dateIso}`,
): ShiftHistoryRow => ({
	id,
	prId,
	prName: prId,
	outlet: "Venue",
	agencyName: "Agency",
	dateIso,
	dateDisplay: dateIso,
	totalPayout: wage,
	wagesRm,
	totalDrinks: 0,
	totalTips: 0,
	durationHours: 6,
});

const extrasOf =
	(
		map: Record<
			string,
			{ overtime?: number; drinkCommission?: number; tipCommission?: number }
		>,
	) =>
	(id: string) => {
		const e = map[id];
		return e
			? {
					overtime: e.overtime ?? 0,
					drinkCommission: e.drinkCommission ?? 0,
					tipCommission: e.tipCommission ?? 0,
				}
			: undefined;
	};

describe("historyWagesRm", () => {
	it("sums each night's sealed wage, in sen", () => {
		expect(
			historyWagesRm([
				night("pr-1", "2026-09-20", 100.1),
				night("pr-1", "2026-09-21", 200.2),
			]),
		).toBe(300.3);
	});

	it("reads the wage PART of a demo row whose payout already holds commission", () => {
		// Demo fixtures seal `totalPayout` as take-home and carry the wage apart.
		expect(historyWagesRm([night("pr-1", "2026-09-20", 650, 500)])).toBe(500);
	});

	it("an empty ledger is RM 0.00, not NaN", () => {
		expect(historyWagesRm([])).toBe(0);
	});
});

describe("approvedOvertimeSenByAssignment", () => {
	it("keeps APPROVED overtime only — a rejected claim keeps its figure but is not owed", () => {
		const map = approvedOvertimeSenByAssignment([
			{ id: "a1", overtimeStatus: "approved", overtimeAmount: "62.50" },
			{ id: "a2", overtimeStatus: "rejected", overtimeAmount: "279.00" },
			{ id: "a3", overtimeStatus: "pending", overtimeAmount: null },
			{ id: "a4", overtimeStatus: null, overtimeAmount: null },
			{ id: "a5" },
		]);
		expect([...map.entries()]).toEqual([["a1", 6250]]);
	});
});

describe("historyExtrasInputsDigest", () => {
	it("ignores order and repeats", () => {
		expect(historyExtrasInputsDigest(["v2", "v1", "v1"], ["p2", "p1"])).toBe(
			historyExtrasInputsDigest(["v1", "v2"], ["p1", "p2", "p2"]),
		);
	});

	it("changes when a voucher or a PR joins", () => {
		const base = historyExtrasInputsDigest(["v1"], ["p1"]);
		expect(historyExtrasInputsDigest(["v1", "v2"], ["p1"])).not.toBe(base);
		expect(historyExtrasInputsDigest(["v1"], ["p1", "p2"])).not.toBe(base);
	});

	it("does not confuse a voucher id with a PR id", () => {
		expect(historyExtrasInputsDigest(["x"], [])).not.toBe(
			historyExtrasInputsDigest([], ["x"]),
		);
	});
});

describe("withNightExtras", () => {
	it("seals each night's own overtime and commission onto its row", () => {
		const [a, b] = withNightExtras(
			[night("pr-1", "2026-09-20", 500), night("pr-1", "2026-09-21", 500)],
			extrasOf({
				"pr-1-2026-09-20": {
					overtime: 3000,
					drinkCommission: 4550,
					tipCommission: 1205,
				},
			}),
		);
		expect(a).toMatchObject({
			wagesRm: 500,
			otRm: 30,
			drinkCommissionRm: 45.5,
			tipCommissionRm: 12.05,
			totalPayout: 587.55,
			serverSealed: true,
		});
		// A night with nothing beyond its wage stays its wage.
		expect(b).toMatchObject({ totalPayout: 500, otRm: 0, serverSealed: true });
	});
});

describe("historyTakeHome", () => {
	const rows = withNightExtras(
		[
			night("pr-1", "2026-09-20", 500),
			night("pr-1", "2026-09-21", 500),
			night("pr-2", "2026-09-21", 600),
		],
		extrasOf({
			"pr-1-2026-09-20": { drinkCommission: 4550 },
			"pr-2-2026-09-21": { overtime: 3000, tipCommission: 1200 },
		}),
	);

	it("adds commission and approved overtime, less the deduction field AND penalty lines", () => {
		const result = historyTakeHome({
			rows,
			vouchers: [
				{
					prId: "pr-1",
					weekStartIso: "2026-09-20",
					weekEndIso: "2026-09-26",
					deduct: 20,
					penaltyRm: 27.5,
				},
			],
		});
		expect(result).toEqual({
			wagesRm: 1600,
			overtimeRm: 30,
			commissionRm: 57.5,
			deductionsRm: 47.5,
			takeHomeRm: 1640,
		});
	});

	it("counts a voucher's deductions once, and only for a week the PR worked", () => {
		const result = historyTakeHome({
			rows,
			vouchers: [
				// Two listed nights fall in this week — still one deduction.
				{
					prId: "pr-1",
					weekStartIso: "2026-09-20",
					weekEndIso: "2026-09-26",
					deduct: 0,
					penaltyRm: 15,
				},
				// A week with no listed night for this PR.
				{
					prId: "pr-1",
					weekStartIso: "2026-09-27",
					weekEndIso: "2026-10-03",
					deduct: 40,
					penaltyRm: 40,
				},
				// No PR on the voucher, no week, or nothing deducted.
				{ weekStartIso: "2026-09-20", weekEndIso: "2026-09-26", deduct: 7 },
				{ prId: "pr-2", deduct: 7, penaltyRm: 7 },
				{
					prId: "pr-2",
					weekStartIso: "2026-09-20",
					weekEndIso: "2026-09-26",
					deduct: 0,
					penaltyRm: 0,
				},
			],
		});
		expect(result.deductionsRm).toBe(15);
		expect(result.takeHomeRm).toBe(1672.5);
	});

	it("tolerates a timestamp-shaped week on the voucher", () => {
		const result = historyTakeHome({
			rows,
			vouchers: [
				{
					prId: "pr-2",
					weekStartIso: "2026-09-20T00:00:00.000Z",
					weekEndIso: "2026-09-26T00:00:00.000Z",
					deduct: 10,
				},
			],
		});
		expect(result.deductionsRm).toBe(10);
	});

	it("states a demo ledger's sealed payout, not its re-added parts", () => {
		// The fixture seals from unrounded commission, so its parts can sit a sen
		// away from the payout it states — the payout is the figure.
		const demo = {
			...night("pr-1", "2026-09-20", 650.01, 500),
			otRm: 0,
			drinkCommissionRm: 150,
			tipCommissionRm: 0,
		};
		expect(historyTakeHome({ rows: [demo], vouchers: [] }).takeHomeRm).toBe(
			650.01,
		);
	});

	it("adds in sen, so a year of cents does not drift", () => {
		const many = Array.from({ length: 300 }, (_, i) =>
			night(
				"pr-1",
				`2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
				0.1,
				0.1,
				`n${i}`,
			),
		);
		const result = historyTakeHome({ rows: many, vouchers: [] });
		expect(result.wagesRm).toBe(30);
		expect(result.takeHomeRm).toBe(30);
	});
});

describe("historyTakeHomeByPr", () => {
	it("gives each PR its own take-home, and the cards add up to the header exactly", () => {
		// Awkward cents on purpose — the sum must still land on the sen.
		const raw = Array.from({ length: 40 }, (_, i) =>
			night(
				`pr-${i % 3}`,
				`2026-09-${String((i % 27) + 1).padStart(2, "0")}`,
				123.45 + i * 0.07,
				undefined,
				`a${i}`,
			),
		);
		const rows = withNightExtras(raw, (id) => {
			const i = Number(id.slice(1));
			return {
				overtime: i % 4 === 0 ? 1111 : 0,
				drinkCommission: 333 * (i % 5),
				tipCommission: 17 * (i % 7),
			};
		});
		const vouchers = [0, 1, 2].map((p) => ({
			prId: `pr-${p}`,
			weekStartIso: "2026-09-06",
			weekEndIso: "2026-09-12",
			deduct: 3.33,
			penaltyRm: 10.01 * (p + 1),
		}));

		const header = historyTakeHome({ rows, vouchers });
		const cards = historyTakeHomeByPr({ rows, vouchers });
		expect(cards.size).toBe(3);

		const sumSen = (pick: (t: typeof header) => number) =>
			[...cards.values()].reduce((a, t) => a + Math.round(pick(t) * 100), 0);
		expect(sumSen((t) => t.takeHomeRm)).toBe(
			Math.round(header.takeHomeRm * 100),
		);
		expect(sumSen((t) => t.wagesRm)).toBe(Math.round(header.wagesRm * 100));
		expect(sumSen((t) => t.deductionsRm)).toBe(
			Math.round(header.deductionsRm * 100),
		);
	});

	it("keeps one PR's deductions off another PR's card", () => {
		const rows = withNightExtras(
			[night("pr-1", "2026-09-20", 500), night("pr-2", "2026-09-20", 500)],
			() => undefined,
		);
		const cards = historyTakeHomeByPr({
			rows,
			vouchers: [
				{
					prId: "pr-1",
					weekStartIso: "2026-09-20",
					weekEndIso: "2026-09-26",
					deduct: 0,
					penaltyRm: 20,
				},
			],
		});
		expect(cards.get("pr-1")?.takeHomeRm).toBe(480);
		expect(cards.get("pr-2")?.takeHomeRm).toBe(500);
	});
});
