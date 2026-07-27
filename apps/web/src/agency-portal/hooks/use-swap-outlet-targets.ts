import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchOutletSwapTargets,
	type OutletSwapTarget,
} from "@/services/outlet-swap";

/** One destination the agency can offer, ready to render. */
export interface SwapOutletTarget {
	/** The destination SHIFT. This is what the swap request stores. */
	shiftId: string;
	outletName: string;
	/** The destination shift's window, e.g. "22:00 — 04:00". Null if unset. */
	shiftWindow: string | null;
	eventName: string | null;
	quantity: number;
	staffedCount: number;
	/**
	 * At or over capacity. Approving into a full shift is refused server-side,
	 * so offering it would only produce a request that can never succeed. The
	 * picker disables these rather than hiding them, so the agency can see the
	 * venue is running but has no room.
	 */
	isFull: boolean;
}

export interface UseSwapOutletTargets {
	/** Shifts the PR could be moved to that night, A–Z by outlet then window. */
	targets: SwapOutletTarget[];
	isLoading: boolean;
	isError: boolean;
}

/**
 * Destination shifts for an outlet swap, straight from the backend.
 *
 * Previously this derived targets in the browser from the shift + outlet lists
 * and keyed them by outlet NAME, keeping only the first shift per venue — it
 * had no way to say *which* shift, because the demo swap request carried only a
 * name. The real request stores a `to_shift_id`, so the server now returns
 * concrete shifts (every one, not one per venue) scoped to the assignment's own
 * agency and date, with the live headcount that decides whether approval can
 * succeed.
 */
export function useSwapOutletTargets(params: {
	/** The shift_assignment being moved. The date and agency come from it. */
	assignmentId: string | null;
	enabled?: boolean;
}): UseSwapOutletTargets {
	const { assignmentId, enabled = true } = params;
	const { logout } = useAuth();

	const query = useQuery({
		queryKey: ["outlet-swap", "targets", assignmentId],
		queryFn: () => fetchOutletSwapTargets(assignmentId!, logout),
		enabled: enabled && Boolean(assignmentId),
		staleTime: 30_000,
	});

	const targets = useMemo(
		() =>
			(query.data ?? [])
				.map(toSwapTarget)
				.sort(
					(a, b) =>
						a.outletName.localeCompare(b.outletName) ||
						(a.shiftWindow ?? "").localeCompare(b.shiftWindow ?? ""),
				),
		[query.data],
	);

	return {
		targets,
		isLoading: query.isLoading,
		isError: query.isError,
	};
}

function toSwapTarget(target: OutletSwapTarget): SwapOutletTarget {
	return {
		shiftId: target.shiftId,
		// The server left-joins the outlet, so a shift whose outlet row is
		// missing would otherwise render as a blank option.
		outletName: target.outletName ?? "Unnamed outlet",
		shiftWindow: target.slot,
		eventName: target.eventName,
		quantity: target.quantity,
		staffedCount: target.staffedCount,
		isFull: target.staffedCount >= target.quantity,
	};
}
