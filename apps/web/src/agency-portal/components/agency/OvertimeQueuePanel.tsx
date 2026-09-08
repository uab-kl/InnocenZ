import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyOvertime } from "@agency-portal/hooks/use-agency-overtime";
import { dayBelongsToWeekTab } from "@agency-portal/lib/payroll-week-scope";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { Check, Clock, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { resolveProofPhotoUrl } from "@/lib/proof-photo";
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
function formatMinutes(minutes: number | null, t: PortalTranslations): string {
	if (minutes == null || minutes <= 0) return "—";
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	if (h === 0) return fill(t.agencyQueues.durationMinutes, { m });
	if (m === 0) return fill(t.agencyQueues.durationHours, { h });
	return fill(t.agencyQueues.durationHoursMinutes, { h, m });
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
	const { t } = usePortalLocale();
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

	// An R2 object KEY on the wire; the resolver adds the public base. Same
	// treatment as the dispute and receipt cards, which reach it through
	// ShiftFactsBlock — this queue carries no such block, so the picture sits
	// beside the claim's own heading instead.
	const cover = claim.coverImage?.trim()
		? resolveProofPhotoUrl(claim.coverImage.trim())
		: null;

	return (
		<div className="rounded-xl border border-[var(--iz-line)] p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="flex min-w-0 gap-2.5">
					{cover ? (
						<img
							src={cover}
							// The venue is what the picture is of; this queue holds no
							// event name to reach for. Never an empty alt — the image is
							// evidence, not decoration.
							alt={claim.outletName ?? ""}
							className="h-12 w-16 shrink-0 rounded border border-[var(--iz-line)] object-cover"
							loading="lazy"
							onError={(e) => {
								e.currentTarget.style.display = "none";
							}}
						/>
					) : null}
					<div className="min-w-0">
						<div className="text-sm font-semibold">
							{claim.prName ?? t.receipts.unknownPr} ·{" "}
							{claim.outletName ?? t.table.outlet}
						</div>
						<p className="iz-tiny iz-muted mt-0.5">
							{formatDay(claim.shiftDate)}
							{claim.slot ? ` · ${claim.slot}` : ""}
						</p>
					</div>
				</div>
				<span className="iz-pill iz-pill-amber !text-[10px]">
					{t.agencyQueues.holdingPayroll}
				</span>
			</div>

			<div className="mt-2 flex flex-wrap gap-4 text-sm">
				<span>
					<span className="iz-tiny iz-muted block">
						{t.payroll.overtimeWorked}
					</span>
					<span className="iz-nums">
						{formatMinutes(claim.overtimeMinutes, t)}
					</span>
				</span>
				<span>
					{/* Priced by the server, by the same function the approval uses. */}
					<span className="iz-tiny iz-muted block">{t.table.pays}</span>
					<span className="iz-nums">RM {claim.amount}</span>
				</span>
				<span>
					<span className="iz-tiny iz-muted block">
						{t.payroll.ontoTheWeekOf}
					</span>
					<span className="iz-nums">
						{claim.week ? claim.week.weekStart : "—"}
					</span>
				</span>
			</div>

			<p className="iz-tiny iz-muted2 mt-2">
				<Clock className="mr-1 inline h-3 w-3" />
				{claim.week
					? fill(t.agencyQueues.overtimeHoldsWeek, {
							week: claim.week.weekStart,
						})
					: t.agencyQueues.overtimeHoldsItsWeek}
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
								? fill(t.agencyQueues.confirmPayAmount, {
										amount: `RM ${claim.amount}`,
									})
								: t.common.approve}
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft flex items-center gap-1.5"
							disabled={busy}
							onClick={() => act("reject")}
						>
							<X className="h-4 w-4" />
							{confirming === "reject"
								? t.payroll.confirmPayNothing
								: t.common.reject}
						</button>
					</div>
					{confirming && (
						<p className="iz-tiny iz-muted2 mt-1">
							{confirming === "approve"
								? fill(t.agencyQueues.approveAddsToVoucher, {
										amount: `RM ${claim.amount}`,
										name: claim.prName ?? t.agencyQueues.thePr,
									})
								: t.payroll.noMoneyAddedWarning}
						</p>
					)}
				</>
			) : (
				// Read is open to the whole agency; deciding is not. Naming the role
				// that holds it beats a disabled button with no explanation.
				<p className="iz-tiny iz-muted2 mt-2">
					{t.agencyQueues.onlyOwnerFinanceDecideOvertime}
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
	includesOlder: boolean,
): boolean {
	return dayBelongsToWeekTab(
		claim.shiftDate,
		weekStartIso,
		weekEndIso,
		includesOlder,
	);
}

export function OvertimeQueuePanel({
	weekStartIso,
	weekEndIso,
	includesOlder = false,
}: {
	weekStartIso: string;
	weekEndIso: string;
	/**
	 * The PAYMENT WEEK, which also holds every claim OLDER than its window.
	 *
	 * Without it a claim that aged past the oldest tab had no screen at all: it
	 * still blocked its voucher's send, that voucher was still listed by the same
	 * tab's own voucher catch-all, and the amber line below still told the agency
	 * to switch to a week the strip did not offer. See `dayBelongsToWeekTab`.
	 */
	includesOlder?: boolean;
}) {
	const { t } = usePortalLocale();
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
		() =>
			allClaims.filter((c) =>
				claimInWeek(c, weekStartIso, weekEndIso, includesOlder),
			),
		[allClaims, weekStartIso, weekEndIso, includesOlder],
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
				t.receipts.couldNotRecordDecision,
			)?.message;
			toast(message ?? t.receipts.couldNotRecordDecision, "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>
				{claims.length > 0
					? fill(t.agencyQueues.overtimeTitleCount, { n: claims.length })
					: t.payroll.overtime}
			</IzSectionLabel>
			<IzCard>
				{isLoading && (
					<p className="iz-tiny iz-muted">{t.agencyHub.loadingOvertime}</p>
				)}

				{!isLoading && claims.length === 0 && (
					<p className="iz-tiny iz-muted">{t.payroll.noOvertimeThisWeek}</p>
				)}

				{!isLoading && pendingElsewhere > 0 && (
					<p className="iz-tiny mt-1 text-[var(--iz-amber)]">
						{fill(
							pendingElsewhere === 1
								? t.agencyQueues.overtimeElsewhereOne
								: t.agencyQueues.overtimeElsewhereMany,
							{ n: pendingElsewhere },
						)}
					</p>
				)}

				{claims.length > 0 && (
					<>
						<p className="iz-tiny iz-muted">
							{t.agencyQueues.overtimeQueueHint}
						</p>
						{/* Two columns from `xl`, matching the Disputes and Receipts
						    queues on this page — one claim is a short card, and a column
						    of them across a portal-width screen was mostly margin.
						    `items-start` keeps each card at its own height. */}
						<div className="mt-3 grid items-start gap-3 xl:grid-cols-2">
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
					</>
				)}
			</IzCard>
		</>
	);
}
