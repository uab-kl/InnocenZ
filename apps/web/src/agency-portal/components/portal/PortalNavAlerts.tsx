import {
	NavAlertContext,
	NavAlertSettledContext,
	PortalTodoCountsContext,
} from "@agency-portal/components/portal/NavAlertBadge";
import { useAgencyApprovalQueue } from "@agency-portal/hooks/use-agency-approval-queue";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { useOrgMembersQuery } from "@agency-portal/hooks/use-org-members";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { useUnpaidBilling } from "@agency-portal/hooks/use-unpaid-billing";
import { isMemberWaiting } from "@agency-portal/lib/member-queue-state";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import {
	countPvsNeedingAction,
	countReceiptsNeedingAction,
	voucherIdsWithOpenDispute,
} from "@agency-portal/lib/payroll-action-counts";
import {
	agencyNavAlerts,
	countShiftsNeedingStaff,
	outletNavAlerts,
} from "@agency-portal/lib/portal-nav-alerts";
import { type ReactNode, useMemo } from "react";

/**
 * The agency's counts, from the SAME hooks and the SAME query keys the pages
 * behind them use.
 *
 * That is the whole design constraint. A badge is a promise about a page, and
 * the way a badge starts lying is by being fed its own copy of the data — the
 * home hub's tiles read the demo store while `/agency/pv` read the backend, so
 * they said 0 next to a page listing real work (see AgencyHomeHubTabs). Sharing
 * react-query keys means no extra request AND no second opinion: the rail and
 * the page cannot disagree, because there is only one answer.
 */
function AgencyNavAlerts({ children }: { children: ReactNode }) {
	const approvals = useAgencyApprovalQueue();
	const { pvs, isLoading: pvsLoading } = useAgencyPvs();
	const { disputes, isLoading: disputesLoading } = useAgencyDisputes();
	const { receipts, isLoading: receiptsLoading } = useAgencyReceipts();
	const { claims: overtime, isLoading: overtimeLoading } = useAgencyOvertime();
	const billing = useUnpaidBilling("agency");
	/*
	 * EVERY approval term, not just cutlost + MC/leave (owner, 18 Nov 2026 —
	 * "yes fix the to do panel"). `approvals.isLoading` left out sign-ups,
	 * venue links and team members, so the To do panel could say "All clear"
	 * and then grow an Approvals row a moment later. `totalIsLoading` waits for
	 * all five reads behind `approvals.total`, the number the row shows.
	 *
	 * The flag does three things: it picks the line under the To do list
	 * ("Checking…" or All clear), it lets TodoPanel mark the list settled — the
	 * only state in which its "start here" ring plays (portal-motion.css M3) —
	 * and it is the rail badges' "settled" flag (`badgesSettled`, below), so a
	 * count landing late is not popped as news.
	 *
	 * It does NOT hold the rows back: each row still mounts as its own count
	 * lands. The ring is what waits, and TodoPanel's settled latch is sticky, so
	 * a row landing above one already shown can no longer ring gold a second time.
	 */
	const todoLoading =
		approvals.totalIsLoading ||
		pvsLoading ||
		disputesLoading ||
		receiptsLoading ||
		overtimeLoading ||
		billing.isLoading;

	const alerts = useMemo(
		() =>
			agencyNavAlerts({
				approvals: approvals.total,
				/*
				 * THE SAME RULE THE PAYROLL PAGE COUNTS BY — one meaning, two
				 * windows (owner's call, 7 Sep 2026).
				 *
				 * This was `status === "PENDING_REVIEW"` alone while the page behind
				 * it counted PENDING_REVIEW + SIGNED + DISPUTED, so the rail and the
				 * tabs it points at answered "what is outstanding" with two different
				 * numbers. A badge is a promise about a page, and two rules is how it
				 * stops being one.
				 *
				 * The rail counts EVERY week while the page splits three windows, so
				 * the totals still need not match digit for digit. What is now true
				 * is that a thing counted here is a thing counted there.
				 */
				vouchers: countPvsNeedingAction(
					pvs,
					voucherIdsWithOpenDispute(disputes),
				),
				disputes: disputes.length,
				receipts: countReceiptsNeedingAction(receipts),
				// Every row this endpoint returns is undecided — that is what it
				// selects on — so there is nothing further to filter.
				overtime: overtime.length,
				unpaidPeriods: billing.periods,
			}),
		[
			approvals.total,
			pvs,
			disputes,
			receipts,
			overtime.length,
			billing.periods,
		],
	);

	// The same numbers, kept apart for the Today page's To do panel — one
	// computation, so a row and the pill it sits behind cannot disagree.
	const todo = useMemo(
		() => ({
			loading: todoLoading,
			counts: {
				approvals: approvals.total,
				vouchers: countPvsNeedingAction(
					pvs,
					voucherIdsWithOpenDispute(disputes),
				),
				disputes: disputes.length,
				receipts: countReceiptsNeedingAction(receipts),
				overtime: overtime.length,
			},
		}),
		[todoLoading, approvals.total, pvs, disputes, receipts, overtime.length],
	);

	// The badges wait for EVERY query behind them — the same flag as the To do
	// panel, which now covers every approval term too. Until then a number
	// arriving is the page loading, not news — see `NavAlertSettledContext`.
	const badgesSettled = !todoLoading;

	return (
		<NavAlertContext.Provider value={alerts}>
			<NavAlertSettledContext.Provider value={badgesSettled}>
				<PortalTodoCountsContext.Provider value={todo}>
					{children}
				</PortalTodoCountsContext.Provider>
			</NavAlertSettledContext.Provider>
		</NavAlertContext.Provider>
	);
}

