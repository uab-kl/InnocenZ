import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyPvDayReview } from "@agency-portal/hooks/use-agency-pv-day-review";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { Check, Hand, RotateCcw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PaymentVoucherDayReview } from "@/services/payment-voucher";

const moneyFromCents = (cents: number) => `RM ${(cents / 100).toFixed(2)}`;

/** yyyy-MM-dd -> "Tue 21 Jul", the same shape the dispute queue uses. */
function formatDay(iso: string): string {
	const d = new Date(`${iso}T00:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString("en-GB", {
		weekday: "short",
		day: "numeric",
		month: "short",
	});
}

function formatStamp(iso: string | null): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	return d.toLocaleString("en-GB", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * One day of the week with its decision and the three things that can be done to
 * it. A held day keeps its Hold button enabled so the note can be corrected
 * without first clearing the decision.
 */
function DayRow({
	day,
	canReview,
	busy,
	onDecide,
}: {
	day: PaymentVoucherDayReview;
	canReview: boolean;
	busy: boolean;
	onDecide: (
		status: PaymentVoucherDayReview["status"],
		note: string,
	) => Promise<void> | void;
}) {
	const { t } = usePortalLocale();
	const [note, setNote] = useState(day.note ?? "");
	const [holding, setHolding] = useState(false);

	const approved = day.status === "approved";
	const held = day.status === "held";

	return (
		<div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="min-w-0">
					<div className="text-sm font-semibold">{formatDay(day.date)}</div>
					<p className="iz-tiny iz-muted mt-0.5">
						{day.reviewedAt && day.status
							? `${held ? t.agencyPvReview.held : t.receipts.approved} ${formatStamp(day.reviewedAt)}${day.bulk ? ` · ${t.agencyPvReview.viaApproveAll}` : ""}`
							: t.agencyPvReview.notReviewed}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<b className="iz-ledger">{moneyFromCents(day.totalCents)}</b>
					{approved && (
						<span className="iz-pill iz-pill-green !text-[10px]">
							{t.receipts.approved}
						</span>
					)}
					{held && (
						<span className="iz-pill iz-pill-red !text-[10px]">
							{t.agencyPvReview.held}
						</span>
					)}
					{!day.status && !day.stale && (
						<span className="iz-pill iz-pill-ink !text-[10px]">
							{t.agencyPvReview.statusOpen}
						</span>
					)}
					{day.stale && (
						<span className="iz-pill iz-pill-amber !text-[10px]">
							{t.agencyPvReview.statusChanged}
						</span>
					)}
				</div>
			</div>

			{/* A stale day is the one case where the amount on screen is not the
			    amount that was signed off, so both figures are shown. */}
			{day.stale && (
				<p className="iz-tiny mt-1.5 flex items-start gap-1.5 text-[var(--iz-amber)]">
					<TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
					<span>
						{day.approvedTotalCents !== null
							? fill(t.agencyPvReview.staleWithApproved, {
									approved: moneyFromCents(day.approvedTotalCents),
									now: moneyFromCents(day.totalCents),
								})
							: fill(t.agencyPvReview.staleWithoutApproved, {
									now: moneyFromCents(day.totalCents),
								})}
					</span>
				</p>
			)}

			{day.note && !holding && (
				<p className="iz-tiny iz-muted2 mt-1">
					{t.agencyPvReview.noteLabel} {day.note}
				</p>
			)}

			{canReview && (
				<>
					{holding && (
						<textarea
							className="iz-field-input mt-2 w-full"
							rows={2}
							placeholder={t.agencyPvReview.holdNotePlaceholder}
							value={note}
							onChange={(e) => setNote(e.target.value)}
						/>
					)}
					<div className="mt-2 flex flex-wrap gap-2">
						{/* Approving sends NO note, which clears whatever is stored. The
						    textarea asks why a day is HELD, so carrying that answer onto the
						    approval that resolves it would leave the record reading
						    "Approved · Note: <the reason it was held>". */}
						<button
							type="button"
							className="iz-chip"
							disabled={busy || (approved && !day.stale)}
							onClick={() => {
								setHolding(false);
								setNote("");
								void onDecide("approved", "");
							}}
						>
							<Check className="mr-1 inline h-3 w-3" /> {t.common.approve}
						</button>
						<button
							type="button"
							className="iz-chip"
							disabled={busy}
							onClick={() => {
								if (!holding) {
									setHolding(true);
									return;
								}
								setHolding(false);
								void onDecide("held", note.trim());
							}}
						>
							<Hand className="mr-1 inline h-3 w-3" />{" "}
							{holding
								? t.agencyPvReview.confirmHold
								: t.agencyPvReview.holdAction}
						</button>
						{(approved || held) && (
							<button
								type="button"
								className="iz-chip"
								disabled={busy}
								onClick={() => {
									setHolding(false);
									setNote("");
									void onDecide(null, "");
								}}
							>
								<RotateCcw className="mr-1 inline h-3 w-3" />{" "}
								{t.agencyPvReview.clearDecision}
							</button>
						)}
					</div>
				</>
			)}
		</div>
	);
}

/**
 * The agency's day-by-day sign-off, sitting between voucher generation and the
 * send: generate → day review → send → PR signs → paid.
 *
 * Every day carrying money must be decided before the voucher can go out, and a
 * held day blocks it — the owner's call on 30 Jul 2026, chosen over a warn-only
 * form because a review nobody has to satisfy is not a control. The same rule is
 * enforced server-side on both the HTTP send and the Monday payout job, so this
 * panel explains a refusal rather than being the thing that enforces it.
 *
 * Renders nothing for a demo voucher: there is no backend row to review, and a
 * panel showing zero days beside real-looking amounts would read as "nothing to
 * sign off" rather than "not applicable here".
 */
export function AgencyPvDayReviewPanel({
	voucherId,
}: {
	voucherId: string | null;
}) {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);
	// Mirrors the server's agencyOwnerOrFinance guard on the two write routes.
	// The READ is deliberately open: seeing what was decided is not the same
	// authority as deciding it.
	const canReview = useAgencyCan()("raisePv");
	const {
		days,
		isBacked,
		isLoading,
		sendGate,
		decidedCount,
		staleCount,
		reviewDay,
		approveAll,
		isSaving,
	} = useAgencyPvDayReview(voucherId);

	if (!voucherId || !isBacked) return null;

	if (isLoading) {
		return (
			<>
				<IzSectionLabel>{t.agencyPvReview.dayReview}</IzSectionLabel>
				<IzCard>
					<p className="iz-tiny iz-muted">{t.agencyPvReview.loadingDays}</p>
				</IzCard>
			</>
		);
	}

	const decide = async (
		date: string,
		status: PaymentVoucherDayReview["status"],
		note: string,
	) => {
		try {
			await reviewDay({ date, status, note: note || undefined });
			toast(
				status === "approved"
					? t.agencyPvReview.toastDayApproved
					: status === "held"
						? t.agencyPvReview.toastDayHeld
						: t.agencyPvReview.toastDecisionCleared,
				"success",
			);
		} catch {
			toast(t.receipts.couldNotRecordDecision, "warn");
		}
	};

	const handleApproveAll = async () => {
		try {
			// The server skips held days, so a bulk approve can never quietly
			// overturn a refusal — and the count it returns says so.
			const result = await approveAll();
			toast(result.message, "success");
		} catch {
			toast(t.agencyPvReview.couldNotApproveRemaining, "warn");
		}
	};

	const undecided = days.filter((d) => d.status === null).length;

	return (
		<>
			<IzSectionLabel>
				{t.agencyPvReview.dayReview}
				{days.length > 0 ? ` (${decidedCount}/${days.length})` : ""}
			</IzSectionLabel>
			<IzCard>
				{days.length === 0 ? (
					// Not an error: week-level lines belong to no day, so there is
					// genuinely nothing to sign off and the send is not blocked.
					<p className="iz-tiny iz-muted">{t.agencyPvReview.noDatedLines}</p>
				) : (
					<>
						<p className="iz-tiny iz-muted">
							{t.agencyPvReview.approveEachDayHint}
						</p>
						{/* Said out loud, because it is an attestation the reviewer makes
						    without opening the receipts panel. A day's total IS the sum of
						    its receipts, so approving the day states those receipts are
						    right — the PR is then told so, and may dispute them. Silent
						    would make it a trap. */}
						<p className="iz-tiny iz-muted mt-1">
							{t.agencyPvReview.approvingDayApprovesReceipts}
						</p>

						{sendGate.allowed ? (
							<p className="iz-tiny mt-1.5 text-[var(--iz-green)]">
								{t.agencyPvReview.everyDayDecided}
							</p>
						) : (
							<p className="iz-tiny mt-1.5 text-[var(--iz-amber)]">
								{fill(t.agencyPvReview.notReadyToSend, {
									reason: sendGate.reason ?? "",
								})}
							</p>
						)}

						{staleCount > 0 && (
							<p className="iz-tiny iz-muted2 mt-1">
								{fill(t.agencyPvReview.staleDaysNeedAnotherLook, {
									n: staleCount,
								})}
							</p>
						)}

						<div className="mt-2">
							{days.map((day) => (
								<DayRow
									key={day.date}
									day={day}
									canReview={canReview}
									busy={isSaving}
									onDecide={(status, note) => decide(day.date, status, note)}
								/>
							))}
						</div>

						{canReview && undecided > 0 && (
							<button
								type="button"
								className="iz-btn iz-btn-soft mt-2.5 w-full"
								disabled={isSaving}
								onClick={() => void handleApproveAll()}
							>
								<Check className="h-4 w-4" />{" "}
								{fill(t.agencyPvReview.approveRemainingDays, { n: undecided })}
							</button>
						)}

						{!canReview && (
							<p className="iz-tiny iz-muted2 mt-2">
								{t.agencyPvReview.readOnlyDays}
							</p>
						)}
					</>
				)}
			</IzCard>
		</>
	);
}
