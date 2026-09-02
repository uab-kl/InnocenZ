import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useVoucherPayeeBank } from "@agency-portal/hooks/use-agency-pvs";
import { usePvIssuer } from "@agency-portal/hooks/use-pv-issuer";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function pvBreakdownDisplayRows(
	breakdown: PvEarningsBreakdown,
	t: PortalTranslations,
) {
	// Keyed on the BUCKET, not on the label: a row keyed by its translated text
	// remounts every row the moment the locale is switched.
	const rows = [
		{ key: "wages", label: t.money.dailyWages, value: breakdown.wages },
		{
			key: "drinks",
			label: t.payroll.drinkCommissions,
			value: breakdown.drinks,
		},
		{ key: "tips", label: t.payroll.tipCommissions, value: breakdown.tips },
		{
			key: "overtime",
			label: t.payroll.overtimeCheckOut,
			value: breakdown.overtime,
		},
	].filter((r) => r.value > 0);
	if (breakdown.other > 0)
		rows.push({ key: "other", label: t.payroll.other, value: breakdown.other });
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
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	// Same letterhead the live PV screen prints — one agency, one document.
	const pvIssuer = usePvIssuer();
	// Real account for the printed document; blank rather than a demo fixture.
	const payeeBank = useVoucherPayeeBank(pv.id);
	const payee = buildAgencyPayee(pv, agencyPRs, payeeBank.data);
	const breakdown = summarizePv(pv);
	const breakdownRows = pvBreakdownDisplayRows(breakdown, t);

	return (
		<div className="iz-screen">
			<AppTopbar onBack={onBack} backLabel={t.payroll.paidPvs} />
			<div className="iz-pv-detail-bar mb-2.5">
				<div className="iz-pv-detail-bar-main">
					<IzPill variant={pvStatusPillVariant(pv.status)}>
						{agencyPvStatusLabel(pv.status, t)}
					</IzPill>
					<span className="iz-pv-detail-id">{pv.id}</span>
				</div>
			</div>

			<IzCard flat className="mb-2">
				<p className="iz-tiny iz-muted2">{t.payroll.fourPartBreakdown}</p>
				{breakdownRows.map((r) => (
					<div key={r.key} className="iz-v-sum">
						<span className="iz-muted">{r.label}</span>
						<b>{formatRM(r.value)}</b>
					</div>
				))}
				<div className="iz-v-sum tot">
					<span>{t.payroll.netPaid}</span>
					<b className="text-[var(--iz-gold)]">{formatRM(getPvNetTotal(pv))}</b>
				</div>
			</IzCard>

			<PvSummaryView pv={pv} payee={payee} className="mb-2.5" />

			{receiptScans.length > 0 && (
				<OutletSection
					title={t.payroll.receiptScans}
					iconKey="Receipt scans"
					hint={`${receiptScans.length} ${t.payroll.onThisPv}`}
				>
					{receiptScans.map((scan) => (
						<IzCard key={scan.id} flat className="mb-2">
							<p className="font-sora text-sm font-bold">{scan.receiptRef}</p>
							<p className="iz-tiny iz-muted mt-0.5">
								{scan.outlet} · {formatRM(scan.totalLogged)}{" "}
								{t.payroll.loggedSuffix}
							</p>
						</IzCard>
					))}
				</OutletSection>
			)}

			{/*
			 * NO LETTERHEAD, NO DOCUMENT.
			 *
			 * `pvIssuer.issuer` is null while the agency record is loading and
			 * after it fails. Both used to reach `pv-pdf`'s default parameter and
			 * print ATMOSPHERE EVENT ENTERPRISE — a real, unrelated company — at
			 * the top of a live payment voucher. Refusing is the honest answer: a
			 * voucher naming the wrong company is worse than no voucher, and the
			 * reason is stated rather than left as a dead button.
			 */}
			<div className="mt-2.5 flex gap-2">
				<button
					type="button"
					disabled={!pvIssuer.issuer}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => {
						if (!pvIssuer.issuer) return;
						downloadPvBreakdownPdf(pv, payee, [], pvIssuer.issuer);
						toast(t.payroll.officialPvOpened, "success");
					}}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					disabled={!pvIssuer.issuer}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => {
						if (!pvIssuer.issuer) return;
						downloadPvBreakdownCsv(pv, payee, pvIssuer.issuer);
						toast(t.payroll.excelDownloaded, "success");
					}}
				>
					<Sheet className="h-4 w-4 shrink-0" /> Excel
				</button>
			</div>
			{!pvIssuer.issuer && (
				<p className="iz-tiny iz-muted2 mt-1.5 text-center">
					{pvIssuer.status === "loading"
						? t.agencyPv.loadingLetterhead
						: t.agencyPv.letterheadUnavailable}
				</p>
			)}

			{/* NOTE: this is `pr-demo`'s plain-text receipt, not the letterhead PDF —
			    same name, different function. It prints no issuer, so it is not
			    gated on `pvIssuer`. */}
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
					toast(t.payroll.receiptDownloaded, "success");
				}}
			>
				<Receipt className="h-4 w-4" /> {t.payroll.downloadPaymentReceipt}
			</button>
		</div>
	);
}
