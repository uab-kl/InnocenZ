import { formatRM, IzCard } from "@agency-portal/components/iz/ui";
import {
	type PrReceiptScan,
	RECEIPT_COMMISSION_RULES,
	receiptEntryLoggedLabel,
	receiptEntryMethod,
} from "@agency-portal/lib/pr-demo";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function ReceiptScanSlip({ scan }: { scan: PrReceiptScan }) {
	const { t } = usePortalLocale();
	const drinkUnits = scan.items
		.filter((i) => i.category === "drinks")
		.reduce((s, i) => s + i.qty, 0);
	const manual = receiptEntryMethod(scan) === "manual";

	return (
		<div className="iz-receipt-slip">
			<div className="iz-scanbox iz-receipt-slip__capture">
				<div className="iz-heading w-full text-left text-[11px] leading-relaxed text-[var(--iz-txt)]">
					<b className="text-[var(--iz-violet-l)]">
						{manual
							? t.prMedia.manualEntryBanner
							: t.prMedia.ocrExtractedBanner}
					</b>
					<br />
					{t.prMedia.receiptIdLabel} {scan.receiptRef}
					<br />
					{t.prMedia.outletLabel} {scan.outlet}
					<br />
					{t.prMedia.prIdLabel} {scan.prId ?? "—"} · {scan.prCode} (
					{scan.prName})
					<br />
					{receiptEntryLoggedLabel(scan, t)}
					<br />
					<br />
					{scan.items.map((item) => (
						<span key={`${item.label}-${item.qty}`}>
							{item.qty}× {item.label} · {formatRM(item.amount)}
							<br />
						</span>
					))}
					<b>
						{t.prMedia.totalLoggedLabel} {formatRM(scan.totalLogged)}
					</b>
				</div>
			</div>

			<IzCard
				flat
				className="mt-3 border-[rgba(111,176,255,.25)] bg-[linear-gradient(180deg,rgba(111,176,255,.08),transparent)]"
			>
				<p className="iz-sm font-bold text-[var(--iz-blue)]">
					{t.prMedia.commissionPvCalc}
				</p>
				<div className="iz-data-table-wrap mt-2">
					<table className="iz-data-table">
						<thead>
							<tr>
								<th>{t.prMedia.colRule}</th>
								<th>{t.prMedia.colCalc}</th>
								{/* Currency CODE, not a word — it stays RM in every locale. */}
								<th className="text-right">RM</th>
							</tr>
						</thead>
						<tbody>
							{scan.drinkCommission > 0 && (
								<tr>
									<td>{t.money.drinks}</td>
									<td className="iz-muted">
										{fill(t.prMedia.drinkUnitsCalc, {
											n: drinkUnits,
											rate: `RM${RECEIPT_COMMISSION_RULES.drinkPerUnit}`,
										})}
									</td>
									<td className="text-right">
										{formatRM(scan.drinkCommission)}
									</td>
								</tr>
							)}
							{scan.tipCommission > 0 && (
								<tr>
									<td>{t.money.tips}</td>
									<td className="iz-muted">{t.prMedia.tipRuleCalc}</td>
									<td className="text-right">{formatRM(scan.tipCommission)}</td>
								</tr>
							)}
						</tbody>
						<tfoot>
							<tr>
								<td colSpan={2} className="font-bold">
									{t.prMedia.totalCommission}
								</td>
								<td className="text-right font-bold">
									{formatRM(scan.totalCommission)}
								</td>
							</tr>
						</tfoot>
					</table>
				</div>
			</IzCard>
		</div>
	);
}
