import { IzSheet } from "@agency-portal/components/iz/Sheet";
import type { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import {
	type AutoAssignPair,
	type AutoAssignPlan,
	dropReasonLabel,
	tierLabel,
} from "@agency-portal/lib/auto-assign";
import { useStore } from "@agency-portal/lib/store";
import { X } from "lucide-react";
import { useMemo, useState } from "react";

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

/** "9pm–3am · Ladies night" — whatever context the shift actually carries. */
function shiftContext(pair: AutoAssignPair): string {
	return [pair.slot, pair.eventName].filter(Boolean).join(" · ");
}

type AutoAssignConfirm = ReturnType<typeof useAutoAssignPlan>["confirm"];

/**
 * The confirm step shared by every auto-assign surface: lists the proposed
 * pairings, lets the agency skip any of them, then writes the rest.
 *
 * It lives apart from the buttons that open it so the home card and the roster's
 * Planning banner cannot drift into two different meanings of "auto-assign"
 * again — the banner used to run a demo-store action that wrote nothing to the
 * backend at all.
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
	/** Names the dates being filled, e.g. "today" or "on Tue, 11 Aug". */
	scopeLabel: string;
}) {
	const toast = useStore((s) => s.toast);
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
		setSkipped(new Set());
		onClose();
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

	const { freePrCount, unfilledCount } = plan;

	return (
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
					{unfilledCount} open {plural(unfilledCount, "slot")} cannot be filled
					— only {freePrCount} free {plural(freePrCount, "PR")} {scopeLabel}.
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
	);
}
