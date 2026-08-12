import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { Check, Clock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toMutationError } from "@/lib/mutation-error";
import type { PendingOvertimeClaim } from "@/services/shift-assignment";

/** yyyy-MM-dd -> "Tue 21 Jul", matching how the roster names the same day. */
function formatDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

/**
 * Recorded minutes as "1h 30m".
 *
 * Formatting the server's own number — NOT a step toward deriving pay. The
 * amount beside it is priced server-side and must never be recomputed from
 * these minutes, or the agency could attest to one figure while a different one
 * lands on the voucher.
 */
function formatMinutes(minutes: number | null): string {
	if (minutes == null || minutes <= 0) return "—";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}h`;
	return `${h}h ${m}m`;
}

/**
 * One overtime claim awaiting a decision.
 *
 * Both actions are irreversible — there is no un-approve and no un-reject
 * endpoint, and an approval writes money onto a voucher — so each takes a
 * second click that states the consequence. That is not politeness: a
 * double-clicked Approve is the exact fault this feature exposed, and while the
 * server now claims the decision as a mutex, the second click is not something
 * the screen should be inviting in the first place.
 *
 * There is no reason box. The endpoint accepts only the decision, so asking for
 * a reason would collect text and discard it — the same call the MC/leave panel
 * makes, for the same reason.
 */
function OvertimeRow({
	claim,
	canDecide,
	busy,
	onDecide,
}: {
	claim: PendingOvertimeClaim;
	canDecide: boolean;
	busy: boolean;
	onDecide: (decision: "approve" | "reject") => Promise<void> | void;
}) {
	const [confirming, setConfirming] = useState<"approve" | "reject" | null>(
		null,
	);

	const act = (decision: "approve" | "reject") => {
		if (confirming !== decision) {
			setConfirming(decision);
			return;
		}
		setConfirming(null);
		void onDecide(decision);
	};

	return (
		<div className="rounded-xl border border-[var(--iz-line)] p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<div className="text-sm font-semibold">
						{claim.prName ?? "Unknown PR"} · {claim.outletName ?? "Outlet"}
					</div>
					<p className="iz-tiny iz-muted mt-0.5">
						{formatDay(claim.shiftDate)}
						{claim.slot ? ` · ${claim.slot}` : ""}
					</p>
				</div>
				<span className="iz-pill iz-pill-amber !text-[10px]">
					Holding payroll
				</span>
			</div>

			<div className="mt-2 flex flex-wrap gap-4 text-sm">
				<span>
					<span className="iz-tiny iz-muted block">Overtime worked</span>
					<span className="font-mono">
						{formatMinutes(claim.overtimeMinutes)}
					</span>
				</span>
				<span>
					{/* Priced by the server, by the same function the approval uses. */}
					<span className="iz-tiny iz-muted block">Pays</span>
					<span className="font-mono">RM {claim.amount}</span>
				</span>
				<span>
					<span className="iz-tiny iz-muted block">Onto the week of</span>
					<span className="font-mono">
						{claim.week ? claim.week.weekStart : "—"}
					</span>
				</span>
			</div>

			<p className="iz-tiny iz-muted2 mt-2">
				<Clock className="mr-1 inline h-3 w-3" />
				Overtime is paid on the voucher for the week it was worked, so this
				claim holds {claim.week ? `w/c ${claim.week.weekStart}` : "its week"}{" "}
				from being sent until it is decided.
			</p>

			{canDecide ? (
				<>
					<div className="mt-2 flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-primary flex items-center gap-1.5"
							disabled={busy}
							onClick={() => act("approve")}
						>
							<Check className="h-4 w-4" />
							{confirming === "approve"
								? `Confirm · pay RM ${claim.amount}`
								: "Approve"}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft flex items-center gap-1.5"
							disabled={busy}
							onClick={() => act("reject")}
						>
							<X className="h-4 w-4" />
							{confirming === "reject" ? "Confirm · pay nothing" : "Reject"}
						</button>
					</div>
					{confirming && (
						<p className="iz-tiny iz-muted2 mt-1">
							{confirming === "approve"
								? `RM ${claim.amount} is added to ${claim.prName ?? "the PR"}'s voucher. This cannot be undone.`
								: "No money is added and the PR is told. This cannot be undone."}
						</p>
					)}
				</>
			) : (
				// Read is open to the whole agency; deciding is not. Naming the role
				// that holds it beats a disabled button with no explanation.
				<p className="iz-tiny iz-muted2 mt-2">
					Only the agency owner or finance can decide overtime.
				</p>
			)}
		</div>
	);
}

