/**
 * Demo sync — shift history → receipt scans + weekly PVs (History tabs).
 * Prior weeks get PAID/SIGNED PVs; open disputes stay out of receipt history.
 */

import {
	addDaysToIso,
	getLiveTodayIso,
	getPayrollWeekSundayIso,
	isWeekPvIssuedOnCalendar,
} from "@agency-portal/lib/demo-clock";
import {
	buildDemoESignatureDataUrl,
	seedFinanceHeadStamp,
} from "@agency-portal/lib/finance-head-stamp";
import {
	calcReceiptCommissions,
	DEMO_PV_ISSUED_WEEKS_AGO,
	fmtDtable,
	type PrPaymentVoucher,
	type PrProfile,
	type PrPvRow,
	type PrReceiptScan,
	pvPayByDeadlineIsoFromIssueIso,
	RECEIPT_COMMISSION_RULES,
	type ReceiptScanStatus,
	reconcilePvTotals,
	TIED_DEMO_ROSTER_PR_ID,
} from "@agency-portal/lib/pr-demo";
import {
	isPrPaymentInboxPv,
	pvForPayrollDate,
	pvRowDateToIso,
} from "@agency-portal/lib/pr-payment-history";
import {
	buildWeeklyPaymentSummary,
	getWeekBounds,
	makeWeeklyPvId,
	pvRowsFromWeeklySummary,
	shiftRowIncomeBreakdown,
	syncWeeklyPvWithSummary,
} from "@agency-portal/lib/pr-weekly-payment";
import { receiptDateIso } from "@agency-portal/lib/receipt-scan-utils";
import type { ShiftHistoryRow } from "@agency-portal/lib/shift-history-utils";
import { addDays, format, parseISO } from "date-fns";

function ymdFromIso(iso: string): [number, number, number] {
	const [y, m, d] = iso.split("-").map(Number);
	return [y, m, d];
}

function outletSessionSlug(outlet: string): string {
	const o = outlet.toLowerCase();
	if (o.includes("velvet")) return "velvet";
	if (o.includes("bear")) return "bearlounge";
	if (o.includes("mermate")) return "mermate";
	return o.replace(/\s+/g, "");
}

function shiftSessionId(outlet: string, dateIso: string): string {
	return `shift-${dateIso}-${outletSessionSlug(outlet)}`;
}

function receiptRefFor(outlet: string, dateIso: string, slot: number): string {
	const code = outletSessionSlug(outlet).slice(0, 4).toUpperCase();
	return `${code}-${dateIso.replace(/-/g, "")}-${String(slot).padStart(2, "0")}`;
}

function histScanPrefix(prId: string) {
	return `rc-hist-${prId}-`;
}

function pvScanPrefix() {
	return "rc-pv-";
}

/** Demo seed scans replaced on every ledger rebuild — PV rows are authoritative. */
const DEMO_MANAGED_RECEIPT_IDS = new Set([
	"rc-luna-w2-d",
	"rc-luna-1",
	"rc-luna-2",
]);

function commissionCategoryFromDesc(
	desc: string,
): "drinks" | "tips" | "tables" | "others" | null {
	const d = desc.toLowerCase();
	if (d.includes("daily wage")) return null;
	if (d.includes("drink")) return "drinks";
	if (d.includes("tip")) return "tips";
	if (d.includes("table")) return "tables";
	if (d.includes("commission") || d.includes("other")) return "others";
	return null;
}

function pvCommissionItems(
	category: "drinks" | "tips" | "tables" | "others",
	amount: number,
	qty: number,
): PrReceiptScan["items"] {
	if (category === "drinks") {
		const unitQty = Math.max(
			1,
			qty || Math.round(amount / RECEIPT_COMMISSION_RULES.drinkPerUnit),
		);
		return [
			{
				label: "Drinks commission",
				qty: unitQty,
				unitPrice: RECEIPT_COMMISSION_RULES.drinkPerUnit,
				amount,
				category: "drinks",
			},
		];
	}
	if (category === "tips") {
		return [
			{ label: "Tips", qty: 1, unitPrice: amount, amount, category: "tips" },
		];
	}
	if (category === "tables") {
		const unitQty = Math.max(
			1,
			qty || Math.round(amount / RECEIPT_COMMISSION_RULES.tablePerUnit),
		);
		return [
			{
				label: "VIP table",
				qty: unitQty,
				unitPrice: RECEIPT_COMMISSION_RULES.tablePerUnit,
				amount,
				category: "tables",
			},
		];
	}
	return [
		{ label: "Others", qty: 1, unitPrice: amount, amount, category: "other" },
	];
}

