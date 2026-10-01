import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import type { RecordedFloorSales } from "@agency-portal/lib/outlet-financial-sync";
import { recordedSalesBySlotId } from "@agency-portal/lib/roster-recorded-sales";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchShiftSales } from "@/services/shift-sale";
import { useAllShiftAssignments } from "./use-all-shift-assignments";

/**
 * THE AGENCY'S REAL FLOOR SALES FOR ONE DAY, per roster slot — the Drinks and
 * Tips columns of the Roster (Live) and the agency home's PR-on-duty table, and
 * the sheets that open from them. See roster-recorded-sales.ts.
 *
 * `recordedBySlotId` is `null` on a DEMO session, which keeps its fixture; on a
 * real one it is always a Map — empty while loading or when nothing approved has
 * been recorded — so a real screen never falls through to the demo engine.
 *
 * `GET /shift-sale` is agency-scoped server-side (the caller's own agency), and
 * the assignments come from the one shared cache every roster screen reads, so
 * this adds a single small request per day shown.
 */
export function useAgencyRecordedFloorSales(params: {
	dateIso: string;
	/** Gate the reads — a lane that may not see the floor passes false. */
	enabled?: boolean;
}): { recordedBySlotId: Map<string, RecordedFloorSales> | null } {
	const { dateIso, enabled = true } = params;
	const { logout } = useAuth();
	const backed = useMemo(() => getAgencyIdentity() !== null, []);
	const on = backed && enabled;

	const salesQuery = useQuery({
		queryKey: ["agency", "floor-sales", dateIso],
		queryFn: () =>
			fetchShiftSales({ fromDate: dateIso, toDate: dateIso }, logout),
		enabled: on,
		staleTime: 30_000,
	});
	const assignmentsQuery = useAllShiftAssignments({ enabled: on });

	const recordedBySlotId = useMemo(
		() =>
			on
				? recordedSalesBySlotId(
						salesQuery.data ?? [],
						assignmentsQuery.data?.data ?? [],
					)
				: null,
		[on, salesQuery.data, assignmentsQuery.data],
	);

	return { recordedBySlotId };
}
