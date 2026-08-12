import { formatRM } from "@agency-portal/components/iz/ui";
import { useOutletCollections } from "@agency-portal/hooks/use-outlet-collections";
import { useOutletSalesReport } from "@agency-portal/hooks/use-outlet-sales-report";
import {
	collectionAmountRm,
	collectionWeekLabel,
} from "@agency-portal/lib/collections";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { shouldShowWeeklyReconciliation } from "@agency-portal/lib/reconciliation-weekly";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { cn } from "@agency-portal/lib/utils";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * Weekly reconciliation on outlet Today.
 *
 * A real session and a demo session reconcile DIFFERENT PAIRS of numbers, which
 * is why this is a fork rather than one component fed from two sources.
 *
 * The demo banner compares the outlet's sales against the PV total. That cannot
 * be backed on this portal and should not be: `payment-voucher` is gated to admin
 * and agency, because what an agency pays each PR is its payroll and not the
 * venue's business. Giving an outlet that figure just to render a banner would be
 * the wrong trade.
 *
 * So a real session reconciles the pair an outlet legitimately holds: what its
 * agency BILLED it for a week (`collection_invoice`) against its own record of the
 * shift assignments behind that week (`shift_assignment.pay_amount`, via the sales
 * report). Both derive from the same column, so they should agree — and when they
 * do not, that is the outlet's own question to ask.
 */
export function OutletReconciliationBanner() {
	// Not a hook — a localStorage read, so it can pick a branch before either
	// child calls the hooks it needs.
	const backed = getOutletIdentity() !== null;
	return backed ? <BilledVsRecordsBanner /> : <DemoReconciliationBanner />;
}

/** Below a cent the two sides agree; floats summed in a different order will not. */
const CENT = 0.005;

function BilledVsRecordsBanner() {
	const can = useOutletCan();
	const collections = useOutletCollections();
	const sales = useOutletSalesReport();
	const [open, setOpen] = useState(false);

	// A billing check, so the same gate the collections statement uses — owner and
	// finance, not ops.
	if (!can("viewBilling")) return null;
	if (collections.isLoading || sales.isLoading) return null;

	// The newest statement defines the period. Deriving the week on the client
	// instead would risk comparing a statement against a different seven days than
	// the agency billed for.
	const statement = collections.invoices[0];
	if (!statement) return null;

	const report = sales.buildReport({
		startIso: statement.weekStart,
		endIso: statement.weekEnd,
	});
	// No shift rows for that week on this side: there is nothing to check the
	// statement against, and an empty report is not evidence of a discrepancy.
	if (!report) return null;

	const billedRm = collectionAmountRm(statement);
	const ownRecordRm = report.totalCost;
	const variance = Math.round((billedRm - ownRecordRm) * 100) / 100;

	// A matching week is not news. This is an alert, and one that renders every
	// week is one nobody reads by the third week.
	if (Math.abs(variance) < CENT) return null;

	const overBilled = variance > 0;
	const summary = overBilled
		? `Billed ${formatRM(variance)} above your shift records`
		: `Your records show ${formatRM(Math.abs(variance))} more than billed`;

	return (
		<div className="mt-4 overflow-hidden rounded-2xl border border-[rgba(232,194,122,.28)] bg-[rgba(232,194,122,.06)]">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
			>
				<AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
				<div className="min-w-0 flex-1">
					<p className="text-xs font-semibold text-[var(--iz-txt)]">
						Weekly reconciliation
					</p>
					<p className="iz-tiny iz-muted truncate">{summary}</p>
				</div>
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="border-t border-[rgba(232,194,122,.2)] px-3.5 pb-3.5 pt-2">
					<p className="iz-tiny iz-muted">
						{collectionWeekLabel(statement.weekStart, statement.weekEnd)} ·
						Agency billed {formatRM(billedRm)} vs your shift records{" "}
						{formatRM(ownRecordRm)}
					</p>
					{/* Both figures come from shift_assignment.pay_amount but through
              different filters — a statement counts only `completed`, while the
              cost side of the sales report excludes just cancelled and no-show.
              A shift that ran and was never marked completed lands here. */}
					<p className="iz-tiny iz-muted2 mt-1.5">
						A statement counts completed shifts only, while this total also
						includes shifts that ran but were never marked completed — so a gap
						here is worth checking rather than a billing error.
					</p>
					<div className="mt-2.5 flex flex-wrap gap-2">
						<Link to="/outlet/subscription" className="iz-chip text-[11px]">
							Statement
						</Link>
						<Link to="/outlet/billing" className="iz-chip text-[11px]">
							Reports
						</Link>
					</div>
					{/* No Confirm here on purpose. Nothing persists an outlet
              confirmation, so the button would only look like it worked, and
              marking a week settled is the agency's call — the outlet is the one
              party with an interest in saying it paid. */}
				</div>
			)}
		</div>
	);
}

