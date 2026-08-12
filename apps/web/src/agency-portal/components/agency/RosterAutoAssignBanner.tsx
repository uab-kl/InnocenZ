import {
	AutoAssignSheet,
	dayLabel,
	plural,
} from "@agency-portal/components/portal/AutoAssignSheet";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { useStore } from "@agency-portal/lib/store";
import { useState } from "react";

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

	if (!backed) {
		return (
			<button
				type="button"
				className="iz-roster-auto-assign"
				onClick={() => demoAutoAssignPr(dateIso)}
			>
				AI auto-assign next free PR · {dateIso}
			</button>
		);
	}

	const { openSlotCount } = plan;
	const day = dayLabel(dateIso);
	const canAssign = plan.pairs.length > 0;

	let label = `AI auto-assign · ${plan.pairs.length} ${plural(plan.pairs.length, "PR")} for ${openSlotCount} open ${plural(openSlotCount, "slot")} · ${day}`;
	if (isLoading) {
		label = `Checking the roster for ${day}…`;
	} else if (isError) {
		label = "Roster unavailable — could not load shifts";
	} else if (openSlotCount === 0) {
		label = `No open slots on ${day} — every shift is fully staffed`;
	} else if (!canAssign) {
		label = `${openSlotCount} open ${plural(openSlotCount, "slot")} on ${day} — no free PRs`;
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
