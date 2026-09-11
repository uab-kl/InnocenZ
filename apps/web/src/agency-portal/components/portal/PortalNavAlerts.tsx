import { NavAlertContext } from "@agency-portal/components/portal/NavAlertBadge";
import { useAgencyApprovalQueue } from "@agency-portal/hooks/use-agency-approval-queue";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useAgencyPvs } from "@agency-portal/hooks/use-agency-pvs";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import { useOrgMembersQuery } from "@agency-portal/hooks/use-org-members";
import { useOutletToday } from "@agency-portal/hooks/use-outlet-today";
import { useUnpaidBilling } from "@agency-portal/hooks/use-unpaid-billing";
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
	const { pvs } = useAgencyPvs();
	const { disputes } = useAgencyDisputes();
	const { receipts } = useAgencyReceipts();
	const { claims: overtime } = useAgencyOvertime();
	const billing = useUnpaidBilling("agency");

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

	return (
		<NavAlertContext.Provider value={alerts}>
			{children}
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
	const pendingMembers = useMemo(
		() => (memberRows.data ?? []).filter((m) => m.status !== "active").length,
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

	return (
		<NavAlertContext.Provider value={alerts}>
			{children}
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