/**
 * The agency's overtime worklist.
 *
 * Sits with the dispute queue rather than on the approvals page on purpose: the
 * approvals page is gated on `approvePrSignups`, which agency FINANCE does not
 * hold — and finance is one of the two roles allowed to decide overtime. Put
 * here, the person told "this week cannot be sent" is looking at the reason.
 */
/**
 * Does this claim belong to the week on screen?
 *
 * Anchored on `shiftDate` — the night the overtime was actually worked — for the
 * same reason a dispute is anchored on its contested day: that is the shift a
 * reviewer has to go and look at. Not `week`, which carries the payroll week the
 * money would LAND in, and which is therefore the wrong answer for a claim being
 * decided late.
 *
 * Containment on `yyyy-MM-dd` strings, so a date sits in exactly one Sun–Sat week.
 */
function claimInWeek(
	claim: PendingOvertimeClaim,
	weekStartIso: string,
	weekEndIso: string,
): boolean {
	if (!claim.shiftDate) return false;
	const day = claim.shiftDate.slice(0, 10);
	return day >= weekStartIso && day <= weekEndIso;
}

export function OvertimeQueuePanel({
	weekStartIso,
	weekEndIso,
}: {
	weekStartIso: string;
	weekEndIso: string;
}) {
	const toast = useStore((s) => s.toast);
	const {
		claims: allClaims,
		isLoading,
		decide,
		isDeciding,
	} = useAgencyOvertime();
	/**
	 * The selected week's claims. This panel ignored the week tab entirely, so one
	 * claim showed up identically under This Week and Last Week, beside voucher and
	 * receipt counts that did move with the tab.
	 */
	const claims = useMemo(
		() => allClaims.filter((c) => claimInWeek(c, weekStartIso, weekEndIso)),
		[allClaims, weekStartIso, weekEndIso],
	);
	/**
	 * Undecided claims in OTHER weeks — counted, not listed. An undecided claim is
	 * why a week refuses to send, so week-scoping must not make one silently
	 * vanish; naming the number keeps the blocker visible without dragging a
	 * foreign week's row into this list.
	 */
	const pendingElsewhere = allClaims.length - claims.length;
	// Mirrors the server's `agencyOwnerOrFinance` guard on the PATCH route: the
	// same set that raises a PV decides the money that goes onto one.
	const canDecide = useAgencyCan()("raisePv");

	const handle = async (
		claim: PendingOvertimeClaim,
		decision: "approve" | "reject",
	) => {
		try {
			const result = await decide({
				assignmentId: claim.assignmentId,
				decision,
			});
			// The server's own words: an approval's message names the amount and the
			// week it landed on, which is more use than a generic "Saved".
			toast(result.message, "success");
		} catch (error) {
			// Surfaced verbatim rather than flattened. The refusals here are
			// specific and actionable — already decided by a colleague, or a
			// commission-only PR with no daily wage to price overtime from — and a
			// generic failure message would send the agency looking for a bug.
			const message = toMutationError(
				error,
				"Could not record that decision",
			)?.message;
			toast(message ?? "Could not record that decision", "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>
				Overtime{claims.length > 0 ? ` (${claims.length})` : ""}
			</IzSectionLabel>
			<IzCard>
				{isLoading && (
					<p className="iz-tiny iz-muted">Loading overtime claims…</p>
				)}

				{!isLoading && claims.length === 0 && (
					<p className="iz-tiny iz-muted">
						No overtime awaiting a decision in this week. A claim is recorded
						when a PR checks out later than the shift was scheduled to end.
					</p>
				)}

				{!isLoading && pendingElsewhere > 0 && (
					<p className="iz-tiny mt-1 text-[var(--iz-amber)]">
						{pendingElsewhere} claim{pendingElsewhere === 1 ? "" : "s"} in
						another week still undecided — switch weeks above to decide{" "}
						{pendingElsewhere === 1 ? "it" : "them"}.
					</p>
				)}

				{claims.length > 0 && (
					<div className="space-y-3">
						<p className="iz-tiny iz-muted">
							Each claim holds its own payroll week until it is decided. The
							amount shown is what the approval writes onto the voucher.
						</p>
						{claims.map((c) => (
							<OvertimeRow
								key={c.assignmentId}
								claim={c}
								canDecide={canDecide}
								busy={isDeciding}
								onDecide={(decision) => handle(c, decision)}
							/>
						))}
					</div>
				)}
			</IzCard>
		</>
	);
}
