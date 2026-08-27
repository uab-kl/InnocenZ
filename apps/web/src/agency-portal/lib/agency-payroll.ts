import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import type { PortalLocale } from "@/lib/portal-i18n/locale-prefs";
import type {
	AgencyCollectionInvoice,
	AgencyManagedPR,
	CollectionLineGroup,
	CollectionLineItem,
} from "@agency-portal/lib/agency-demo";
import { buildReceiptScansFromPaymentVouchers } from "@agency-portal/lib/history-demo-sync";
import type {
	PrPaymentVoucher,
	PrReceiptScan,
} from "@agency-portal/lib/pr-demo";
import {
	DEMO_PV_ISSUED_WEEKS_AGO,
	fmtDateLabelFromIso,
	formatPvPayByDeadlineShort,
	getPvNetTotal,
	isLegacyReceiptScanIdentity,
	type PrProfile,
	type PrPvStatus,
	pvPayByDeadlineMsFromIssued,
	pvStatusLabel,
	RECEIPT_COMMISSION_RULES,
} from "@agency-portal/lib/pr-demo";
import { pvRowDateToIso } from "@agency-portal/lib/pr-payment-history";
import {
	dedupeShiftHistorySlots,
	SHIFT_HISTORY_FALLBACK_PER_DRINK_RM,
	type ShiftHistoryRow,
	sortShiftHistoryDesc,
} from "@agency-portal/lib/shift-history-utils";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const PV_COMMISSION_SCAN_PREFIX = "rc-pv-";
const PAYROLL_SHIFT_ROW_PREFIX = "ap-shift-";
const PAYROLL_RECEIPT_WEEKS_AGO = new Set([0, 1]);

function agencyPrReceiptCode(pr: AgencyManagedPR): string {
	const digits = pr.id.replace(/\D/g, "").slice(0, 4);
	return `PR-${digits.padStart(4, "0") || "0099"}`;
}

function agencyPrReceiptProfile(pr: AgencyManagedPR): PrProfile {
	return {
		name: pr.name,
		first: pr.icName?.trim() || pr.name,
		ic: pr.ic ?? "",
		mobile: pr.mobile ?? "",
		email: pr.email ?? "",
		bank: "—",
		acc: "—",
		av: "",
		avg: "",
		tier: pr.trainingLevel ?? "—",
		rep: "",
		shifts: String(pr.checkIns ?? 0),
		noshow: String(pr.noShows ?? 0),
		langs: [],
		prog: 0,
		next: "—",
	};
}

function prNameMatchesAgency(scanName: string, pr: AgencyManagedPR): boolean {
	const sn = scanName.trim().toLowerCase();
	const full = pr.name.trim().toLowerCase();
	const first = full.split(/\s+/)[0] ?? "";
	return sn === full || sn === first || full.startsWith(sn);
}

export function receiptBelongsToAgencyPr(
	scan: PrReceiptScan,
	pr: AgencyManagedPR,
): boolean {
	if (scan.prId && pr.id === scan.prId) return true;
	return prNameMatchesAgency(scan.prName, pr);
}

/** Canonical PR name on agency payroll — IC match + Luna → Vicky migration. */
export function resolvePvPrName(
	pv: Pick<PrPaymentVoucher, "prName" | "prIc">,
	agencyPRs: AgencyManagedPR[] = [],
): string {
	if (pv.prIc) {
		const byIc = agencyPRs.find((p) => p.ic === pv.prIc);
		if (byIc?.name) return byIc.name;
	}
	const byName = agencyPRs.find((p) => prNameMatchesAgency(pv.prName, p));
	if (byName?.name) return byName.name;
	if (pv.prName === "Luna") return "Vicky";
	return pv.prName;
}

