import { AgencyPvDayReviewPanel } from "@agency-portal/components/agency/AgencyPvDayReviewPanel";
import {
	AgencyReceiptsPanel,
	receiptsInPayrollWeek,
} from "@agency-portal/components/agency/AgencyReceiptsPanel";
import { DisputeQueuePanel } from "@agency-portal/components/agency/DisputeQueuePanel";
import { OvertimeQueuePanel } from "@agency-portal/components/agency/OvertimeQueuePanel";
import { PayrollVerifyPanel } from "@agency-portal/components/agency/PayrollVerifyPanel";
import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { SignatureInkMark } from "@agency-portal/components/iz/SignatureInkMark";
import {
	formatRM,
	IzCard,
	IzCardTitle,
	IzKpiLabel,
	IzPageTitle,
	IzPill,
} from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { PrSignaturePad } from "@agency-portal/components/pr/PrSignaturePad";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useAgencyPvDayReview } from "@agency-portal/hooks/use-agency-pv-day-review";
import {
	useAgencyPvDetail,
	useAgencyPvs,
} from "@agency-portal/hooks/use-agency-pvs";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { usePvIssuer } from "@agency-portal/hooks/use-pv-issuer";
import {
	agencySubscriptionBillingForWeeklyPv,
	nowAgencyDateTime,
	ownedByAgency,
} from "@agency-portal/lib/agency-demo";
import {
	AGENCY_PV_STATUS_LABELS,
	agencyPvStatusLabel,
	getAgencyManagedReceiptScans,
	receiptsForPv,
	resolvePvPrLabel,
	resolvePvPrName,
} from "@agency-portal/lib/agency-payroll";
import {
	AGENCY_SUB_ROLE_LABELS,
	agencyCan,
} from "@agency-portal/lib/agency-rbac";
import {
	DEMO_PV_ISSUED_WEEKS_AGO,
	demoPayrollWeekBoundsForWeeksAgo,
	downloadPvReceipt,
	FINANCE_HEAD_LABEL,
	getLatestPvIssuedMs,
	getPvNetTotal,
	getPvSalesTotal,
	PAYROLL_CYCLE,
	type PrPaymentVoucher,
	type PrPvRow,
	type PrPvStatus,
	type PrReceiptScan,
	parsePvIssuedMs,
	pvStatusPillVariant,
	receiptEntryLoggedLabel,
	receiptEntryMethod,
	receiptEntryMethodLabel,
	receiptStatusLabel,
	reconcilePvTotals,
	resolvePvPayByDue,
	sortPvsBySales,
} from "@agency-portal/lib/pr-demo";
import {
	disputeDaysRemaining,
	PV_WORKFLOW_STEPS,
	type PvEarningsBreakdown,
	pvWorkflowStepIndex,
	summarizePv,
} from "@agency-portal/lib/pv-breakdown";
import {
	downloadPvBreakdownCsv,
	downloadPvBreakdownPdf,
} from "@agency-portal/lib/pv-pdf";
import {
	buildAgencyPayee,
	formatPvSignStamp,
} from "@agency-portal/lib/pv-template";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	CheckCircle2,
	ChevronRight,
	Clock,
	FileText,
	Filter,
	Pencil,
	Receipt,
	Send,
	Sheet,
	Shield,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
export const Route = createFileRoute("/agency/pv")({
	component: AgencyPV,
	validateSearch: (
		search: Record<string, unknown>,
	): { status?: PvStatusFilter; pv?: string } => {
		const status = search.status;
		const valid: PvStatusFilter[] = [
			"PENDING_REVIEW",
			"SENT",
			"SIGNED",
			"DISPUTED",
			"TO_PAY",
		];
		let statusFilter: PvStatusFilter | undefined;
		if (
			typeof status === "string" &&
			valid.includes(status as PvStatusFilter)
		) {
			statusFilter = status as PvStatusFilter;
		}
		const pv =
			typeof search.pv === "string" && search.pv.trim()
				? search.pv.trim()
				: undefined;
		return { status: statusFilter, pv };
	},
});

function statusPill(status: PrPvStatus) {
	return pvStatusPillVariant(status);
}

type PvStatusFilter = "all" | "TO_PAY" | PrPvStatus;

type PayrollWeekTab = "this_week" | "last_week" | "last_last_week";

type PvSubTab = "vouchers" | "receipts" | "disputes" | "overtime";

const LAST_WEEK_REVIEW_STATUSES = new Set<PrPvStatus>([
	"SENT",
	"PENDING_REVIEW",
	"DISPUTED",
]);

/**
 * Does this voucher belong to the tab covering `weekStartIso`–`weekEndIso`?
 *
 * The tabs are Sun–Sat payroll weeks, and since 3 Aug 2026 so is the backend —
 * `week_start` is now a SUNDAY, matching this screen exactly.
 *
 * Matching stays containment-based rather than string equality even though the
 * two now agree. It was written because they did NOT agree: a Sunday tab start
 * could never equal a Monday `week_start`, and equality silently hid every real
 * voucher here. Containment is correct under either convention — a date sits in
 * exactly one Sun–Sat week — so it is the test that cannot break again if the
 * cadence is ever changed. The row still prints its own week wherever one
 * diverges, rather than letting the tab label speak for it.
 */
function pvBelongsToPayrollWeek(
	pv: PrPaymentVoucher,
	weekStartIso: string,
	weekEndIso: string,
	lastWeekStart: string,
	lastLastWeekStart: string,
): boolean {
	if (pv.weekStartIso) {
		return pv.weekStartIso >= weekStartIso && pv.weekStartIso <= weekEndIso;
	}
	const weeksAgo = DEMO_PV_ISSUED_WEEKS_AGO[pv.id];
	if (weeksAgo === 0) return weekStartIso === lastWeekStart;
	if (weeksAgo === 1) return weekStartIso === lastLastWeekStart;
	return false;
}

const PV_STATUS_FILTERS: { value: PvStatusFilter; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "PENDING_REVIEW", label: AGENCY_PV_STATUS_LABELS.PENDING_REVIEW },
	{ value: "SENT", label: AGENCY_PV_STATUS_LABELS.SENT },
	{ value: "DISPUTED", label: AGENCY_PV_STATUS_LABELS.DISPUTED },
	{ value: "TO_PAY", label: "To pay" },
];

function statusFiltersForWeek(tab: PayrollWeekTab) {
	// "To pay" only means something once a PR has signed, which cannot have
	// happened for a week still running or one awaiting review.
	if (tab === "last_week" || tab === "this_week") {
		return PV_STATUS_FILTERS.filter((f) => f.value !== "TO_PAY");
	}
	return PV_STATUS_FILTERS;
}

/** "2026-07-20" -> "20 Jul", so a week range reads "20 Jul – 26 Jul 2026". */
function shortIsoDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

/**
 * The week a BACKEND voucher itself covers, or null for a demo one (whose
 * `cycle` string already is a date range).
 *
 * Still needed after the weeks were aligned to Sun–Sat (3 Aug 2026): the
 * backend's `cycle` column holds a CADENCE ("Weekly"), not a range, so without
 * this the row shows no dates at all and the only week on screen is the tab's.
 */
