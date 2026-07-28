import {
	EMPTY_PAYROLL_RANGE,
	PayrollRangeFilterCard,
} from "@agency-portal/components/agency/PayrollRangeFilter";
import { PayrollVerifyPanel } from "@agency-portal/components/agency/PayrollVerifyPanel";
import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import {
	formatRM,
	IzCard,
	IzCardTitle,
	IzKpiLabel,
	IzPageTitle,
	IzPill,
	IzSelect,
} from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { ReceiptScanSlip } from "@agency-portal/components/pr/ReceiptScanSlip";
import {
	useAgencyPvDetail,
	useAgencyPvs,
} from "@agency-portal/hooks/use-agency-pvs";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import {
	agencySubscriptionBillingForWeeklyPv,
	nowAgencyDateTime,
	ownedByAgency,
} from "@agency-portal/lib/agency-demo";
import {
	AGENCY_PV_STATUS_LABELS,
	agencyPvStatusLabel,
	getAgencyManagedReceiptScans,
	receiptBelongsToAgencyPr,
	receiptsForPv,
	resolvePvPrName,
} from "@agency-portal/lib/agency-payroll";
import {
	AGENCY_SUB_ROLE_LABELS,
	agencyCan,
} from "@agency-portal/lib/agency-rbac";
import {
	matchesReceiptShiftWorkRange,
	type PayrollRangeFilter,
	receiptShiftDateIso,
} from "@agency-portal/lib/payroll-filters";
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
	type ReceiptEntryMethod,
	receiptEntryLoggedLabel,
	receiptEntryMethod,
	receiptEntryMethodLabel,
	receiptShiftDetails,
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
import { buildAgencyPayee } from "@agency-portal/lib/pv-template";
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
import { useEffect, useMemo, useState } from "react";
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

type PayrollWeekTab = "last_week" | "last_last_week";

type PvSubTab = "vouchers" | "receipts";

const LAST_WEEK_REVIEW_STATUSES = new Set<PrPvStatus>([
	"SENT",
	"PENDING_REVIEW",
	"DISPUTED",
]);

