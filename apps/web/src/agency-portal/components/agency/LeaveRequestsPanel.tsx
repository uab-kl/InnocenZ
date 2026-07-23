import { IzCard } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { fetchOutlets } from "@/services/outlet/outlet";
import { fetchShiftAssignments } from "@/services/shift-assignment";

/**
 * Pending PR MC/leave requests (backend `leave_pending` assignments) awaiting
 * this agency's decision. Approve excuses the PR from the shift with no
 * penalty (`leave_approved`); Reject puts the row back to `assigned` — the
 * mobile app tells the PR either way. Mirrors the "PR swap requests" section;
 * renders nothing while there is no pending request.
 */
export function LeaveRequestsPanel({ canAct }: { canAct: boolean }) {
	const { logout } = useAuth();
	const rosterMut = useRosterMutations();

	// "roster"-prefixed keys so the roster mutations' invalidate() refreshes
	// this list together with the planning grid.
	const requestsQuery = useQuery({
		queryKey: ["roster", "leave-requests"],
		queryFn: () =>
			fetchShiftAssignments({ status: "leave_pending", pageSize: 100 }, logout),
		staleTime: 15_000,
	});
	const outletsQuery = useQuery({
		queryKey: ["roster", "outlets"],
		queryFn: () => fetchOutlets({ pageSize: 500 }, logout),
		staleTime: 60_000,
	});

	const outletNameById = useMemo(
		() => new Map((outletsQuery.data?.data ?? []).map((o) => [o.id, o.name])),
		[outletsQuery.data],
	);

	const requests = requestsQuery.data?.data ?? [];
	if (requests.length === 0) return null;

	const busy = rosterMut.approveLeave.isPending || rosterMut.rejectLeave.isPending;

	return (
		<OutletSection
			title="MC / Leave requests"
			hint={`${requests.length} pending`}
			className="!mt-4"
		>
			<div className="grid gap-2 md:grid-cols-2">
				{requests.map((req) => (
					<IzCard key={req.id}>
						<p className="font-sora text-sm font-bold">{req.prName ?? "PR"}</p>
						<p className="iz-tiny iz-muted mt-0.5">
							{(req.outletId ? outletNameById.get(req.outletId) : undefined) ??
								"Outlet"}{" "}
							· {req.shiftDate ?? "—"}
						</p>
						{req.notes && (
							<p className="iz-tiny iz-muted mt-1 line-clamp-3">
								&ldquo;{req.notes}&rdquo;
							</p>
						)}
						{canAct && (
							<div className="mt-2 flex gap-2">
								<button
									type="button"
									className="iz-btn iz-btn-soft flex-1 !py-1.5 !text-xs"
									disabled={busy}
									onClick={() => rosterMut.rejectLeave.mutate(req.id)}
								>
									Reject
								</button>
								<button
									type="button"
									className="iz-btn iz-btn-primary flex-1 !py-1.5 !text-xs"
									disabled={busy}
									onClick={() => rosterMut.approveLeave.mutate(req.id)}
								>
									Approve · excuse shift
								</button>
							</div>
						)}
					</IzCard>
				))}
			</div>
		</OutletSection>
	);
}