function pvOwnWeekLabel(pv: PrPaymentVoucher): string | null {
	if (!pv.weekStartIso || !pv.weekEndIso) return null;
	const year = pv.weekEndIso.slice(0, 4);
	return `${shortIsoDay(pv.weekStartIso)} – ${shortIsoDay(pv.weekEndIso)} ${year}`;
}

/**
 * The statuses a voucher for the CURRENT, still-running week can legitimately
 * hold. Same set as last week's: the week being open does not stop an agency
 * reviewing what has accrued so far, and a voucher already sent mid-week (it
 * happens) must not vanish from the only screen that can chase it.
 */
const THIS_WEEK_STATUSES = LAST_WEEK_REVIEW_STATUSES;

function AgencyPV() {
	const navigate = useNavigate();
	const { status: statusFromSearch, pv: pvFromSearch } = Route.useSearch();
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const prReceiptScans = useStore((s) => s.prReceiptScans ?? []);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencySubRole = useStore((s) => s.agencySubRole);
	// Tenant scoping — attribute receipts to this agency via its OWNED PRs so a
	// shared PR (member of both agencies) never drags the other agency's payroll in.
	const agencyPRs = useMemo(
		() => ownedByAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	// Vouchers come from the backend (already agency-scoped server-side); the
	// Receipts sub-tab stays on the demo store — no backend for receipt scans.
	const { pvs: prPaymentVouchers } = useAgencyPvs();
	const [detailId, setDetailId] = useState<string | null>(null);
	const [payrollWeekTab, setPayrollWeekTab] =
		useState<PayrollWeekTab>("last_week");
	const [pvSubTab, setPvSubTab] = useState<PvSubTab>("vouchers");
	// Counts only. Both panels fetch the same queries themselves, and React Query
	// dedupes, so this costs no extra request. The COUNT is the point: these two
	// used to sit open above the fold, and an undecided overtime claim is WHY the
	// week below refuses to send — hiding that behind a click with no number
	// would turn a visible blocker into an invisible one.
	const { disputes: openDisputes } = useAgencyDisputes();
	const { claims: pendingOtClaims } = useAgencyOvertime();
	const [statusFilter, setStatusFilter] = useState<PvStatusFilter>("all");
	// Count only — the panel below runs the same query and React Query dedupes it.
	const { receipts: backendReceipts } = useAgencyReceipts();
	const { date, time } = nowAgencyDateTime();

	const payrollActivePvs = useMemo(
		() => prPaymentVouchers.filter((p) => p.status !== "PAID"),
		[prPaymentVouchers],
	);

	const paid = prPaymentVouchers.filter((p) => p.status === "PAID").length;

	const agencyReceiptScans = useMemo(
		() =>
			getAgencyManagedReceiptScans(
				prReceiptScans,
				agencyPRs,
				prPaymentVouchers,
			),
		[prReceiptScans, agencyPRs, prPaymentVouchers],
	);

	// -1 = the week still running. Same Sun–Sat shape as the other two, so the
	// three tabs are one convention rather than a special case bolted on.
	const thisWeekBounds = useMemo(
		() => demoPayrollWeekBoundsForWeeksAgo(-1),
		[],
	);
	const lastWeekBounds = useMemo(() => demoPayrollWeekBoundsForWeeksAgo(0), []);
	const lastLastWeekBounds = useMemo(
		() => demoPayrollWeekBoundsForWeeksAgo(1),
		[],
	);

	const thisWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					thisWeekBounds.weekStartIso,
					thisWeekBounds.weekEndIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && THIS_WEEK_STATUSES.has(p.status),
		);
	}, [
		payrollActivePvs,
		thisWeekBounds.weekStartIso,
		thisWeekBounds.weekEndIso,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
	]);

	const lastWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					lastWeekBounds.weekStartIso,
					lastWeekBounds.weekEndIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && LAST_WEEK_REVIEW_STATUSES.has(p.status),
		);
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastWeekBounds.weekEndIso,
		lastLastWeekBounds.weekStartIso,
	]);

	/**
	 * The payment week — EVERY voucher in it, not only the signed ones.
	 *
	 * By this week a voucher is *expected* to be signed and ready to pay, and the
	 * tab was written to show only `SIGNED` on that basis. But this is the ONLY
	 * tab whose window contains a two-week-old voucher, so filtering by status
	 * made an unsigned one invisible everywhere: the agency could not review it,
	 * could not send it, and the PR could therefore never sign it — RM 875.00 with
	 * no screen in the whole product, and nothing anywhere saying so.
	 *
	 * A voucher that missed its window is the exception the agency most needs to
	 * see. So the tab shows the week and flags what has not been signed; the
	 * "To pay" status chip still isolates the signed ones for the payment run.
	 */
	/**
	 * PLUS every SIGNED voucher, whatever week it belongs to.
	 *
	 * OWNER RULE (4 Aug 2026): *"after the pr sign the pv, the pv should come out
	 * at the payment week section"*. This tab is the PAYMENT QUEUE — the screen
	 * that answers "who am I paying now" — and it was filtering by CALENDAR DATE
	 * alone. So PV-000004, signed by the PR at 16:30 on 4 Aug, stayed in Last Week
	 * because its week was 26 Jul–01 Aug, while PV-000002 sat here purely by being
	 * older. Signing changed nothing on the one screen that pays it.
	 *
	 * A signature is what makes a voucher payable, so a signature is what puts it
	 * in the queue. `payrollActivePvs` has already dropped PAID, so a voucher
	 * leaves again the moment it is paid.
	 *
	 * It stays in its own week tab as well, deliberately. Removing it there would
	 * mean an agency looking for last week's voucher — by the week it was worked,
	 * which is how everyone refers to it — would not find it where they looked.
	 */
	const lastLastWeekPvs = useMemo(() => {
		const inWindow = payrollActivePvs.filter((p) =>
			pvBelongsToPayrollWeek(
				p,
				lastLastWeekBounds.weekStartIso,
				lastLastWeekBounds.weekEndIso,
				lastWeekBounds.weekStartIso,
				lastLastWeekBounds.weekStartIso,
			),
		);
		const seen = new Set(inWindow.map((p) => p.id));
		const signedElsewhere = payrollActivePvs.filter(
			(p) => p.status === "SIGNED" && !seen.has(p.id),
		);
		return [...inWindow, ...signedElsewhere];
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekEndIso,
	]);

	const weekTabPvs = useMemo(() => {
		if (payrollWeekTab === "this_week") return thisWeekPvs;
		if (payrollWeekTab === "last_week") return lastWeekPvs;
		return lastLastWeekPvs;
	}, [payrollWeekTab, thisWeekPvs, lastWeekPvs, lastLastWeekPvs]);

	/**
	 * The first week tab actually holding a voucher of this status, newest first,
	 * or null if none does.
	 *
	 * Exists because a link that names a status must land where that status lives.
	 * Reading it from the data rather than hardcoding a tab means the payout cadence
	 * can move without this going stale — which is exactly how the previous
	 * hardcoded "last_week" ended up pointing at an empty list.
	 */
	const tabHoldingStatus = useCallback(
		(status: PrPvStatus): PayrollWeekTab | null => {
			const holds = (list: PrPaymentVoucher[]) =>
				list.some((p) => p.status === status);
			if (holds(thisWeekPvs)) return "this_week";
			if (holds(lastWeekPvs)) return "last_week";
			if (holds(lastLastWeekPvs)) return "last_last_week";
			return null;
		},
		[thisWeekPvs, lastWeekPvs, lastLastWeekPvs],
	);

	useEffect(() => {
		if (statusFromSearch === ("PAID" as PvStatusFilter)) {
			void navigate({
				to: "/agency/history",
				search: { tab: "paid" },
				replace: true,
			});
			return;
		}
		if (statusFromSearch === "TO_PAY" || statusFromSearch === "SIGNED") {
			setPayrollWeekTab("last_last_week");
			setPvSubTab("vouchers");
			setStatusFilter(statusFromSearch === "TO_PAY" ? "TO_PAY" : "all");
		} else if (
			statusFromSearch === "SENT" ||
			statusFromSearch === "PENDING_REVIEW" ||
			statusFromSearch === "DISPUTED"
		) {
			// Whichever week actually holds a voucher of this status, rather than a
			// hardcoded "last_week". A real pending_review voucher lives in the week
			// still RUNNING, so the agency home's "Pending Agency Review" link landed
			// on Last Week and reported "No vouchers match these filters" while two
			// waited one tab away. last_week stays the fallback, so an empty result
			// still lands somewhere deliberate.
			setPayrollWeekTab(tabHoldingStatus(statusFromSearch) ?? "last_week");
			setPvSubTab("vouchers");
			setStatusFilter(statusFromSearch);
		} else if (statusFromSearch && statusFromSearch !== "PAID") {
			setStatusFilter(statusFromSearch);
		}
		if (pvFromSearch) setDetailId(pvFromSearch);
		// tabHoldingStatus is a dependency on purpose: on first paint the vouchers
		// have not arrived, so the pick above would fall back and stick. Re-running
		// once they load is what makes it land on the right tab — and it cannot then
		// fight a manual tab click, because selectPayrollWeekTab clears these params.
	}, [statusFromSearch, pvFromSearch, navigate, tabHoldingStatus]);

	const latestIssuedMs = useMemo(
		() => getLatestPvIssuedMs(weekTabPvs),
		[weekTabPvs],
	);

	const activeWeekBounds =
		payrollWeekTab === "last_last_week"
			? lastLastWeekBounds
			: payrollWeekTab === "this_week"
				? thisWeekBounds
				: lastWeekBounds;

	const activeWeekStats = useMemo(() => {
		const signed = weekTabPvs.filter((p) => p.status === "SIGNED");
		const prCount = new Set(
			weekTabPvs.map((p) => resolvePvPrName(p, agencyPRs)),
		).size;
		const pvCount = weekTabPvs.length;
		return {
			prCount,
			pvCount,
			pendingPayout:
				Math.round(signed.reduce((sum, p) => sum + getPvNetTotal(p), 0) * 100) /
				100,
			signedCount: signed.length,
			signedTotal:
				Math.round(signed.reduce((sum, p) => sum + getPvNetTotal(p), 0) * 100) /
				100,
		};
	}, [weekTabPvs, agencyPRs]);

	const activeWeekBilling = useMemo(
		() => agencySubscriptionBillingForWeeklyPv(activeWeekStats.pvCount),
		[activeWeekStats.pvCount],
	);

	/**
	 * The DATABASE's receipts for the selected week — what the Receipts sub-tab
	 * counts and lists.
	 *
	 * Anchored on the voucher's own `week_start`, the same containment rule the
	 * voucher rows use, rather than on when the receipt was uploaded: a receipt
	 * logged on Monday for last week's shift is last week's money.
	 */
	const activeWeekReceipts = useMemo(
		() =>
			receiptsInPayrollWeek(
				backendReceipts,
				activeWeekBounds.weekStartIso,
				activeWeekBounds.weekEndIso,
			),
		[
			backendReceipts,
			activeWeekBounds.weekStartIso,
			activeWeekBounds.weekEndIso,
		],
	);

	const selectPayrollWeekTab = (tab: PayrollWeekTab) => {
		setPayrollWeekTab(tab);
		setStatusFilter("all");
		// The payment week hides Disputes and Overtime, so landing on it while one
		// of them is selected would leave a panel open with no tab above it — and
		// no way back except guessing. Fall back to the tab that always exists.
		if (
			tab === "last_last_week" &&
			(pvSubTab === "disputes" || pvSubTab === "overtime")
		) {
			setPvSubTab("vouchers");
		}
		// Drop the incoming ?status/?pv. They are an instruction about where to land,
		// and once the user has picked a tab themselves that instruction is spent —
		// leaving it in the URL lets the effect above re-apply it on the next refetch
		// and pull them off the tab they just chose.
		if (statusFromSearch || pvFromSearch) {
			void navigate({ to: "/agency/pv", search: {}, replace: true });
		}
	};

	const statusFilteredPvs = useMemo(() => {
		if (statusFilter === "all") return weekTabPvs;
		if (statusFilter === "TO_PAY" || statusFilter === "SIGNED") {
			return weekTabPvs.filter((p) => p.status === "SIGNED");
		}
		return weekTabPvs.filter((p) => p.status === statusFilter);
	}, [weekTabPvs, statusFilter]);

	// The status chips apply on every tab now, including the payment week. They
	// were bypassed there because that tab held only SIGNED vouchers and a filter
	// over one status is pointless — now that it shows unsigned ones too, "To pay"
	// is what narrows it back down to the payment run.
	const filteredVouchers = useMemo(
		() => sortPvsBySales(statusFilteredPvs, "default"),
		[statusFilteredPvs],
	);

	/**
	 * Payment-week vouchers nobody has signed — overdue by the screen's own rule.
	 * Counted rather than hidden: this is the number that says money is stuck.
	 */
	const unsignedPaymentWeekPvs = useMemo(
		() => lastLastWeekPvs.filter((p) => p.status !== "SIGNED"),
		[lastLastWeekPvs],
	);

	const visibleStatusFilters = useMemo(
		() => statusFiltersForWeek(payrollWeekTab),
		[payrollWeekTab],
	);

	useEffect(() => {
		// "To pay" is offered only on the Payment Week tab; leaving it selected while
		// switching to a week that cannot have signed vouchers filters the list to
		// nothing and reads as an empty week.
		if (payrollWeekTab !== "last_last_week" && statusFilter === "TO_PAY") {
			setStatusFilter("all");
		}
	}, [payrollWeekTab, statusFilter]);

	const statusCounts = useMemo(() => {
		const counts: Record<PvStatusFilter, number> = {
			all: weekTabPvs.length,
			PENDING_REVIEW: 0,
			SENT: 0,
			SIGNED: 0,
			TO_PAY: 0,
			DISPUTED: 0,
			PAID: 0,
		};
		for (const p of weekTabPvs) {
			counts[p.status] += 1;
			if (p.status === "SIGNED") counts.TO_PAY += 1;
		}
		return counts;
	}, [weekTabPvs]);

	const hasActiveFilters = statusFilter !== "all";

	const clearFilters = () => {
		setStatusFilter("all");
	};

	const detail = prPaymentVouchers.find((p) => p.id === detailId);

	if (detail) {
		return (
			<div className="iz-screen">
				<AppTopbar onBack={() => setDetailId(null)} backLabel="PV list" />
				<PvDetail
					pv={detail}
					receiptScans={receiptsForPv(agencyReceiptScans, detail)}
					onClose={() => setDetailId(null)}
				/>
			</div>
		);
	}

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>Payroll &amp; PV</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">
					{date} · {time} · Cycle{" "}
					<span className="text-[var(--iz-gold-l)]">{PAYROLL_CYCLE.range}</span>
					<IzPill variant="violet" className="ml-1.5 !py-0 !text-[9px]">
						Per-item calc
					</IzPill>
				</p>
				<p className="iz-tiny iz-muted2 mt-1">
					{AGENCY_SUB_ROLE_LABELS[agencySubRole ?? "agency_owner"]} · PR portal
					signs · PR confirms weekly earnings
				</p>
			</header>

			{/* Disputes and overtime used to render open here, above the weeks. They
			    now live in the sub-tab row below beside Payment Vouchers / Receipts,
			    at the owner's request, because on a quiet week two empty panels ate
			    the first screen. Their COUNTS ride on the tab labels so an
			    outstanding item is still visible without opening the tab — an
			    undecided overtime claim is why a week refuses to send. Still NOT on
			    the approvals page: that route is gated on `approvePrSignups`, which
			    agency finance does not hold, and finance may decide overtime. */}

			<div className="iz-payroll-tabs mt-3">
				{/* The week still running. Vouchers accrue into it as shifts complete, so
				    without this tab a real voucher for the current week has nowhere to
				    appear at all. */}
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "this_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("this_week")}
				>
					This Week
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "last_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("last_week")}
				>
					Last Week
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${payrollWeekTab === "last_last_week" ? " on" : ""}`}
					onClick={() => selectPayrollWeekTab("last_last_week")}
				>
					Payment Week
				</button>
			</div>

			<p className="iz-tiny iz-muted2 mt-2">
				{payrollWeekTab === "this_week"
					? `${thisWeekBounds.cycle} · in progress · not yet closed`
					: payrollWeekTab === "last_week"
						? `${lastWeekBounds.cycle} · pending PR review or dispute`
						: // Not a single week any more: this tab now also holds every
							// SIGNED voucher from any week, so naming one date range would
							// describe a list it no longer matches. Say what the list IS.
							`Signed vouchers · ${lastLastWeekBounds.cycle} and earlier · ${
								unsignedPaymentWeekPvs.length > 0
									? `${unsignedPaymentWeekPvs.length} not signed yet`
									: "ready to pay"
							}`}
				{" · "}
				{activeWeekStats.pvCount} PV{activeWeekStats.pvCount === 1 ? "" : "s"} ·{" "}
				{activeWeekBilling.plan.label} · {activeWeekBilling.priceLabel}
				{activeWeekBilling.plan.renegotiate && (
					<span className="text-[var(--iz-amber)]">
						{" "}
						· contact admin for custom pricing
					</span>
				)}
			</p>

			<div className="iz-grid3 mt-3">
				<div className="iz-stat-tile">
					<div className="n text-[var(--iz-gold-l)]">
						{activeWeekStats.prCount}
					</div>
					<IzKpiLabel>PR</IzKpiLabel>
				</div>
				<div className="iz-stat-tile">
					<div className="n">{activeWeekStats.pvCount}</div>
					<IzKpiLabel>PV</IzKpiLabel>
				</div>
				<div className="iz-stat-tile">
					<div className="n text-[var(--iz-gold-l)]">
						{formatRM(activeWeekStats.pendingPayout)}
					</div>
					<IzKpiLabel>Pending Payout</IzKpiLabel>
				</div>
			</div>

			<div className="iz-payroll-tabs mt-2.5">
				<button
					type="button"
					className={`iz-payroll-tab${pvSubTab === "vouchers" ? " on" : ""}`}
					onClick={() => setPvSubTab("vouchers")}
				>
					Payment Vouchers ({weekTabPvs.length})
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${pvSubTab === "receipts" ? " on" : ""}`}
					onClick={() => setPvSubTab("receipts")}
				>
					Receipts ({activeWeekReceipts.length})
				</button>
				{/* Hidden on the PAYMENT week (owner's rule, 3 Aug 2026): by then every
				    voucher is signed, and a signed voucher's figures are settled — a
				    dispute or an overtime claim belongs to a week still under review.
				    ⚠️ These two remain deliberately NOT week-scoped on the other tabs:
				    a claim blocks whichever week it belongs to, so filtering them to the
				    selected week would hide the thing stopping a DIFFERENT week from
				    going out. Hiding here is about the payment week having nothing left
				    to contest — not about scoping the queues. */}
				{payrollWeekTab !== "last_last_week" && (
					<>
						<button
							type="button"
							className={`iz-payroll-tab${pvSubTab === "disputes" ? " on" : ""}`}
							onClick={() => setPvSubTab("disputes")}
						>
							Disputes ({openDisputes.length})
						</button>
						<button
							type="button"
							className={`iz-payroll-tab${pvSubTab === "overtime" ? " on" : ""}`}
							onClick={() => setPvSubTab("overtime")}
						>
							Overtime ({pendingOtClaims.length})
						</button>
					</>
				)}
			</div>

			{pvSubTab === "disputes" && <DisputeQueuePanel />}
			{pvSubTab === "overtime" && <OvertimeQueuePanel />}

			{pvSubTab === "vouchers" && (
				<OutletSection title="Payment Vouchers" hint={activeWeekBounds.cycle}>
					{payrollWeekTab === "last_last_week" && (
						<IzCard
							flat
							className="!mb-2.5 border-[rgba(232,194,122,.3)] bg-[linear-gradient(180deg,rgba(232,194,122,.05),transparent)]"
						>
							<div className="iz-between">
								<div>
									<p className="iz-sm font-bold">Signed PVs · manual payment</p>
									<p className="iz-tiny iz-muted mt-1">
										Agency pays each PR individually after e-sign — no scheduled
										auto-transfer.
									</p>
									<p className="iz-tiny iz-muted2 mt-0.5">
										{activeWeekStats.signedCount} signed · use <b>To pay</b> to
										record each bank transfer ·{" "}
										<Link
											to="/agency/history"
											search={{ tab: "paid" }}
											className="text-[var(--iz-gold-l)]"
										>
											{paid} paid in History
										</Link>
									</p>
								</div>
								<b className="font-sora text-base text-[var(--iz-gold)]">
									{formatRM(activeWeekStats.signedTotal)}
								</b>
							</div>
							<p className="iz-tiny iz-muted2 mt-2">
								Duplicate payment blocked
							</p>
						</IzCard>
					)}
					{payrollWeekTab === "last_last_week" &&
						unsignedPaymentWeekPvs.length > 0 && (
							<IzCard
								flat
								className="!mb-2.5 border-[rgba(244,183,64,.4)] bg-[rgba(244,183,64,.08)]"
							>
								<p className="iz-sm font-bold text-[var(--iz-amber)]">
									{unsignedPaymentWeekPvs.length} voucher
									{unsignedPaymentWeekPvs.length === 1 ? "" : "s"} in this week
									{unsignedPaymentWeekPvs.length === 1 ? " is" : " are"} still
									not signed
								</p>
								{/* The whole reason this card exists: by the payment week a voucher
								    should already be signed, so one that is not has fallen out of
								    the flow — and before this tab showed it, nothing anywhere in
								    the product would ever have mentioned it again. */}
								<p className="iz-tiny iz-muted2 mt-0.5">
									These are overdue — a PR cannot sign a voucher that was never
									sent. Review each day, then send it, and it moves to the
									PR&apos;s Payment screen to e-sign.
								</p>
								<ul className="mt-1.5 space-y-0.5">
									{unsignedPaymentWeekPvs.map((p) => (
										<li key={p.id} className="iz-tiny iz-muted2">
											{resolvePvPrName(p, agencyPRs)} ·{" "}
											{formatRM(getPvNetTotal(p))} ·{" "}
											{agencyPvStatusLabel(p.status)}
										</li>
									))}
								</ul>
							</IzCard>
						)}
					{payrollWeekTab !== "last_last_week" && (
						<IzCard flat className="!mb-2.5">
							<div className="flex items-center gap-2 iz-tiny iz-muted">
								<Filter className="h-3.5 w-3.5 shrink-0" />
								Filter &amp; sort
								{hasActiveFilters && (
									<button
										type="button"
										className="ml-auto text-[var(--iz-gold-l)]"
										onClick={clearFilters}
									>
										Clear all
									</button>
								)}
							</div>

							<p className="iz-filter-group-label">Status</p>
							<div className="iz-filter-chips">
								{visibleStatusFilters.map((f) => {
									const active = statusFilter === f.value;
									const count = statusCounts[f.value];
									return (
										<button
											key={f.value}
											type="button"
											className={`iz-filter-chip${active ? " on" : ""}`}
											onClick={() => setStatusFilter(f.value)}
										>
											{f.label}
											<span className="iz-filter-chip__count">({count})</span>
										</button>
									);
								})}
							</div>
						</IzCard>
					)}

					<div className="space-y-2.5">
						{filteredVouchers.length === 0 ? (
							<IzCard className="text-center">
								<p className="iz-sm iz-muted">
									{payrollWeekTab === "last_last_week"
										? "No signed vouchers to pay this week"
										: "No vouchers match these filters"}
								</p>
								{payrollWeekTab !== "last_last_week" && hasActiveFilters && (
									<button
										type="button"
										className="iz-chip mt-2"
										onClick={clearFilters}
									>
										Clear filters
									</button>
								)}
							</IzCard>
						) : (
							filteredVouchers.map((pv) => (
								<button
									key={pv.id}
									type="button"
									className="iz-card iz-between w-full cursor-pointer text-left"
									onClick={() => setDetailId(pv.id)}
								>
									<div className="min-w-0">
										<div className="font-sora text-[15px] font-bold">
											{pv.id}
										</div>
										<p className="iz-tiny iz-muted mt-0.5">
											{resolvePvPrLabel(pv, agencyPRs)} · {pv.outlet}
										</p>
										{pv.prIc && (
											<p className="iz-tiny iz-muted2">IC {pv.prIc}</p>
										)}
										<p className="iz-tiny iz-muted2 mt-0.5">
											Cycle: {pv.cycle}
										</p>
										{/* A backend voucher's own week runs Mon–Sun while these tabs
										    are Sun–Sat, so the tab heading is one day out from the
										    week this voucher actually covers. Print the voucher's
										    range rather than letting the heading speak for it. */}
										{pvOwnWeekLabel(pv) && (
											<p className="iz-tiny iz-muted2">
												Week worked: {pvOwnWeekLabel(pv)}
											</p>
										)}
										<p className="iz-tiny iz-muted2">
											Issued {pv.issued} · Due {resolvePvPayByDue(pv)}
											{parsePvIssuedMs(pv.issued) >= latestIssuedMs &&
												latestIssuedMs > 0 && (
													<span className="ml-1 text-[var(--iz-violet)]">
														· Latest
													</span>
												)}
										</p>
										<p className="iz-tiny text-[var(--iz-gold-l)] mt-0.5">
											Sales {formatRM(getPvSalesTotal(pv))}
										</p>
									</div>
									<div className="shrink-0 text-right">
										<IzPill variant={statusPill(pv.status)}>
											{agencyPvStatusLabel(pv.status)}
										</IzPill>
										<div className="iz-ledger font-sora mt-1.5 text-base font-bold">
											{formatRM(getPvNetTotal(pv))}
										</div>
										<p className="iz-tiny iz-muted2 mt-0.5">Net payable</p>
									</div>
								</button>
							))
						)}
					</div>
				</OutletSection>
			)}

			{pvSubTab === "receipts" && (
				<AgencyReceiptsPanel
					weekStartIso={activeWeekBounds.weekStartIso}
					weekEndIso={activeWeekBounds.weekEndIso}
					onOpenPv={(voucherId) => setDetailId(voucherId)}
				/>
			)}
		</div>
	);
}

