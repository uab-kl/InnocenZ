import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCardTitle } from "@agency-portal/components/iz/ui";
import { LiveEarningsLabel } from "@agency-portal/components/outlet/outlet-live-sales-ui";
import type { OutletPrLiveEarningsBreakdown } from "@agency-portal/lib/outlet-financial-sync";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

function EarningsRow({ label, amount }: { label: string; amount: number }) {
	const { t } = usePortalLocale();
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
	const { t } = usePortalLocale();
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
					<EarningsRow
						label={t.today.colDailyWages}
						amount={breakdown.dailyWagesRm}
					/>
					<EarningsRow label="HH" amount={breakdown.hhCommissionRm} />
					<EarningsRow
						label={t.today.colNormal}
						amount={breakdown.normalCommissionRm}
					/>
					<EarningsRow
						label={t.reports.colTips}
						amount={breakdown.tipSalesRm}
					/>
					<EarningsRow label="OT" amount={breakdown.otPayRm} />
				</dl>

				<div className="iz-outlet-pr-earnings-sheet__total">
					<LiveEarningsLabel label={t.today.colTotalEarn} />
					<span>{formatRM(breakdown.totalEarnRm)}</span>
				</div>
			</div>

			{noFloorSales && (
				<p className="iz-sm iz-muted2 mt-4 text-center">
					{t.today.noFloorSalesForPr}
				</p>
			)}

			<button
				type="button"
				className="iz-btn iz-btn-soft mt-4 w-full"
				onClick={onClose}
			>
				{t.common.close}
			</button>
		</IzSheet>
	);
}
