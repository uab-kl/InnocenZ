import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	type BackfillSlot,
	fetchBackfillSlots,
	fetchReplacementCandidates,
} from "@/services/shift-assignment";

/**
 * Backfill worklist (Slice 3 of the cancel epic): upcoming slots whose PR
 * cancelled or had MC/leave approved while the shift is still short-staffed.
 * "Pick replacement" opens the ranked candidates the backend matched (free
 * that night, same agency; released PR's tier first, then outlet experience) —
 * assigning reuses the normal create-assignment mutation, so the row drops off
 * as soon as the shift is staffed back to quantity. Renders nothing when
 * there is no gap.
 */
export function BackfillPanel({ canAct }: { canAct: boolean }) {
	const { logout } = useAuth();
	const [target, setTarget] = useState<BackfillSlot | null>(null);

	// "roster"-prefixed key so the roster mutations' invalidate() refreshes
	// this worklist together with the planning grid.
	const slotsQuery = useQuery({
		queryKey: ["roster", "backfill"],
		queryFn: () => fetchBackfillSlots(logout),
		staleTime: 15_000,
	});

	const slots = slotsQuery.data ?? [];
	if (slots.length === 0) return null;

	return (
		<>
			<OutletSection
				title="Backfill needed"
				hint={`${slots.length} open slot${slots.length === 1 ? "" : "s"}`}
				className="!mt-4"
			>
				<div className="grid gap-2 md:grid-cols-2">
					{slots.map((slot) => (
						<IzCard key={slot.assignmentId}>
							<p className="font-sora text-sm font-bold">
								{slot.outletName ?? "Outlet"} · {slot.shiftDate}
							</p>
							<p className="iz-tiny iz-muted mt-0.5">
								{slot.slot ?? slot.eventName ?? "Shift"} · staffed{" "}
								{slot.staffedCount}/{slot.quantity} ·{" "}
								{slot.status === "leave_approved"
									? "leave approved"
									: "cancelled"}{" "}
								— {slot.prName}
							</p>
							{slot.notes && (
								<p className="iz-tiny iz-muted mt-1 line-clamp-2">
									&ldquo;{slot.notes}&rdquo;
								</p>
							)}
							{canAct && (
								<button
									type="button"
									className="iz-btn iz-btn-primary mt-2 w-full !py-1.5 !text-xs"
									onClick={() => setTarget(slot)}
								>
									Pick replacement
								</button>
							)}
						</IzCard>
					))}
				</div>
			</OutletSection>

			{target && (
				<ReplacementSheet slot={target} onClose={() => setTarget(null)} />
			)}
		</>
	);
}

function ReplacementSheet({
	slot,
	onClose,
}: {
	slot: BackfillSlot;
	onClose: () => void;
}) {
	const { logout } = useAuth();
	const rosterMut = useRosterMutations();

	const candidatesQuery = useQuery({
		queryKey: ["roster", "backfill-candidates", slot.assignmentId],
		queryFn: () => fetchReplacementCandidates(slot.assignmentId, logout),
		staleTime: 15_000,
	});
	const candidates = candidatesQuery.data ?? [];
	const busy = rosterMut.assign.isPending;

	const [error, setError] = useState<string | null>(null);

	// Closing on success only. The bare mutate() here reported nothing when the
	// write failed, so a backfill that never landed looked exactly like one that
	// did — the sheet shut and the slot stayed on the worklist.
	const assign = async (prId: string, userId?: string | null) => {
		if (busy) return;
		setError(null);
		try {
			await rosterMut.assign.mutateAsync({
				shiftId: slot.shiftId,
				prId,
				userId: userId ?? undefined,
			});
			onClose();
		} catch (err) {
			setError(
				toMutationError(err, "Couldn't assign the PR.")?.message ??
					"Couldn't assign the PR.",
			);
		}
	};

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div className="iz-sheet-head">
				<div>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						Backfill · {slot.shiftDate}
					</p>
					<h3>
						{slot.outletName ?? "Outlet"} · {slot.slot ?? "Shift"}
					</h3>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					disabled={busy}
					aria-label="Close"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{error && (
				<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">{error}</p>
			)}

			{candidatesQuery.isLoading ? (
				<p className="iz-tiny iz-muted mt-4 text-center">Matching free PRs…</p>
			) : candidates.length === 0 ? (
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					No free PR available that night — every active PR already has a
					booking on {slot.shiftDate}.
				</p>
			) : (
				<>
					<p className="iz-field-label mt-3">
						Free that night · {candidates.length}
					</p>
					<div className="mt-1.5 grid gap-1.5">
						{candidates.map((c) => (
							<div
								key={c.prId}
								className="flex items-center gap-2 rounded-xl border border-[var(--iz-line)] px-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<p className="font-sora text-sm font-bold text-[var(--iz-txt)]">
										{c.prName}
									</p>
									<p className="iz-tiny iz-muted">
										{c.tier}
										{c.timesAtOutlet > 0
											? ` · worked here ${c.timesAtOutlet}×`
											: " · new to this outlet"}
									</p>
								</div>
								<button
									type="button"
									className="iz-btn iz-btn-primary shrink-0 !py-1.5 !text-xs"
									disabled={busy}
									onClick={() => assign(c.prId, c.userId)}
								>
									{busy ? "Assigning…" : "Assign"}
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</IzSheet>
	);
}
