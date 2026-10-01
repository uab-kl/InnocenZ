import { formatRM } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useLogShiftSale } from "@agency-portal/hooks/use-log-shift-sale";
import { useOutletShiftSales } from "@agency-portal/hooks/use-outlet-shift-sales";
import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import { resolveOutletShiftDateIso } from "@agency-portal/lib/agency-outlet-shifts";
import { getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { outletShiftFloorSalesStarted } from "@agency-portal/lib/outlet-financial-sync";
import {
	buildShiftSaleInput,
	initialSaleInput,
	isUnchangedSale,
	keptBesideDrinksRm,
	parseSaleAmount,
	recordedSaleFor,
	recordedSaleTotalRm,
	saleLoggedText,
} from "@agency-portal/lib/outlet-sales-log";
import { outletWriteRefusalText } from "@agency-portal/lib/outlet-write-refusal";
import { outletMatches } from "@agency-portal/lib/portal-sync";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { Wine } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * LOG SALES ON A REAL SESSION — one RM figure per PR on the shift.
 *
 * Owner default (29 Sep 2026): "Log Sales becomes a real write, per PR". The
 * backend records floor sales per (shift, PR) in `shift_sale`, which Today,
 * History, Reports and the reconciliation banner already read; the old panel
 * counted drinks into the demo store, so a real venue saw nothing at all.
 *
 *   · Offered once the shift is LIVE or ENDED — the clock has started or a PR
 *     has checked in — and never on a sealed night.
 *   · Gated on `logSales` (`sales:create`), exactly what `POST /shift-sale`
 *     asks of an outlet member; a Director never sees the inputs.
 *   · Lists the PRs STAFFING the shift (`shift.prs` leaves out cancelled,
 *     no-show and excused), the same set the server accepts a sale for.
 *   · EVERY row is editable, a receipt's services included (owner, 29 Sep
 *     2026: "Count services too"): the recorded total reads drinks + tips +
 *     services, the box edits the drinks, and the tips and services travel
 *     back exactly as recorded.
 *   · Confirms in the SERVER's sentence and refreshes every `shift_sale` read;
 *     a refusal reads in the portal's language where the portal knows it.
 *
 * Drawn on Today (for the shift the panels describe) and in the shift sheet
 * (Calendar) — one component, so the two cannot drift apart.
 *
 * The rules for what is sent — and what is refused before asking — live in
 * `outlet-sales-log.ts`, where they are unit-tested.
 */