/** Receipt scans from PV commission lines — same amounts as Shifts + Payment tabs. */
function pvReceiptDatesAreSealed(pv: PrPaymentVoucher): boolean {
	return (
		pv.status === "SENT" ||
		pv.status === "SIGNED" ||
		pv.status === "PAID" ||
		pv.status === "DISPUTED"
	);
}

export function buildReceiptScansFromPaymentVouchers(
	pvs: PrPaymentVoucher[],
	prId: string,
	profile: PrProfile,
): PrReceiptScan[] {
	const todayIso = getLiveTodayIso();
	const out: PrReceiptScan[] = [];
	const usedLinkedIds = new Set<string>();

	for (const pv of pvs) {
		if (pv.prName !== profile.name) continue;
		const sealed = pvReceiptDatesAreSealed(pv);
		const year = pv.weekStartIso
			? parseInt(pv.weekStartIso.slice(0, 4), 10)
			: parseInt(
					pv.issued.match(/\d{4}/)?.[0] ?? String(new Date().getFullYear()),
					10,
				);

		for (const row of pv.rows) {
			const category = commissionCategoryFromDesc(row.desc);
			if (!category || row.amt <= 0) continue;
			const iso = pvRowDateToIso(row, year);
			if (!iso || (!sealed && iso > todayIso)) continue;

			const ymd = ymdFromIso(iso);
			const [y, m, d] = ymd;
			const dateLabel = fmtDtable(y, m, d);
			const sessionId = shiftSessionId(row.outlet, iso);
			const linkedId = row.receiptIds?.[0];
			const id =
				linkedId && !usedLinkedIds.has(linkedId)
					? (usedLinkedIds.add(linkedId), linkedId)
					: `${pvScanPrefix()}${pv.id}-${row.i}`;
			const items = pvCommissionItems(category, row.amt, row.qty);
			const comm = calcReceiptCommissions(items);
			const drinkCommission = category === "drinks" ? row.amt : 0;
			const tipCommission = category === "tips" ? row.amt : 0;

			out.push({
				id,
				receiptRef: receiptRefFor(row.outlet, iso, row.i),
				scannedAt: `${dateLabel} ${y} · ${22}:${String((10 + row.i) % 60).padStart(2, "0")}`,
				date: ymd,
				outlet: row.outlet,
				prCode: "PR-0001",
				prName: profile.name,
				prId,
				shiftSessionId: sessionId,
				pvId: pv.id,
				pvLineDesc: row.desc,
				pvStatus: pv.status,
				items,
				totalLogged: row.amt,
				drinkCommission: drinkCommission || comm.drinkCommission,
				tipCommission: tipCommission || comm.tipCommission,
				totalCommission: row.amt,
				status: receiptStatusFromPv({ status: "pending" } as PrReceiptScan, pv),
			});
		}
	}

	return out;
}

function dateInPvWeek(iso: string, pvs: PrPaymentVoucher[]): boolean {
	return pvs.some(
		(p) =>
			p.weekStartIso &&
			p.weekEndIso &&
			iso >= p.weekStartIso &&
			iso <= p.weekEndIso,
	);
}

function mergeReceiptScansById(...groups: PrReceiptScan[][]): PrReceiptScan[] {
	const byId = new Map<string, PrReceiptScan>();
	for (const group of groups) {
		for (const scan of group) {
			byId.set(scan.id, scan);
		}
	}
	return [...byId.values()];
}

/** Agency / demo-timeline PVs — do not replace with shift-history reconstructions. */
function isAuthoritativeDemoPayrollPv(pv: PrPaymentVoucher): boolean {
	return pv.id in DEMO_PV_ISSUED_WEEKS_AGO;
}