/**
 * The outlet's counts.
 *
 * `useOutletToday()` is called with no arguments on purpose: that is the same
 * window the Today page asks for, so the two share one cache entry and the rail
 * costs nothing extra on the screen it most often sits beside.
 */
function OutletNavAlerts({ children }: { children: ReactNode }) {
	const today = useOutletToday();
	const billing = useUnpaidBilling("outlet");
	// The same key Settings reads, so badge and panel are one answer.
	const outletId = useMemo(() => getOutletIdentity()?.outletId ?? null, []);
	const memberRows = useOrgMembersQuery("outlet", outletId);
	/*
	 * ⚠️ WAITING, not "not active" — the venue's twin of the agency bug.
	 *
	 * `rejected` and `inactive` are decisions already taken, so counting them
	 * puts a number on the rail for work nobody can do. Found while fixing the
	 * agency side, where Atlas showed 2 over a queue reading "Waiting (0) ·
	 * Declined (1) · Deactivated (1)"; this copy carried the same predicate.
	 *
	 * ⚠️ Invisible here TODAY — all 13 outlet memberships are active, so it reads
	 * 0 either way. Which is precisely why it had to be fixed alongside the
	 * agency one, rather than left for the day a venue declines somebody.
	 */
	const pendingMembers = useMemo(
		() => (memberRows.data ?? []).filter(isMemberWaiting).length,
		[memberRows.data],
	);

	const alerts = useMemo(
		() =>
			outletNavAlerts({
				shiftsNeedingStaff: countShiftsNeedingStaff(today.shifts),
				unpaidPeriods: billing.periods,
				pendingMembers,
			}),
		[today.shifts, billing.periods, pendingMembers],
	);

	const todoLoading =
		today.isLoading || billing.isLoading || memberRows.isLoading;
	const todo = useMemo(
		() => ({
			loading: todoLoading,
			counts: {
				shiftsNeedingStaff: countShiftsNeedingStaff(today.shifts),
				pendingMembers,
			},
		}),
		[todoLoading, today.shifts, pendingMembers],
	);

	// The same three reads feed every outlet badge, so their flag is the
	// badges' too.
	return (
		<NavAlertContext.Provider value={alerts}>
			<NavAlertSettledContext.Provider value={!todoLoading}>
				<PortalTodoCountsContext.Provider value={todo}>
					{children}
				</PortalTodoCountsContext.Provider>
			</NavAlertSettledContext.Provider>
		</NavAlertContext.Provider>
	);
}

/**
 * Counts for the portal rail, one portal at a time.
 *
 * The two branches are separate COMPONENTS rather than one hook taking a
 * `portal` argument, and that is not a style choice: hooks cannot be called
 * conditionally, so a single hook would have to run the agency queries inside
 * an outlet session. Those endpoints are agency-scoped, so a venue signing in
 * would fire a handful of requests it has no business making and cannot read.
 * Mounting one branch or the other is the only shape that asks nothing it is
 * not entitled to.
 */
export function PortalNavAlerts({
	portal,
	children,
}: {
	portal: "agency" | "outlet";
	children: ReactNode;
}) {
	if (portal === "agency") return <AgencyNavAlerts>{children}</AgencyNavAlerts>;
	return <OutletNavAlerts>{children}</OutletNavAlerts>;
}
