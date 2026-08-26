import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { formatRM, IzCard, IzCardTitle } from "@agency-portal/components/iz/ui";
import { calcShiftPayout } from "@agency-portal/lib/agency-demo";
import { shiftHoursFromLabel } from "@agency-portal/lib/outlet-demo";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useMemo } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function OutletSealReview({
	shift,
	open,
	onClose,
	onConfirm,
}: {
	shift: ShiftRequest | null;
	open: boolean;
	onClose: () => void;
	onConfirm: () => void;
}) {
	const { t } = usePortalLocale();
	const agencyPRs = useStore((s) => s.agencyPRs);
	const agencyRoster = useStore((s) => s.agencyRoster);

	const rows = useMemo(() => {
		if (!shift) return [];
		const hours = shiftHoursFromLabel(shift.shift);
		const drinkUnits = shift.drinkUnits ?? 0;
		const perPr = Math.max(shift.prs.length, 1);
		return shift.prs.map((prId) => {
			const pr = agencyPRs.find((p) => p.id === prId);
			const roster = agencyRoster.find(
				(s) => s.prId === prId && s.status === "on-duty",
			);
			const drinks = Math.round(drinkUnits / perPr);
			const drinkSales = drinks * (shift.perDrinkRm ?? 120);
			const tips = roster?.floorTips ?? Math.round(drinkSales * 0.15);
			const payout = calcShiftPayout({
				outlet: shift.outletName,
				hoursWorked: hours,
				drinks,
				drinkSales,
				tips,
				prTier: pr?.trainingLevel,
				shiftTierRates: shift.tierRates,
			});
			return {
				prId,
				prName: pr?.name ?? prId,
				hours,
				drinks,
				tips,
				payout,
			};
		});
	}, [shift, agencyPRs, agencyRoster]);

	const total = rows.reduce((sum, r) => sum + r.payout.total, 0);

	return (
		<IzSheet open={open} onClose={onClose}>
			<IzCardTitle>{t.today.sealPerPrReview}</IzCardTitle>
			{shift && (
				<p className="iz-tiny iz-muted mt-1">
					{shift.event} · {shift.date} · {shift.shift}
				</p>
			)}
			<div className="mt-3 space-y-2">
				{rows.map((r) => (
					<IzCard key={r.prId} flat className="!py-2.5">
						<div className="font-sora text-sm font-bold">{r.prName}</div>
						<div className="mt-1 grid grid-cols-3 gap-1 text-[10px] text-[var(--iz-muted)]">
							<span>{fill(t.outletPanels.hoursCount, { n: r.hours })}</span>
							<span>{fill(t.today.drinksCount, { n: r.drinks })}</span>
							<span>
								{fill(t.outletPanels.tipsAmount, { amount: formatRM(r.tips) })}
							</span>
						</div>
						<div className="mt-1 text-xs font-semibold text-[var(--iz-gold)]">
							{fill(t.outletPanels.pvEstimate, {
								amount: formatRM(r.payout.total),
							})}
						</div>
					</IzCard>
				))}
			</div>
			{rows.length > 0 && (
				<div className="iz-v-sum tot mt-3">
					<span className="font-sora font-bold">{t.today.totalPayroll}</span>
					<span className="iz-ledger text-[var(--iz-gold)]">
						{formatRM(total)}
					</span>
				</div>
			)}
			<button
				type="button"
				className="iz-btn iz-btn-primary mt-3 w-full"
				onClick={onConfirm}
			>
				{t.today.sealAndGeneratePvs}
			</button>
			<button
				type="button"
				className="iz-btn iz-btn-soft mt-2 w-full"
				onClick={onClose}
			>
				{t.today.back}
			</button>
		</IzSheet>
	);
}
