import type {
	AgencyManagedPR,
	AgencyRosterSlot,
} from "@agency-portal/lib/agency-demo";
import {
	rosterSlotsFromBackend,
	shiftRequestFromBackendShift,
} from "@agency-portal/lib/backend-shift-map";
import { addDaysToIso, getLiveTodayIso } from "@agency-portal/lib/demo-clock";
import { getOutletIdentity } from "@agency-portal/lib/outlet-identity";
import { managedPrFromBackend } from "@agency-portal/lib/pr-personnel-map";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchPrPersonnel } from "@/services/pr-personnel";
import { fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";

// Today shows tonight's shift, so a fortnight ahead is plenty. The Calendar
// screen pages through months in both directions and passes its own window.
const DEFAULT_LOOKAHEAD_DAYS = 14;
const DEFAULT_LOOKBEHIND_DAYS = 0;

export interface OutletTodayData {
	backed: boolean;
	/** Tonight + upcoming shifts at this outlet. */
	shifts: ShiftRequest[];
	/** One slot per assigned PR — what the detail panels match `shift.prs` against. */
	roster: AgencyRosterSlot[];
	/** PR records for those ids — the panels drop any id they cannot resolve. */
	prs: AgencyManagedPR[];
	isLoading: boolean;
}

/**
 * Backend-driven data for the outlet Today / Calendar screens. Gated on a real
 * session (`getOutletIdentity()` non-null): backed sessions get live data, demo
 * sessions get `backed: false` so the screens keep their demo store.
 *
 * Returns BOTH halves the cards need, because they are cross-referenced: a card
 * is a `ShiftRequest` whose `prs` are assignment PR ids, and the staffing /
 * detail panels resolve those ids against roster slots. Feeding one without the
 * other renders a shift with nobody on it.
 *
 * Read-only. The live-ops actions on these panels (log sales, check-in, release
 * early, cut-loss) have no outlet-writable endpoint — assignment writes are
 * agency/admin — so they still act on the demo store, as do the parts with no
 * backend at all (drink menu counts, receipt scans, tied offers).
 */
export function useOutletToday(
	params: {
		/** Days of history to include (Calendar pages backwards; Today doesn't). */
		lookbehindDays?: number;
		lookaheadDays?: number;
	} = {},
): OutletTodayData {
	const {
		lookbehindDays = DEFAULT_LOOKBEHIND_DAYS,
		lookaheadDays = DEFAULT_LOOKAHEAD_DAYS,
	} = params;
	const { logout } = useAuth();
	const identity = useMemo(() => getOutletIdentity(), []);
	const backed = identity !== null;
	const outletName = identity?.outletName ?? "";

	const todayIso = useMemo(() => getLiveTodayIso(), []);
	const fromDate = useMemo(
		() => addDaysToIso(todayIso, -lookbehindDays),
		[todayIso, lookbehindDays],
	);
	const toDate = useMemo(
		() => addDaysToIso(todayIso, lookaheadDays),
		[todayIso, lookaheadDays],
	);

	const shiftsQuery = useQuery({
		// The window is part of the key — a wider Calendar fetch must not be
		// served from (or overwrite) Today's narrower one.
		queryKey: ["outlet", "today", "shifts", fromDate, toDate],
		queryFn: () => fetchShifts({ fromDate, toDate, pageSize: 200 }, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
	const assignmentsQuery = useQuery({
		queryKey: ["outlet", "today", "assignments"],
		queryFn: () => fetchShiftAssignments({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 30_000,
	});
	// Scoped server-side to PRs rostered at this outlet's own venues.
	const prsQuery = useQuery({
		queryKey: ["outlet", "today", "prs"],
		queryFn: () => fetchPrPersonnel({ pageSize: 500 }, logout),
		enabled: backed,
		staleTime: 60_000,
	});

	const { shifts, roster } = useMemo(() => {
		if (!backed) return { shifts: [], roster: [] };
		const backendShifts = shiftsQuery.data?.data ?? [];
		const assignments = assignmentsQuery.data?.data ?? [];

		return {
			shifts: backendShifts.map((shift) =>
				shiftRequestFromBackendShift({
					shift,
					assignments,
					outletName,
					todayIso,
				}),
			),
			// Every slot carries the outlet's own venue name — the backend already
			// scoped these shifts to outlets this caller belongs to.
			roster: rosterSlotsFromBackend({
				shifts: backendShifts,
				assignments,
				outletNameById: new Map(
					backendShifts.map((s) => [s.outletId, outletName]),
				),
			}),
		};
	}, [backed, outletName, todayIso, shiftsQuery.data, assignmentsQuery.data]);

	const prs = useMemo<AgencyManagedPR[]>(
		() => (backed ? (prsQuery.data?.data ?? []).map(managedPrFromBackend) : []),
		[backed, prsQuery.data],
	);

	return {
		backed,
		shifts,
		roster,
		prs,
		isLoading:
			backed &&
			(shiftsQuery.isLoading ||
				assignmentsQuery.isLoading ||
				prsQuery.isLoading),
	};
}
