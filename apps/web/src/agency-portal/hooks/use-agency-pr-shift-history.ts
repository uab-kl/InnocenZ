import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchShiftAssignments,
	type ShiftAssignmentStatus,
} from "@/services/shift-assignment";

/**
 * One worked shift as the Manage-PR detail card renders it.
 *
 * There is deliberately NO payout here. The sealed wage lives on the payment
 * voucher line, and re-deriving it from a rate card would create a second
 * source of truth for money that could disagree with the voucher the agency
 * actually pays. Showing the shift without the amount is the honest half.
 */
export interface PrShiftHistoryRow {
	id: string;
	/** "12 Jul 2026" — same format the ratings feed uses. */
	dateDisplay: string;
	outlet: string;
	/** Sort key; the display string is not sortable. */
	dateIso: string;
	status: ShiftAssignmentStatus;
}

/**
 * How a shift ENDED, for the rows where that is not "worked normally".
 *
 * A no-show rendered identically to a completed shift is not a cosmetic
 * problem: the Suspend and Detach buttons sit directly below this list, so an
 * unmarked absence reads as attendance to whoever is deciding. Clean shifts stay
 * unlabelled — marking everything is the same as marking nothing.
 */
export function shiftOutcomeLabel(
	status: ShiftAssignmentStatus,
): { label: string; tone: "red" | "amber" } | null {
	switch (status) {
		case "no_show":
			return { label: "No-show", tone: "red" };
		case "cancelled":
			return { label: "Cancelled", tone: "red" };
		case "leave_approved":
			return { label: "Leave", tone: "amber" };
		case "leave_pending":
			return { label: "Leave pending", tone: "amber" };
		default:
			return null;
	}
}

function displayDate(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return iso;
	return at.toLocaleDateString(undefined, {
		day: "numeric",
		month: "short",
		year: "numeric",
	});
}

export interface UsePrShiftHistoryResult {
	/** False for demo sessions — the caller falls back to its demo store. */
	backed: boolean;
	rows: PrShiftHistoryRow[];
	isLoading: boolean;
}

/**
 * Shifts one PR has worked, for the agency's Manage-PR detail screen.
 *
 * This section used to read the demo zustand store and filter it with
 * `r.prId === detail.id` — a real backend uuid compared against demo ids like
 * `pr_tied`, which can never match, so the card was permanently blank.
 *
 * No client-side agency filter: `GET /shift-assignment` pins a non-admin caller
 * to its own `agencyId` server-side, so another agency's PR id returns nothing.
 * That is a real scope check, not just a role gate — do not add a client filter
 * and assume it is the one protecting this.
 */
export function useAgencyPrShiftHistory(
	prId: string | null,
): UsePrShiftHistoryResult {
	const { logout } = useAuth();
	const backed = getAgencyIdentity() !== null;
	const enabled = backed && Boolean(prId);

	const query = useQuery({
		queryKey: ["agency", "pr-shift-history", prId],
		queryFn: () =>
			fetchShiftAssignments({ prId: prId ?? undefined, pageSize: 100 }, logout),
		enabled,
		staleTime: 60_000,
	});

	const rows = useMemo<PrShiftHistoryRow[]>(() => {
		const assignments = query.data?.data ?? [];
		// `GET /shift-assignment` returns every assignment, including ones rostered
		// for NEXT week. A section titled "Shift history" that lists shifts nobody
		// has worked yet is lying about what it is, so cut at today.
		const todayIso = new Date().toLocaleDateString("en-CA");
		return assignments
			.filter(
				(a) => Boolean(a.shiftDate) && (a.shiftDate as string) <= todayIso,
			)
			.map((a) => ({
				id: a.id,
				dateIso: a.shiftDate as string,
				dateDisplay: displayDate(a.shiftDate as string),
				// A shift whose outlet row is missing still happened — name it rather
				// than dropping the row and under-reporting what the PR worked.
				outlet: a.outletName?.trim() || "Unknown outlet",
				status: a.status,
			}))
			.sort((a, b) => (a.dateIso < b.dateIso ? 1 : -1));
	}, [query.data]);

	return { backed, rows, isLoading: query.isLoading };
}
