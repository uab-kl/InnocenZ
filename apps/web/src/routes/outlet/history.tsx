import { ShiftHistoryLog } from "@agency-portal/components/iz/ShiftHistoryLog";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useOutletHistory } from "@agency-portal/hooks/use-outlet-history";
import { shiftHistoryForOutlet } from "@agency-portal/lib/portal-sync";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export const Route = createFileRoute("/outlet/history")({
	component: OutletHistory,
});

function OutletHistory() {
	const { t } = usePortalLocale();
	const shiftHistory = useStore((s) => s.shiftHistory) ?? [];
	const storeOutletName = useStore((s) => s.outletWorkspace.outletName);
	const storeAgencyPRs = useStore((s) => s.agencyPRs);
	// A real session reads its sealed nights from the backend; demo sessions keep
	// reading the demo store.
	const backend = useOutletHistory();
	const outletName = backend.backed ? backend.outletName : storeOutletName;
	const demoRows = useMemo(
		() => shiftHistoryForOutlet(shiftHistory, storeOutletName),
		[shiftHistory, storeOutletName],
	);
	const rows = backend.backed ? backend.rows : demoRows;
	// Backend PR roster carries profile photos; demo falls back to the store.
	const agencyPRs = backend.backed ? backend.prs : storeAgencyPRs;
	const summaryHint = useMemo(() => {
		if (backend.isLoading) return t.history.loadingShiftHistory;
		if (rows.length === 0) return t.history.noShiftHistory;
		const sorted = [...rows].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
		const oldest = sorted[0]?.dateDisplay;
		const newest = sorted[sorted.length - 1]?.dateDisplay;
		const totalPayout = rows.reduce((a, r) => a + r.totalPayout, 0);
		const range =
			oldest && newest && oldest !== newest
				? `${oldest} – ${newest}`
				: (oldest ?? newest);
		return fill(t.history.summary, {
			n: rows.length,
			range: range ?? "",
			total: totalPayout.toLocaleString(),
		});
	}, [rows, backend.isLoading, t]);

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title={t.nav.history}
				iconKey="History"
				hint={summaryHint}
			/>
			<ShiftHistoryLog
				portal="outlet"
				rows={rows}
				agencyPRs={agencyPRs}
				embedded
			/>
		</OutletPage>
	);
}
