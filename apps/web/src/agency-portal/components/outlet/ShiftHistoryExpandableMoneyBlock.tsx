import { formatRM } from "@agency-portal/components/iz/ui";
import {
	type HistoryMoneyKind,
	ShiftHistoryMoneyBreakdownView,
} from "@agency-portal/components/outlet/ShiftHistoryMoneyBreakdownView";
import type { ShiftHistoryMoneyBreakdown } from "@agency-portal/lib/shift-history-amounts";
import { cn } from "@agency-portal/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/** Clickable Total Received / Total Payout tiles with on-demand breakdown. */
export function ShiftHistoryExpandableMoneyBlock({
	breakdown,
	className,
	payoutLabel,
	payoutNote,
	inlineBreakdown = false,
}: {
	breakdown: ShiftHistoryMoneyBreakdown;
	className?: string;
	/**
	 * Already-translated words for the payout tile when "Total payout" would
	 * misname the figure — the agency History's "Take-home", or "Wages" while
	 * the take-home cannot be stated yet.
	 */
	payoutLabel?: string;
	/** A line under the payout figure — the wage part beside a take-home. */
	payoutNote?: string;
	/** Keep the active breakdown beside its metric on small Agency screens. */
	inlineBreakdown?: boolean;
}) {
	const { t } = usePortalLocale();
	const breakdownId = useId();
	const [openKind, setOpenKind] = useState<HistoryMoneyKind | null>(null);

	const toggle = (kind: HistoryMoneyKind) => {
		setOpenKind((prev) => (prev === kind ? null : kind));
	};

	return (
		<div
			className={cn(
				"iz-hist-expandable-money",
				inlineBreakdown && "iz-hist-expandable-money--inline",
				className,
			)}
		>
			<div className="iz-outlet-shift-log-summary__metrics iz-outlet-shift-log-summary__metrics--pair">
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-summary__metric iz-outlet-shift-log-summary__metric--btn",
						"iz-outlet-shift-log-summary__metric--received",
						openKind === "received" && "is-open",
					)}
					onClick={() => toggle("received")}
					aria-expanded={openKind === "received"}
					aria-controls={openKind === "received" ? breakdownId : undefined}
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						{t.history.metricTotalReceived}
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatRM(breakdown.totalReceived)}
					</span>
					{inlineBreakdown && (
						<span className="iz-hist-breakdown-toggle">
							{openKind === "received"
								? t.approvedDesign.hideBreakdown
								: t.approvedDesign.viewBreakdown}
							<ChevronDown className="iz-hist-metric-chevron" aria-hidden />
						</span>
					)}
				</button>
				{inlineBreakdown && openKind === "received" && (
					<div id={breakdownId} className="iz-hist-inline-breakdown">
						<ShiftHistoryMoneyBreakdownView
							breakdown={breakdown}
							kind="received"
						/>
					</div>
				)}
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-summary__metric iz-outlet-shift-log-summary__metric--btn",
						"iz-outlet-shift-log-summary__metric--payout",
						openKind === "payout" && "is-open",
					)}
					onClick={() => toggle("payout")}
					aria-expanded={openKind === "payout"}
					aria-controls={openKind === "payout" ? breakdownId : undefined}
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						{payoutLabel ?? t.history.metricTotalPayout}
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatRM(breakdown.totalPayout)}
					</span>
					{payoutNote ? (
						<span className="iz-tiny iz-muted2 mt-0.5 block">{payoutNote}</span>
					) : null}
					{inlineBreakdown && (
						<span className="iz-hist-breakdown-toggle">
							{openKind === "payout"
								? t.approvedDesign.hideBreakdown
								: t.approvedDesign.viewBreakdown}
							<ChevronDown className="iz-hist-metric-chevron" aria-hidden />
						</span>
					)}
				</button>
				{inlineBreakdown && openKind === "payout" && (
					<div id={breakdownId} className="iz-hist-inline-breakdown">
						<ShiftHistoryMoneyBreakdownView
							breakdown={breakdown}
							kind="payout"
						/>
					</div>
				)}
			</div>
			{!inlineBreakdown && openKind ? (
				<div id={breakdownId}>
					<ShiftHistoryMoneyBreakdownView
						breakdown={breakdown}
						kind={openKind}
					/>
				</div>
			) : null}
		</div>
	);
}
