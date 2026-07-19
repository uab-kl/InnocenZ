import { AgencyPaidPvHistory } from "@agency-portal/components/agency/AgencyPaidPvHistory";
import { ShiftHistoryLog } from "@agency-portal/components/iz/ShiftHistoryLog";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useAgencyHistory } from "@agency-portal/hooks/use-agency-history";
import { ownedByAgency } from "@agency-portal/lib/agency-demo";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import { getPrAgencyById } from "@agency-portal/lib/pr-demo";
import { scopeShiftHistoryToAgencyName } from "@agency-portal/lib/shift-history-utils";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";

type HistoryTab = "shifts" | "outlets" | "paid";

function historySummaryHint(
	rows: { dateIso: string; dateDisplay: string; totalPayout: number }[],
	shiftLabel: string,
) {
	if (rows.length === 0)
		return "No shift history yet — completed shifts will appear here.";
	const sorted = [...rows].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
	const oldest = sorted[0]?.dateDisplay;
	const newest = sorted[sorted.length - 1]?.dateDisplay;
	const totalPayout = rows.reduce((a, r) => a + r.totalPayout, 0);
	const range =
		oldest && newest && oldest !== newest
			? `${oldest} – ${newest}`
			: (oldest ?? newest);
	return `${rows.length} ${shiftLabel} · ${range} · RM ${totalPayout.toLocaleString()} paid out`;
}

export const Route = createFileRoute("/agency/history")({
	component: AgencyHistory,
	validateSearch: (
		search: Record<string, unknown>,
	): { tab?: HistoryTab; pv?: string } => {
		const tabRaw = search.tab;
		const tab =
			tabRaw === "paid" ? "paid" : tabRaw === "outlets" ? "outlets" : undefined;
		const pv =
			typeof search.pv === "string" && search.pv.trim()
				? search.pv.trim()
				: undefined;
		return { tab, pv };
	},
});

function AgencyHistory() {
	const navigate = useNavigate();
	const { tab: tabFromSearch, pv: pvFromSearch } = Route.useSearch();
	const tab: HistoryTab =
		tabFromSearch === "paid"
			? "paid"
			: tabFromSearch === "outlets"
				? "outlets"
				: "shifts";

	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allShiftHistory = useStore((s) => s.shiftHistory);
	const allPrPaymentVouchers = useStore((s) => s.prPaymentVouchers ?? []);
	const demoReceiptScans = useStore((s) => s.prReceiptScans ?? []);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const orgName = useStore((s) => s.agencyOwner.orgName);

	// Real session → backend History; demo store otherwise. Shift tabs come from
	// completed shift-assignments; the Paid tab reuses the wired PV backend + PR
	// roster (which the Paid view filters to PAID + scopes by PR). Receipt scans
	// and itemized PV lines have no backend, so they stay empty / summary-only
	// when backed.
	const backend = useAgencyHistory();

	// Tenant scoping — Delta must never see Atlas records (and vice-versa).
	// PVs/receipts carry no agency tag, so they are attributed via OWNED PRs; shift
	// history is tagged with the assigning agency's name.
	const activeAgencyName =
		getPrAgencyById(activeAgencyId)?.name ?? "Atlas Agency";
	const demoAgencyPRs = useMemo(
		() => ownedByAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const agencyPRs = backend.backed ? backend.agencyPRs : demoAgencyPRs;
	const prReceiptScans = backend.backed ? [] : demoReceiptScans;

	const shiftHistory = useMemo(
		() =>
			backend.backed
				? backend.shiftRows
				: scopeShiftHistoryToAgencyName(allShiftHistory, activeAgencyName),
		[backend.backed, backend.shiftRows, allShiftHistory, activeAgencyName],
	);
	// Both paths run through getAgencyManagedPvs so the tab count matches what the
	// Paid-PV view (which re-scopes internally) renders.
	const prPaymentVouchers = useMemo(
		() =>
			getAgencyManagedPvs(
				backend.backed ? backend.pvs : allPrPaymentVouchers,
				agencyPRs,
			),
		[backend.backed, backend.pvs, allPrPaymentVouchers, agencyPRs],
	);

	const paidCount = prPaymentVouchers.filter((p) => p.status === "PAID").length;
	const outletCount = useMemo(
		() => new Set(shiftHistory.map((r) => r.outlet)).size,
		[shiftHistory],
	);

	const summaryHint = useMemo(() => {
		if (tab === "paid")
			return `${paidCount} paid payment voucher${paidCount === 1 ? "" : "s"}`;
		if (tab === "outlets") {
			return historySummaryHint(
				shiftHistory,
				`PR shifts across ${outletCount} outlet${outletCount === 1 ? "" : "s"}`,
			);
		}
		return historySummaryHint(shiftHistory, "PR shifts");
	}, [tab, shiftHistory, outletCount, paidCount]);

	const setTab = (next: HistoryTab) => {
		void navigate({
			to: "/agency/history",
			search: next === "shifts" ? {} : { tab: next },
			replace: true,
		});
	};

	return (
		<OutletPage>
			<OutletPageHeader eyebrow={orgName} title="History" hint={summaryHint} />

			<div className="iz-payroll-tabs mt-3">
				<button
					type="button"
					className={`iz-payroll-tab${tab === "shifts" ? " on" : ""}`}
					onClick={() => setTab("shifts")}
				>
					<TitleWithIcon>By PR</TitleWithIcon>
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${tab === "outlets" ? " on" : ""}`}
					onClick={() => setTab("outlets")}
				>
					<TitleWithIcon>By outlet ({outletCount})</TitleWithIcon>
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${tab === "paid" ? " on" : ""}`}
					onClick={() => setTab("paid")}
				>
					<TitleWithIcon>Paid PVs ({paidCount})</TitleWithIcon>
				</button>
			</div>

			{tab === "shifts" && (
				<>
					<p className="iz-tiny iz-muted mt-2">
						PR view — shift totals match Last Week / Last Last Week payroll PVs.
						Tap a PR, then an outlet for each night.
					</p>
					<ShiftHistoryLog
						key="history-by-pr"
						portal="agency"
						groupBy="pr"
						rows={shiftHistory}
						embedded
					/>
				</>
			)}

			{tab === "outlets" && (
				<>
					<p className="iz-tiny iz-muted mt-2">
						Outlet view — same shift nights as payroll PVs. Tap a row for PR
						breakdown.
					</p>
					<ShiftHistoryLog
						key="history-by-outlet"
						portal="agency"
						groupBy="venue"
						rows={shiftHistory}
						embedded
					/>
				</>
			)}

			{tab === "paid" && (
				<AgencyPaidPvHistory
					pvs={prPaymentVouchers}
					receiptScans={prReceiptScans}
					agencyPRs={agencyPRs}
					initialPvId={pvFromSearch}
					onClearInitialPv={() =>
						void navigate({
							to: "/agency/history",
							search: { tab: "paid" },
							replace: true,
						})
					}
				/>
			)}
		</OutletPage>
	);
}
