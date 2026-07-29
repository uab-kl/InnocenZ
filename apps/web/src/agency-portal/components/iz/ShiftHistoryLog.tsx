import {
	calendarNavBounds,
	HistDateCalendar,
	isoKeyFromDate,
} from "@agency-portal/components/iz/HistDateCalendar";
import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	formatRM,
	IzCard,
	IzPageTitle,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import {
	ShiftTxnMetric,
	ShiftTxnMetricsRow,
} from "@agency-portal/components/outlet/outlet-history-metrics";
import {
	findOutletRatingForPr,
	OutletPrHistoryCard,
	OutletShiftLogRatingBlock,
	OutletShiftLogShiftCard,
	OutletShiftLogSummaryCard,
} from "@agency-portal/components/outlet/outlet-history-ui";
import { ShiftHistoryExpandableMoneyBlock } from "@agency-portal/components/outlet/ShiftHistoryExpandableMoneyBlock";
import { useAgencyRatings } from "@agency-portal/hooks/use-agency-ratings";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { shiftHistoryForOutlet } from "@agency-portal/lib/portal-sync";
import { fmtDateLabelFromIso } from "@agency-portal/lib/pr-demo";
import { shiftHistorySubline } from "@agency-portal/lib/shift-history";
import {
	resolveShiftHistoryBreakdown,
	shiftHistoryTotalReceived,
	sumShiftHistoryBreakdowns,
} from "@agency-portal/lib/shift-history-amounts";
import {
	aggregateShiftHistoryByPr,
	aggregateShiftHistoryByVenue,
	type ShiftHistoryPrRollup,
	type ShiftHistoryRow,
	sortShiftHistoryDesc,
	sumShiftHistoryVenueRollups,
} from "@agency-portal/lib/shift-history-utils";
import { useStore } from "@agency-portal/lib/store";
import { format, parseISO } from "date-fns";
import {
	Calendar as CalendarIcon,
	ChevronDown,
	ChevronRight,
	X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type Portal = "agency" | "outlet";
type AgencyGroupBy = "pr" | "venue";

export function ShiftHistoryLog({
	portal,
	rows = [],
	subtitle: subtitleOverride,
	embedded = false,
	groupBy = "pr",
	agencyPRs: agencyPRsProp,
}: {
	portal: Portal;
	rows?: ShiftHistoryRow[];
	subtitle?: string;
	/** When true, omit page chrome (used inside tabbed History). */
	embedded?: boolean;
	/** Agency history — roll up by PR (default) or by outlet venue. */
	groupBy?: AgencyGroupBy;
	/** Live PR roster for avatars (profile → comcard). Falls back to demo store. */
	agencyPRs?: AgencyManagedPR[];
}) {
	const [nameFilter, setNameFilter] = useState("");
	const [dateRange, setDateRange] = useState({ from: "", to: "" });
	const [thirdFilter, setThirdFilter] = useState("");
	const [detailPrId, setDetailPrId] = useState<string | null>(null);
	const [detailPrVenue, setDetailPrVenue] = useState<string | null>(null);
	const [detailVenue, setDetailVenue] = useState<string | null>(null);
	const demoRatings = useStore((s) => s.ratings);
	const backendRatings = useAgencyRatings();
	const outletRatings = backendRatings.backed
		? backendRatings.ratings
		: demoRatings;
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = agencyPRsProp ?? storeAgencyPRs;
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);

	const breakdownOpts = useMemo(() => {
		const forRows = (shiftRows: ShiftHistoryRow[]) => {
			const prId = shiftRows[0]?.prId;
			const pr = prId ? agencyPRs.find((p) => p.id === prId) : undefined;
			return {
				rules: outletCommissionRules,
				prTier: pr?.trainingLevel,
				perDrinkRm,
			};
		};
		return forRows;
	}, [agencyPRs, outletCommissionRules, perDrinkRm]);

	const agencyByVenue = portal === "agency" && groupBy === "venue";

	const prNames = useMemo(
		() => [...new Set(rows.map((r) => r.prName))].sort(),
		[rows],
	);
	const outlets = useMemo(
		() => [...new Set(rows.map((r) => r.outlet))].sort(),
		[rows],
	);
	const dates = useMemo(
		() => [...new Set(rows.map((r) => r.dateIso))].sort().reverse(),
		[rows],
	);
	const dateOptions = useMemo(
		() =>
			dates.map((d) => {
				const row = rows.find((r) => r.dateIso === d);
				return { key: d, label: row?.dateDisplay ?? d };
			}),
		[dates, rows],
	);
	const thirdOptions = useMemo(() => {
		if (portal === "agency") {
			return [...new Set(rows.map((r) => r.outlet))].sort();
		}
		return [...new Set(rows.map((r) => r.agencyName))].sort();
	}, [rows, portal]);

	const filtered = useMemo(() => {
		const matched = rows.filter((r) => {
			if (agencyByVenue) {
				if (nameFilter && r.outlet !== nameFilter) return false;
				if (thirdFilter && r.prId !== thirdFilter) return false;
			} else {
				if (nameFilter && r.prId !== nameFilter) return false;
				if (thirdFilter) {
					if (portal === "agency" && r.outlet !== thirdFilter) return false;
					if (portal === "outlet" && r.agencyName !== thirdFilter) return false;
				}
			}
			if (dateRange.from && r.dateIso < dateRange.from) return false;
			if (dateRange.to && r.dateIso > dateRange.to) return false;
			return true;
		});
		return sortShiftHistoryDesc(matched);
	}, [rows, nameFilter, dateRange, thirdFilter, portal, agencyByVenue]);

	const subtitle =
		subtitleOverride ??
		(agencyByVenue
			? "Agency ledger — one row per outlet with totals across PR shifts. Tap for PR breakdown."
			: portal === "agency"
				? "Transaction log — one row per PR with totals across the filtered shifts. Tap for outlet breakdown."
				: "Transaction log — one row per PR with totals across the filtered shifts.");

	const primaryLabel = agencyByVenue ? "OUTLET" : "NAME";
	const thirdLabel = agencyByVenue
		? "PR"
		: portal === "agency"
			? "OUTLET"
			: "PR AGENCY";
	const venueLabel = portal === "agency" ? "outlet" : "agency";
	const showPrDetail = !agencyByVenue;
	const showVenueDetail = agencyByVenue;

	const prRollups = useMemo(
		() => aggregateShiftHistoryByPr(filtered, portal),
		[filtered, portal],
	);

	const rankedPrRollups = useMemo(
		() => [...prRollups].sort((a, b) => b.totalPayout - a.totalPayout),
		[prRollups],
	);

	const topPrPayout = rankedPrRollups[0]?.totalPayout ?? 0;

	const useOutletCardLayout =
		portal === "outlet" || (portal === "agency" && !agencyByVenue);
	const useHistGrid = useOutletCardLayout || agencyByVenue;

	const venueRollups = useMemo(
		() =>
			agencyByVenue ? aggregateShiftHistoryByVenue(filtered, "agency") : [],
		[filtered, agencyByVenue],
	);

	const detailPrRows = useMemo(
		() => (detailPrId ? filtered.filter((r) => r.prId === detailPrId) : []),
		[detailPrId, filtered],
	);
	const detailPr = useMemo(
		() => prRollups.find((p) => p.prId === detailPrId) ?? null,
		[prRollups, detailPrId],
	);
	const detailVenueRollups = useMemo(
		() => aggregateShiftHistoryByVenue(detailPrRows, portal),
		[detailPrRows, portal],
	);
	const detailTotals = useMemo(
		() => sumShiftHistoryVenueRollups(detailVenueRollups),
		[detailVenueRollups],
	);

	const detailPrVenueRollup = useMemo(
		() => detailVenueRollups.find((v) => v.venue === detailPrVenue) ?? null,
		[detailVenueRollups, detailPrVenue],
	);

	const detailPrVenueShifts = useMemo(
		() => sortShiftHistoryDesc(detailPrVenueRollup?.shifts ?? []),
		[detailPrVenueRollup],
	);
	const detailPrShifts = useMemo(
		() => sortShiftHistoryDesc(detailPrRows),
		[detailPrRows],
	);
	const detailBreakdown = useMemo(
		() =>
			sumShiftHistoryBreakdowns(detailPrShifts, breakdownOpts(detailPrShifts)),
		[detailPrShifts, breakdownOpts],
	);
	const detailPrVenueBreakdown = useMemo(
		() =>
			sumShiftHistoryBreakdowns(
				detailPrVenueShifts,
				breakdownOpts(detailPrVenueShifts),
			),
		[detailPrVenueShifts, breakdownOpts],
	);
	const detailOutletName = detailPrRows[0]?.outlet ?? "";
	const detailPrRating = useMemo(
		() =>
			detailPr
				? findOutletRatingForPr(detailPr.prName, outletRatings)
				: undefined,
		[detailPr, outletRatings],
	);

	const openPrDetail = (prId: string) => {
		setDetailPrVenue(null);
		setDetailPrId(prId);
	};

	const closePrDetail = () => {
		setDetailPrVenue(null);
		setDetailPrId(null);
	};

	const detailOutletRows = useMemo(
		() => (detailVenue ? filtered.filter((r) => r.outlet === detailVenue) : []),
		[detailVenue, filtered],
	);
	const detailOutletRollup = useMemo(
		() => venueRollups.find((v) => v.venue === detailVenue) ?? null,
		[venueRollups, detailVenue],
	);
	const detailOutletPrRollups = useMemo(
		() => aggregateShiftHistoryByPr(detailOutletRows, "agency"),
		[detailOutletRows],
	);
	const detailOutletBreakdown = useMemo(
		() =>
			sumShiftHistoryBreakdowns(
				detailOutletRows,
				breakdownOpts(detailOutletRows),
			),
		[detailOutletRows, breakdownOpts],
	);

	const logCountLabel = agencyByVenue
		? `${venueRollups.length} outlet${venueRollups.length !== 1 ? "s" : ""} · ${filtered.length} shift${filtered.length !== 1 ? "s" : ""}`
		: `${prRollups.length} PR${prRollups.length !== 1 ? "s" : ""} · ${filtered.length} shift${filtered.length !== 1 ? "s" : ""}`;

	const agencyName = rows[0]?.agencyName ?? "Atlas Agency";

	const shellClass = embedded
		? useOutletCardLayout
			? "iz-outlet-hist-log"
			: "mt-2"
		: "iz-screen";
	const outletStyleLayout = useOutletCardLayout;

	return (
		<div className={shellClass}>
			{!embedded && portal === "agency" && (
				<AppTopbar backTo="/agency" backLabel="Agency home" />
			)}
			{!embedded && (
				<>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						InnocenZ · {portal === "agency" ? "Agency" : "Outlet"}
					</p>
					<IzPageTitle size="xl" className="mx-0.5 mt-0.5">
						History
					</IzPageTitle>
				</>
			)}
			{!embedded && <p className="iz-tiny iz-muted mt-0.5">{subtitle}</p>}
			{embedded && subtitleOverride && !outletStyleLayout && (
				<p className="iz-tiny iz-muted mt-1">{subtitleOverride}</p>
			)}

			<p
				className={
					outletStyleLayout
						? "iz-outlet-hist-filter-heading"
						: "iz-txn-filter-heading mt-4"
				}
			>
				<TitleWithIcon>Filter by</TitleWithIcon>
			</p>
			<div
				className={
					outletStyleLayout ? "iz-outlet-hist-filters" : "iz-txn-filters"
				}
			>
				<HistSelectField
					label={primaryLabel}
					value={nameFilter}
					onChange={setNameFilter}
					options={
						agencyByVenue
							? [
									{ value: "", label: "All outlets" },
									...outlets.map((o) => ({ value: o, label: o })),
								]
							: [
									{ value: "", label: "All names" },
									...prNames.map((n) => {
										const row = rows.find((r) => r.prName === n);
										return { value: row?.prId ?? n, label: n };
									}),
								]
					}
				/>
				<HistDateRangePickerField
					label="DATE"
					range={dateRange}
					onChange={setDateRange}
					dateOptions={dateOptions}
				/>
				<HistSelectField
					label={thirdLabel}
					value={thirdFilter}
					onChange={setThirdFilter}
					options={
						agencyByVenue
							? [
									{ value: "", label: "All PRs" },
									...prNames.map((n) => {
										const row = rows.find((r) => r.prName === n);
										return { value: row?.prId ?? n, label: n };
									}),
								]
							: [
									{
										value: "",
										label: portal === "agency" ? "All outlets" : "All agencies",
									},
									...thirdOptions.map((o) => ({ value: o, label: o })),
								]
					}
				/>
			</div>

			<div
				className={
					outletStyleLayout ? "iz-outlet-hist-log-head" : "iz-between mt-4"
				}
			>
				<div
					className={
						outletStyleLayout ? "iz-outlet-hist-log-head__main" : "flex-1"
					}
				>
					{outletStyleLayout ? (
						<div className="iz-outlet-hist-section-label">
							<TitleWithIcon>Transaction log</TitleWithIcon>
						</div>
					) : portal === "agency" ? (
						<div className="iz-outlet-hist-section-label">
							<TitleWithIcon>Transaction log</TitleWithIcon>
						</div>
					) : (
						<IzSectionLabel className="!mb-0">Transaction log</IzSectionLabel>
					)}
					<span
						className={
							outletStyleLayout || portal === "agency"
								? "iz-outlet-hist-log-count"
								: "iz-tiny iz-muted2"
						}
					>
						{logCountLabel}
					</span>
				</div>
			</div>

			<div
				className={
					useHistGrid
						? `iz-outlet-hist-grid${agencyByVenue ? " iz-outlet-hist-grid--venues" : ""}`
						: "mt-2.5 space-y-2.5"
				}
			>
				{agencyByVenue ? (
					venueRollups.length === 0 ? (
						<IzCard className="text-center">
							<p className="iz-sm iz-muted">No records match these filters</p>
						</IzCard>
					) : (
						venueRollups.map((rollup) => (
							<VenueHistoryCard
								key={rollup.venue}
								rollup={rollup}
								onTap={() => setDetailVenue(rollup.venue)}
							/>
						))
					)
				) : rankedPrRollups.length === 0 ? (
					<IzCard className="text-center">
						<p className="iz-sm iz-muted">No records match these filters</p>
					</IzCard>
				) : outletStyleLayout ? (
					rankedPrRollups.map((rollup, index) => (
						<OutletPrHistoryCard
							key={rollup.prId}
							rollup={rollup}
							rank={index + 1}
							topPayout={topPrPayout}
							portal={portal}
							agencyPRs={agencyPRs}
							rating={findOutletRatingForPr(rollup.prName, outletRatings)}
							onTap={showPrDetail ? () => openPrDetail(rollup.prId) : undefined}
						/>
					))
				) : (
					prRollups.map((rollup) => (
						<PrHistoryCard
							key={rollup.prId}
							rollup={rollup}
							venueLabel={venueLabel}
							onTap={showPrDetail ? () => openPrDetail(rollup.prId) : undefined}
						/>
					))
				)}
			</div>

			{showPrDetail && detailPr && (
				<IzSheet open wide onClose={closePrDetail}>
					<div className="iz-sheet-head">
						<div>
							<button
								type="button"
								className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
								onClick={
									portal === "outlet" || !detailPrVenue
										? closePrDetail
										: () => setDetailPrVenue(null)
								}
							>
								{portal === "outlet" || !detailPrVenue
									? "← Back to log"
									: "← All outlets"}
							</button>
							<p className="iz-tiny iz-muted2 uppercase">
								{portal === "outlet" || detailPrVenue
									? `Shift log · ${detailPr.prName}`
									: `Earned breakdown by ${venueLabel}`}
							</p>
							<h3>
								{portal === "outlet"
									? detailOutletName || detailPr.prName
									: (detailPrVenue ?? detailPr.prName)}
							</h3>
						</div>
						<button
							type="button"
							className="iz-sheet-close"
							onClick={closePrDetail}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					{portal === "outlet" ? (
						<>
							<OutletShiftLogSummaryCard
								shiftCount={detailPrShifts.length}
								outletName={detailOutletName}
								prName={detailPr.prName}
								agencyLabel={
									detailPr.venues.length === 1
										? detailPr.venues[0]
										: detailPr.venues.length > 1
											? detailPr.venues.join(" · ")
											: undefined
								}
								totalPayout={detailTotals.totalPayout}
								totalReceived={detailTotals.totalReceived}
								totalDrinks={detailTotals.totalDrinks}
								totalTips={detailTotals.totalTips}
								breakdown={detailBreakdown}
							/>

							{detailPrRating && (
								<OutletShiftLogRatingBlock rating={detailPrRating} />
							)}

							<div className="iz-outlet-shift-log-list">
								{detailPrShifts.map((shift) => (
									<OutletShiftLogShiftCard key={shift.id} row={shift} />
								))}
							</div>
						</>
					) : detailPrVenue && detailPrVenueRollup ? (
						<>
							<IzCard flat className="!mb-3">
								<p className="iz-tiny iz-muted">
									{detailPrVenueShifts.length} shift
									{detailPrVenueShifts.length !== 1 ? "s" : ""} at{" "}
									{detailPrVenue} · {detailPr.prName}
								</p>
								<ShiftHistoryExpandableMoneyBlock
									className="mt-2"
									breakdown={detailPrVenueBreakdown}
								/>
							</IzCard>

							<div className="space-y-2">
								{detailPrVenueShifts.map((shift) => (
									<ShiftHistoryShiftCard
										key={shift.id}
										row={shift}
										portal={portal}
									/>
								))}
							</div>
						</>
					) : (
						<>
							<IzCard flat className="!mb-3">
								<p className="iz-tiny iz-muted">
									{detailTotals.shiftCount} shift
									{detailTotals.shiftCount !== 1 ? "s" : ""} in filtered log
									{detailVenueRollups.length !== 1
										? ` · ${detailVenueRollups.length} ${venueLabel}s`
										: detailVenueRollups[0]
											? ` · ${detailVenueRollups[0].venue}`
											: ""}
								</p>
								<ShiftHistoryExpandableMoneyBlock
									className="mt-2"
									breakdown={detailBreakdown}
								/>
							</IzCard>

							<p className="iz-tiny iz-muted2 mb-2">
								Tap an outlet to see every shift
							</p>
							<div className="space-y-2.5">
								{detailVenueRollups.map((rollup) => (
									<button
										key={rollup.venue}
										type="button"
										className="iz-txn-card-btn w-full"
										onClick={() => setDetailPrVenue(rollup.venue)}
									>
										<IzCard
											flat
											className="!mb-0 w-full text-left transition-colors hover:border-[var(--iz-gold-d)]"
										>
											<div className="iz-between items-start gap-2">
												<p className="font-sora text-sm font-bold">
													{rollup.venue}
												</p>
												<span className="iz-tiny iz-muted2 flex items-center gap-1">
													{rollup.shiftCount} shift
													{rollup.shiftCount !== 1 ? "s" : ""}
													<ChevronRight className="h-3.5 w-3.5" aria-hidden />
												</span>
											</div>
											<ShiftTxnMetricsRow
												className="iz-txn-card-metrics--sheet"
												totalPayout={rollup.totalPayout}
												totalReceived={rollup.totalReceived}
												totalDrinks={rollup.totalDrinks}
												totalTips={rollup.totalTips}
											/>
										</IzCard>
									</button>
								))}
							</div>
						</>
					)}

					{portal !== "outlet" && (
						<p className="iz-tiny iz-muted2 mt-3 text-center">
							Read-only · mirrored to outlet portal
						</p>
					)}
				</IzSheet>
			)}

			{showVenueDetail && detailOutletRollup && (
				<IzSheet open wide onClose={() => setDetailVenue(null)}>
					<div className="iz-sheet-head">
						<div>
							<button
								type="button"
								className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
								onClick={() => setDetailVenue(null)}
							>
								← Back to log
							</button>
							<p className="iz-tiny iz-muted2 uppercase">
								PR breakdown · {agencyName}
							</p>
							<h3>{detailOutletRollup.venue}</h3>
						</div>
						<button
							type="button"
							className="iz-sheet-close"
							onClick={() => setDetailVenue(null)}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					<IzCard flat className="!mb-3">
						<p className="iz-tiny iz-muted">
							{detailOutletRollup.shiftCount} shift
							{detailOutletRollup.shiftCount !== 1 ? "s" : ""} ·{" "}
							{detailOutletPrRollups.length} PR
							{detailOutletPrRollups.length !== 1 ? "s" : ""}
						</p>
						<ShiftHistoryExpandableMoneyBlock
							className="mt-2"
							breakdown={detailOutletBreakdown}
						/>
					</IzCard>

					<div className="space-y-2.5">
						{detailOutletPrRollups.map((rollup) => (
							<IzCard key={rollup.prId} flat>
								<div className="iz-between items-start gap-2">
									<p className="font-sora text-sm font-bold">{rollup.prName}</p>
									<span className="iz-tiny iz-muted2">
										{rollup.shiftCount} shift
										{rollup.shiftCount !== 1 ? "s" : ""} · Latest{" "}
										{rollup.latestDateDisplay}
									</span>
								</div>
								<ShiftTxnMetricsRow
									className="iz-txn-card-metrics--sheet"
									totalPayout={rollup.totalPayout}
									totalReceived={rollup.totalReceived}
									totalDrinks={rollup.totalDrinks}
									totalTips={rollup.totalTips}
								/>
							</IzCard>
						))}
					</div>

					<p className="iz-tiny iz-muted2 mt-3 text-center">
						Agency view · PR ↔ outlet shift history
					</p>
				</IzSheet>
			)}
		</div>
	);
}

