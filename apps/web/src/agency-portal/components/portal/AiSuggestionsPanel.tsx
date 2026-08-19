import {
	AutoAssignSheet,
	plural,
} from "@agency-portal/components/portal/AutoAssignSheet";
import { useAutoAssignPlan } from "@agency-portal/hooks/use-auto-assign-plan";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Layers } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

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
	const { t, locale } = usePortalLocale();
	/**
	 * `plural` appends an "s", which is an English rule. Chinese measure words
	 * ("名 PR", "个空缺岗位") never take a plural form, so the helper is applied
	 * only when English is active — otherwise the panel would read "5 个空缺岗位s".
	 */
	const pl = (n: number, word: string) =>
		locale === "en" ? plural(n, word) : word;

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
					<span>{t.agencyHome.aiSuggestion}</span>
				</div>
				<div className="iz-portal-ai-btn__body">
					<div className="min-w-0 flex-1">
						<div className="font-sora text-sm font-semibold leading-snug">
							{t.agencyHome.openRosterPlanning}
						</div>
						<p className="iz-tiny iz-muted mt-0.5">
							{t.agencyHome.signInToAutoAssign}
						</p>
					</div>
					<ChevronRight className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
				</div>
			</Link>
		);
	}

	const { openSlotCount } = plan;
	const canAssign = plan.pairs.length > 0;

	let title = t.agencyHome.assignAvailablePr;
	let desc = `${plan.pairs.length} ${pl(plan.pairs.length, t.agencyHome.prUnit)} ${t.agencyHome.readyFor} ${openSlotCount} ${pl(openSlotCount, t.agencyHome.openSlotUnit)} ${t.agencyHome.todayWord}`;
	if (isLoading) {
		title = t.agencyHome.checkingRoster;
		desc = t.agencyHome.loadingShiftsAndPrs;
	} else if (isError) {
		title = t.agencyHome.rosterUnavailable;
		desc = t.agencyHome.couldNotLoadShifts;
	} else if (openSlotCount === 0) {
		title = t.agencyHome.noOpenShiftsToday;
		desc = t.agencyHome.everyShiftStaffed;
	} else if (!canAssign) {
		title = `${openSlotCount} ${pl(openSlotCount, t.agencyHome.openSlotUnit)} ${t.agencyHome.todayWord}`;
		// "No free PRs" was said even when ten PRs were idle and merely the wrong
		// tier for what the shift asked for — which sends the agency hunting for
		// staff it already has. The two situations have opposite remedies, so they
		// get different sentences.
		desc =
			plan.tierBlockedCount > 0
				? t.agencyHome.freePrsWrongTier
				: t.agencyHome.everyoneBookedOrInactive;
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
					<span>{t.agencyHome.aiSuggestion}</span>
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
