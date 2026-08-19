import {
	AutoAssignSheet,
	dayLabel,
} from "@agency-portal/components/portal/AutoAssignSheet";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { useStore } from "@agency-portal/lib/store";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * The roster Planning tab's auto-assign banner.
 *
 * 🔴 This used to call the demo-store action `demoAutoAssignPr`, which reads
 * `store.shifts` / `store.agencyRoster` and writes with `assignPrToOutlet` — a
 * plain `set()`, never an API call. But the Planning grid beside it renders
 * BACKEND rows (`RosterBackendTimetable` over `useRosterSlots`), so on a real
 * agency login the action looked at empty demo slices and either warned "No open
 * outlet shifts on this date" or wrote a row nothing on screen reads. Same
 * failure family as the cancel/no-show handlers a few lines up in the route:
 * *when a screen changes where its rows come from, every action has to move with
 * them.*
 *
 * It now runs the same backend plan as the home card, scoped to the date the
 * agency is looking at instead of to today. The demo store keeps the old
 * one-PR-at-a-time action, and only demo sessions ever reach it.
 */
export function RosterAutoAssignBanner({ dateIso }: { dateIso: string }) {
	const demoAutoAssignPr = useStore((s) => s.demoAutoAssignPr);
	const { backed, plan, isLoading, isError, confirm } = useAutoAssignPlan({
		dateIso,
	});
	const [open, setOpen] = useState(false);
	const { t } = usePortalLocale();

	if (!backed) {
		return (
			<button
				type="button"
				className="iz-roster-auto-assign"
				onClick={() => demoAutoAssignPr(dateIso)}
			>
				{fill(t.rosterGrid.autoAssignNextFreeDate, { date: dateIso })}
			</button>
		);
	}

	const { openSlotCount } = plan;
	const day = dayLabel(dateIso);
	const canAssign = plan.pairs.length > 0;

	// Counted nouns resolve first, then drop into the sentence template. Going
	// through the dictionary for the noun as well as the sentence is what lets
	// Chinese put the day in front and use a measure word, which no amount of
	// gluing English fragments could express.
	const prs = fill(
		plan.pairs.length === 1
			? t.rosterGrid.prCountOne
			: t.rosterGrid.prCountMany,
		{ n: plan.pairs.length },
	);
	const slots = fill(
		openSlotCount === 1
			? t.rosterGrid.slotCountOne
			: t.rosterGrid.slotCountMany,
		{ n: openSlotCount },
	);

	let label = fill(t.rosterGrid.autoAssignPlan, { prs, slots, day });
	if (isLoading) {
		label = fill(t.rosterGrid.autoAssignChecking, { day });
	} else if (isError) {
		label = t.rosterGrid.autoAssignError;
	} else if (openSlotCount === 0) {
		label = fill(t.rosterGrid.autoAssignNoOpenSlots, { day });
	} else if (!canAssign) {
		label = fill(t.rosterGrid.autoAssignNoFreePrs, { slots, day });
	}

	return (
		<>
			<button
				type="button"
				className="iz-roster-auto-assign"
				disabled={!canAssign}
				onClick={() => setOpen(true)}
			>
				{label}
			</button>

			{open && (
				<AutoAssignSheet
					plan={plan}
					confirm={confirm}
					onClose={() => setOpen(false)}
					scopeLabel={`on ${day}`}
				/>
			)}
		</>
	);
}
