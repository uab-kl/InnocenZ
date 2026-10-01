import { AgencyPaidPvHistory } from "@agency-portal/components/agency/AgencyPaidPvHistory";
import {
	ShiftHistoryLog,
	type ShiftHistoryTakeHome,
} from "@agency-portal/components/iz/ShiftHistoryLog";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { formatRM } from "@agency-portal/components/iz/ui";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useAgencyHistory } from "@agency-portal/hooks/use-agency-history";
import { ownedByAgency } from "@agency-portal/lib/agency-demo";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import {
	historySealedPayoutRm,
	historyTakeHome,
	historyWagesRm,
} from "@agency-portal/lib/history-take-home";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { getPrAgencyById } from "@agency-portal/lib/pr-demo";
import {
	type ShiftHistoryRow,
	scopeShiftHistoryToAgencyName,
} from "@agency-portal/lib/shift-history-utils";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

type HistoryTab = "shifts" | "outlets" | "paid";

/**
 * The header line: TAKE-HOME first, the wage part beside it (owner default,
 * 29 Sep 2026). `takeHomeRm` is null while its other parts — the vouchers,
 * their lines and receipts — are loading or failed; the line then states
 * wages alone rather than a sum missing a part.
 */
function historySummaryHint(
	rows: ShiftHistoryRow[],
	shiftLabel: string,
	t: PortalTranslations,
	takeHomeRm: number | null,
) {
	if (rows.length === 0) return t.history.noShiftHistoryYet;
	const sorted = [...rows].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
	const oldest = sorted[0]?.dateDisplay;
	const newest = sorted[sorted.length - 1]?.dateDisplay;
	const range =
		oldest && newest && oldest !== newest
			? `${oldest} – ${newest}`
			: (oldest ?? newest);
	// The cards' own formatter: `toLocaleString()` followed the BROWSER and
	// dropped the cents, so "RM 250" here sat above "RM 250.00" below.
	const wages = formatRM(historyWagesRm(rows));
	if (takeHomeRm === null) {
		return fill(t.history.summaryLineWagesOnly, {
			count: rows.length,
			label: shiftLabel,
			range: range ?? "",
			total: wages,
		});
	}
	return fill(t.history.summaryLine, {
		count: rows.length,
		label: shiftLabel,
		range: range ?? "",
		total: formatRM(takeHomeRm),
		wages,
	});
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
	const { t } = usePortalLocale();
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

	/*
	 * What the PRs take home across the ledger — see history-take-home.ts for
	 * every part and its row. A real session builds it from stored rows only:
	 * each night's approved overtime and commission are already sealed onto its
	 * row by the hook, and the deductions are THIS agency's own vouchers (the
	 * `deduction` field and the penalty lines, server-scoped). A demo session
	 * keeps its fixture, which already seals take-home onto each row.
	 *
	 * The SAME value goes to the log below, so every PR card is this sum cut per
	 * PR — the cards add up to the header.
	 */
	const takeHome = useMemo<ShiftHistoryTakeHome>(
		() =>
			backend.backed
				? { ready: backend.takeHomeReady, vouchers: backend.voucherDeductions }
				: { ready: true, vouchers: [] },
		[backend.backed, backend.takeHomeReady, backend.voucherDeductions],
	);
	const takeHomeRm = useMemo(() => {
		if (!backend.backed) return historySealedPayoutRm(shiftHistory);
		if (!takeHome.ready) return null;
		return historyTakeHome({ rows: shiftHistory, vouchers: takeHome.vouchers })
			.takeHomeRm;
	}, [backend.backed, takeHome, shiftHistory]);

	const summaryHint = useMemo(() => {
		if (tab === "paid")
			return fill(
				paidCount === 1 ? t.history.paidPvCountOne : t.history.paidPvCountMany,
				{ n: paidCount },
			);
		if (tab === "outlets") {
			return historySummaryHint(
				shiftHistory,
				fill(t.history.prShiftsAcross, {
					outlets: fill(
						outletCount === 1
							? t.history.outletCountOne
							: t.history.outletCountMany,
						{ n: outletCount },
					),
				}),
				t,
				takeHomeRm,
			);
		}
		return historySummaryHint(shiftHistory, t.history.prShifts, t, takeHomeRm);
		// `t` belongs in the deps: without it the hint keeps the wording from
		// whichever language was active when the memo last ran, so switching
		// language would leave this one line in the old language.
	}, [tab, shiftHistory, outletCount, paidCount, t, takeHomeRm]);

	const setTab = (next: HistoryTab) => {
		void navigate({
			to: "/agency/history",
			search: next === "shifts" ? {} : { tab: next },
			replace: true,
		});
	};

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={orgName}
				title={t.agencyMisc.history}
				iconKey="History"
				hint={summaryHint}
			/>

			<div className="iz-payroll-tabs mt-3">
				<button
					type="button"
					className={`iz-payroll-tab${tab === "shifts" ? " on" : ""}`}
					onClick={() => setTab("shifts")}
				>
					{/* `TitleWithIcon` derives its icon from the rendered children, so a
					    translated tab label misses the lookup and drops the glyph
					    entirely (`iconForLabel` → null, no fallback). Pass the ENGLISH
					    key explicitly instead. */}
					<TitleWithIcon icon={iconForNav("By PR")}>
						{t.agencyMisc.byPr}
					</TitleWithIcon>
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${tab === "outlets" ? " on" : ""}`}
					onClick={() => setTab("outlets")}
				>
					<TitleWithIcon icon={iconForNav("By outlet")}>
						{fill(t.history.byOutletCount, { n: outletCount })}
					</TitleWithIcon>
				</button>
				<button
					type="button"
					className={`iz-payroll-tab${tab === "paid" ? " on" : ""}`}
					onClick={() => setTab("paid")}
				>
					<TitleWithIcon>
						{fill(t.history.paidPvsCount, { n: paidCount })}
					</TitleWithIcon>
				</button>
			</div>

			{tab === "shifts" && (
				<>
					<p className="iz-tiny iz-muted mt-2">{t.history.prViewHint}</p>
					<ShiftHistoryLog
						key="history-by-pr"
						portal="agency"
						groupBy="pr"
						rows={shiftHistory}
						agencyPRs={agencyPRs}
						takeHome={takeHome}
						embedded
					/>
				</>
			)}

			{tab === "outlets" && (
				<>
					<p className="iz-tiny iz-muted mt-2">{t.history.outletViewHint}</p>
					<ShiftHistoryLog
						key="history-by-outlet"
						portal="agency"
						groupBy="venue"
						rows={shiftHistory}
						agencyPRs={agencyPRs}
						takeHome={takeHome}
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
