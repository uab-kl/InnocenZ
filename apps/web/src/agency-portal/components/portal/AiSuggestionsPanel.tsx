import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import {
	type AutoAssignPair,
	dropReasonLabel,
	tierLabel,
} from "@agency-portal/lib/auto-assign";
import { useStore } from "@agency-portal/lib/store";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Layers, X } from "lucide-react";
import { useMemo, useState } from "react";

function plural(n: number, one: string, many = `${one}s`): string {
	return n === 1 ? one : many;
}

function dayLabel(iso: string): string {
	const [y, m, d] = iso.split("-").map(Number);
	return new Date(y, m - 1, d).toLocaleDateString("en-MY", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

/** "9pm–3am · Ladies night" — whatever context the shift actually carries. */
function shiftContext(pair: AutoAssignPair): string {
	return [pair.slot, pair.eventName].filter(Boolean).join(" · ");
}

/**
 * Home-screen action card: proposes which PRs to put on today's unfilled shifts
 * and writes them once the agency confirms.
 *
 * The suggestion comes from the backend roster (open slots = a shift's quantity
 * minus its staffing assignments), NOT from the demo store — the card used to
 * name hardcoded demo outlets whenever no demo data was loaded.
 */
export function AiSuggestionsPanel() {
	const toast = useStore((s) => s.toast);
	// Today only for now; switching to "week" fills the whole payroll week.
	const { backed, plan, isLoading, isError, confirm } =
		useAutoAssignPlan("today");
	const [open, setOpen] = useState(false);
	const [skipped, setSkipped] = useState<Set<string>>(new Set());

	const pairKey = (p: AutoAssignPair) => `${p.shiftId}:${p.prId}`;
	const selected = useMemo(
		() => plan.pairs.filter((p) => !skipped.has(`${p.shiftId}:${p.prId}`)),
		[plan.pairs, skipped],
	);

	const toggleSkip = (pair: AutoAssignPair) => {
		const key = pairKey(pair);
		setSkipped((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const closeSheet = () => {
		setOpen(false);
		setSkipped(new Set());
	};

	const runConfirm = () => {
		confirm.mutate(selected, {
			onSuccess: ({ assigned, failed, dropped }) => {
				if (assigned > 0) {
					toast(
						`Assigned ${assigned} ${plural(assigned, "PR")} to open ${plural(assigned, "shift")}`,
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
						`Skipped ${dropped.length} ${plural(dropped.length, "PR")} — ${reasons}`,
						"warn",
					);
				}
				if (failed.length > 0) {
					toast(
						`${failed.length} ${plural(failed.length, "assignment")} could not be made — please retry`,
						"warn",
					);
				}
				// Kept open when anything did not land, so the agency can see what.
				if (failed.length > 0 || dropped.length > 0) return;
				closeSheet();
			},
			onError: () => {
				toast("Could not assign — please try again", "warn");
			},
		});
	};

	// Demo session: no backend roster to plan against, so just point at planning.
	if (!backed) {
		return (
			<Link
				to="/agency/roster"
				search={{ view: "planning" }}
				className="iz-portal-ai-btn"
			>
				<div className="iz-portal-ai-btn__label">
					<Layers
						className="h-4 w-4 text-[var(--iz-violet)]"
						strokeWidth={1.8}
					/>
					<span>AI suggestion</span>
				</div>
				<div className="iz-portal-ai-btn__body">
					<div className="min-w-0 flex-1">
						<div className="font-sora text-sm font-semibold leading-snug">
							Open roster planning
						</div>
						<p className="iz-tiny iz-muted mt-0.5">
							Sign in to an agency to auto-assign
						</p>
					</div>
					<ChevronRight className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
				</div>
			</Link>
		);
	}

	const { openSlotCount, freePrCount, unfilledCount } = plan;
	const canAssign = plan.pairs.length > 0;

	let title = "Assign available PR";
	let desc = `${plan.pairs.length} ${plural(plan.pairs.length, "PR")} ready for ${openSlotCount} open ${plural(openSlotCount, "slot")} today`;
	if (isLoading) {
		title = "Checking today's roster";
		desc = "Loading shifts and available PRs";
	} else if (isError) {
		title = "Roster unavailable";
		desc = "Could not load shifts — try again shortly";
	} else if (openSlotCount === 0) {
		title = "No open shifts today";
		desc = "Every posted shift is fully staffed";
	} else if (!canAssign) {
		title = `${openSlotCount} open ${plural(openSlotCount, "slot")} today`;
		desc = "No free PRs — everyone is booked or inactive";
	}

	return (
		<>
			<button
				type="button"
				className="iz-portal-ai-btn w-full text-left"
				disabled={!canAssign}
				onClick={() => setOpen(true)}
			>
				<div className="iz-portal-ai-btn__label">
					<Layers
						className="h-4 w-4 text-[var(--iz-violet)]"
						strokeWidth={1.8}
					/>
					<span>AI suggestion</span>
				</div>
				<div className="iz-portal-ai-btn__body">
					<div className="min-w-0 flex-1">
						<div className="font-sora text-sm font-semibold leading-snug">
							{title}
						</div>
						<p className="iz-tiny iz-muted mt-0.5">{desc}</p>
					</div>
					<ChevronRight className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
				</div>
			</button>

			{open && (
				<IzSheet open onClose={closeSheet}>
					<div className="iz-sheet-head">
						<div>
							<h3>Assign available PR</h3>
							<p className="iz-tiny iz-muted mt-1">
								Best match by tier, then fewest shifts this week. Nothing is
								assigned until you confirm.
							</p>
						</div>
						<button
							type="button"
							className="iz-sheet-close"
							onClick={closeSheet}
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>
					</div>

					<div className="space-y-2">
						{plan.pairs.map((pair) => {
							const key = pairKey(pair);
							const isSkipped = skipped.has(key);
							const context = shiftContext(pair);
							return (
								<div
									key={key}
									className={`flex items-center gap-3 rounded-xl border border-[var(--iz-line)] px-3 py-2.5 ${
										isSkipped ? "opacity-45" : ""
									}`}
								>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-semibold">
											{pair.prName}
											<span className="iz-tiny iz-muted2 ml-2 font-normal">
												{tierLabel(pair.prTier)} · {pair.shiftsThisWeek}{" "}
												{plural(pair.shiftsThisWeek, "shift")} this week
											</span>
										</p>
										<p className="iz-tiny iz-muted mt-0.5 truncate">
											→ {pair.outletName} · {dayLabel(pair.shiftDate)}
											{context ? ` · ${context}` : ""}
										</p>
									</div>
									<button
										type="button"
										className="iz-chip !px-2 !py-1 !text-[10px]"
										onClick={() => toggleSkip(pair)}
									>
										{isSkipped ? "Include" : "Skip"}
									</button>
								</div>
							);
						})}
					</div>

					{unfilledCount > 0 && (
						<p className="iz-tiny iz-muted2 mt-3 leading-snug">
							{unfilledCount} open {plural(unfilledCount, "slot")} cannot be
							filled — only {freePrCount} free {plural(freePrCount, "PR")}{" "}
							today.
						</p>
					)}

					<button
						type="button"
						className="iz-btn iz-btn-primary mt-3 w-full"
						disabled={selected.length === 0 || confirm.isPending}
						onClick={runConfirm}
					>
						{confirm.isPending
							? "Assigning…"
							: `Confirm ${selected.length} ${plural(selected.length, "assignment")}`}
					</button>
				</IzSheet>
			)}
		</>
	);
}