function ShiftHistoryShiftCard({
	row,
	portal = "agency",
}: {
	row: ShiftHistoryRow;
	portal?: "agency" | "outlet";
}) {
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	const prTier = agencyPRs.find((p) => p.id === row.prId)?.trainingLevel;
	const breakdown = useMemo(
		() =>
			resolveShiftHistoryBreakdown(row, {
				rules: outletCommissionRules,
				prTier,
				perDrinkRm,
			}),
		[row, outletCommissionRules, prTier, perDrinkRm],
	);

	return (
		<IzCard flat>
			<div className="iz-between items-start gap-2">
				<div>
					<p className="font-sora text-sm font-bold">{row.dateDisplay}</p>
					<p className="iz-tiny iz-muted mt-0.5">
						{shiftHistorySubline(row, portal)}
					</p>
				</div>
				<div className="text-right">
					<div className="font-sora text-sm font-bold text-[var(--iz-gold-l)]">
						{formatRM(breakdown.totalPayout)}
					</div>
					<p className="iz-tiny iz-muted2">{row.durationHours}h shift</p>
				</div>
			</div>
			<ShiftHistoryExpandableMoneyBlock
				className="mt-2"
				breakdown={breakdown}
			/>
		</IzCard>
	);
}

/** Outlet portal — shift-by-shift history for one PR at the current outlet. */
export function OutletPrShiftHistorySheet({
	open,
	onClose,
	prId,
	prName,
	outletName,
	agencyName,
}: {
	open: boolean;
	onClose: () => void;
	prId: string;
	prName: string;
	outletName: string;
	agencyName?: string;
}) {
	const shiftHistory = useStore((s) => s.shiftHistory) ?? [];
	const demoRatings = useStore((s) => s.ratings);
	const backendRatings = useAgencyRatings();
	const outletRatings = backendRatings.backed
		? backendRatings.ratings
		: demoRatings;
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const agencyPRs = useStore((s) => s.agencyPRs);
	const perDrinkRm = useStore((s) => s.outletWorkspace.perDrinkRm);
	const rows = useMemo(
		() =>
			sortShiftHistoryDesc(
				shiftHistoryForOutlet(shiftHistory, outletName).filter(
					(r) => r.prId === prId,
				),
			),
		[shiftHistory, outletName, prId],
	);
	const totals = useMemo(
		() => ({
			totalPayout: rows.reduce((a, r) => a + r.totalPayout, 0),
			totalReceived: rows.reduce((a, r) => a + shiftHistoryTotalReceived(r), 0),
			totalDrinks: rows.reduce((a, r) => a + r.totalDrinks, 0),
			totalTips: rows.reduce((a, r) => a + r.totalTips, 0),
		}),
		[rows],
	);
	const prTier = agencyPRs.find((p) => p.id === prId)?.trainingLevel;
	const breakdown = useMemo(
		() =>
			sumShiftHistoryBreakdowns(rows, {
				rules: outletCommissionRules,
				prTier,
				perDrinkRm,
			}),
		[rows, outletCommissionRules, prTier, perDrinkRm],
	);
	const agencyLabel = useMemo(() => {
		if (agencyName) return agencyName;
		const names = [...new Set(rows.map((r) => r.agencyName))].filter(Boolean);
		return names.length === 1 ? names[0] : names.join(" · ");
	}, [rows, agencyName]);
	const prRating = useMemo(
		() => findOutletRatingForPr(prName, outletRatings),
		[prName, outletRatings],
	);

	return (
		<IzSheet open={open} wide onClose={onClose}>
			<div className="iz-sheet-head">
				<div>
					<button
						type="button"
						className="iz-chip mb-2 !px-2 !py-1 !text-[10px]"
						onClick={onClose}
					>
						← Back to log
					</button>
					<p className="iz-tiny iz-muted2 uppercase">Shift log · {prName}</p>
					<h3>{outletName}</h3>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{rows.length === 0 ? (
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						No shift history yet for {prName} at {outletName}
					</p>
				</IzCard>
			) : (
				<>
					<OutletShiftLogSummaryCard
						shiftCount={rows.length}
						outletName={outletName}
						prName={prName}
						agencyLabel={agencyLabel || undefined}
						totalPayout={totals.totalPayout}
						totalReceived={totals.totalReceived}
						totalDrinks={totals.totalDrinks}
						totalTips={totals.totalTips}
						breakdown={breakdown}
					/>

					{prRating && <OutletShiftLogRatingBlock rating={prRating} />}

					<div className="iz-outlet-shift-log-list">
						{rows.map((shift) => (
							<OutletShiftLogShiftCard key={shift.id} row={shift} />
						))}
					</div>
				</>
			)}
		</IzSheet>
	);
}