function receiptScanStatusPill(scan: PrReceiptScan): {
	variant: "green" | "amber" | "red" | "ink" | "violet" | "gold";
	label: string;
} {
	if (scan.logSource === "manual") {
		if (scan.agencyVerification === "pending")
			return { variant: "amber", label: "VERIFY" };
		if (scan.agencyVerification === "approved")
			return { variant: "green", label: "VERIFIED" };
		if (scan.agencyVerification === "rejected")
			return { variant: "ink", label: "REJECTED" };
	}
	const variant =
		scan.status === "paid"
			? "green"
			: scan.status === "in_pv"
				? "amber"
				: "ink";
	return { variant, label: receiptStatusLabel(scan.status) };
}

function ReceiptScanRow({
	scan,
	onClick,
	compact = false,
	onVerify,
}: {
	scan: PrReceiptScan;
	onClick?: () => void;
	/** Hide line items — used on the agency receipts list (details in sheet). */
	compact?: boolean;
	onVerify?: (scanId: string, decision: "approved" | "rejected") => void;
}) {
	const [y, m, d] = scan.date;
	const entry = receiptEntryMethod(scan);
	const pendingSelfLog =
		scan.logSource === "manual" && scan.agencyVerification === "pending";
	const statusPill = receiptScanStatusPill(scan);

	const body = (
		<IzCard
			flat
			className={`!mb-2${pendingSelfLog ? " iz-receipt-selflog-pending" : ""}${onClick && !pendingSelfLog ? " !mb-0 transition-colors hover:border-[var(--iz-gold-d)]" : ""}`}
		>
			<div className="iz-between items-start gap-2">
				<div className="min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<p className="font-sora text-sm font-bold">{scan.receiptRef}</p>
						{scan.logSource === "manual" && (
							<IzPill variant="amber">Self-log</IzPill>
						)}
					</div>
					<p className="iz-tiny iz-muted2 mt-0.5 font-mono">{scan.id}</p>
					<p className="iz-tiny iz-muted mt-0.5">
						{scan.prName} · {scan.outlet}
					</p>
					{scan.manualReason && (
						<p className="iz-tiny text-[var(--iz-amber)] mt-1">
							{scan.manualReason}
						</p>
					)}
					{scan.prId && <p className="iz-tiny iz-muted2">PR ID {scan.prId}</p>}
					<p className="iz-tiny iz-muted2 mt-0.5">
						{receiptEntryLoggedLabel(scan)}
					</p>
					<p className="iz-tiny iz-muted2">
						Shift date {d}/{m}/{y}
					</p>
				</div>
				<div className="flex shrink-0 items-start gap-2 text-right">
					<div>
						{scan.logSource === "manual" ? (
							<IzPill variant={statusPill.variant}>{statusPill.label}</IzPill>
						) : (
							<IzPill variant={entry === "manual" ? "violet" : "ink"}>
								{receiptEntryMethodLabel(entry)}
							</IzPill>
						)}
						<p className="iz-ledger mt-1 text-sm font-bold">
							{formatRM(scan.totalLogged)}
						</p>
						<p className="iz-tiny iz-muted2">
							Comm {formatRM(scan.totalCommission)}
						</p>
					</div>
					{onClick && !pendingSelfLog && (
						<ChevronRight
							className="mt-1 h-4 w-4 text-[var(--iz-muted)]"
							aria-hidden
						/>
					)}
				</div>
			</div>
			{!compact && (
				<div className="mt-2 border-t border-[var(--iz-line)] pt-2">
					{scan.items.map((item) => (
						<p
							key={`${scan.id}-${item.label}`}
							className="iz-tiny iz-muted py-0.5"
						>
							{item.qty}× {item.label} · {formatRM(item.amount)}
						</p>
					))}
				</div>
			)}
			{pendingSelfLog && onVerify && (
				<div className="mt-2 flex gap-2 border-t border-[var(--iz-line)] pt-2">
					<button
						type="button"
						className="iz-btn iz-btn-soft flex-1 !py-1.5 !text-xs"
						onClick={() => onVerify(scan.id, "rejected")}
					>
						Reject
					</button>
					<button
						type="button"
						className="iz-btn iz-btn-primary flex-1 !py-1.5 !text-xs"
						onClick={() => onVerify(scan.id, "approved")}
					>
						<CheckCircle2 className="h-3 w-3" /> Verify self-log
					</button>
				</div>
			)}
		</IzCard>
	);

	if (onClick && !pendingSelfLog) {
		return (
			<button
				type="button"
				className="mb-2 block w-full text-left"
				onClick={onClick}
			>
				{body}
			</button>
		);
	}

	return body;
}