/**
 * How a payee is NAMED on screen: `Vicky (Victoria Tan Mei Lin)`.
 *
 * Owner's rule (4 Aug 2026) — the nickname goes in FRONT, the legal name stays
 * in brackets behind it. Both are needed and neither replaces the other: the
 * floor knows this person as Vicky, while the money, the IC and the bank
 * transfer are all in the legal name, and an agency reconciling a payment has to
 * see that the two belong together.
 *
 * The nickname comes off the voucher's own FK join (`prNickname`) first, since
 * that is read from `pr.nickname` at request time. `resolvePvPrName` supplies the
 * legal half and the demo-row fallback. With no nickname — or one that merely
 * repeats the legal name — this returns the legal name alone rather than
 * printing "Victoria Tan Mei Lin (Victoria Tan Mei Lin)".
 */
export function resolvePvPrLabel(
	pv: Pick<PrPaymentVoucher, "prName" | "prIc"> & { prNickname?: string },
	agencyPRs: AgencyManagedPR[] = [],
): string {
	return formatPayeeLabel(pv.prNickname, resolvePvPrName(pv, agencyPRs));
}

/**
 * `(Vicky) Victoria Tan Mei Lin` — the owner's exact format, 5 Aug 2026.
 *
 * THE BRACKETS GO ROUND THE NICKNAME, and the nickname comes first. An earlier
 * pass read the instruction the other way and shipped `Vicky (Victoria Tan Mei
 * Lin)`; this is the corrected order and the one to keep.
 *
 * ONE formatter, called by every screen that names a payee — the voucher card
 * and the dispute row already drifted apart once because each formatted its own
 * label, which is how the nickname ended up on one screen and not the other.
 *
 * Falls back to whichever half exists. A nickname that merely repeats the legal
 * name prints once, not as "(Victoria Tan Mei Lin) Victoria Tan Mei Lin".
 */
/**
 * An attendance stamp as a clock time, or an explicit word when there isn't one.
 *
 * ONE spelling. Every check-in/check-out clock in this portal is currently its
 * own inline `toLocaleTimeString("en-MY", …)` copy — nine of them at last
 * count — which is exactly how two screens come to disagree about one stamp.
 *
 * `absent` is REQUIRED rather than defaulted: "not checked in" and "still on
 * duty" are different facts, and a shared default would let a caller print the
 * wrong one by omission. A null stamp never renders as a bare dash here — the
 * agency is ruling on money and needs to know which of the two it is.
 */
export function formatStampClock(iso: string | null, absent: string): string {
	if (!iso) return absent;
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return absent;
	return at.toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" });
}

/**
 * A shift's own day, spelled in full: "Thu 6 Aug 2026".
 *
 * The YEAR is deliberate. A payroll queue holds disputes months apart and
 * "Thu 6 Aug" alone reads as this year to anyone skimming it.
 *
 * Parsed with an explicit `T00:00:00` so the string is read as a LOCAL date.
 * `new Date("2026-08-06")` is parsed as UTC midnight, which in UTC+8 renders as
 * the 6th but in any negative offset renders as the 5th.
 */