/** Drop shift-history synced ledger rows so they can be rebuilt from the current log. */
function stripShiftHistorySyncedLedger(
	scans: PrReceiptScan[],
	pvs: PrPaymentVoucher[],
	prId: string,
	profileName: string,
) {
	const inboxWeeks = new Set(
		pvs
			.filter(
				(p) =>
					p.prName === profileName && p.weekStartIso && isPrPaymentInboxPv(p),
			)
			.map((p) => p.weekStartIso!),
	);
	return {
		scans: scans.filter(
			(s) =>
				!s.id.startsWith(histScanPrefix(prId)) &&
				!s.id.startsWith(pvScanPrefix()),
		),
		pvs: pvs.filter((p) => {
			if (isAuthoritativeDemoPayrollPv(p)) return true;
			if (p.prName !== profileName || !p.weekStartIso) return true;
			if (inboxWeeks.has(p.weekStartIso) && !isPrPaymentInboxPv(p))
				return false;
			return !(p.status === "PAID" || p.status === "SIGNED");
		}),
	};
}

/** Receipt scans for each sealed shift night in history. */
export function buildReceiptScansFromShiftHistory(
	rows: ShiftHistoryRow[],
	prId: string,
	profile: PrProfile,
	existing: PrReceiptScan[] = [],
): PrReceiptScan[] {
	const todayIso = getLiveTodayIso();
	const existingIds = new Set(existing.map((s) => s.id));
	const out: PrReceiptScan[] = [];

	for (const row of rows) {
		if (row.prId !== prId || row.dateIso > todayIso) continue;

		const ymd = ymdFromIso(row.dateIso);
		const [y, m, d] = ymd;
		const dateLabel = fmtDtable(y, m, d);
		const sessionId = shiftSessionId(row.outlet, row.dateIso);
		const histPrefix = `rc-hist-${prId}-${row.dateIso.replace(/-/g, "")}`;
		const income = shiftRowIncomeBreakdown(row);

		const parts: Array<{
			slot: number;
			category: "drinks" | "tips" | "tables";
			amount: number;
			qty: number;
			unitPrice: number;
		}> = [];
		if (income.drinks > 0) {
			parts.push({
				slot: 1,
				category: "drinks",
				amount: income.drinks,
				qty: Math.max(
					1,
					Math.round(income.drinks / RECEIPT_COMMISSION_RULES.drinkPerUnit),
				),
				unitPrice: RECEIPT_COMMISSION_RULES.drinkPerUnit,
			});
		}
		if (income.tips > 0) {
			parts.push({
				slot: 2,
				category: "tips",
				amount: income.tips,
				qty: 1,
				unitPrice: income.tips,
			});
		}
		if (income.others > 0) {
			parts.push({
				slot: 3,
				category: "tables",
				amount: income.others,
				qty: Math.max(
					1,
					Math.round(income.others / RECEIPT_COMMISSION_RULES.tablePerUnit),
				),
				unitPrice: RECEIPT_COMMISSION_RULES.tablePerUnit,
			});
		}

		for (const part of parts) {
			const id = `${histPrefix}-${part.slot}`;
			if (existingIds.has(id)) continue;
			existingIds.add(id);

			const items =
				part.category === "drinks"
					? [
							{
								label: "Drinks commission",
								qty: part.qty,
								unitPrice: part.unitPrice,
								amount: part.amount,
								category: "drinks" as const,
							},
						]
					: part.category === "tips"
						? [
								{
									label: "Tips",
									qty: 1,
									unitPrice: part.amount,
									amount: part.amount,
									category: "tips" as const,
								},
							]
						: [
								{
									label: "VIP table",
									qty: part.qty,
									unitPrice: part.unitPrice,
									amount: part.amount,
									category: "tables" as const,
								},
							];

			const comm = calcReceiptCommissions(items);
			const scannedAt = `${dateLabel} ${y} · ${22 + part.slot}:${String(10 + part.slot * 11).padStart(2, "0")}`;

			out.push({
				id,
				receiptRef: receiptRefFor(row.outlet, row.dateIso, part.slot),
				scannedAt,
				date: ymd,
				outlet: row.outlet,
				prCode: "PR-0001",
				prName: profile.name,
				prId,
				shiftSessionId: sessionId,
				items,
				totalLogged: part.amount,
				drinkCommission: comm.drinkCommission,
				tipCommission: comm.tipCommission,
				totalCommission: comm.totalCommission,
				status: "pending",
			});
		}
	}

	return out;
}

