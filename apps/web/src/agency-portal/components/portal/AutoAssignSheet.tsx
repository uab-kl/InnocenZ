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
								"flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
								on
									? "border-[var(--iz-gold)] bg-[rgba(232,194,122,0.06)]"
									: "border-[var(--iz-line)]",
							)}
						>
							<span
								className={cn(
									"flex h-4 w-4 shrink-0 items-center justify-center rounded border",
									on
										? "border-[var(--iz-gold)] bg-[var(--iz-gold)] text-black"
										: "border-[var(--iz-line2)]",
								)}
								aria-hidden
							>
								{on && <Check className="h-3 w-3" />}
							</span>
							<div className="min-w-0 flex-1">
								<p className="truncate text-sm font-semibold">
									{pair.prName}
									<span className="iz-tiny iz-muted2 ml-2 font-normal">
										{tierLabel(pair.prTier)}
								{pair.requestedByVenue && (
									<span className="iz-pill iz-pill-amber !py-0 !text-[9px]">
										{t.rosterGrid.outletRequest}
									</span>
								)} ·{" "}
										{fill(
											pair.shiftsThisWeek === 1
												? t.rosterGrid.autoAssignShiftsThisWeekOne
												: t.rosterGrid.autoAssignShiftsThisWeekMany,
											{ n: pair.shiftsThisWeek },
										)}
									</span>
								</p>
								<p className="iz-tiny iz-muted mt-0.5 truncate">
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