function venueLatestMeta(rollup: { shifts: ShiftHistoryRow[] }) {
	const latest = rollup.shifts.reduce(
		(best, row) => (row.dateIso > best.dateIso ? row : best),
		rollup.shifts[0],
	);
	const prNames = [...new Set(rollup.shifts.map((s) => s.prName))].sort();
	const prSummary =
		prNames.length <= 2 ? prNames.join(" · ") : `${prNames.length} PRs`;
	return { latest, prSummary };
}

function VenueHistoryCard({
	rollup,
	onTap,
}: {
	rollup: ReturnType<typeof aggregateShiftHistoryByVenue>[number];
	onTap?: () => void;
}) {
	const { latest, prSummary } = venueLatestMeta(rollup);

	const body = (
		<>
			<div className="iz-between items-start gap-2">
				<div className="iz-venue-hist-card__name">{rollup.venue}</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<div className="text-right">
						<div className="font-sora text-sm font-bold text-[var(--iz-gold-l)]">
							{rollup.shiftCount} shift{rollup.shiftCount !== 1 ? "s" : ""}
						</div>
						<p className="iz-tiny iz-muted2">Latest {latest?.dateDisplay}</p>
					</div>
					{onTap && (
						<ChevronRight
							className="h-4 w-4 text-[var(--iz-muted)]"
							aria-hidden
						/>
					)}
				</div>
			</div>
			<p className="iz-tiny iz-muted mt-0.5">{prSummary}</p>
			<ShiftTxnMetricsRow
				total
				totalPayout={rollup.totalPayout}
				totalReceived={rollup.totalReceived}
				totalDrinks={rollup.totalDrinks}
				totalTips={rollup.totalTips}
			/>
		</>
	);

	if (onTap) {
		return (
			<button type="button" className="iz-txn-card-btn" onClick={onTap}>
				<IzCard
					flat
					className="!mb-0 w-full text-left transition-colors hover:border-[var(--iz-gold-d)]"
				>
					{body}
				</IzCard>
			</button>
		);
	}

	return <IzCard>{body}</IzCard>;
}

