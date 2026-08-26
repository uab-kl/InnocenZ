import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard } from "@agency-portal/components/iz/ui";
import { OutletSection } from "@agency-portal/components/outlet/OutletSection";
import { useRosterMutations } from "@agency-portal/hooks/use-roster-mutations";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
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
	const { t } = usePortalLocale();
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
				title={t.agencyBroadcast.backfillNeeded}
				iconKey="Backfill needed"
				hint={
					slots.length === 1
						? t.agencyBroadcast.backfillOpenSlotOne
						: fill(t.agencyBroadcast.backfillOpenSlotMany, { n: slots.length })
				}
				className="!mt-4"
			>
				<div className="grid gap-2 md:grid-cols-2">
					{slots.map((slot) => (
						<IzCard key={slot.assignmentId}>
							<p className="font-sora text-sm font-bold">
								{slot.outletName ?? t.table.outlet} · {slot.shiftDate}
							</p>
							<p className="iz-tiny iz-muted mt-0.5">
								{fill(t.agencyBroadcast.backfillSlotLine, {
									slot: slot.slot ?? slot.eventName ?? t.rosterGrid.shift,
									staffed: slot.staffedCount,
									quantity: slot.quantity,
									// `slot.status` is the STORED value — compared, never shown.
									reason:
										slot.status === "leave_approved"
											? t.agencyBroadcast.backfillReasonLeaveApproved
											: t.agencyBroadcast.backfillReasonCancelled,
									name: slot.prName,
								})}
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
									{t.roster.pickReplacement}
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
	const { t } = usePortalLocale();
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
				toMutationError(err, t.rosterGrid.couldNotAssignPr)?.message ??
					t.rosterGrid.couldNotAssignPr,
			);
		}
	};

	return (
		<IzSheet open onClose={busy ? () => {} : onClose}>
			<div className="iz-sheet-head">
				<div>
					<p className="iz-tiny iz-muted2 uppercase tracking-widest">
						{fill(t.agencyBroadcast.backfillEyebrow, { date: slot.shiftDate })}
					</p>
					<h3>
						{slot.outletName ?? t.table.outlet} ·{" "}
						{slot.slot ?? t.rosterGrid.shift}
					</h3>
				</div>
				<button
					type="button"
					className="iz-sheet-close"
					onClick={onClose}
					disabled={busy}
					aria-label={t.common.close}
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			{error && (
				<p className="iz-tiny mt-3 text-[var(--iz-danger,#dc2626)]">{error}</p>
			)}

			{candidatesQuery.isLoading ? (
				<p className="iz-tiny iz-muted mt-4 text-center">
					{t.agencyBroadcast.backfillMatching}
				</p>
			) : candidates.length === 0 ? (
				<p className="iz-tiny iz-muted mt-4 rounded-xl border border-dashed border-[var(--iz-line)] px-4 py-6 text-center">
					{fill(t.agencyBroadcast.backfillNoneFree, { date: slot.shiftDate })}
				</p>
			) : (
				<>
					<p className="iz-field-label mt-3">
						{fill(t.agencyBroadcast.backfillFreeThatNight, {
							n: candidates.length,
						})}
					</p>
					<div className="mt-1.5 grid gap-1.5">
						{candidates.map((c) => (
							<div
								key={c.prId}
								className="flex items-center gap-3 rounded-xl border border-[var(--iz-line)] px-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<p className="truncate font-sora text-sm font-bold text-[var(--iz-txt)]">
										{c.prName}
									</p>
									{/* `c.tier` is the stored grade — the sentence around it moves
									    with the locale, the grade itself never does. */}
									<p className="iz-tiny iz-muted truncate">
										{c.timesAtOutlet > 0
											? fill(t.agencyBroadcast.backfillTierWorkedHere, {
													tier: c.tier,
													n: c.timesAtOutlet,
												})
											: fill(t.agencyBroadcast.backfillTierNewToOutlet, {
													tier: c.tier,
												})}
									</p>
								</div>
								{/* iz-btn is width:100% globally — without iz-btn-sm/!w-auto the
								    button takes the whole row and squashes the name beside it. */}
								<button
									type="button"
									className="iz-btn iz-btn-primary iz-btn-sm shrink-0 !w-auto whitespace-nowrap !py-1.5 !text-xs"
									disabled={busy}
									onClick={() => assign(c.prId, c.userId)}
								>
									{busy ? t.roster.assigning : t.roster.assign}
								</button>
							</div>
						))}
					</div>
				</>
			)}
		</IzSheet>
	);
}
