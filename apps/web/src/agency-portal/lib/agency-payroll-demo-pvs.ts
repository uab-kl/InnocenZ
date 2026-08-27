/**
 * Agency payroll demo — one PV per roster PR for Last Week (0) and Last Last Week (1).
 * Amounts follow the Vicky multi-shift template (~RM 2.8k–3.2k net).
 */

import { SEED_COMCARD_AGENCY_PRS } from "@agency-portal/lib/agency-pr-comcards";
import {
	buildDemoESignatureDataUrl,
	seedFinanceHeadStamp,
} from "@agency-portal/lib/finance-head-stamp";

type PayrollPr = { id: string; name: string; ic: string };

/** Avoid importing agency-demo (cycles through pr-demo during SSR). */
const VICKY_PAYROLL_PR: PayrollPr = {
	id: "p1",
	name: "Vicky",
	ic: "950312-14-8821",
};

type PayrollPvRow = {
	i: number;
	date: string;
	day: string;
	outlet: string;
	desc: string;
	qty: number;
	amt: number;
	ref: string;
	receiptIds?: string[];
};

type PayrollPvSeed = {
	id: string;
	prName: string;
	prIc?: string;
	outlet: string;
	cycle: string;
	issued: string;
	due: string;
	rows: PayrollPvRow[];
	subtotal: number;
	deduct: number;
	net: number;
	status: "PENDING_REVIEW" | "SENT" | "DISPUTED";
	financeHeadName: string;
	financeHeadSignedAt: string;
	financeHeadSignatureDataUrl?: string;
	receiptIds?: string[];
	prSignedAt?: string;
	prSignatureDataUrl?: string;
	prDisputeReason?: string;
	disputedAt?: string;
};

function seedPrSignature(prName: string) {
	return { prSignatureDataUrl: buildDemoESignatureDataUrl(prName) };
}

/**
 * ⚠️ STORED / PARSED KEYS, NOT LABELS — and the ONLY copy of either list.
 *
 * `MONTH_KEYS` is the month half of every short date this portal WRITES onto a
 * voucher row — `fmtDtable` → `PrPvRow.date`, e.g. "18 Jul" — and it is the same
 * table every reader PARSES that string back with, through `monthKeyIndex` in
 * pr-demo. Four separate hand-copied month lists used to do this job (one writer
 * and three parsers); if any of them had drifted, a stored date would have
 * silently resolved to the wrong month or to epoch. The string it builds is also
 * a sort key, a payroll-row grouping key and part of the `paidRefs`
 * duplicate-payment guard, and it reaches sessionStorage through the store's
 * `partialize`.
 *
 * `WEEKDAY_KEYS` is persisted on `PrPvRow.day`, read back positionally
 * (`row.dateDisplay.split(" ")[0]` gates a duplicate-voucher check) and spliced
 * into dispute text that `parseDisputeDateIsoFromText` re-reads with an
 * English-only regex.
 *
 * Translating either list rewrites stored records and breaks those parsers at
 * once, silently, with tsc green. To show a month or a weekday to a reader, use
 * `monthShortLabel(i, t)` / `weekdayLabel(token, t)` from
 * `@/lib/portal-i18n/date-label` — the render half of the split.
 *
 * They live in this demo-seed module purely because of the dependency direction:
 * pr-demo imports THIS file, so this is the one place all the date-writing
 * modules can reach without an import cycle. pr-demo re-exports both under the
 * same names, and that is the import site everything downstream should use.
 */
export const MONTH_KEYS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

export const WEEKDAY_KEYS = [
	"Sun",
	"Mon",
	"Tue",
	"Wed",
	"Thu",
	"Fri",
	"Sat",
] as const;

const OUTLETS = ["Velvet 23", "Bear Lounge", "Mermate", "Urban Soul"] as const;

const ANCHOR_W0 = {
	cycle: "4 May \u2013 10 May 2026",
	issued: "10 May 2026",
	due: "17 May 2026",
	finance: "10 May 2026 \u00b7 09:14",
	month: 5,
	startDay: 5,
	year: 2026,
};

const ANCHOR_W1 = {
	cycle: "11 May \u2013 17 May 2026",
	issued: "17 May 2026",
	due: "24 May 2026",
	finance: "17 May 2026 \u00b7 09:02",
	month: 5,
	startDay: 12,
	year: 2026,
};

/** Preserve receipt links on canonical demo PV ids. */
const PAYROLL_PV_ID: Record<string, { w0?: string; w1?: string }> = {
	Vicky: { w0: "PV-2026-0611-A", w1: "PV-2026-0604-L" },
	Charlotte: { w1: "PV-2026-0521" },
};

