import { IzSheet } from "@agency-portal/components/iz/Sheet";
import type { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import {
	type AutoAssignPair,
	type AutoAssignPlan,
	dropReasonLabel,
	tierLabel,
} from "@agency-portal/lib/auto-assign";
import { useStore } from "@agency-portal/lib/store";
import { cn } from "@agency-portal/lib/utils";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function plural(n: number, one: string, many = `${one}s`): string {
	return n === 1 ? one : many;
}

export function dayLabel(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d).toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

/** "9pm-3am · Ladies night" — whatever context the shift actually carries. */
function shiftContext(pair: AutoAssignPair): string {
	return [pair.slot, pair.eventName].filter(Boolean).join(" · ");
}

type AutoAssignConfirm = ReturnType<typeof useAutoAssignPlan>["confirm"];

/**
 * The confirm step shared by every auto-assign surface: lists the proposed
 * pairings, lets the agency CHOOSE which ones to write, then writes those.
 *
 * It lives apart from the buttons that open it so the home card and the roster's
 * Planning banner cannot drift into two different meanings of "auto-assign"
 * again — the banner used to run a demo-store action that wrote nothing to the
 * backend at all.
 *
 * ⚠️ Selection is OPT-IN, and that is the point. This sheet used to arrive with
 * every proposed pairing already included and a "Skip" chip on each row, so the
 * default action of the biggest button on screen was "write all of these" and
 * the agency had to notice and decline the ones it did not want. Assigning a PR
 * to a shift is real money and a real person's evening; the safe default is
 * nothing selected. "Select all" is one tap away for the common case.
 */
export function AutoAssignSheet({
	plan,
	confirm,
	onClose,
	scopeLabel,
}: {
	plan: AutoAssignPlan;
	confirm: AutoAssignConfirm;
	onClose: () => void;
	/** Names the dates being filled, already localised, e.g. "today". */
	scopeLabel: string;
}) {
	const toast = useStore((s) => s.toast);
	const { t } = usePortalLocale();
	const [chosen, setChosen] = useState<Set<string>>(new Set());

	const pairKey = (p: AutoAssignPair) => `${p.shiftId}:${p.prId}`;
	const selected = useMemo(
		() => plan.pairs.filter((p) => chosen.has(`${p.shiftId}:${p.prId}`)),
		[plan.pairs, chosen],
	);
	const allChosen = plan.pairs.length > 0 && chosen.size === plan.pairs.length;

	const toggle = (pair: AutoAssignPair) => {
		const key = pairKey(pair);
		setChosen((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const toggleAll = () => {
		setChosen(allChosen ? new Set() : new Set(plan.pairs.map(pairKey)));
	};

	const closeSheet = () => {
		setChosen(new Set());
		onClose();
	};

	const runConfirm = () => {
		confirm.mutate(selected, {
			onSuccess: ({ assigned, failed, dropped }) => {
				if (assigned > 0) {
					toast(
						fill(
							assigned === 1
								? t.rosterGrid.autoAssignDoneOne
								: t.rosterGrid.autoAssignDoneMany,
							{ n: assigned },
						),
						"success",
					);
				}
				// Dropped = the roster moved while the sheet was open, so the pair was
				// never written. Name the reason rather than failing silently.
				if (dropped.length > 0) {
					const reasons = [
						...new Set(dropped.map((d) => dropReasonLabel(d.reason))),
					].join(", ");
					toast(
						fill(
							dropped.length === 1
								? t.rosterGrid.autoAssignDroppedOne
								: t.rosterGrid.autoAssignDroppedMany,
							{ n: dropped.length, reasons },
						),
						"warn",
					);
				}
				if (failed.length > 0) {
					// The SERVER's own reason, verbatim — "This shift already has all 2
					// Tier I it asked for". The count-only version ended in "please
					// retry", which is advice that can never work for a full tier: no
					// amount of retrying opens a third Tier I seat on a shift that asked
					// for two, and the one sentence naming the real obstacle was being
					// thrown away. Distinct messages only, so five identical refusals do
					// not print five times.
					const reasons = [
						...new Set(failed.map((f) => f.message).filter(Boolean)),
					];
					toast(
						fill(
							failed.length === 1
								? t.rosterGrid.autoAssignFailedOne
								: t.rosterGrid.autoAssignFailedMany,
							{
								n: failed.length,
								reasons:
									reasons.length > 0
										? reasons.join(" · ")
										: t.rosterGrid.autoAssignFailedNoReason,
							},
						),
						"warn",
					);
				}
				// Kept open when anything did not land, so the agency can see what.
				if (failed.length > 0 || dropped.length > 0) return;
				closeSheet();
			},
			onError: () => {
				toast(t.rosterGrid.autoAssignErrorToast, "warn");
			},
		});
	};

	const { freePrCount, unfilledCount, tierBlockedCount } = plan;

	return (
		<IzSheet open onClose={closeSheet}>
			<div className="iz-sheet-head">
				<div>
					<h3>{t.rosterGrid.autoAssignTitle}</h3>
					<p className="iz-tiny iz-muted mt-1">
						{t.rosterGrid.autoAssignIntro}
					</p>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={closeSheet}
					aria-label={t.common.close}
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="mb-2 flex items-center justify-between gap-2">
				<span className="iz-post-job-pr-badge">
					{fill(t.rosterGrid.autoAssignSelectedOf, {
						n: chosen.size,
						total: plan.pairs.length,
					})}
				</span>
				<button
					type="button"
					onClick={toggleAll}
					className="iz-tiny font-semibold text-[var(--iz-gold)]"
				>
					{allChosen
						? t.rosterGrid.autoAssignClear
						: fill(t.rosterGrid.autoAssignSelectAll, { n: plan.pairs.length })}
				</button>
			</div>

			<div className="space-y-2">
				{plan.pairs.map((pair) => {
					const key = pairKey(pair);
					const on = chosen.has(key);
					const context = shiftContext(pair);
					return (
						<button
							key={key}
							type="button"
							onClick={() => toggle(pair)}
							aria-pressed={on}
							className={cn(
								// items-START, not centre: the rows are multi-line now, and a
								// centred tick drifts down the taller ones.
								"flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
								on
									? "border-[var(--iz-gold)] bg-[rgba(232,194,122,0.06)]"
									: "border-[var(--iz-line)]",
							)}
						>
							<span
								className={cn(
									"mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
									on
										? "border-[var(--iz-gold)] bg-[var(--iz-gold)] text-black"
										: "border-[var(--iz-line2)]",
								)}
								aria-hidden
							>
								{on && <Check className="h-3 w-3" />}
							</span>
							{/* WHO (line 1), WHY THEY RANK HERE (line 2), WHAT THEY WOULD GET
							    (line 3).

							    ⚠️ This was ONE `truncate`d line carrying all four facts inline,
							    and both halves failed at once. The pill sat directly against the
							    tier with no separator between them, so it read as
							    "Tier I⟨Outlet request⟩" with the chip overlapping the numeral.
							    And the detail line lost the end of the window and the whole
							    event name to the ellipsis — "· 16:00 - 20:00 · THURSD…" — which
							    is the half an agency actually reads before committing someone's
							    evening.

							    Chips WRAP now rather than truncate: a chip pushed off the end is
							    the one thing the row exists to say. Keep the gap utilities on
							    these flex rows — `ml-2` on an inline span is what produced the
							    collision, because a pill is a flex box and takes no margin from
							    the text beside it. */}
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
									<span className="text-sm font-semibold">{pair.prName}</span>
									<span className="iz-tiny iz-muted2">
										{tierLabel(pair.prTier)}
									</span>
								</div>
								{/* The venue's ask and the venue history are mutually exclusive
								    by design: a requested PR is already at the top for the
								    stronger reason, so drawing both would only bury the one that
								    decided the order. */}
								<div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
									{pair.requestedByVenue && (
										<span className="iz-pill iz-pill-amber !px-2 !py-0.5 !text-[9px] !leading-normal">
											{t.rosterGrid.outletRequest}
										</span>
									)}
									{!pair.requestedByVenue && pair.workedHereBefore && (
										<span className="iz-pill iz-pill-green !px-2 !py-0.5 !text-[9px] !leading-normal">
											{t.rosterGrid.autoAssignWorkedHere}
										</span>
									)}
									<span className="iz-tiny iz-muted2">
										{fill(
											pair.shiftsThisWeek === 1
												? t.rosterGrid.autoAssignShiftsThisWeekOne
												: t.rosterGrid.autoAssignShiftsThisWeekMany,
											{ n: pair.shiftsThisWeek },
										)}
									</span>
								</div>
								<p className="iz-tiny iz-muted mt-1 leading-snug">
									→ {pair.outletName} · {dayLabel(pair.shiftDate)}
									{context ? ` · ${context}` : ""}
								</p>
							</div>
						</button>
					);
				})}
			</div>

			{unfilledCount > 0 && (
				<p className="iz-tiny iz-muted2 mt-3 leading-snug">
					{/* Two different shortages, two different remedies. Blaming the head
					    count while PRs sit idle read as a contradiction — "4 slots cannot
					    be filled, only 10 free PRs" — and pointed the agency at hiring
					    when the fix was the shift's tier mix. */}
					{tierBlockedCount > 0 ? (
						<>
							{fill(
								tierBlockedCount === 1
									? t.rosterGrid.autoAssignTierBlockedOne
									: t.rosterGrid.autoAssignTierBlockedMany,
								{ n: tierBlockedCount, scope: scopeLabel },
							)}
							{unfilledCount > tierBlockedCount && (
								<>
									{" "}
									{fill(t.rosterGrid.autoAssignTierBlockedRest, {
										n: unfilledCount - tierBlockedCount,
									})}
								</>
							)}
						</>
					) : (
						fill(
							unfilledCount === 1
								? t.rosterGrid.autoAssignShortOne
								: t.rosterGrid.autoAssignShortMany,
							{ n: unfilledCount, prs: freePrCount, scope: scopeLabel },
						)
					)}
				</p>
			)}

			<button
				type="button"
				className="iz-btn iz-btn-primary mt-3 w-full"
				disabled={selected.length === 0 || confirm.isPending}
				onClick={runConfirm}
			>
				{confirm.isPending
					? t.rosterGrid.autoAssignAssigning
					: selected.length === 0
						? t.rosterGrid.autoAssignPickSome
						: fill(
								selected.length === 1
									? t.rosterGrid.autoAssignConfirmOne
									: t.rosterGrid.autoAssignConfirmMany,
								{ n: selected.length },
							)}
			</button>
		</IzSheet>
	);
}