function PrHistoryCard({
	rollup,
	venueLabel,
	onTap,
}: {
	rollup: ShiftHistoryPrRollup;
	venueLabel: string;
	onTap?: () => void;
}) {
	const venueSummary =
		rollup.venues.length <= 2
			? rollup.venues.join(" · ")
			: `${rollup.venues.length} ${venueLabel}s`;

	const body = (
		<>
			<div className="iz-between items-start gap-2">
				<div className="font-sora text-[16px] font-bold">{rollup.prName}</div>
				<div className="flex shrink-0 items-center gap-1.5">
					<div className="text-right">
						<div className="font-sora text-sm font-bold text-[var(--iz-gold-l)]">
							{rollup.shiftCount} shift{rollup.shiftCount !== 1 ? "s" : ""}
						</div>
						<p className="iz-tiny iz-muted2">
							Latest {rollup.latestDateDisplay}
						</p>
					</div>
					{onTap && (
						<ChevronRight
							className="h-4 w-4 text-[var(--iz-muted)]"
							aria-hidden
						/>
					)}
				</div>
			</div>
			<p className="iz-tiny iz-muted mt-0.5">{venueSummary}</p>
			<ShiftTxnMetricsRow
				total
				totalPayout={rollup.totalPayout}
				totalReceived={rollup.totalReceived}
				totalDrinks={rollup.totalDrinks}
				totalTips={rollup.totalTips}
			/>
		</>
	);

	if (onTap) {
		return (
			<button type="button" className="iz-txn-card-btn" onClick={onTap}>
				<IzCard
					flat
					className="!mb-0 w-full text-left transition-colors hover:border-[var(--iz-gold-d)]"
				>
					{body}
				</IzCard>
			</button>
		);
	}

	return <IzCard>{body}</IzCard>;
}

