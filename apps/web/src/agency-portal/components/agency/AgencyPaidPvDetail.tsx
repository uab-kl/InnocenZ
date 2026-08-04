import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { agencyPvStatusLabel } from "@agency-portal/lib/agency-payroll";
import {
	downloadPvReceipt,
	getPvNetTotal,
	type PrPaymentVoucher,
	type PrReceiptScan,
	pvStatusPillVariant,
} from "@agency-portal/lib/pr-demo";
import {
	type PvEarningsBreakdown,
	summarizePv,
} from "@agency-portal/lib/pv-breakdown";
import {
	downloadPvBreakdownCsv,
	downloadPvBreakdownPdf,
} from "@agency-portal/lib/pv-pdf";
import { buildAgencyPayee } from "@agency-portal/lib/pv-template";
import { useStore } from "@agency-portal/lib/store";
import { FileText, Receipt, Sheet } from "lucide-react";

function pvBreakdownDisplayRows(breakdown: PvEarningsBreakdown) {
	const rows = [
		{ label: "Daily wages", value: breakdown.wages },
		{ label: "Drink commissions", value: breakdown.drinks },
		{ label: "Tip commissions", value: breakdown.tips },
		{ label: "Overtime (check-out)", value: breakdown.overtime },
	].filter((r) => r.value > 0);
	if (breakdown.other > 0)
		rows.push({ label: "Other", value: breakdown.other });
	return rows;
}

export function AgencyPaidPvDetail({
	pv,
	receiptScans,
	agencyPRs,
	onBack,
}: {
	pv: PrPaymentVoucher;
	receiptScans: PrReceiptScan[];
	agencyPRs: AgencyManagedPR[];
	onBack: () => void;
}) {
	const toast = useStore((s) => s.toast);
	const payee = buildAgencyPayee(pv, agencyPRs);
	const breakdown = summarizePv(pv);
	const breakdownRows = pvBreakdownDisplayRows(breakdown);

	return (
		<div className="iz-screen">
			<AppTopbar onBack={onBack} backLabel="Paid PVs" />
			<div className="iz-pv-detail-bar mb-2.5">
				<div className="iz-pv-detail-bar-main">
					<IzPill variant={pvStatusPillVariant(pv.status)}>
						{agencyPvStatusLabel(pv.status)}
					</IzPill>
					<span className="iz-pv-detail-id">{pv.id}</span>
				</div>
			</div>

			<IzCard flat className="mb-2">
				<p className="iz-tiny iz-muted2">4-part earnings breakdown</p>
				{breakdownRows.map((r) => (
					<div key={r.label} className="iz-v-sum">
						<span className="iz-muted">{r.label}</span>
						<b>{formatRM(r.value)}</b>
					</div>
				))}
				<div className="iz-v-sum tot">
					<span>Net paid</span>
					<b className="text-[var(--iz-gold)]">{formatRM(getPvNetTotal(pv))}</b>
				</div>
			</IzCard>

			<PvSummaryView pv={pv} payee={payee} className="mb-2.5" />

			{receiptScans.length > 0 && (
				<OutletSection
					title="Receipt scans"
					hint={`${receiptScans.length} on this PV`}
				>
					{receiptScans.map((scan) => (
						<IzCard key={scan.id} flat className="mb-2">
							<p className="font-sora text-sm font-bold">{scan.receiptRef}</p>
							<p className="iz-tiny iz-muted mt-0.5">
								{scan.outlet} · {formatRM(scan.totalLogged)} logged
							</p>
						</IzCard>
					))}
				</OutletSection>
			)}

			<div className="mt-2.5 flex gap-2">
				<button
					type="button"
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs"
					onClick={() => {
						downloadPvBreakdownPdf(pv, payee);
						toast("Official PV opened — use Print → Save as PDF", "success");
					}}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs"
					onClick={() => {
						downloadPvBreakdownCsv(pv, payee);
						toast("Payment voucher Excel downloaded", "success");
					}}
				>
					<Sheet className="h-4 w-4 shrink-0" /> Excel
				</button>
			</div>

			<button
				type="button"
				className="iz-btn iz-btn-primary mt-2 w-full"
				onClick={() => {
					downloadPvReceipt(pv, {
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
		</div>
	);
}
