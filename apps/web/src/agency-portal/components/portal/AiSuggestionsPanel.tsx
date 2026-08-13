import {
	AutoAssignSheet,
	plural,
} from "@agency-portal/components/portal/AutoAssignSheet";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Layers } from "lucide-react";
import { useState } from "react";

/**
 * Home-screen action card: proposes which PRs to put on today's unfilled shifts
 * and writes them once the agency confirms.
 *
 * The suggestion comes from the backend roster (open slots = a shift's quantity
 * minus its staffing assignments), NOT from the demo store — the card used to
 * name hardcoded demo outlets whenever no demo data was loaded.
 *
 * The confirm step is `AutoAssignSheet`, shared with the roster's Planning
 * banner so both surfaces plan and write identically.
 */
export function AiSuggestionsPanel() {
	// Today only for now; switching to "week" fills the whole payroll week.
	const { backed, plan, isLoading, isError, confirm } =
		useAutoAssignPlan("today");
	const [open, setOpen] = useState(false);

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

	const { openSlotCount } = plan;
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
		// "No free PRs" was said even when ten PRs were idle and merely the wrong
		// tier for what the shift asked for — which sends the agency hunting for
		// staff it already has. The two situations have opposite remedies, so they
		// get different sentences.
		desc =
			plan.tierBlockedCount > 0
				? "Free PRs today are not the tiers these shifts asked for"
				: "No free PRs — everyone is booked or inactive";
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
				<AutoAssignSheet
					plan={plan}
					confirm={confirm}
					onClose={() => setOpen(false)}
					scopeLabel="today"
				/>
			)}
		</>
	);
}