function dateFromKey(key: string): Date | undefined {
	if (!key) return undefined;
	const [y, m, d] = key.split("-").map(Number);
	if (!y || !m || !d) return undefined;
	return new Date(y, m - 1, d);
}

function defaultHistCalendarMonth(
	dateOptions: { key: string; label: string }[],
) {
	const latestRecord = dateFromKey(dateOptions[0]?.key ?? "");
	const today = parseISO(getLiveTodayIso());
	if (!latestRecord) return today;
	return latestRecord > today ? latestRecord : today;
}

function formatHistDateKey(
	key: string,
	dateOptions: { key: string; label: string }[],
) {
	const found = dateOptions.find((o) => o.key === key);
	if (found) return found.label;
	if (/^\d{4}-\d{2}-\d{2}$/.test(key)) return fmtDateLabelFromIso(key);
	return key;
}

function formatDateRangeLabel(
	range: { from: string; to: string },
	dateOptions: { key: string; label: string }[],
) {
	const labelFor = (key: string) => formatHistDateKey(key, dateOptions);
	if (!range.from && !range.to) return "All dates";
	if (range.from && range.to)
		return `${labelFor(range.from)} – ${labelFor(range.to)}`;
	if (range.from) return `From ${labelFor(range.from)}`;
	return `Until ${labelFor(range.to)}`;
}

