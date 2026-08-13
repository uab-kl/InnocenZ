import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { outletShiftRequestFromBackend } from "@agency-portal/lib/agency-outlet-shift-map";
import {
	type AgencyOutletSummary,
	buildAgencyOutletSummaries,
} from "@agency-portal/lib/agency-outlet-shifts";
import { addDaysToIso } from "@agency-portal/lib/demo-clock";
import { DEFAULT_ROSTER_DATE_ISO } from "@agency-portal/lib/roster-availability";
import type { ShiftRequest } from "@agency-portal/lib/store";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchAllPages } from "@/lib/fetch-all-pages";
import { fetchShifts } from "@/services/shift";
import { fetchShiftAssignments } from "@/services/shift-assignment";
import { useAgencyOutlets } from "./use-agency-outlets";
import { useRosterSlots } from "./use-roster-slots";

// How far ahead to pull upcoming shifts for the demand dashboard. The builder
// already drops past dates; this just bounds the fetch window.
const DEMAND_HORIZON_DAYS = 90;

/**
 * Backend-driven Outlet demand dashboard data for the agency portal.
 *
 * Rebuilds the same `AgencyOutletSummary[]` the demo store produces — but from
 * real backend shifts + roster assignments instead of demo data — by feeding
 * them through the SAME `buildAgencyOutletSummaries`, so the cards / detail view
 * / filters render unchanged. The outlet REGISTRY alone can't populate this
 * dashboard (it has no shift-demand content); the demand is derived from the
 * shift / shift-assignment backend keyed by each real outlet name.
 *
 * Gated on a real session (`getAgencyIdentity()` non-null): backed sessions get
 * live summaries, demo sessions get `backed: false` + empty so the screen falls
 * back to its demo store — the same real-vs-demo split as the other wired
 * screens. Tied offers + commission rules have no backend source, so backed
 * summaries pass none (tied offers are a demo-only concept; the tier pay
 * breakdown falls back to defaults — cosmetic only).
 */
export function useAgencyOutletDemand() {
	const { logout } = useAuth();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const backed = identity !== null;
	const todayIso = DEFAULT_ROSTER_DATE_ISO;
	// todayIso is a module constant, so this only computes once.
	const toDate = useMemo(() => addDaysToIso(todayIso, DEMAND_HORIZON_DAYS), []);

	// Real outlet directory — supplies the card list + the outletId -> name map.
	const { outlets } = useAgencyOutlets();

	const shiftsQuery = useQuery({
		queryKey: ["agency", "outlet-demand", "shifts", todayIso, toDate],
		queryFn: () =>
			fetchShifts({ fromDate: todayIso, toDate, pageSize: 200 }, logout),
		enabled: backed,
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});

	// Raw assignments, because `supplied` is `prs.length` and the mapper needs the
	// real PR ids per shift. The roster SLOTS below cannot serve this: an
	// `AgencyRosterSlot` carries no `shiftId`, so a slot cannot be attributed back
	// to the shift it staffs. Shares the roster query key, so a roster write
	// invalidates this dashboard too.
	const assignmentsQuery = useQuery({
		queryKey: ["roster", "assignments"],
		// Paged out: the server clamps to 100, and this key is shared — see
		// lib/fetch-all-pages.ts.
		queryFn: () =>
			fetchAllPages((page) =>
				fetchShiftAssignments({ page, pageSize: 100 }, logout),
			),
		enabled: backed,
		staleTime: 30_000,
	});

	// Roster assignments feed `scheduledTonight` per outlet (already backend-mapped).
	const roster = useRosterSlots({
		fromDate: todayIso,
		toDate,
		enabled: backed,
	});

	const outletNameById = useMemo(
		() => new Map(outlets.map((o) => [o.id, o.name])),
		[outlets],
	);
	const outletNames = useMemo(() => outlets.map((o) => o.name), [outlets]);

	const shifts = useMemo<ShiftRequest[]>(() => {
		const rows = shiftsQuery.data?.data ?? [];
		const assignments = assignmentsQuery.data?.data ?? [];
		return rows.flatMap((s) => {
			const name = outletNameById.get(s.outletId);
			// Drop shifts at outlets outside this agency's directory (no card for them).
			if (!name) return [];
			return [outletShiftRequestFromBackend(s, name, assignments)];
		});
	}, [shiftsQuery.data, assignmentsQuery.data, outletNameById]);

	const rosterSlots = roster.slots;

	const summaries = useMemo<AgencyOutletSummary[]>(() => {
		if (!backed) return [];
		return buildAgencyOutletSummaries({
			outlets: outletNames,
			shifts,
			roster: rosterSlots,
			tiedOffers: [],
			todayIso,
			commissionRules: [],
		});
	}, [backed, outletNames, shifts, rosterSlots]);

	return {
		backed,
		summaries,
		// Exposed so the screen can rebuild the detail day-demand chart from the
		// same source (backend shifts + roster, no tied offers).
		shifts,
		roster: rosterSlots,
		todayIso,
		isLoading: backed && (shiftsQuery.isLoading || roster.isLoading),
	};
}