function PvWorkflowRail({ status }: { status: PrPvStatus }) {
	const active = pvWorkflowStepIndex(status);
	return (
		<div className="mb-2.5 flex gap-1 overflow-x-auto pb-1">
			{PV_WORKFLOW_STEPS.map((step, idx) => {
				const done = idx <= active;
				const current = idx === active;
				return (
					<div
						key={step.key}
						className={`shrink-0 rounded-lg border px-2 py-1.5 text-center ${
							current
								? "border-[var(--iz-gold)] bg-[rgba(232,194,122,.12)]"
								: done
									? "border-[var(--iz-green)]/40 text-[var(--iz-green)]"
									: "border-[var(--iz-line)] text-[var(--iz-muted)]"
						}`}
					>
						<p className="iz-tiny font-semibold">{step.label}</p>
					</div>
				);
			})}
		</div>
	);
}

function PvBreakdownCard({ breakdown }: { breakdown: PvEarningsBreakdown }) {
	const rows = [
		{ label: "Daily wages", value: breakdown.wages },
		{ label: "Drink commissions", value: breakdown.drinks },
		{ label: "Tip commissions", value: breakdown.tips },
		{ label: "Overtime (check-out)", value: breakdown.overtime },
	].filter((r) => r.value > 0);
	if (breakdown.other > 0)
		rows.push({ label: "Other", value: breakdown.other });
	return (
		<IzCard flat className="mb-2.5">
			<p className="iz-tiny iz-muted2 mb-2 tracking-wide">
				4-PART EARNINGS BREAKDOWN
			</p>
			{rows.map((r) => (
				<div key={r.label} className="iz-v-sum">
					<span className="iz-muted">{r.label}</span>
					<b>{formatRM(r.value)}</b>
				</div>
			))}
			<div className="iz-v-sum tot">
				<span>Subtotal</span>
				<b className="text-[var(--iz-gold)]">{formatRM(breakdown.total)}</b>
			</div>
		</IzCard>
	);
}