export function HistDateRangePickerField({
	label,
	range,
	onChange,
	dateOptions,
}: {
	label: string;
	range: { from: string; to: string };
	onChange: (range: { from: string; to: string }) => void;
	dateOptions: { key: string; label: string }[];
}) {
	const [open, setOpen] = useState(false);
	const [pickTarget, setPickTarget] = useState<"from" | "to">("from");
	const rootRef = useRef<HTMLDivElement>(null);
	const active = Boolean(range.from || range.to);
	const displayLabel = formatDateRangeLabel(range, dateOptions);
	const selectedKey = pickTarget === "from" ? range.from : range.to;
	const selected = dateFromKey(
		selectedKey || (pickTarget === "to" ? range.from : ""),
	);
	const defaultMonth = defaultHistCalendarMonth(dateOptions);
	const navBounds = useMemo(
		() => calendarNavBounds(dateOptions, defaultMonth),
		[dateOptions, defaultMonth],
	);
	const [viewMonth, setViewMonth] = useState(selected ?? defaultMonth);
	const wasOpenRef = useRef(false);

	useEffect(() => {
		if (open && !wasOpenRef.current) {
			const initialTarget = range.from && !range.to ? "to" : "from";
			setPickTarget(initialTarget);
			setViewMonth(
				dateFromKey(initialTarget === "from" ? range.from : range.to) ??
					dateFromKey(range.from) ??
					dateFromKey(range.to) ??
					defaultMonth,
			);
		}
		wasOpenRef.current = open;
	}, [open, range.from, range.to, defaultMonth]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current?.contains(e.target as Node)) return;
			setOpen(false);
		};
		const id = window.setTimeout(
			() => document.addEventListener("mousedown", onDoc),
			0,
		);
		return () => {
			window.clearTimeout(id);
			document.removeEventListener("mousedown", onDoc);
		};
	}, [open]);

	const labelFor = (key: string) => formatHistDateKey(key, dateOptions);

	return (
		<div ref={rootRef} className="iz-hist-custom-select compact">
			<label>{label}</label>
			<button
				type="button"
				className={`iz-hist-select-trigger sm${open ? " open" : ""}`}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-label="Choose date range"
			>
				<span
					className={`flex min-w-0 items-center gap-1.5 truncate${active ? "" : " iz-muted2"}`}
				>
					<CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
					<span className="truncate">{displayLabel}</span>
				</span>
				{active ? (
					<span
						role="button"
						tabIndex={0}
						className="iz-hist-clear"
						aria-label="Clear date range"
						onClick={(e) => {
							e.stopPropagation();
							onChange({ from: "", to: "" });
							setPickTarget("from");
							setOpen(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								onChange({ from: "", to: "" });
								setPickTarget("from");
								setOpen(false);
							}
						}}
					>
						<X className="h-3.5 w-3.5" />
					</span>
				) : (
					<ChevronDown
						className={`h-4 w-4 shrink-0 text-[var(--iz-muted2)] transition-transform${open ? " rotate-180" : ""}`}
					/>
				)}
			</button>
			{open && (
				<div
					className="iz-hist-cal iz-hist-cal--popover iz-hist-cal--range"
					onMouseDown={(e) => e.stopPropagation()}
				>
					<div className="iz-hist-range-targets">
						<button
							type="button"
							className={`iz-hist-range-target${pickTarget === "from" ? " is-active" : ""}`}
							onClick={() => {
								setPickTarget("from");
								if (range.from)
									setViewMonth(dateFromKey(range.from) ?? viewMonth);
							}}
						>
							<span className="iz-hist-range-target-label">From</span>
							<span className="iz-hist-range-target-value">
								{range.from ? labelFor(range.from) : "Pick date"}
							</span>
						</button>
						<button
							type="button"
							className={`iz-hist-range-target${pickTarget === "to" ? " is-active" : ""}`}
							onClick={() => {
								setPickTarget("to");
								if (range.to) setViewMonth(dateFromKey(range.to) ?? viewMonth);
							}}
						>
							<span className="iz-hist-range-target-label">To</span>
							<span className="iz-hist-range-target-value">
								{range.to ? labelFor(range.to) : "Pick date"}
							</span>
						</button>
					</div>
					<HistDateCalendar
						selected={selected}
						viewMonth={viewMonth}
						onViewMonthChange={setViewMonth}
						navBounds={navBounds}
						onSelectDay={(d) => {
							const key = isoKeyFromDate(d);
							if (pickTarget === "from") {
								onChange({
									from: key,
									to: range.to && range.to < key ? "" : range.to,
								});
								setPickTarget("to");
								return;
							}
							let from = range.from;
							let to = key;
							if (from && to < from) {
								from = key;
								to = range.from;
							}
							onChange({ from, to });
							setOpen(false);
						}}
					/>
					<p className="iz-tiny iz-muted2 mt-1 px-1">
						Pick From, then To. Any date up to today works — days without shifts
						simply show no rows.
					</p>
				</div>
			)}
		</div>
	);
}