export const AGENCY_PAYROLL_ROSTER: PayrollPr[] = [
	VICKY_PAYROLL_PR,
	...SEED_COMCARD_AGENCY_PRS.map((pr) => ({
		id: pr.id,
		name: pr.name,
		ic: pr.ic,
	})),
].sort((a, b) =>
	a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
);

/** Last-week inbox mix — agency review · PR review · disputed (20 PRs total). */
const LAST_WEEK_AGENCY_REVIEW = new Set(["Alice", "Gin", "Moon", "Wei Qi"]);
const LAST_WEEK_DISPUTED = new Set(["Bernice", "Charlotte", "Jes", "Yvon"]);

function lastWeekPvStatus(prName: string): PayrollPvSeed["status"] {
	if (LAST_WEEK_AGENCY_REVIEW.has(prName)) return "PENDING_REVIEW";
	if (LAST_WEEK_DISPUTED.has(prName)) return "DISPUTED";
	return "SENT";
}

function markDisputedRows(rows: PayrollPvRow[]): PayrollPvRow[] {
	const drinks = rows.find((row) => row.desc.includes("Drinks"));
	if (!drinks) return rows;
	return rows.map((row) =>
		row === drinks ? { ...row, ref: "Disputed" } : row,
	);
}

function disputeDemoFields(_prName: string, rows: PayrollPvRow[]) {
	const line =
		rows.find((row) => row.ref === "Disputed") ??
		rows.find((row) => row.desc.includes("Drinks"));
	const when = line ? `${line.day} ${line.date}` : "this week";
	return {
		prDisputeReason: `${when} · Commission – Drinks — receipt total does not match floor log.`,
		disputedAt: "22 Jun 2026 · 14:08",
	};
}

/**
 * The seeded `PrPvRow.date` KEY — "18 Jul". Not a label: three parsers read it
 * back (see the note on `MONTH_KEYS`), so it is built from that table and never
 * from a dictionary.
 */
function rowDateKey(day: number, month: number): string {
	return `${day} ${MONTH_KEYS[month - 1]}`;
}

function outletLabel(rows: PayrollPvRow[]): string {
	const outlets = [
		...new Set(rows.map((r) => r.outlet).filter((o) => o && o !== "\u2014")),
	];
	if (outlets.length > 1) return `Multi-outlet (${outlets.length})`;
	return outlets[0] ?? "Velvet 23";
}

function attachLinkedReceipts(
	prName: string,
	weeksAgo: 0 | 1,
	rows: PayrollPvRow[],
): PayrollPvRow[] {
	const drinks = rows.filter((row) => row.desc.includes("Drinks"));
	if (prName === "Vicky" && weeksAgo === 0) {
		if (drinks[0]) drinks[0].receiptIds = ["rc-luna-w2-d"];
		if (drinks[1]) drinks[1].receiptIds = ["rc-luna-2"];
		if (drinks[2]) drinks[2].receiptIds = ["rc-luna-1"];
	}
	if (prName === "Vicky" && weeksAgo === 1 && drinks[0]) {
		drinks[0].receiptIds = ["rc-luna-2"];
	}
	if (prName === "Charlotte" && weeksAgo === 1 && drinks[0]) {
		drinks[0].receiptIds = ["rc-seed-4"];
	}
	return rows;
}

function buildWeeklyRows(
	prIndex: number,
	anchor: typeof ANCHOR_W0,
	weeksAgo: 0 | 1,
): PayrollPvRow[] {
	const wage =
		weeksAgo === 0 ? 298 + (prIndex % 5) * 12 : 268 + (prIndex % 5) * 14;
	const commBias = weeksAgo === 0 ? 0 : 19;
	const shiftDays = weeksAgo === 0 ? [0, 1, 2, 3, 5, 6] : [0, 1, 2, 3, 4, 6];
	const rows: PayrollPvRow[] = [];
	let i = 1;

	for (const dayOff of shiftDays) {
		const day = anchor.startDay + dayOff;
		const outlet = OUTLETS[(prIndex + dayOff) % OUTLETS.length]!;
		const date = new Date(anchor.year, anchor.month - 1, day);
		const dayLabel = WEEKDAY_KEYS[date.getDay()]!;
		const dateStr = rowDateKey(day, anchor.month);

		rows.push({
			i: i++,
			date: dateStr,
			day: dayLabel,
			outlet,
			desc: "Daily Wages",
			qty: 1,
			amt: wage,
			ref: "Sealed",
		});

		rows.push({
			i: i++,
			date: dateStr,
			day: dayLabel,
			outlet,
			desc: "Commission \u2013 Drinks",
			qty: 1,
			amt: 88 + ((prIndex * 19 + dayOff * 13 + commBias) % 42),
			ref: "Verified",
		});

		if (dayOff % 2 === 0) {
			rows.push({
				i: i++,
				date: dateStr,
				day: dayLabel,
				outlet,
				desc: "Commission \u2013 Tips",
				qty: 1,
				amt: 62 + ((prIndex * 11 + dayOff * 7 + commBias) % 34),
				ref: "Verified",
			});
		}

		if (dayOff === 5 || (weeksAgo === 1 && dayOff === 4)) {
			rows.push({
				i: i++,
				date: dateStr,
				day: dayLabel,
				outlet,
				desc: "Commission \u2013 Tables",
				qty: 1,
				amt: 52 + (prIndex % 5) * 14,
				ref: "Verified",
			});
		}
	}

	return rows;
}