function pvBelongsToPayrollWeek(
	pv: PrPaymentVoucher,
	weekStartIso: string,
	lastWeekStart: string,
	lastLastWeekStart: string,
): boolean {
	if (pv.weekStartIso) return pv.weekStartIso === weekStartIso;
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
	if (tab === "last_week") {
		return PV_STATUS_FILTERS.filter((f) => f.value !== "TO_PAY");
	}
	return PV_STATUS_FILTERS;
}

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
	const [statusFilter, setStatusFilter] = useState<PvStatusFilter>("all");
	const [payrollRange, setPayrollRange] =
		useState<PayrollRangeFilter>(EMPTY_PAYROLL_RANGE);
	const verifyAgencyReceiptSelfLog = useStore(
		(s) => s.verifyAgencyReceiptSelfLog,
	);
	const { date, time } = nowAgencyDateTime();

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
			setPayrollWeekTab("last_week");
			setPvSubTab("vouchers");
			setStatusFilter(statusFromSearch);
		} else if (statusFromSearch && statusFromSearch !== "PAID") {
			setStatusFilter(statusFromSearch);
		}
		if (pvFromSearch) setDetailId(pvFromSearch);
	}, [statusFromSearch, pvFromSearch, navigate]);

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

	const lastWeekBounds = useMemo(() => demoPayrollWeekBoundsForWeeksAgo(0), []);
	const lastLastWeekBounds = useMemo(
		() => demoPayrollWeekBoundsForWeeksAgo(1),
		[],
	);

	const lastWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					lastWeekBounds.weekStartIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && LAST_WEEK_REVIEW_STATUSES.has(p.status),
		);
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
	]);

	const lastLastWeekPvs = useMemo(() => {
		return payrollActivePvs.filter(
			(p) =>
				pvBelongsToPayrollWeek(
					p,
					lastLastWeekBounds.weekStartIso,
					lastWeekBounds.weekStartIso,
					lastLastWeekBounds.weekStartIso,
				) && p.status === "SIGNED",
		);
	}, [
		payrollActivePvs,
		lastWeekBounds.weekStartIso,
		lastLastWeekBounds.weekStartIso,
	]);

	const weekTabPvs = useMemo(
		() => (payrollWeekTab === "last_week" ? lastWeekPvs : lastLastWeekPvs),
		[payrollWeekTab, lastWeekPvs, lastLastWeekPvs],
	);

	const latestIssuedMs = useMemo(
		() => getLatestPvIssuedMs(weekTabPvs),
		[weekTabPvs],
	);

	const activeWeekBounds =
		payrollWeekTab === "last_last_week" ? lastLastWeekBounds : lastWeekBounds;

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

	const activeWeekReceiptScans = useMemo(() => {
		const linked = new Map<string, PrReceiptScan>();
		for (const pv of weekTabPvs) {
			for (const scan of receiptsForPv(agencyReceiptScans, pv)) {
				linked.set(scan.id, scan);
			}
		}
		return [...linked.values()].filter((scan) => {
			const iso = receiptShiftDateIso(scan);
			return (
				iso >= activeWeekBounds.weekStartIso &&
				iso <= activeWeekBounds.weekEndIso
			);
		});
	}, [
		agencyReceiptScans,
		weekTabPvs,
		activeWeekBounds.weekStartIso,
		activeWeekBounds.weekEndIso,
	]);

	const selectPayrollWeekTab = (tab: PayrollWeekTab) => {
		setPayrollWeekTab(tab);
		setStatusFilter("all");
	};

	const statusFilteredPvs = useMemo(() => {
		if (statusFilter === "all") return weekTabPvs;
		if (statusFilter === "TO_PAY" || statusFilter === "SIGNED") {
			return weekTabPvs.filter((p) => p.status === "SIGNED");
		}
		return weekTabPvs.filter((p) => p.status === statusFilter);
	}, [weekTabPvs, statusFilter]);

	const filteredVouchers = useMemo(
		() =>
			sortPvsBySales(
				payrollWeekTab === "last_last_week" ? weekTabPvs : statusFilteredPvs,
				"default",
			),
		[payrollWeekTab, weekTabPvs, statusFilteredPvs],
	);

	const visibleStatusFilters = useMemo(
		() => statusFiltersForWeek(payrollWeekTab),
		[payrollWeekTab],
	);

	useEffect(() => {
		if (payrollWeekTab === "last_week" && statusFilter === "TO_PAY") {
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

			<div className="iz-payroll-tabs mt-3">
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
				{payrollWeekTab === "last_week"
					? `${lastWeekBounds.cycle} · pending PR review or dispute`
					: `${lastLastWeekBounds.cycle} · signed · ready to pay`}
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
					Receipts ({activeWeekReceiptScans.length})
				</button>
			</div>

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
					{payrollWeekTab === "last_week" && (
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
								{payrollWeekTab === "last_week" && hasActiveFilters && (
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
											{resolvePvPrName(pv, agencyPRs)} · {pv.outlet}
										</p>
										{pv.prIc && (
											<p className="iz-tiny iz-muted2">IC {pv.prIc}</p>
										)}
										<p className="iz-tiny iz-muted2 mt-0.5">
											Cycle: {pv.cycle}
										</p>
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
				<ReceiptsSection
					scans={activeWeekReceiptScans}
					agencyPRs={agencyPRs}
					pvs={prPaymentVouchers}
					payrollRange={payrollRange}
					onRangeChange={setPayrollRange}
					onClearRange={() => setPayrollRange(EMPTY_PAYROLL_RANGE)}
					onVerifySelfLog={verifyAgencyReceiptSelfLog}
					onOpenPv={(pvId) => setDetailId(pvId)}
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

function ReceiptScanDetailSheet({
	scan,
	pv,
	open,
	onClose,
	onOpenPv,
}: {
	scan: PrReceiptScan | null;
	pv?: PrPaymentVoucher;
	open: boolean;
	onClose: () => void;
	onOpenPv?: (pvId: string) => void;
}) {
	if (!scan) return null;

	const [y, m, d] = scan.date;
	const entry = receiptEntryMethod(scan);
	const shift = receiptShiftDetails(scan, pv);

	return (
		<IzSheet open={open} onClose={onClose}>
			<div className="iz-sheet-body">
				<div className="iz-between items-start gap-2">
					<div className="min-w-0">
						<h3 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
							{scan.receiptRef}
						</h3>
						<p className="iz-tiny iz-muted2 mt-0.5 font-mono">{scan.id}</p>
					</div>
					<IzPill variant={entry === "manual" ? "violet" : "ink"}>
						{receiptEntryMethodLabel(entry)}
					</IzPill>
				</div>

				<p className="iz-tiny iz-muted mt-2">
					{scan.prName} · {scan.outlet}
					{scan.prId ? ` · PR ID ${scan.prId}` : ""}
				</p>
				<p className="iz-tiny iz-muted2">{receiptEntryLoggedLabel(scan)}</p>
				<p className="iz-tiny iz-muted2">
					Shift date {d}/{m}/{y}
					{shift.window ? ` · ${shift.shiftTime} ${shift.window}` : ""}
				</p>

				<IzCard flat className="mt-3 border-[rgba(232,194,122,.25)]">
					<p className="iz-tiny iz-muted2 tracking-wide">PAYMENT VOUCHER</p>
					{scan.pvId ? (
						<>
							<p className="font-sora mt-1 text-sm font-bold text-[var(--iz-gold-l)]">
								{scan.pvId}
							</p>
							{pv ? (
								<p className="iz-tiny iz-muted mt-1">
									{pv.prName} · {pv.outlet} · issued {pv.issued}
								</p>
							) : (
								<p className="iz-tiny iz-muted2 mt-1">
									PV not in agency payroll list
								</p>
							)}
							{pv && (
								<div className="mt-2 flex flex-wrap items-center gap-2">
									<IzPill variant={pvStatusPillVariant(pv.status)}>
										{agencyPvStatusLabel(pv.status)}
									</IzPill>
									<span className="iz-ledger text-sm font-bold">
										{formatRM(pv.net)}
									</span>
								</div>
							)}
							{onOpenPv && (
								<button
									type="button"
									className="iz-btn iz-btn-soft iz-btn-sm mt-3 w-full"
									onClick={() => {
										onOpenPv(scan.pvId!);
										onClose();
									}}
								>
									<FileText className="h-3.5 w-3.5" /> View full PV
								</button>
							)}
						</>
					) : (
						<p className="iz-sm iz-muted mt-1">
							Not on a PV yet — receipt is attached to the PR&apos;s active
							shift until Time-Out.
						</p>
					)}
				</IzCard>

				<div className="mt-3">
					<ReceiptScanSlip scan={scan} />
				</div>
			</div>
		</IzSheet>
	);
}

function ReceiptsSection({
	scans,
	agencyPRs,
	pvs,
	payrollRange,
	onRangeChange,
	onClearRange,
	onOpenPv,
	onVerifySelfLog,
}: {
	scans: PrReceiptScan[];
	agencyPRs: AgencyManagedPR[];
	pvs: PrPaymentVoucher[];
	payrollRange: PayrollRangeFilter;
	onRangeChange: (r: PayrollRangeFilter) => void;
	onClearRange: () => void;
	onOpenPv?: (pvId: string) => void;
	onVerifySelfLog?: (scanId: string, decision: "approved" | "rejected") => void;
}) {
	const [outlet, setOutlet] = useState("");
	const [prId, setPrId] = useState("");
	const [entryMethod, setEntryMethod] = useState<"" | ReceiptEntryMethod>("");
	const [detailScan, setDetailScan] = useState<PrReceiptScan | null>(null);
	const detailPv = useMemo(
		() =>
			detailScan?.pvId ? pvs.find((p) => p.id === detailScan.pvId) : undefined,
		[detailScan, pvs],
	);
	const outlets = useMemo(
		() => [...new Set(scans.map((s) => s.outlet))].sort(),
		[scans],
	);
	const prOptions = useMemo(
		() =>
			agencyPRs
				.filter((pr) => scans.some((s) => receiptBelongsToAgencyPr(s, pr)))
				.sort((a, b) => a.name.localeCompare(b.name)),
		[agencyPRs, scans],
	);
	const filtered = useMemo(
		() =>
			scans.filter((s) => {
				if (outlet && s.outlet !== outlet) return false;
				if (prId) {
					const pr = agencyPRs.find((p) => p.id === prId);
					if (!pr || !receiptBelongsToAgencyPr(s, pr)) return false;
				}
				if (entryMethod && receiptEntryMethod(s) !== entryMethod) return false;
				return matchesReceiptShiftWorkRange(s, payrollRange);
			}),
		[scans, outlet, prId, entryMethod, agencyPRs, payrollRange],
	);
	const receiptFiltersActive = Boolean(outlet || prId || entryMethod);

	const clearReceiptFilters = () => {
		onClearRange();
		setOutlet("");
		setPrId("");
		setEntryMethod("");
	};

	const pendingSelfLogs = useMemo(
		() =>
			scans.filter(
				(s) => s.logSource === "manual" && s.agencyVerification === "pending",
			),
		[scans],
	);

	return (
		<OutletSection
			title="Receipt scans"
			hint={`${scans.length} from managed PRs`}
		>
			{pendingSelfLogs.length > 0 && (
				<IzCard
					flat
					className="mb-2 border-[rgba(244,183,64,.4)] bg-[rgba(244,183,64,.08)]"
				>
					<p className="iz-sm font-bold text-[var(--iz-amber)]">
						{pendingSelfLogs.length} manual self-log
						{pendingSelfLogs.length !== 1 ? "s" : ""} awaiting verify
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						PR keyed in amounts when OCR could not read blurry or water-damaged
						receipts.
					</p>
				</IzCard>
			)}
			<IzCard flat>
				<p className="iz-tiny iz-muted">
					Agency copy of PR receipt logs — grouped by shift working day. Tap a
					receipt for line items and the PV it belongs to.
				</p>
			</IzCard>
			<PayrollRangeFilterCard
				range={payrollRange}
				onChange={onRangeChange}
				onClear={clearReceiptFilters}
				clearLabel="Clear filters"
				clearActive={receiptFiltersActive}
				hint="Shift work date for range · scan time when a time range is set · filter by PR, outlet, or entry method."
			>
				<IzSelect
					block
					className="!text-xs"
					value={prId}
					onChange={(e) => setPrId(e.target.value)}
				>
					<option value="">All PRs</option>
					{prOptions.map((pr) => (
						<option key={pr.id} value={pr.id}>
							{pr.name}
						</option>
					))}
				</IzSelect>
				<IzSelect
					block
					className="!text-xs"
					value={outlet}
					onChange={(e) => setOutlet(e.target.value)}
				>
					<option value="">All outlets</option>
					{outlets.map((o) => (
						<option key={o} value={o}>
							{o}
						</option>
					))}
				</IzSelect>
				<IzSelect
					block
					className="!text-xs"
					value={entryMethod}
					onChange={(e) =>
						setEntryMethod(e.target.value as "" | ReceiptEntryMethod)
					}
				>
					<option value="">All entry methods</option>
					<option value="scan">Scanned</option>
					<option value="manual">Manual</option>
				</IzSelect>
			</PayrollRangeFilterCard>
			<p className="iz-tiny iz-muted2 mt-2 mb-2">
				{filtered.length} scan{filtered.length !== 1 ? "s" : ""} for managed PRs
			</p>
			<div className="space-y-2">
				{filtered.length === 0 ? (
					<IzCard className="text-center">
						<p className="iz-sm iz-muted">No receipt scans in this range</p>
					</IzCard>
				) : (
					filtered.map((scan) => {
						const pendingSelfLog =
							scan.logSource === "manual" &&
							scan.agencyVerification === "pending";
						return (
							<ReceiptScanRow
								key={scan.id}
								scan={scan}
								compact
								onVerify={onVerifySelfLog}
								onClick={pendingSelfLog ? undefined : () => setDetailScan(scan)}
							/>
						);
					})
				)}
			</div>
			<ReceiptScanDetailSheet
				scan={detailScan}
				pv={detailPv}
				open={detailScan !== null}
				onClose={() => setDetailScan(null)}
				onOpenPv={onOpenPv}
			/>
		</OutletSection>
	);
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
	const { editLines, sendToPr, resend, resolveDispute, overrideSigned } =
		useAgencyPvs();
	const agencySubRole = useStore((s) => s.agencySubRole);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const toast = useStore((s) => s.toast);
	// The list omits line items — pull the full voucher (falls back to the list
	// row until it resolves).
	const detailPv = useAgencyPvDetail(pv.id, pv);
	const v = detailPv ?? pv;
	const [editing, setEditing] = useState(false);
	const [overrideOpen, setOverrideOpen] = useState(false);
	const [overrideReason, setOverrideReason] = useState("");
	const canOverride = agencyCan(agencySubRole, "overrideSignedPv");
	const [rows, setRows] = useState<PrPvRow[]>(v.rows);
	const [deduct, setDeduct] = useState(v.deduct);
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
					<b className="text-[var(--iz-txt)]">{pv.financeHeadName}</b>
					{pv.financeHeadSignedAt
						? ` · ${pv.financeHeadSignedAt}`
						: " · pending"}
				</p>
				{pv.financeHeadSignatureDataUrl && (
					<div className="iz-pv-sig-preview mt-1.5">
						<img
							src={pv.financeHeadSignatureDataUrl}
							alt={`${pv.financeHeadName} signature`}
						/>
					</div>
				)}
				<p className="iz-tiny iz-muted mt-2">
					2nd · PR ({pv.prName}):
					{prHasSigned ? (
						<>
							{" "}
							<b className="text-[var(--iz-txt)]">{pv.prName}</b>
							{pv.prSignedAt ? ` · ${pv.prSignedAt}` : ""}
							{" · "}
							<span className="text-[var(--iz-green)]">e-sign on file ✓</span>
						</>
					) : pv.status === "SENT" || pv.status === "PENDING_REVIEW" ? (
						" awaiting manual sign"
					) : (
						" —"
					)}
				</p>
				{prHasSigned && prSigPreview && (
					<div className="iz-pv-sig-preview mt-1.5">
						<img src={prSigPreview} alt={`${pv.prName} signature`} />
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
						downloadPvBreakdownPdf(displayPv, payee);
						toast("Official PV opened — use Print → Save as PDF", "success");
					}}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs"
					onClick={() => {
						downloadPvBreakdownCsv(displayPv, payee);
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

			{pv.status === "PENDING_REVIEW" &&
				agencyCan(agencySubRole, "raisePv") && (
					<button
						type="button"
						className="iz-btn iz-btn-primary mt-2 w-full"
						onClick={() => sendToPr(pv.id)}
					>
						<Send className="h-4 w-4" /> Send to PR for e-sign
					</button>
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

			{/* Receipt evidence for this week — renders nothing on a demo voucher,
          whose id has no backend row behind it. */}
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