function HistDatePickerField({
	label,
	value,
	onChange,
	dateOptions,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	dateOptions: { key: string; label: string }[];
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const selectedLabel = dateOptions.find((o) => o.key === value)?.label;
	const selected = dateFromKey(value);
	const defaultMonth = defaultHistCalendarMonth(dateOptions);
	const navBounds = useMemo(
		() => calendarNavBounds(dateOptions, defaultMonth),
		[dateOptions, defaultMonth],
	);
	const [viewMonth, setViewMonth] = useState(selected ?? defaultMonth);

	useEffect(() => {
		if (open)
			setViewMonth(
				selected ?? dateFromKey(dateOptions[0]?.key ?? "") ?? defaultMonth,
			);
	}, [open, selected, defaultMonth, dateOptions]);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current?.contains(e.target as Node)) return;
			setOpen(false);
		};
		const id = window.setTimeout(
			() => document.addEventListener("mousedown", onDoc),
			0,
		);
		return () => {
			window.clearTimeout(id);
			document.removeEventListener("mousedown", onDoc);
		};
	}, [open]);

	return (
		<div ref={rootRef} className="iz-hist-custom-select compact">
			<label>{label}</label>
			<button
				type="button"
				className={`iz-hist-select-trigger sm${open ? " open" : ""}`}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-label="Choose date"
			>
				<span
					className={`flex min-w-0 items-center gap-1.5 truncate${value ? "" : " iz-muted2"}`}
				>
					<CalendarIcon className="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]" />
					<span className="truncate">
						{value ? (selectedLabel ?? value) : "All dates"}
					</span>
				</span>
				{value ? (
					<span
						role="button"
						tabIndex={0}
						className="iz-hist-clear"
						aria-label="Clear date"
						onClick={(e) => {
							e.stopPropagation();
							onChange("");
							setOpen(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								e.stopPropagation();
								onChange("");
								setOpen(false);
							}
						}}
					>
						<X className="h-3.5 w-3.5" />
					</span>
				) : (
					<ChevronDown
						className={`h-4 w-4 shrink-0 text-[var(--iz-muted2)] transition-transform${open ? " rotate-180" : ""}`}
					/>
				)}
			</button>
			{open && (
				<div
					className="iz-hist-cal iz-hist-cal--popover"
					onMouseDown={(e) => e.stopPropagation()}
				>
					<HistDateCalendar
						selected={selected}
						viewMonth={viewMonth}
						onViewMonthChange={setViewMonth}
						navBounds={navBounds}
						onSelectDay={(d) => {
							onChange(isoKeyFromDate(d));
							setOpen(false);
						}}
					/>
				</div>
			)}
		</div>
	);
}