function attachReceiptIdsToPvRows(
	rows: PrPvRow[],
	scans: PrReceiptScan[],
	year: number,
): PrPvRow[] {
	const scansByDate = new Map<string, PrReceiptScan[]>();
	for (const s of scans) {
		const iso = receiptDateIso(s);
		const list = scansByDate.get(iso) ?? [];
		list.push(s);
		scansByDate.set(iso, list);
	}

	return rows.map((row) => {
		const m = row.date.trim().match(/^(\d{1,2})\s+([A-Za-z]+)/);
		if (!m || row.receiptIds?.length) return row;
		const months = [
			"jan",
			"feb",
			"mar",
			"apr",
			"may",
			"jun",
			"jul",
			"aug",
			"sep",
			"oct",
			"nov",
			"dec",
		];
		const mi = months.findIndex((x) => x === m[2].slice(0, 3).toLowerCase());
		if (mi < 0) return row;
		const day = parseInt(m[1], 10);
		const iso = `${year}-${String(mi + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
		const dayScans = (scansByDate.get(iso) ?? []).filter(
			(s) => s.outlet === row.outlet || row.outlet.includes(s.outlet),
		);
		if (!dayScans.length) return row;
		const desc = row.desc.toLowerCase();
		const ids = dayScans
			.filter((s) => {
				if (s.pvLineDesc && s.pvLineDesc === row.desc) return true;
				if (desc.includes("drink")) return s.drinkCommission === row.amt;
				if (desc.includes("tip")) return s.tipCommission === row.amt;
				if (desc.includes("other") || row.desc === "Others") {
					return (
						s.totalCommission === row.amt &&
						s.items.some((i) => i.category === "other")
					);
				}
				return false;
			})
			.map((s) => s.id);
		return ids.length ? { ...row, receiptIds: ids } : row;
	});
}

/** Weekly PVs for completed payroll weeks — PAID (older) or SIGNED (last week). */
export function buildWeeklyPvsFromShiftHistory(
	rows: ShiftHistoryRow[],
	scans: PrReceiptScan[],
	prId: string,
	profile: PrProfile,
	existing: PrPaymentVoucher[] = [],
): PrPaymentVoucher[] {
	const todayIso = getLiveTodayIso();
	const currentWeekSun = getPayrollWeekSundayIso(todayIso);
	const prevWeekSun = addDaysToIso(currentWeekSun, -7);
	const inboxWeekStarts = new Set(
		existing
			.filter(
				(p) =>
					p.weekStartIso &&
					p.prName === profile.name &&
					(p.status === "SENT" ||
						p.status === "DISPUTED" ||
						p.status === "PENDING_REVIEW"),
			)
			.map((p) => p.weekStartIso!),
	);
	const authoritativeWeekStarts = new Set(
		existing
			.filter(
				(p) =>
					p.weekStartIso &&
					p.prName === profile.name &&
					isAuthoritativeDemoPayrollPv(p),
			)
			.map((p) => p.weekStartIso!),
	);
	const weekStarts = new Set<string>();

	for (const row of rows) {
		if (row.prId !== prId || row.dateIso > todayIso) continue;
		const bounds = getWeekBounds(ymdFromIso(row.dateIso));
		if (bounds.startIso === currentWeekSun) continue;
		if (!isWeekPvIssuedOnCalendar(bounds.endIso, todayIso)) continue;
		weekStarts.add(bounds.startIso);
	}

	const pvs: PrPaymentVoucher[] = [];

	for (const weekStartIso of [...weekStarts].sort()) {
		if (inboxWeekStarts.has(weekStartIso)) continue;
		if (authoritativeWeekStarts.has(weekStartIso)) continue;
		const bounds = getWeekBounds(ymdFromIso(weekStartIso));
		const summary = buildWeeklyPaymentSummary({
			weekStartIso,
			shiftHistory: rows,
			scans,
			prId,
		});
		if (summary.totals.net <= 0) continue;

		const status =
			weekStartIso === prevWeekSun ? ("SIGNED" as const) : ("PAID" as const);
		const issueDate = parseISO(bounds.issueDayIso);
		const issuedLabel = format(issueDate, "d MMM yyyy");
		const dueLabel = format(
			parseISO(pvPayByDeadlineIsoFromIssueIso(bounds.issueDayIso)),
			"d MMM yyyy",
		);
		const signedStamp = format(addDays(issueDate, 1), "d MMM yyyy · 16:20");
		const paidStamp = format(addDays(issueDate, 2), "d MMM yyyy · 11:42");

		const year = parseInt(weekStartIso.slice(0, 4), 10);
		let pvRows = pvRowsFromWeeklySummary(
			summary,
			rows.find((r) => r.prId === prId)?.outlet ?? "Velvet 23",
		);
		pvRows = attachReceiptIdsToPvRows(pvRows, scans, year);
		const receiptIds = [...new Set(pvRows.flatMap((r) => r.receiptIds ?? []))];

		const subtotal = summary.totals.net;
		const pv: PrPaymentVoucher = {
			id: makeWeeklyPvId(weekStartIso, "L"),
			prName: profile.name,
			prIc: profile.ic,
			outlet:
				[...new Set(pvRows.map((r) => r.outlet).filter((o) => o && o !== "—"))]
					.length > 1
					? `Multi-outlet (${[...new Set(pvRows.map((r) => r.outlet))].length})`
					: (pvRows[0]?.outlet ?? "Velvet 23"),
			weekStartIso,
			weekEndIso: bounds.endIso,
			cycle: summary.weekLabel.replace(/\s+\d{4}$/, ""),
			issued: issuedLabel,
			due: dueLabel,
			rows: pvRows,
			subtotal,
			deduct: 0,
			net: subtotal,
			status,
			...seedFinanceHeadStamp(
				`${issuedLabel.split(" ").slice(0, 3).join(" ")} · 09:00`,
			),
			receiptIds,
		};

		if (status === "SIGNED" || status === "PAID") {
			pv.prSignedAt = signedStamp;
			pv.prSignatureDataUrl = buildDemoESignatureDataUrl(profile.name);
		}
		if (status === "PAID") {
			pv.paidAt = paidStamp;
			pv.bankRef = `INZ-TRF-${weekStartIso.replace(/-/g, "")}`;
		}

		pvs.push(syncWeeklyPvWithSummary(pv, summary));
	}

	return pvs;
}

function receiptStatusFromPv(
	scan: PrReceiptScan,
	pv: PrPaymentVoucher,
): ReceiptScanStatus {
	if (pv.status === "DISPUTED") return "disputed";
	if (pv.status === "PAID") return "paid";
	if (pv.status === "SIGNED" || pv.status === "SENT") return "in_pv";
	if (pv.status === "PENDING_REVIEW") return "pending";
	if (scan.status === "attached") return "attached";
	return "pending";
}

function scanBelongsToProfile(
	scan: PrReceiptScan,
	prId: string,
	profileName: string,
): boolean {
	if (scan.prId) return scan.prId === prId;
	return scan.prName === profileName;
}

function filterScansForPvAuthoritativeWeeks(
	scans: PrReceiptScan[],
	pvScans: PrReceiptScan[],
	sealedPvs: PrPaymentVoucher[],
	prId: string,
	profileName: string,
): PrReceiptScan[] {
	const pvScanIds = new Set(pvScans.map((s) => s.id));
	return scans.filter((s) => {
		if (DEMO_MANAGED_RECEIPT_IDS.has(s.id)) return false;
		if (!scanBelongsToProfile(s, prId, profileName)) return true;
		const iso = receiptDateIso(s);
		if (!dateInPvWeek(iso, sealedPvs)) return true;
		return pvScanIds.has(s.id);
	});
}

function attachReceiptIdsToAllPvs(
	pvs: PrPaymentVoucher[],
	scans: PrReceiptScan[],
	profileName: string,
): PrPaymentVoucher[] {
	return pvs.map((pv) => {
		if (pv.prName !== profileName || !pv.weekStartIso) return pv;
		const year = parseInt(pv.weekStartIso.slice(0, 4), 10);
		const rows = attachReceiptIdsToPvRows(pv.rows, scans, year);
		const receiptIds = [...new Set(rows.flatMap((r) => r.receiptIds ?? []))];
		return { ...pv, rows, receiptIds };
	});
}

/** Attach shift session ids from sealed checkout rows — keeps History aligned with shifts. */
function enrichReceiptScansFromShiftHistory(
	scans: PrReceiptScan[],
	rows: ShiftHistoryRow[],
	prId: string,
): PrReceiptScan[] {
	const bySlot = new Map<string, ShiftHistoryRow>();
	for (const row of rows) {
		if (row.prId === prId) bySlot.set(`${row.dateIso}|${row.outlet}`, row);
	}
	return scans.map((scan) => {
		if (scan.prId && scan.prId !== prId) return scan;
		const dateIso = receiptDateIso(scan);
		const hist = bySlot.get(`${dateIso}|${scan.outlet}`);
		if (!hist) return scan;
		const sessionId = shiftSessionId(scan.outlet, dateIso);
		return {
			...scan,
			shiftSessionId: scan.shiftSessionId ?? sessionId,
		};
	});
}

export function syncReceiptScansWithPvs(
	scans: PrReceiptScan[],
	pvs: PrPaymentVoucher[],
	prId: string,
): PrReceiptScan[] {
	return scans.map((scan) => {
		if (scan.prId && scan.prId !== prId) return scan;
		const dateIso = receiptDateIso(scan);
		const pv =
			(scan.pvId ? pvs.find((p) => p.id === scan.pvId) : undefined) ??
			pvForPayrollDate(
				dateIso,
				pvs.filter((p) => p.prName === scan.prName),
			);

		if (!pv) {
			if (scan.status === "attached") return scan;
			return scan;
		}

		return {
			...scan,
			pvId: pv.id,
			pvStatus: pv.status,
			status: receiptStatusFromPv(scan, pv),
		};
	});
}

/** Receipt scans tab — past sealed shifts only (disputed receipts stay visible with status badge). */
export function isReceiptHiddenInHistory(
	_scan: PrReceiptScan,
	_pvs: PrPaymentVoucher[],
): boolean {
	return false;
}

export function mergeHistoryDemoLedger(opts: {
	shiftHistory: ShiftHistoryRow[];
	scans: PrReceiptScan[];
	pvs: PrPaymentVoucher[];
	prId?: string;
	profile?: PrProfile;
}): { scans: PrReceiptScan[]; pvs: PrPaymentVoucher[] } {
	const prId = opts.prId ?? TIED_DEMO_ROSTER_PR_ID;
	const profile =
		opts.profile ?? ({ name: "Vicky", ic: "950312-14-8821" } as PrProfile);

	const stripped = stripShiftHistorySyncedLedger(
		opts.scans,
		opts.pvs,
		prId,
		profile.name,
	);
	const minePvs = stripped.pvs.filter((p) => p.prName === profile.name);
	const sealedPvs = minePvs.filter(pvReceiptDatesAreSealed);

	const pvScans = buildReceiptScansFromPaymentVouchers(minePvs, prId, profile);
	const baseScans = filterScansForPvAuthoritativeWeeks(
		stripped.scans,
		pvScans,
		sealedPvs,
		prId,
		profile.name,
	);
	const shiftScans = buildReceiptScansFromShiftHistory(
		opts.shiftHistory,
		prId,
		profile,
		[],
	).filter((scan) => !dateInPvWeek(receiptDateIso(scan), minePvs));

	let scans = enrichReceiptScansFromShiftHistory(
		mergeReceiptScansById(baseScans, shiftScans, pvScans),
		opts.shiftHistory,
		prId,
	);

	const extraPvs = buildWeeklyPvsFromShiftHistory(
		opts.shiftHistory,
		scans,
		prId,
		profile,
		stripped.pvs,
	);
	let pvs = [...stripped.pvs, ...extraPvs];

	scans = syncReceiptScansWithPvs(scans, pvs, prId);
	pvs = attachReceiptIdsToAllPvs(pvs, scans, profile.name).map(
		reconcilePvTotals,
	);
	return { scans, pvs };
}

/** Rebuild receipt scans + PV receipt links after inbox/dispute/sign actions. */
export function syncStoreHistoryLedger(
	shiftHistory: ShiftHistoryRow[],
	scans: PrReceiptScan[],
	pvs: PrPaymentVoucher[],
	profile: PrProfile = { name: "Vicky", ic: "950312-14-8821" },
	prId: string = TIED_DEMO_ROSTER_PR_ID,
): { scans: PrReceiptScan[]; pvs: PrPaymentVoucher[] } {
	return mergeHistoryDemoLedger({ shiftHistory, scans, pvs, prId, profile });
}