export function OutletPrSalesLog({
	shift,
	roster = [],
	agencyPrs = [],
}: {
	shift: ShiftRequest;
	roster?: AgencyRosterSlot[];
	agencyPrs?: AgencyManagedPR[];
}) {
	const { t } = usePortalLocale();
	const can = useOutletCan();
	const toast = useStore((s) => s.toast);
	const { rows: saleRows } = useOutletShiftSales();
	const logSale = useLogShiftSale();
	/*
	 * What the operator has TYPED, keyed by shift AND PR: the panel follows the
	 * shift picked on Today, and a figure typed for one shift must never sit in
	 * another shift's box.
	 */
	const [drafts, setDrafts] = useState<Record<string, string>>({});

	if (!can("logSales")) return null;

	const prIds = shift.prs ?? [];
	// The shift's own calendar day — the same resolution Today's cards use.
	const shiftDateIso = resolveOutletShiftDateIso(
		shift.date,
		shift.dateIso,
		getLiveTodayIso(),
	);
	const rosterForShift = roster.filter(
		(slot) =>
			outletMatches(slot.outlet, shift.outletName) &&
			slot.dateIso === shiftDateIso &&
			prIds.includes(slot.prId),
	);
	// Live or ended: the clock has started, or somebody is already stamped in.
	const opened = outletShiftFloorSalesStarted(shift, new Date(), {
		outletName: shift.outletName,
		rosterSlots: rosterForShift,
		prIds,
	});
	if (!opened) return null;

	if (shift.status === "sealed") {
		return (
			<p className="iz-tiny iz-muted mt-3">{t.today.salesLockedAfterSeal}</p>
		);
	}

	const nameOf = (prId: string) =>
		agencyPrs.find((p) => p.id === prId)?.name ??
		rosterForShift.find((slot) => slot.prId === prId)?.prName ??
		"PR";

	const busy = logSale.isPending;

	return (
		<OutletSection title={t.today.logSales} icon={Wine} className="!mt-3">
			{/* In the body, not the section's `hint`: that line is truncated to
			    one row, and the part it would cut — a receipt replaces this
			    figure — is the part an operator most needs to read. */}
			<p className="iz-tiny iz-muted2 mb-2">{t.today.logSalesHint}</p>
			{prIds.length === 0 ? (
				<p className="iz-tiny iz-muted">{t.today.logSalesNoPrs}</p>
			) : (
				<div className="space-y-2">
					{prIds.map((prId) => {
						const name = nameOf(prId);
						const recorded = recordedSaleFor(saleRows, shift.id, prId);
						// Tips and services the save carries back untouched.
						const keptRm = keptBesideDrinksRm(recorded);
						const key = `${shift.id}|${prId}`;
						const value = drafts[key] ?? initialSaleInput(recorded);
						const parsed = parseSaleAmount(value);
						const problem =
							!parsed.ok && parsed.reason === "invalid"
								? t.today.logSalesInvalid
								: !parsed.ok && parsed.reason === "tooLarge"
									? t.today.logSalesTooLarge
									: null;
						const savingThis = busy && logSale.variables?.prId === prId;
						const canSave =
							!busy && parsed.ok && !isUnchangedSale(parsed.rm, recorded);

						const save = () => {
							// The button's own gate — Enter must not write what the
							// button would refuse (an unchanged or unreadable figure).
							if (!canSave || !parsed.ok) return;
							logSale.mutate(
								buildShiftSaleInput({
									shiftId: shift.id,
									prId,
									drinkSalesRm: parsed.rm,
									recorded,
								}),
								{
									onSuccess: (result) => {
										toast(saleLoggedText(result.message, t.today), "success");
										// The refreshed row now holds this figure; let the box
										// read it from there rather than from what was typed.
										setDrafts(({ [key]: _saved, ...rest }) => rest);
									},
									onError: (error) =>
										toast(
											outletWriteRefusalText(error, t, t.today.couldNotLogSale),
											"warn",
										),
								},
							);
						};

						return (
							<div
								key={prId}
								className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--iz-line)] px-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate text-xs font-semibold text-[var(--iz-txt)]">
										{name}
									</p>
									<p className="iz-tiny iz-muted2">
										{recorded
											? fill(t.today.logSalesRecorded, {
													// drinks + tips + services — the server's rule.
													amount: formatRM(recordedSaleTotalRm(recorded)),
												})
											: t.today.logSalesNothingRecorded}
									</p>
									{keptRm > 0 && (
										<p className="iz-tiny iz-muted2">
											{fill(t.today.logSalesKeptNote, {
												amount: formatRM(keptRm),
											})}
										</p>
									)}
									{problem && (
										<p className="iz-tiny text-[var(--iz-red)]">{problem}</p>
									)}
								</div>
								<input
									type="text"
									inputMode="decimal"
									className="iz-field-input w-28"
									aria-label={fill(t.today.logSalesAmountLabel, { name })}
									aria-invalid={problem ? true : undefined}
									value={value}
									disabled={busy}
									onChange={(e) =>
										setDrafts((current) => ({
											...current,
											[key]: e.target.value,
										}))
									}
									onKeyDown={(e) => {
										if (e.key === "Enter") save();
									}}
								/>
								<button
									type="button"
									className="iz-btn iz-btn-gold iz-btn-sm"
									disabled={!canSave}
									onClick={save}
								>
									{savingThis ? t.common.saving : t.common.save}
								</button>
							</div>
						);
					})}
				</div>
			)}
		</OutletSection>
	);
}