export function HistSelectField({
	label,
	value,
	onChange,
	options,
	icon,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	options: { value: string; label: string }[];
	icon?: ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDoc = (e: MouseEvent) => {
			if (rootRef.current && !rootRef.current.contains(e.target as Node))
				setOpen(false);
		};
		document.addEventListener("click", onDoc);
		return () => document.removeEventListener("click", onDoc);
	}, [open]);

	const current =
		options.find((o) => o.value === value)?.label ?? options[0]?.label ?? "Any";

	return (
		<div ref={rootRef} className="iz-hist-custom-select compact">
			<label>{label}</label>
			<button
				type="button"
				className={`iz-hist-select-trigger sm${open ? " open" : ""}`}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				<span
					className={`flex min-w-0 items-center gap-1.5 truncate${value ? "" : " iz-muted2"}`}
				>
					{icon}
					<span className="truncate">{current}</span>
				</span>
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-[var(--iz-muted2)] transition-transform${open ? " rotate-180" : ""}`}
				/>
			</button>
			{open && (
				<ul className="iz-hist-select-menu" role="listbox">
					{options.map((opt) => (
						<li key={opt.value || "__any"}>
							<button
								type="button"
								role="option"
								aria-selected={value === opt.value}
								className={value === opt.value ? "sel" : undefined}
								onClick={() => {
									onChange(opt.value);
									setOpen(false);
								}}
							>
								{opt.label}
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
