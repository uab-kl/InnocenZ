import { formatRM } from "@agency-portal/components/iz/ui";
import {
	type HistoryMoneyKind,
	ShiftHistoryMoneyBreakdownView,
} from "@agency-portal/components/outlet/ShiftHistoryMoneyBreakdownView";
import type { ShiftHistoryMoneyBreakdown } from "@agency-portal/lib/shift-history-amounts";
import { cn } from "@agency-portal/lib/utils";
import { useState } from "react";

/** Clickable Total Received / Total Payout tiles with on-demand breakdown. */
export function ShiftHistoryExpandableMoneyBlock({
	breakdown,
	className,
}: {
	breakdown: ShiftHistoryMoneyBreakdown;
	className?: string;
}) {
	const [openKind, setOpenKind] = useState<HistoryMoneyKind | null>(null);

	const toggle = (kind: HistoryMoneyKind) => {
		setOpenKind((prev) => (prev === kind ? null : kind));
	};

	return (
		<div className={cn("iz-hist-expandable-money", className)}>
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
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						Total received
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatRM(breakdown.totalReceived)}
					</span>
				</button>
				<button
					type="button"
					className={cn(
						"iz-outlet-shift-log-summary__metric iz-outlet-shift-log-summary__metric--btn",
						"iz-outlet-shift-log-summary__metric--payout",
						openKind === "payout" && "is-open",
					)}
					onClick={() => toggle("payout")}
					aria-expanded={openKind === "payout"}
				>
					<span className="iz-outlet-shift-log-summary__metric-label">
						Total payout
					</span>
					<span className="iz-outlet-shift-log-summary__metric-value">
						{formatRM(breakdown.totalPayout)}
					</span>
				</button>
			</div>
			{openKind ? (
				<ShiftHistoryMoneyBreakdownView breakdown={breakdown} kind={openKind} />
			) : null}
		</div>
	);
}
