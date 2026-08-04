import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCardTitle } from "@agency-portal/components/iz/ui";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import type { OutletPrLiveEarningsBreakdown } from "@agency-portal/lib/outlet-financial-sync";

function EarningsRow({ label, amount }: { label: string; amount: number }) {
	return (
		<div className="iz-outlet-pr-earnings-sheet__row">
			<dt>
				<LiveEarningsLabel label={label} />
			</dt>
			<dd>{formatRM(amount)}</dd>
		</div>
	);
}

export function OutletPrLiveSalesSheet({
	open,
	onClose,
	shiftEvent,
	breakdown,
}: {
	open: boolean;
	onClose: () => void;
	shiftEvent: string;
	breakdown: OutletPrLiveEarningsBreakdown;
}) {
	const noFloorSales =
		breakdown.hhDrinkSalesRm === 0 &&
		breakdown.normalDrinkSalesRm === 0 &&
		breakdown.tipSalesRm === 0;

	return (
		<IzSheet open={open} onClose={onClose} wide liveSales>
			<IzCardTitle>Live sales · {breakdown.prName}</IzCardTitle>
			<p className="iz-sm iz-muted mt-1.5">{shiftEvent} · tonight floor</p>

			<div className="iz-outlet-pr-earnings-sheet mt-4">
				<div className="iz-outlet-pr-earnings-sheet__identity">
					<p className="iz-outlet-pr-earnings-sheet__name">
						{breakdown.prName}
					</p>
					<p className="iz-outlet-pr-earnings-sheet__id">{breakdown.prId}</p>
				</div>

				<dl className="iz-outlet-pr-earnings-sheet__rows">
					<EarningsRow label="Daily wages" amount={breakdown.dailyWagesRm} />
					<EarningsRow label="HH" amount={breakdown.hhCommissionRm} />
					<EarningsRow label="Normal" amount={breakdown.normalCommissionRm} />
					<EarningsRow label="Tips" amount={breakdown.tipSalesRm} />
					<EarningsRow label="OT" amount={breakdown.otPayRm} />
				</dl>

				<div className="iz-outlet-pr-earnings-sheet__total">
					<LiveEarningsLabel label="Total earn" />
					<span>{formatRM(breakdown.totalEarnRm)}</span>
				</div>
			</div>

			{noFloorSales && (
				<p className="iz-sm iz-muted2 mt-4 text-center">
					No floor sales logged for this PR yet tonight.
				</p>
			)}

			<button
				type="button"
				className="iz-btn iz-btn-soft mt-4 w-full"
				onClick={onClose}
			>
				Close
			</button>
		</IzSheet>
	);
}