/** The prototype banner, unchanged: outlet sales against the PV total. */
function DemoReconciliationBanner() {
	const {
		agencyReconciliation,
		confirmOutletReconciliation,
		setReconciliationVarianceReason,
	} = useStore();
	const canConfirm = useOutletCan()("confirmDaily");
	const [open, setOpen] = useState(false);
	const [reason, setReason] = useState(
		agencyReconciliation.varianceReason ?? "",
	);

	if (!canConfirm) return null;
	if (!shouldShowWeeklyReconciliation(agencyReconciliation)) return null;
	if (
		agencyReconciliation.outletConfirmed &&
		agencyReconciliation.agencyConfirmed
	)
		return null;

	const hasVariance = agencyReconciliation.variance !== 0;
	const summary = hasVariance
		? `Variance ${formatRM(agencyReconciliation.variance)} · action needed`
		: agencyReconciliation.outletConfirmed
			? "Awaiting agency confirm"
			: `Confirm week · ${agencyReconciliation.dateLabel}`;

	return (
		<div className="mt-4 overflow-hidden rounded-2xl border border-[rgba(232,194,122,.28)] bg-[rgba(232,194,122,.06)]">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left"
			>
				<AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-amber)]" />
				<div className="min-w-0 flex-1">
					<p className="text-xs font-semibold text-[var(--iz-txt)]">
						Weekly reconciliation
					</p>
					<p className="iz-tiny iz-muted truncate">{summary}</p>
				</div>
				<ChevronDown
					className={cn(
						"h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform",
						open && "rotate-180",
					)}
				/>
			</button>

			{open && (
				<div className="border-t border-[rgba(232,194,122,.2)] px-3.5 pb-3.5 pt-2">
					<p className="iz-tiny iz-muted">
						{agencyReconciliation.dateLabel} · Sales{" "}
						{formatRM(agencyReconciliation.outletSalesTotal)} vs PV{" "}
						{formatRM(agencyReconciliation.pvTotal)}
					</p>
					{hasVariance && !agencyReconciliation.outletConfirmed && (
						<input
							value={reason}
							onChange={(e) => setReason(e.target.value)}
							onBlur={() => setReconciliationVarianceReason(reason)}
							placeholder="Variance reason"
							className="mt-2 w-full rounded-xl border border-[var(--iz-line2)] bg-white/[0.03] px-3 py-2 text-xs outline-none"
						/>
					)}
					<div className="mt-2.5 flex flex-wrap gap-2">
						{!agencyReconciliation.outletConfirmed && (
							<button
								type="button"
								onClick={() => {
									if (hasVariance && reason.trim())
										setReconciliationVarianceReason(reason);
									confirmOutletReconciliation();
								}}
								className="iz-btn iz-btn-primary iz-btn-sm"
							>
								Confirm
							</button>
						)}
						<Link to="/outlet/billing" className="iz-chip text-[11px]">
							Reports
						</Link>
					</div>
				</div>
			)}
		</div>
	);
}