function buildPayrollWeekPv(
	pr: PayrollPr,
	prIndex: number,
	weeksAgo: 0 | 1,
): PayrollPvSeed {
	const anchor = weeksAgo === 0 ? ANCHOR_W0 : ANCHOR_W1;
	const idOverride =
		weeksAgo === 0 ? PAYROLL_PV_ID[pr.name]?.w0 : PAYROLL_PV_ID[pr.name]?.w1;
	const id =
		idOverride ??
		`PV-2026-AGY-${String(prIndex + 1).padStart(2, "0")}-W${weeksAgo}`;

	const rows = attachLinkedReceipts(
		pr.name,
		weeksAgo,
		buildWeeklyRows(prIndex, anchor, weeksAgo),
	);
	const lastWeekStatus = weeksAgo === 0 ? lastWeekPvStatus(pr.name) : null;
	const rowsForPv =
		lastWeekStatus === "DISPUTED" ? markDisputedRows(rows) : rows;
	const subtotal =
		Math.round(rowsForPv.reduce((sum, row) => sum + row.amt, 0) * 100) / 100;
	const deduct =
		weeksAgo === 1 && prIndex % 4 === 0
			? 180
			: weeksAgo === 1 && prIndex % 5 === 2
				? 95
				: 0;
	const net = Math.round((subtotal - deduct) * 100) / 100;
	const receiptIds = [
		...new Set(rowsForPv.flatMap((row) => row.receiptIds ?? [])),
	];

	const pv: PayrollPvSeed = {
		id,
		prName: pr.name,
		prIc: pr.ic,
		outlet: outletLabel(rowsForPv),
		cycle: anchor.cycle,
		issued: anchor.issued,
		due: anchor.due,
		rows: rowsForPv,
		subtotal,
		deduct,
		net,
		status: weeksAgo === 0 ? lastWeekStatus! : "PENDING_REVIEW",
		...seedFinanceHeadStamp(anchor.finance),
		...(receiptIds.length ? { receiptIds } : {}),
		...(weeksAgo === 1
			? {
					prSignedAt: "19 May 2026 \u00b7 11:05",
					...seedPrSignature(pr.name),
				}
			: {}),
		...(lastWeekStatus === "DISPUTED"
			? disputeDemoFields(pr.name, rowsForPv)
			: {}),
	};

	return pv;
}

export function buildAgencyPayrollWeekSeedPvs(): PayrollPvSeed[] {
	const out: PayrollPvSeed[] = [];
	for (let i = 0; i < AGENCY_PAYROLL_ROSTER.length; i++) {
		const pr = AGENCY_PAYROLL_ROSTER[i]!;
		out.push(buildPayrollWeekPv(pr, i, 0));
		out.push(buildPayrollWeekPv(pr, i, 1));
	}
	return out;
}

export const AGENCY_PAYROLL_WEEK_PVS = buildAgencyPayrollWeekSeedPvs();

export const AGENCY_PAYROLL_PV_ID_SET = new Set(
	AGENCY_PAYROLL_WEEK_PVS.map((pv) => pv.id),
);

export const AGENCY_PAYROLL_PV_WEEKS_AGO: Record<string, number> =
	Object.fromEntries(
		AGENCY_PAYROLL_WEEK_PVS.map((pv) => {
			if (PAYROLL_PV_ID[pv.prName]?.w0 === pv.id) return [pv.id, 0];
			if (PAYROLL_PV_ID[pv.prName]?.w1 === pv.id) return [pv.id, 1];
			const match = pv.id.match(/-W(\d)$/);
			return [pv.id, match ? Number(match[1]) : 0];
		}),
	);
