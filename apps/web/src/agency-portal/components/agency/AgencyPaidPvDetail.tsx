import { PvSummaryView } from "@agency-portal/components/iz/PvSummaryView";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useAgencySignerName } from "@agency-portal/hooks/use-agency-member-name";
import {
	useAgencyPvDetailState,
	useVoucherPayeeBank,
} from "@agency-portal/hooks/use-agency-pvs";
import { usePvIssuer } from "@agency-portal/hooks/use-pv-issuer";
import type { AgencyManagedPR } from "@agency-portal/lib/agency-demo";
import { agencyPvStatusLabel } from "@agency-portal/lib/agency-payroll";
import {
	pvLinesReady,
	pvVoucherRef,
	withLinesStateNote,
	withReadableHeader,
	withReadableLines,
	withRowNumbersFromOne,
} from "@agency-portal/lib/payroll-display";
import {
	downloadPvReceipt,
	getPvNetTotal,
	type PrPaymentVoucher,
	type PrReceiptScan,
	pvStatusPillVariant,
} from "@agency-portal/lib/pr-demo";
import { pvBreakdownRows, summarizePv } from "@agency-portal/lib/pv-breakdown";
import {
	downloadPvBreakdownCsv,
	downloadPvBreakdownPdf,
} from "@agency-portal/lib/pv-pdf";
import { buildAgencyPayee } from "@agency-portal/lib/pv-template";
import { useStore } from "@agency-portal/lib/store";
import { FileText, Receipt, Sheet } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function AgencyPaidPvDetail({
	pv: listPv,
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
	/*
	 * THE VOUCHER'S REAL LINES — the same request, key and mapper the Payroll
	 * detail uses. This screen used to render the LIST row only, which carries
	 * one stand-in row for the week's total: the breakdown table was that one
	 * English sentence and the four-part split filed the whole week under
	 * "Other". Until the lines arrive (or if they cannot), the screen says so
	 * instead of presenting the stand-in as the voucher.
	 */
	const { pv, lines, retry } = useAgencyPvDetailState(listPv.id, listPv);
	const linesReady = pvLinesReady(lines);
	// Same letterhead the live PV screen prints — one agency, one document.
	const pvIssuer = usePvIssuer();
	// Real account for the printed document; blank rather than a demo fixture.
	const payeeBank = useVoucherPayeeBank(pv.id);
	const payee = buildAgencyPayee(pv, agencyPRs, payeeBank.data);
	const breakdown = summarizePv(pv);
	// The shared builder — this file used to hold its own copy of it.
	const breakdownRows = pvBreakdownRows(breakdown, t);
	// "Agency signed" by a person's name — `finance_head_name` can hold the
	// signer's email (PV-000003 did) or, on old rows, their user id.
	const signerName = useAgencySignerName()(pv.financeHeadName);
	// What the summary reads: day words and readable refs on the lines, rows
	// counted from 1, the voucher's own week instead of "Weekly", the signer by
	// name — and, until the lines are here, a stand-in row that says so.
	const shownPv = withLinesStateNote(
		withRowNumbersFromOne(
			withReadableHeader(withReadableLines(pv, t), signerName, t),
		),
		lines,
		t,
	);
	// The printed documents wait for the real lines: a PDF of the stand-in row
	// is a voucher with no line items on it.
	const canPrint = Boolean(pvIssuer.issuer) && linesReady;

	return (
		<div className="iz-screen">
			<AppTopbar onBack={onBack} backLabel={t.payroll.paidPvs} />
			<div className="iz-pv-detail-bar mb-2.5">
				<div className="iz-pv-detail-bar-main">
					<IzPill variant={pvStatusPillVariant(pv.status)}>
						{agencyPvStatusLabel(pv.status, t)}
					</IzPill>
					{/* The printed number, as the Payroll detail and every card show it —
					    never the uuid, which is a database key the reader cannot use. */}
					<span className="iz-pv-detail-id">{pvVoucherRef(pv) || "—"}</span>
				</div>
			</div>
			{pv.prIcMismatch && (
				<p className="iz-tiny mb-2 text-[var(--iz-amber)]">
					{t.izPv.prIcDiffersFromProfile}
				</p>
			)}
			{/* The summary only prints the agency row once someone signed, so a
			    voucher paid before that signature was required (PV-000002,
			    PV-000006) said nothing at all — say it, as the Payroll detail does. */}
			{!pv.financeHeadSignedAt && (
				<p className="iz-tiny iz-muted mb-2">
					{t.agencyPv.signerFirst} · {t.agencyPv.agencyNoSignatureOnRecord}
				</p>
			)}

			<IzCard flat className="mb-2">
				<p className="iz-card-sect">{t.payroll.fourPartBreakdown}</p>
				{/* The split is computed from the LINES, so without them it would be
				    the stand-in row filed under "Other". Say where the lines are
				    instead; the net below is the stored figure either way. */}
				{lines === "loading" && (
					<p className="iz-tiny iz-muted2">
						{t.agencyPv.breakdownLinesLoading}
					</p>
				)}
				{lines === "error" && (
					<p className="iz-tiny text-[var(--iz-red)]">
						{t.agencyPv.breakdownLinesFailed}{" "}
						<button type="button" className="iz-chip" onClick={retry}>
							{t.common.retry}
						</button>
					</p>
				)}
				{linesReady &&
					breakdownRows.map((r) => (
						<div key={r.key} className="iz-v-sum">
							<span className="iz-muted">{r.label}</span>
							{/* Red on a deduction — the owner's colour code. */}
							<b
								className={
									r.tone === "red" ? "text-[var(--iz-red)]" : undefined
								}
							>
								{formatRM(r.value)}
							</b>
						</div>
					))}
				<div className="iz-v-sum tot">
					<span>{t.payroll.netPaid}</span>
					<b className="text-[var(--iz-gold)]">{formatRM(getPvNetTotal(pv))}</b>
				</div>
			</IzCard>

			<PvSummaryView pv={shownPv} payee={payee} className="mb-2.5" />

			{receiptScans.length > 0 && (
				<OutletSection
					title={t.payroll.receiptScans}
					iconKey="Receipt scans"
					hint={`${receiptScans.length} ${t.payroll.onThisPv}`}
				>
					{receiptScans.map((scan) => (
						<IzCard key={scan.id} flat className="mb-2">
							<p className="iz-heading text-sm font-bold">{scan.receiptRef}</p>
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
					disabled={!canPrint}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => {
						if (!pvIssuer.issuer || !linesReady) return;
						downloadPvBreakdownPdf(pv, payee, [], pvIssuer.issuer);
						toast(t.payroll.officialPvOpened, "success");
					}}
				>
					<FileText className="h-4 w-4 shrink-0" /> PDF
				</button>
				<button
					type="button"
					disabled={!canPrint}
					className="iz-btn iz-btn-soft min-w-0 flex-1 !py-2.5 !text-xs disabled:opacity-50"
					onClick={() => {
						if (!pvIssuer.issuer || !linesReady) return;
						downloadPvBreakdownCsv(pv, payee, pvIssuer.issuer);
						toast(t.payroll.excelDownloaded, "success");
					}}
				>
					<Sheet className="h-4 w-4 shrink-0" /> Excel
				</button>
			</div>
			{!pvIssuer.issuer ? (
				<p className="iz-tiny iz-muted2 mt-1.5 text-center">
					{pvIssuer.status === "loading"
						? t.agencyPv.loadingLetterhead
						: t.agencyPv.letterheadUnavailable}
				</p>
			) : (
				!linesReady && (
					<p className="iz-tiny iz-muted2 mt-1.5 text-center">
						{t.agencyPv.downloadsWaitForLines}
					</p>
				)
			)}

			{/* NOTE: this is `pr-demo`'s plain-text receipt, not the letterhead PDF —
			    same name, different function. It prints no issuer, so it is not
			    gated on `pvIssuer`. */}
			<button
				type="button"
				// It lists the voucher's rows too, so it waits for the same lines.
				disabled={!linesReady}
				className="iz-btn iz-btn-primary mt-2 w-full disabled:opacity-50"
				onClick={() => {
					if (!linesReady) return;
					downloadPvReceipt(pv, {
						name: payee.name,
						// Blank, never a made-up bank: a lane without payee-bank
						// access (Director) has no account to print.
						bank: payee.bank ?? "",
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