function PvDetail({
	pv,
	receiptScans,
	onClose,
}: {
	pv: PrPaymentVoucher;
	receiptScans: PrReceiptScan[];
	onClose: () => void;
}) {
	const {
		editLines,
		sendToPr,
		resend,
		resolveDispute,
		overrideSigned,
		financeSign,
		isSigning,
		markPaid,
	} = useAgencyPvs();
	const [signOpen, setSignOpen] = useState(false);
	const [signError, setSignError] = useState<string | null>(null);
	const [bankRef, setBankRef] = useState("");
	const agencySubRole = useStore((s) => s.agencySubRole);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const toast = useStore((s) => s.toast);
	// The letterhead the printed voucher carries — the signed-in agency, so this
	// document names the same company the PR's copy of it does. Undefined on a
	// demo session, which falls the template back to its own issuer.
	const pvIssuer = usePvIssuer();
	// The list omits line items — pull the full voucher (falls back to the list
	// row until it resolves).
	const detailPv = useAgencyPvDetail(pv.id, pv);
	const v = detailPv ?? pv;
	// Shares the day-review panel's fetch (same query key), so the button and the
	// panel below it can never disagree about whether a day is held.
	const { sendGate } = useAgencyPvDayReview(pv.id);
	const [editing, setEditing] = useState(false);
	const [overrideOpen, setOverrideOpen] = useState(false);
	const [overrideReason, setOverrideReason] = useState("");
	const canOverride = agencyCan(agencySubRole, "overrideSignedPv");
	const [rows, setRows] = useState<PrPvRow[]>(v.rows);
	const [deduct, setDeduct] = useState(v.deduct);

	/**
	 * Has the agency signed? Read from the voucher, never from local state — the
	 * server is the authority, and a locally-remembered signature would leave the
	 * Send button enabled against a 409.
	 */
	const financeSigned = Boolean(v.financeHeadSignedAt);

	const handleFinanceSign = async (ink: {
		w: number;
		h: number;
		strokes: [number, number][][];
	}) => {
		setSignError(null);
		try {
			await financeSign({ id: pv.id, signature: ink });
			setSignOpen(false);
			toast("Voucher signed — you can send it now", "success");
		} catch (error) {
			// The server's refusal verbatim: each one is a real rule (already sent,
			// wrong role), not a generic failure the agency has to guess at.
			setSignError(
				(error as { response?: { data?: { message?: string } } } | null)
					?.response?.data?.message ?? "Could not record that signature",
			);
		}
	};
	// Refresh the editable copy when the real line items arrive.
	useEffect(() => {
		if (!editing) {
			setRows(v.rows);
			setDeduct(v.deduct);
		}
	}, [v, editing]);

	const payee = buildAgencyPayee(v, agencyPRs);
	const breakdown = summarizePv(editing ? { ...v, rows, deduct } : v);
	const prHasSigned = Boolean(
		v.prSignedAt || v.status === "PAID" || v.status === "SIGNED",
	);
	const prSigPreview = v.prSignatureDataUrl;
	const disputeDays = disputeDaysRemaining(v.disputedAt);
	const displayPv: PrPaymentVoucher = editing
		? reconcilePvTotals({ ...v, rows, deduct })
		: v;

	const saveEdit = () => {
		editLines(pv.id, rows, deduct);
		setEditing(false);
	};

	return (
		<>
			<div className="iz-pv-detail-bar mb-2.5">
				<div className="iz-pv-detail-bar-main">
					<IzPill variant={statusPill(pv.status)}>
						{agencyPvStatusLabel(pv.status)}
					</IzPill>
					<span className="iz-pv-detail-id">{pv.id}</span>
				</div>
				<button type="button" className="iz-chip" onClick={onClose}>
					Close
				</button>
			</div>

			<PvWorkflowRail status={pv.status} />

			<IzCard flat className="mb-2">
				<p className="iz-tiny iz-muted2">Dual-sign PV</p>
				<p className="iz-tiny mt-1">
					1st · {FINANCE_HEAD_LABEL}:{" "}
					<b className="text-[var(--iz-txt)]">{v.financeHeadName}</b>
					{v.financeHeadSignedAt
						? ` · ${formatPvSignStamp(v.financeHeadSignedAt)}`
						: " · pending"}
				</p>
				{/* The drawn mark, read from the voucher's own `finance_head_signature`.
				    Reads `v`, not `pv` — the ink rides on the DETAIL fetch, and the list
				    row has never carried it. The demo data URL is the fallback, not the
				    source: it is drawn from the signer's NAME, so preferring it showed a
				    signature for anyone on file. */}
				{financeSigned && (
					<div className="iz-pv-sig-preview mt-1.5">
						{v.financeHeadSignatureInk ? (
							<SignatureInkMark
								ink={v.financeHeadSignatureInk}
								label={`${v.financeHeadName} signature`}
							/>
						) : v.financeHeadSignatureDataUrl ? (
							<img
								src={v.financeHeadSignatureDataUrl}
								alt={`${v.financeHeadName} signature`}
							/>
						) : null}
					</div>
				)}
				<p className="iz-tiny iz-muted mt-2">
					2nd · PR ({pv.prName}):
					{prHasSigned ? (
						<>
							{" "}
							<b className="text-[var(--iz-txt)]">{pv.prName}</b>
							{v.prSignedAt ? ` · ${formatPvSignStamp(v.prSignedAt)}` : ""}
							{" · "}
							<span className="text-[var(--iz-green)]">e-sign on file ✓</span>
						</>
					) : pv.status === "SENT" || pv.status === "PENDING_REVIEW" ? (
						" awaiting manual sign"
					) : (
						" —"
					)}
				</p>
				{prHasSigned && (v.prSignatureInk || prSigPreview) && (
					<div className="iz-pv-sig-preview mt-1.5">
						{v.prSignatureInk ? (
							<SignatureInkMark
								ink={v.prSignatureInk}
								label={`${pv.prName} signature`}
							/>
						) : (
							<img src={prSigPreview} alt={`${pv.prName} signature`} />
						)}
					</div>
				)}
			</IzCard>

			<PvBreakdownCard breakdown={breakdown} />

			{pv.status === "DISPUTED" && (
				<IzCard flat className="mb-2 border-[var(--iz-red)]">
					<p className="iz-tiny font-bold text-[var(--iz-red)]">
						PR dispute — resolve within 7 days
					</p>
					{pv.disputedAt && (
						<p className="iz-tiny iz-muted2 mt-0.5">Raised {pv.disputedAt}</p>
					)}
					{disputeDays !== null && (
						<p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)] mt-1">
							<Clock className="h-3 w-3" />
							{disputeDays > 0
								? `${disputeDays} day(s) left to adjust + re-send`
								: "Past 7 days — follow up with PR directly"}
						</p>
					)}
					{pv.disputeUpdatedAt && (
						<p className="iz-tiny text-[var(--iz-amber)]">
							PR updated {pv.disputeUpdatedAt}
						</p>
					)}
					{pv.prDisputeReason && (
						<div className="mt-2 rounded-[12px] border border-[rgba(255,107,107,.2)] bg-[rgba(0,0,0,.15)] p-3">
							<p className="iz-tiny iz-muted2 tracking-wide">PR REASON</p>
							<p className="iz-sm mt-1 leading-relaxed">{pv.prDisputeReason}</p>
						</div>
					)}
					{pv.disputeNote && (
						<p className="iz-tiny iz-muted mt-2">
							<b className="text-[var(--iz-muted)]">Agency note:</b>{" "}
							{pv.disputeNote}
						</p>
					)}
				</IzCard>
			)}

			<PvSummaryView pv={displayPv} payee={payee} className="mb-2.5" />

			{receiptScans.length > 0 && (
				<OutletSection
					title="Receipt scans"
					hint={`${receiptScans.length} logged on this PV`}
				>
					{receiptScans.map((scan) => (
						<ReceiptScanRow key={scan.id} scan={scan} />
					))}
				</OutletSection>
			)}

			{pv.status === "DISPUTED" && rows.length > 0 && (
				<OutletSection
					title="Edit line items"
					hint="Dispute resolution"
					trailing={
						<button
							type="button"
							className="iz-chip"
							onClick={() => setEditing(!editing)}
						>
							<Pencil className="mr-1 inline h-3 w-3" />{" "}
							{editing ? "Cancel" : "Edit"}
						</button>
					}
				>
					<IzCard>
						{rows.map((r, idx) => (
							<div
								key={r.i}
								className="iz-v-sum border-b border-[var(--iz-line)] py-2 last:border-0"
							>
								<div className="min-w-0 pr-2">
									{editing ? (
										<input
											className="w-full rounded bg-[var(--iz-bg2)] px-2 py-1 text-sm"
											value={r.desc}
											onChange={(e) => {
												const next = [...rows];
												next[idx] = { ...r, desc: e.target.value };
												setRows(next);
											}}
										/>
									) : (
										<span className="iz-sm">{r.desc}</span>
									)}
									<p className="iz-tiny iz-muted2 mt-0.5">
										{r.date} ({r.day}) · {r.outlet} · {r.ref}
									</p>
								</div>
								{editing ? (
									<input
										type="number"
										className="w-20 rounded bg-[var(--iz-bg2)] px-2 py-1 text-right text-sm"
										value={r.amt}
										onChange={(e) => {
											const next = [...rows];
											next[idx] = { ...r, amt: Number(e.target.value) };
											setRows(next);
										}}
									/>
								) : (
									<b className="iz-ledger shrink-0">{formatRM(r.amt)}</b>
								)}
							</div>
						))}
						{editing && (
							<div className="mt-2">
								<label className="iz-tiny iz-muted">Deductions</label>
								<input
									type="number"
									className="mt-1 w-full rounded-xl border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-3 py-2 text-sm"
									value={deduct}
									onChange={(e) => setDeduct(Number(e.target.value))}
								/>
								<button
									type="button"
									className="iz-btn iz-btn-primary mt-2 w-full"
									onClick={saveEdit}
								>
									Save dispute edit
								</button>
							</div>
						)}
					</IzCard>
				</OutletSection>
			)}

			<div className="mt-2.5 flex gap-2">
				<button
					type="button"
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs"
					onClick={() => {
						downloadPvBreakdownPdf(displayPv, payee, [], pvIssuer);
						toast("Official PV opened — use Print → Save as PDF", "success");
					}}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs"
					onClick={() => {
						downloadPvBreakdownCsv(displayPv, payee, pvIssuer);
						toast("Payment voucher Excel downloaded", "success");
					}}
				>
					<Sheet className="h-4 w-4 shrink-0" /> Excel
				</button>
			</div>
			<p className="iz-tiny iz-muted2 mt-1.5 text-center">
				PDF and Excel match the official voucher layout · duplicate payment
				blocked on send.
			</p>

			{pv.status === "PAID" && (
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-2 w-full"
					onClick={() => {
						downloadPvReceipt(displayPv, {
							name: payee.name,
							bank: payee.bank ?? "Maybank",
							acc: payee.accountNo ?? "",
							ic: payee.ic ?? pv.prIc ?? "",
						});
						toast("Payment receipt downloaded", "success");
					}}
				>
					<Receipt className="h-4 w-4" /> Download payment receipt
				</button>
			)}

			{/* The day review gates this: the backend refuses a send while any day is
			    held or undecided, so the button says why instead of 409-ing. */}
			{pv.status === "PENDING_REVIEW" &&
				agencyCan(agencySubRole, "raisePv") && (
					<>
						{/*
						 * The agency's own signature, ahead of the send — the rail's
						 * "Finance sign" step, which until 3 Aug 2026 was a label with no
						 * action behind it. The server refuses the send without it (409),
						 * so the pad is offered here rather than letting the button fail.
						 */}
						{!financeSigned && (
							<div className="mt-2 rounded-xl border border-[rgba(232,194,122,.35)] p-3">
								<p className="iz-sm font-bold">Finance signature required</p>
								<p className="iz-tiny iz-muted2 mt-0.5">
									Sign to attest these figures. The PR counter-signs what you
									sign here, so it comes before the voucher is sent.
								</p>
								{signError && (
									<p className="iz-tiny mt-1.5 text-[var(--iz-red,#c0554f)]">
										{signError}
									</p>
								)}
								{signOpen ? (
									<div className="mt-2">
										<PrSignaturePad
											label="Draw your signature"
											onConfirm={() => {
												/* the PNG is not persisted — strokes are */
											}}
											onConfirmInk={(ink) => void handleFinanceSign(ink)}
											onCancel={() => setSignOpen(false)}
										/>
									</div>
								) : (
									<button
										type="button"
										className="iz-btn iz-btn-primary mt-2 w-full"
										disabled={isSigning}
										onClick={() => setSignOpen(true)}
									>
										<Pencil className="h-4 w-4" /> Sign this voucher
									</button>
								)}
							</div>
						)}
						<button
							type="button"
							className="iz-btn iz-btn-primary mt-2 w-full"
							disabled={!sendGate.allowed || !financeSigned}
							onClick={() => sendToPr(pv.id)}
						>
							<Send className="h-4 w-4" /> Send to PR for e-sign
						</button>
						{!financeSigned && (
							<p className="iz-tiny iz-muted2 mt-1 text-center">
								Sign above first — the PR counter-signs your signature.
							</p>
						)}
						{/* Only once we know WHY. While the fetch is in flight the button is
						    disabled with no caption — a reason would be a guess. */}
						{!sendGate.allowed &&
							sendGate.heldDays.length + sendGate.unreviewedDays.length > 0 && (
								<p className="iz-tiny iz-muted2 mt-1 text-center">
									{sendGate.reason} — see Day review below.
								</p>
							)}
					</>
				)}

			{(pv.status === "DISPUTED" || pv.status === "SENT") && (
				<button
					type="button"
					className="iz-btn iz-btn-soft mt-2 w-full"
					onClick={() => resend(pv.id)}
				>
					Re-send to PR
				</button>
			)}

			{pv.status === "DISPUTED" && (
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-2"
					onClick={() => resolveDispute(pv.id)}
				>
					Resolve dispute &amp; reassign
				</button>
			)}

			{/*
			 * Recording the bank transfer — the last step of the rail, and the one
			 * that had no action behind it: the payment week card has always said
			 * "use To pay to record each bank transfer" while offering nothing to
			 * record it with, so a signed voucher could never become paid.
			 *
			 * Only on a SIGNED voucher: paying one the PR has not counter-signed
			 * would settle a figure nobody agreed to. The bank reference is optional
			 * because a transfer can be real without its reference being to hand,
			 * and blocking the record would lose the more important fact.
			 */}
			{pv.status === "SIGNED" && agencyCan(agencySubRole, "raisePv") && (
				<div className="mt-2 rounded-xl border border-[rgba(93,217,160,.35)] p-3">
					<p className="iz-sm font-bold">Record payment</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						Marks this voucher paid and moves it to History. The paid date is
						stamped once — recording twice cannot re-date a transfer.
					</p>
					<input
						type="text"
						className="mt-2 w-full rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)] px-2 py-1.5 text-xs"
						placeholder="Bank reference (optional)"
						value={bankRef}
						onChange={(e) => setBankRef(e.target.value)}
						aria-label="Bank reference"
					/>
					<button
						type="button"
						className="iz-btn iz-btn-primary mt-2 w-full"
						onClick={() => {
							markPaid(pv.id, bankRef.trim() || undefined);
							setBankRef("");
							toast(
								`${formatRM(getPvNetTotal(pv))} recorded as paid`,
								"success",
							);
						}}
					>
						<CheckCircle2 className="h-4 w-4" /> Mark as paid
					</button>
				</div>
			)}

			{pv.overrideAudit && (
				<IzCard flat className="mt-2 border-[var(--iz-amber)]">
					<p className="iz-tiny flex items-center gap-1 text-[var(--iz-amber)]">
						<Shield className="h-3 w-3" /> Overridden by {pv.overrideAudit.by} ·{" "}
						{pv.overrideAudit.at}
					</p>
					<p className="iz-tiny iz-muted mt-1">{pv.overrideAudit.reason}</p>
				</IzCard>
			)}

			{canOverride && (pv.status === "SIGNED" || pv.status === "PAID") && (
				<button
					type="button"
					className="iz-btn iz-btn-ghost mt-2 w-full"
					onClick={() => setOverrideOpen(true)}
				>
					Override signed PV (audit logged)
				</button>
			)}

			<IzSheet open={overrideOpen} onClose={() => setOverrideOpen(false)}>
				<IzCardTitle>Override signed PV</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3">
					Finance may override with a mandatory audit reason — PV re-opens for
					PR review
				</p>
				<textarea
					className="iz-field-input min-h-[80px]"
					value={overrideReason}
					onChange={(e) => setOverrideReason(e.target.value)}
					placeholder="Reason for override…"
				/>
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-3 w-full"
					disabled={!overrideReason.trim()}
					onClick={() => {
						overrideSigned(pv.id, overrideReason);
						setOverrideOpen(false);
						setOverrideReason("");
					}}
				>
					Confirm override
				</button>
			</IzSheet>

			{/* Day-by-day sign-off, then the receipt evidence it is judged against.
          Both render nothing on a demo voucher, whose id has no backend row
          behind it, and both read the same fetch. */}
			<AgencyPvDayReviewPanel voucherId={pv.id} />
			<PayrollVerifyPanel voucherId={pv.id} />

			<button
				type="button"
				className="iz-btn iz-btn-soft mt-2"
				onClick={onClose}
			>
				Back to payroll
			</button>
		</>
	);
}