export function formatShiftDayDate(
	iso: string | null,
	/**
	 * The portal's locale, LAST and with no default. A default would pin one
	 * language for every caller that forgot to pass it — which is exactly what
	 * this function's hardcoded "en-GB" did, silently, until an audit traced it.
	 *
	 * Intl rather than the dictionary's month names, on purpose: this is the one
	 * date shape here carrying a YEAR, and the parts reorder between languages
	 * (zh-CN leads with the year and puts the weekday last). Intl knows that
	 * ordering; a hand-built template would have to encode it per language.
	 */
	locale: PortalLocale,
): string {
	if (!iso) return "—";
	const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString(dateLocaleTag(locale), {
		weekday: "short",
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

/**
 * How long the PR was actually on the floor: check-in to shift end.
 *
 * Derived from the two stamps and NOTHING else. The phone's `shiftDurationLabel`
 * must not be ported here — it carries a hardcoded `scheduledHours = 6` default
 * and appends OT guessed from it, while the caller ALSO prints the server's
 * `overtime_minutes`, so the same shift shows OT twice from two disagreeing
 * sources. `overtime_minutes` is the only OT truth; this function never touches
 * it.
 *
 * Returns "—" unless both stamps exist — a running shift has no duration yet,
 * and a zero would read as one.
 */
export function formatShiftDuration(
	checkInAt: string | null,
	checkOutAt: string | null,
): string {
	if (!checkInAt || !checkOutAt) return "—";
	const start = new Date(checkInAt).getTime();
	const end = new Date(checkOutAt).getTime();
	if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
	const minutes = Math.round((end - start) / 60000);
	return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function formatPayeeLabel(
	nickname: string | null | undefined,
	legalName: string | null | undefined,
): string {
	const nick = nickname?.trim();
	const legal = legalName?.trim();
	if (!nick) return legal ?? "";
	if (!legal) return nick;
	if (nick.toLowerCase() === legal.toLowerCase()) return legal;
	return `(${nick}) ${legal}`;
}

export function pvBelongsToAgencyPr(
	pv: Pick<PrPaymentVoucher, "prName" | "prIc">,
	agencyPRs: AgencyManagedPR[] = [],
): boolean {
	if (pv.prIc && agencyPRs.some((p) => p.ic === pv.prIc)) return true;
	return agencyPRs.some((p) => prNameMatchesAgency(pv.prName, p));
}

export function getAgencyManagedPvs(
	pvs: PrPaymentVoucher[],
	agencyPRs: AgencyManagedPR[] = [],
): PrPaymentVoucher[] {
	return pvs.filter((pv) => pvBelongsToAgencyPr(pv, agencyPRs));
}

export type AgencyToPayRow = {
	prName: string;
	outlet: string;
	prIc?: string;
	totalNet: number;
	pvCount: number;
};

/** Group signed PVs by PR — matches Payroll → To pay → Payment queue. */
export function buildAgencyToPayRows(
	pvs: PrPaymentVoucher[],
	agencyPRs: AgencyManagedPR[] = [],
): AgencyToPayRow[] {
	const byPr = new Map<string, { row: AgencyToPayRow; outlets: Set<string> }>();
	for (const pv of pvs) {
		const prName = resolvePvPrName(pv, agencyPRs);
		const existing = byPr.get(prName);
		if (existing) {
			existing.row.totalNet += getPvNetTotal(pv);
			existing.row.pvCount += 1;
			existing.outlets.add(pv.outlet);
		} else {
			byPr.set(prName, {
				row: {
					prName,
					outlet: pv.outlet,
					prIc: pv.prIc,
					totalNet: getPvNetTotal(pv),
					pvCount: 1,
				},
				outlets: new Set([pv.outlet]),
			});
		}
	}
	return [...byPr.values()]
		.map(({ row, outlets }) => ({
			...row,
			outlet: outlets.size > 1 ? `Multi-outlet (${outlets.size})` : row.outlet,
		}))
		.sort((a, b) => b.totalNet - a.totalNet);
}

/** Signed PV net total — same figure as Payroll → To pay → Payment queue. */
export function agencyPrToPayTotal(
	pvs: PrPaymentVoucher[] = [],
	agencyPRs: AgencyManagedPR[] = [],
): number {
	return buildAgencyToPayRows(
		pvs.filter((pv) => pv.status === "SIGNED"),
		agencyPRs,
	).reduce((sum, row) => sum + row.totalNet, 0);
}

export function agencyPrToPayCount(
	pvs: PrPaymentVoucher[] = [],
	agencyPRs: AgencyManagedPR[] = [],
): number {
	return buildAgencyToPayRows(
		pvs.filter((pv) => pv.status === "SIGNED"),
		agencyPRs,
	).length;
}

/** Earliest pay-by Wednesday among signed agency PVs (14 days after issue). */
export function agencyPendingPayoutDeadline(
	pvs: PrPaymentVoucher[] = [],
	agencyPRs: AgencyManagedPR[] = [],
	now = Date.now(),
): {
	payByLabel: string;
	payByMs: number;
	isOverdue: boolean;
	pvCount: number;
} | null {
	const signed = getAgencyManagedPvs(pvs, agencyPRs).filter(
		(pv) => pv.status === "SIGNED",
	);
	if (!signed.length) return null;

	let payByMs = Infinity;
	let payByLabel = "";
	for (const pv of signed) {
		const ms = pvPayByDeadlineMsFromIssued(pv.issued);
		if (ms > 0 && ms < payByMs) {
			payByMs = ms;
			payByLabel = formatPvPayByDeadlineShort(pv.issued) ?? "";
		}
	}
	if (!Number.isFinite(payByMs) || !payByLabel) return null;

	return {
		payByLabel,
		payByMs,
		isOverdue: payByMs < now,
		pvCount: signed.length,
	};
}

export function resolvePvPrId(
	pv: Pick<PrPaymentVoucher, "prName" | "prIc">,
	agencyPRs: AgencyManagedPR[] = [],
): string | undefined {
	if (pv.prIc) {
		const byIc = agencyPRs.find((p) => p.ic === pv.prIc);
		if (byIc) return byIc.id;
	}
	return agencyPRs.find((p) => prNameMatchesAgency(pv.prName, p))?.id;
}

/** Agency payroll display labels — aligned with History / PV filter chips. */
/**
 * The agency's word for each PV state, keyed by the API's own enum value.
 *
 * Maps to dictionary KEYS, not finished strings: the enum value is what the
 * filter chips put in the query string and what the server matches on, so it
 * must never be translated — only the words beside it.
 */
export const AGENCY_PV_STATUS_LABELS: Record<
	PrPvStatus,
	keyof PortalTranslations["payroll"]
> = {
	PENDING_REVIEW: "statusPendingReview",
	SENT: "statusSent",
	SIGNED: "statusSigned",
	DISPUTED: "statusDisputed",
	PAID: "statusPaid",
};

// `t` is REQUIRED, not optional with an English default: an optional parameter
// would let a new call site compile while quietly rendering English.
export function agencyPvStatusLabel(
	status: PrPvStatus,
	t: PortalTranslations,
): string {
	const key = AGENCY_PV_STATUS_LABELS[status];
	return key ? t.payroll[key] : pvStatusLabel(status);
}

/**
 * Build commission receipt scans for Last Week / Last Last Week demo PVs.
 * Dates follow remapped PV rows so agency Payroll receipts stay in sync with vouchers.
 */
export function syncAgencyPayrollReceiptScans(
	scans: PrReceiptScan[],
	pvs: PrPaymentVoucher[],
	agencyPRs: AgencyManagedPR[],
): PrReceiptScan[] {
	const payrollPvIds = new Set(
		pvs
			.filter((pv) => {
				const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
				return weeksAgo != null && PAYROLL_RECEIPT_WEEKS_AGO.has(weeksAgo);
			})
			.map((pv) => pv.id),
	);
	if (payrollPvIds.size === 0) return scans;

	const base = scans.filter(
		(scan) =>
			!(
				scan.pvId &&
				payrollPvIds.has(scan.pvId) &&
				scan.id.startsWith(PV_COMMISSION_SCAN_PREFIX)
			),
	);

	const generated: PrReceiptScan[] = [];
	for (const pr of agencyPRs) {
		if (pr.detached) continue;
		const prPvs = pvs.filter(
			(pv) =>
				payrollPvIds.has(pv.id) &&
				(pv.prIc === pr.ic || prNameMatchesAgency(pv.prName, pr)),
		);
		if (prPvs.length === 0) continue;
		const profile = agencyPrReceiptProfile(pr);
		for (const scan of buildReceiptScansFromPaymentVouchers(
			prPvs,
			pr.id,
			profile,
		)) {
			generated.push({ ...scan, prCode: agencyPrReceiptCode(pr) });
		}
	}

	const byId = new Map<string, PrReceiptScan>();
	for (const scan of base) byId.set(scan.id, scan);
	for (const scan of generated) byId.set(scan.id, scan);
	return [...byId.values()].sort((a, b) =>
		b.scannedAt.localeCompare(a.scannedAt),
	);
}

type PayrollShiftSlot = {
	prId: string;
	prName: string;
	outlet: string;
	dateIso: string;
	dateDisplay: string;
	totalPayout: number;
	drinksAmt: number;
	tipsAmt: number;
	tablesAmt: number;
	pvId: string;
};

function payrollDemoPvs(pvs: PrPaymentVoucher[]): PrPaymentVoucher[] {
	return pvs.filter((pv) => {
		const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
		return weeksAgo != null && PAYROLL_RECEIPT_WEEKS_AGO.has(weeksAgo);
	});
}

function dateInPayrollDemoWeek(
	dateIso: string,
	pvs: PrPaymentVoucher[],
): boolean {
	return payrollDemoPvs(pvs).some(
		(pv) =>
			pv.weekStartIso &&
			pv.weekEndIso &&
			dateIso >= pv.weekStartIso &&
			dateIso <= pv.weekEndIso,
	);
}

function outletSlug(outlet: string): string {
	return outlet.trim().toLowerCase().replace(/\s+/g, "-");
}

function buildShiftHistoryFromPayrollPvs(
	pvs: PrPaymentVoucher[],
	agencyPRs: AgencyManagedPR[],
	agencyName: string,
): ShiftHistoryRow[] {
	const slots = new Map<string, PayrollShiftSlot>();

	for (const pv of payrollDemoPvs(pvs)) {
		const pr = agencyPRs.find(
			(p) =>
				!p.detached && (pv.prIc === p.ic || prNameMatchesAgency(pv.prName, p)),
		);
		if (!pr) continue;

		const prName = resolvePvPrName(pv, agencyPRs);
		const year = pv.weekStartIso
			? parseInt(pv.weekStartIso.slice(0, 4), 10)
			: parseInt(pv.issued.match(/\d{4}/)?.[0] ?? "2026", 10);

		for (const row of pv.rows) {
			const outlet = row.outlet?.trim();
			if (!outlet || outlet === "\u2014") continue;

			const dateIso = pvRowDateToIso(row, year);
			if (!dateIso) continue;
			if (
				pv.weekStartIso &&
				pv.weekEndIso &&
				(dateIso < pv.weekStartIso || dateIso > pv.weekEndIso)
			) {
				continue;
			}

			const slotKey = `${pr.id}|${dateIso}|${outlet.toLowerCase()}`;
			const acc =
				slots.get(slotKey) ??
				({
					prId: pr.id,
					prName,
					outlet,
					dateIso,
					dateDisplay: fmtDateLabelFromIso(dateIso),
					totalPayout: 0,
					drinksAmt: 0,
					tipsAmt: 0,
					tablesAmt: 0,
					pvId: pv.id,
				} satisfies PayrollShiftSlot);

			acc.totalPayout += row.amt;
			const desc = row.desc.toLowerCase();
			if (desc.includes("drink")) acc.drinksAmt += row.amt;
			else if (desc.includes("tip")) acc.tipsAmt += row.amt;
			else if (desc.includes("table")) acc.tablesAmt += row.amt;
			slots.set(slotKey, acc);
		}
	}

	const { drinkPerUnit } = RECEIPT_COMMISSION_RULES;
	return [...slots.values()].map((acc) => {
		const totalDrinks =
			drinkPerUnit > 0
				? Math.max(0, Math.round(acc.drinksAmt / drinkPerUnit))
				: 0;
		const drinkSalesRm =
			Math.round(totalDrinks * SHIFT_HISTORY_FALLBACK_PER_DRINK_RM * 100) / 100;
		const drinkCommissionRm = Math.round(acc.drinksAmt * 100) / 100;
		const tipCommissionRm = Math.round(acc.tipsAmt * 100) / 100;
		// Table commission retired from History — fold any PV table lines out of payout display parts.
		const totalPayout = Math.round(acc.totalPayout * 100) / 100;
		const wagesRm = Math.max(
			0,
			Math.round((totalPayout - drinkCommissionRm - tipCommissionRm) * 100) /
				100,
		);
		return {
			id: `${PAYROLL_SHIFT_ROW_PREFIX}${acc.pvId}-${acc.dateIso}-${outletSlug(acc.outlet)}`,
			prName: acc.prName,
			prId: acc.prId,
			outlet: acc.outlet,
			agencyName,
			dateDisplay: acc.dateDisplay,
			dateIso: acc.dateIso,
			totalPayout,
			totalDrinks,
			drinkSalesRm,
			totalTips: tipCommissionRm,
			totalTables: 0,
			wagesRm,
			otRm: 0,
			drinkCommissionRm,
			tipCommissionRm,
			durationHours: 6,
		};
	});
}

/**
 * Replace agency-roster shift rows in Last Week / Last Last Week with PV line items
 * so History totals match agency Payroll vouchers.
 */
export function syncAgencyPayrollShiftHistory(
	rows: ShiftHistoryRow[],
	pvs: PrPaymentVoucher[],
	agencyPRs: AgencyManagedPR[],
	/**
	 * Resolved by the CALLER from the agency actually signed in. This used to be
	 * a module constant hardcoded to "Atlas Agency" and stamped onto every row
	 * built here — and these are ShiftHistoryRow[], the exact rows
	 * ShiftHistoryLog renders, so a real agency would have seen a demo agency's
	 * name against its own shifts. Passed in rather than derived here so this
	 * module stays a leaf and imports no store.
	 * Pass "" when nothing is resolvable — consumers filter falsy names out.
	 */
	agencyName: string,
): ShiftHistoryRow[] {
	const generated = buildShiftHistoryFromPayrollPvs(pvs, agencyPRs, agencyName);
	if (generated.length === 0) return rows;

	const rosterPrIds = new Set(
		agencyPRs.filter((p) => !p.detached).map((p) => p.id),
	);
	const filtered = rows.filter((row) => {
		if (row.id.startsWith(PAYROLL_SHIFT_ROW_PREFIX)) return false;
		if (!rosterPrIds.has(row.prId)) return true;
		if (!dateInPayrollDemoWeek(row.dateIso, pvs)) return true;
		return false;
	});

	return dedupeShiftHistorySlots(
		sortShiftHistoryDesc([...filtered, ...generated]),
	);
}

/** Receipt scans belonging to PRs on the agency roster (or linked agency PVs). */
export function getAgencyManagedReceiptScans(
	scans: PrReceiptScan[],
	agencyPRs: AgencyManagedPR[],
	pvs: PrPaymentVoucher[],
): PrReceiptScan[] {
	const agencyPvIds = new Set(
		pvs
			.filter((pv) =>
				agencyPRs.some((pr) => prNameMatchesAgency(pv.prName, pr)),
			)
			.map((pv) => pv.id),
	);

	return scans.filter((scan) => {
		if (isLegacyReceiptScanIdentity(scan)) return false;
		if (scan.prId && agencyPRs.some((pr) => pr.id === scan.prId)) return true;
		if (agencyPRs.some((pr) => prNameMatchesAgency(scan.prName, pr)))
			return true;
		if (scan.pvId && agencyPvIds.has(scan.pvId)) return true;
		return false;
	});
}

export function receiptsForPv(
	scans: PrReceiptScan[],
	pv: PrPaymentVoucher,
): PrReceiptScan[] {
	const ids = new Set(pv.receiptIds ?? []);
	return scans.filter((s) => s.pvId === pv.id || ids.has(s.id));
}

function inferCollectionLineGroup(label: string): CollectionLineGroup {
	const d = label.toLowerCase();
	if (
		d.includes("wage") ||
		d.includes("payroll") ||
		d.includes("overtime") ||
		d.includes(" ot")
	) {
		return "payroll";
	}
	if (
		d.includes("drink") ||
		d.includes("tip") ||
		d.includes("table") ||
		d.includes("commission")
	) {
		return "commissions";
	}
	return "fees";
}

function pvRowToCollectionLine(
	row: { desc: string; amt: number },
	pv: PrPaymentVoucher,
): CollectionLineItem {
	return {
		label: row.desc,
		detail: `${pv.prName} · ${pv.id}`,
		amount: row.amt,
		group: inferCollectionLineGroup(row.desc),
	};
}

/** Line items owed — invoice breakdown or derived from linked PV rows */
export function collectionOwedLines(
	invoice: AgencyCollectionInvoice,
	pvs: PrPaymentVoucher[],
): CollectionLineItem[] {
	if (invoice.lines?.length) {
		return invoice.lines
			.filter((l) => l.amount > 0)
			.map((l) => ({
				...l,
				group: l.group ?? inferCollectionLineGroup(l.label),
			}));
	}
	const linked = invoice.linkedPvIds
		.map((id) => pvs.find((p) => p.id === id))
		.filter((p): p is PrPaymentVoucher => Boolean(p));
	if (linked.length) {
		return linked.flatMap((pv) =>
			pv.rows.map((row) => pvRowToCollectionLine(row, pv)),
		);
	}
	return [
		{
			label: "Agency payroll & fees",
			detail: invoice.id,
			amount: invoice.amount,
			group: "fees",
		},
	];
}

export const COLLECTION_LINE_GROUPS: CollectionLineGroup[] = [
	"payroll",
	"commissions",
	"fees",
];

export const COLLECTION_GROUP_LABELS: Record<CollectionLineGroup, string> = {
	payroll: "Payroll",
	commissions: "Commissions",
	fees: "Fees & platform",
};

export function groupCollectionLines(lines: CollectionLineItem[]) {
	return COLLECTION_LINE_GROUPS.map((group) => {
		const items = lines.filter(
			(l) => (l.group ?? inferCollectionLineGroup(l.label)) === group,
		);
		return {
			group,
			label: COLLECTION_GROUP_LABELS[group],
			lines: items,
			subtotal: items.reduce((s, l) => s + l.amount, 0),
		};
	}).filter((g) => g.lines.length > 0);
}

export function mergeAgencyCollections(
	persisted: AgencyCollectionInvoice[] | undefined,
	seeds: AgencyCollectionInvoice[],
): AgencyCollectionInvoice[] {
	if (!persisted?.length) return seeds;
	const seedById = Object.fromEntries(seeds.map((s) => [s.id, s]));
	const filtered = persisted.filter(
		(row) => row.kind !== "agency" || seedById[row.id],
	);
	const merged = filtered.map((row) => {
		const seed = seedById[row.id];
		if (!seed) return row;
		const isAgencySubscription =
			seed.kind === "agency" &&
			seed.lines?.some((l) => l.label.toLowerCase().includes("subscription"));
		if (isAgencySubscription) {
			return { ...seed, ...row, amount: seed.amount, lines: seed.lines };
		}
		return {
			...seed,
			...row,
			lines: row.lines?.length ? row.lines : seed.lines,
			linkedPvIds: seed.linkedPvIds?.length
				? seed.linkedPvIds
				: row.linkedPvIds,
		};
	});
	const ids = new Set(merged.map((m) => m.id));
	return [...merged, ...seeds.filter((s) => !ids.has(s.id))];
}
