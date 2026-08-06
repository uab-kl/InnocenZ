import { AgencyReceiptEditor } from "@agency-portal/components/agency/AgencyReceiptEditor";
import { ProofPhotos } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useAgencyReceipts } from "@agency-portal/hooks/use-agency-receipts";
import {
	formatPayeeLabel,
	formatShiftDayDate,
	formatShiftDuration,
	formatStampClock,
} from "@agency-portal/lib/agency-payroll";
import { useStore } from "@agency-portal/lib/store";
import { Check, ImageOff, Paperclip, Pencil, X } from "lucide-react";
import { useMemo, useState } from "react";
import type {
	AgencyReceipt,
	DisputeShift,
	PaymentVoucherDispute,
} from "@/services/payment-voucher";

/** The PR app's own words for each bucket, so both sides read the same. */
const COMPONENT_LABEL: Record<PaymentVoucherDispute["component"], string> = {
	wages: "Daily wages",
	drinks: "Drinks",
	tips: "Tips",
	others: "Others",
};

function formatRM(value: string | null): string {
	const n = Number(value ?? 0);
	return `RM ${n.toFixed(2)}`;
}

/** yyyy-MM-dd -> "Tue 21 Jul", matching how the PR saw the cell they tapped. */
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
 * The receipts a dispute is actually ABOUT.
 *
 * A dispute MAY name one receipt (`receiptId`, migration 0088) and when it does
 * that is the answer — exactly one paper, no derivation. The old docstring here
 * said "never a receipt", which stopped being true at 0088; deriving anyway is
 * how a two-shift night showed BOTH shifts' receipts as the evidence for a
 * claim about one of them, directly contradicting the shift block above.
 *
 * With no `receiptId` the claim covers the whole day, so fall back to how the
 * cell was built: lines on that date, in that bucket. A receipt qualifies if it
 * carries even one such line.
 *
 * Matched on `voucherId` as well as the date, because two PRs can work the same
 * night and `lineDate` alone would pull in somebody else's paper.
 *
 * `kind` is optional on the feed's line shape (a backend that has not restarted
 * yet omits it). Missing kind means the line cannot be attributed to a bucket,
 * so it is NOT matched — showing an unrelated receipt as "the evidence" is worse
 * than showing none and saying so.
 */
function receiptsForDispute(
	dispute: PaymentVoucherDispute,
	receipts: AgencyReceipt[],
): AgencyReceipt[] {
	if (dispute.receiptId) {
		return receipts.filter((r) => r.id === dispute.receiptId);
	}
	return receipts.filter(
		(r) =>
			r.voucherId === dispute.voucherId &&
			r.lines.some(
				(l) =>
					l.lineDate === dispute.disputeDate && l.kind === dispute.component,
			),
	);
}

/** What this receipt contributed to the disputed cell — not its whole total. */
function disputedSubtotal(
	receipt: AgencyReceipt,
	dispute: PaymentVoucherDispute,
): number {
	return receipt.lines
		.filter(
			(l) => l.lineDate === dispute.disputeDate && l.kind === dispute.component,
		)
		.reduce((sum, l) => sum + Number(l.amount || 0), 0);
}

/**
 * Correct the paper behind a disputed figure, without leaving the queue.
 *
 * SAME EDITOR as the Receipts sub-tab — deliberately the same component, not a
 * copy: a correction made while settling a dispute must obey exactly the rules a
 * correction made anywhere else obeys, and two editors would drift.
 *
 * This used to be impossible on purpose. The only way to change a voucher's
 * money was `PUT /payment-voucher/:id`, which deletes and re-inserts every line
 * — so upholding a PR's claim would have destroyed the very self-logged receipts
 * that claim was built on. The targeted receipt endpoints removed that trap, and
 * with it the reason to send the reviewer somewhere else mid-decision.
 */
/**
 * One shift behind a disputed figure: where it was, what the night was called,
 * whether it was a special event, its window, and the two stamps.
 *
 * Every absent value is spelled out. "not checked in" and "still on duty" are
 * different facts and neither is a dash — the agency is about to rule on money.
 *
 * `slot` prints VERBATIM. It must never go through `formatShiftTimeRange` /
 * `parseShiftWindow`, whose `?? "22:00"` / `?? "04:00"` defaults would render a
 * null slot as a confident, entirely fabricated "10pm – 4am".
 */
function DisputeShiftBlock({ shift }: { shift: DisputeShift }) {
	const ot = shift.overtimeMinutes ?? 0;
	return (
		<div className="rounded-md border border-[var(--iz-line,#2a2a3a)] px-2.5 py-2">
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-sm font-semibold">{shift.outletName || "—"}</span>
				{/* The event TYPE, always present — the column is NOT NULL and
				    defaults to 'normal', so once we have the shift we have this. */}
				<span
					className={`iz-pill !text-[10px] ${
						shift.eventKind === "special" ? "iz-pill-amber" : "iz-pill-ink"
					}`}
				>
					{shift.eventKind === "special" ? "Special event" : "Normal shift"}
				</span>
			</div>
			<p className="iz-tiny iz-muted mt-0.5">
				{shift.eventName?.trim() || "No event name"} · {shift.slot || "—"}
			</p>
			{/* The shift's OWN day, with the year — a payroll queue holds claims
			    months apart, and "Thu 6 Aug" alone reads as this year. This is
			    shift.shiftDate, NOT the dispute's date: the latter is the day the
			    receipt was logged, which differs on a midnight-crossing shift. */}
			<p className="iz-tiny iz-muted2 mt-0.5">
				{formatShiftDayDate(shift.shiftDate)}
			</p>
			<div className="mt-1.5 flex flex-wrap gap-4">
				<span>
					<span className="iz-tiny iz-muted block">Check-in</span>
					<span className="font-mono text-sm">
						{formatStampClock(shift.checkInAt, "not checked in")}
					</span>
				</span>
				<span>
					{/* "Shift end", NOT "checked out". The stored stamp is clamped to
					    the scheduled end when the PR taps out, so calling it a
					    check-out asserts a time that never happened on every
					    overtime shift. The real overrun is the OT beside it. */}
					<span className="iz-tiny iz-muted block">Shift end</span>
					<span className="font-mono text-sm">
						{formatStampClock(shift.checkOutAt, "still on duty")}
						{ot > 0 ? ` · +${ot}m OT` : ""}
					</span>
				</span>
				<span>
					{/* Derived from the two stamps ONLY. The OT beside "Shift end"
					    comes from the server's overtime_minutes and is the sole OT
					    truth — this never adds a second guess at it. */}
					<span className="iz-tiny iz-muted block">Duration</span>
					<span className="font-mono text-sm">
						{formatShiftDuration(shift.checkInAt, shift.checkOutAt)}
					</span>
				</span>
			</div>
		</div>
	);
}

/**
 * Which shift a claim is about — one, several, or none, and it says which.
 *
 * A dispute names a receipt only when the contested cell had one. With no
 * receipt the claim covers the WHOLE day, so every shift the PR worked that day
 * is in scope. Rendering `shifts[0]` would be a silent pick: two shifts in one
 * night are usually at different outlets, so the card would show the wrong
 * venue AND the wrong check-in while looking authoritative.
 */
function DisputeShiftFacts({ dispute }: { dispute: PaymentVoucherDispute }) {
	const shifts = dispute.shifts ?? [];

	if (shifts.length === 0) {
		return (
			<p className="iz-tiny iz-muted2 mt-2">
				Which shift · not linked — this claim names no receipt, or the receipt
				has no shift record.
			</p>
		);
	}

	return (
		<div className="mt-2">
			<p className="iz-tiny iz-muted mb-1">
				{shifts.length > 1
					? `This claim covers the whole day — ${shifts.length} shifts worked`
					: dispute.receiptId
						? "The shift behind this figure"
						: "This claim covers the whole day — 1 shift worked"}
			</p>
			<div className="flex flex-col gap-1.5">
				{shifts.map((shift) => (
					<DisputeShiftBlock key={shift.assignmentId} shift={shift} />
				))}
			</div>
		</div>
	);
}

function DisputeEvidence({
	dispute,
	receipts,
}: {
	dispute: PaymentVoucherDispute;
	receipts: AgencyReceipt[];
}) {
	const [openId, setOpenId] = useState<string | null>(null);
	const matches = receiptsForDispute(dispute, receipts);

	if (matches.length === 0) {
		return (
			<p className="iz-tiny iz-muted2 mt-3">
				{dispute.component === "wages" || dispute.component === "others"
					? "No receipt behind this — daily wages and OT are calculated from the check-in and check-out stamps, so the correction is to the shift record."
					: "No receipt found for this day and bucket. It may have been removed since the dispute was raised."}
			</p>
		);
	}

	return (
		<div className="mt-3 space-y-2">
			<p className="iz-tiny iz-muted">
				{matches.length === 1
					? "The receipt"
					: `The ${matches.length} receipts`}{" "}
				behind this figure — correct it here if the PR is right.
			</p>
			{matches.map((receipt) => {
				const editing = openId === receipt.id;
				// Verified means the week closed and the server refuses to re-decide
				// it, so the editor is withheld rather than offered and answered
				// with a 409 — same rule the Receipts sub-tab applies.
				const editable = receipt.status !== "verified";
				return (
					<div
						key={receipt.id}
						className="rounded-lg border border-[var(--iz-line)] bg-[var(--iz-bg2)]/40 p-2.5"
					>
						<div className="flex flex-wrap items-center gap-2">
							<span className="font-mono text-sm font-semibold">
								{receipt.orderNo ?? "No order no"}
							</span>
							<span className="iz-tiny iz-muted2">{receipt.receiptNo}</span>
							{/*
							 * The RECEIPT's own review state. The dispute's state is the
							 * amber "Open" pill on the row above — two different facts,
							 * and a reviewer settling a claim needs both: whether they
							 * already approved this paper, and whether the claim stands.
							 */}
							<span
								className={`iz-pill !text-[10px] ${
									receipt.status === "approved"
										? "iz-pill-green"
										: receipt.status === "verified"
											? "iz-pill-green"
											: "iz-pill-amber"
								}`}
							>
								{receipt.status === "pending"
									? "Pending"
									: receipt.status === "verified"
										? "Verified"
										: "Approved"}
							</span>
							<span className="iz-tiny ml-auto font-mono">
								{formatRM(disputedSubtotal(receipt, dispute).toFixed(2))}
							</span>
						</div>

						{/* THE PAPER ITSELF — the scan the OCR read these figures off.
						    Distinct from the PR's dispute attachment above: that is what
						    they photographed to argue, this is the original record being
						    argued about. Settling a "wrong commission" claim means holding
						    the two side by side, and neither was on screen. */}
						{(receipt.proofPhotos ?? []).length > 0 ? (
							<>
								<p className="iz-tiny iz-muted2 mt-2">
									The scanned receipt
									{receipt.receiptTime
										? ` · printed ${receipt.receiptTime}`
										: ""}
								</p>
								<ProofPhotos
									photos={receipt.proofPhotos ?? []}
									label={`${receipt.receiptNo} scan`}
								/>
							</>
						) : (
							<p className="iz-tiny iz-muted2 mt-2">
								No photo on this receipt — it was self-logged without one.
							</p>
						)}

						{editable && (
							<button
								type="button"
								className="iz-btn iz-btn-ghost mt-1.5 !h-7 !px-2.5 !text-[11px]"
								onClick={() => setOpenId(editing ? null : receipt.id)}
								aria-expanded={editing}
							>
								<Pencil className="mr-1 h-3 w-3" />{" "}
								{editing ? "Close editor" : "Edit receipt"}
							</button>
						)}
						{editable && editing && (
							<AgencyReceiptEditor receipt={receipt} lines={receipt.lines} />
						)}
					</div>
				);
			})}
		</div>
	);
}

/**
 * One dispute awaiting a decision.
 *
 * Shows what the voucher said (`disputedAmount`, computed server-side) beside
 * what the PR says it should be, because those two numbers are the whole
 * argument. Proof is displayed when attached and its absence is stated plainly
 * rather than left blank — a missing-record claim legitimately has no photo, so
 * "no proof attached" is information, not a defect.
 */
function DisputeRow({
	dispute,
	onResolve,
	busy,
	receipts,
}: {
	dispute: PaymentVoucherDispute;
	onResolve: (
		outcome: "accepted" | "rejected",
		note: string,
	) => Promise<void> | void;
	busy: boolean;
	receipts: AgencyReceipt[];
}) {
	const [note, setNote] = useState("");
	const [rejecting, setRejecting] = useState(false);
	const proof = dispute.proofPhotos ?? [];

	const submit = (outcome: "accepted" | "rejected") => {
		// A rejection needs a reason; the server enforces it too, so surfacing it
		// here is about not making the agency discover it via a 400.
		if (outcome === "rejected" && !note.trim()) {
			setRejecting(true);
			return;
		}
		void onResolve(outcome, note.trim());
	};

	return (
		<div className="rounded-xl border border-[var(--iz-line)] p-3">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					{/* The SHARED formatter, not a second copy — formatting the label here
					    by hand is exactly how this row ended up without a nickname while
					    the voucher card had one. */}
					<div className="text-sm font-semibold">
						{formatPayeeLabel(
							dispute.voucher.prNickname,
							dispute.voucher.prName,
						) || "Unknown PR"}{" "}
						· {COMPONENT_LABEL[dispute.component]}
					</div>
					<p className="iz-tiny iz-muted mt-0.5">
						{formatDay(dispute.disputeDate)}
						{dispute.voucher.weekStart && dispute.voucher.weekEnd
							? ` · week ${dispute.voucher.weekStart} to ${dispute.voucher.weekEnd}`
							: ""}
					</p>
				</div>
				{/* The row used to hardcode "Open" — true only because the panel could
				    not fetch anything else. Now that settled claims are listed, the
				    pill has to say which one this is. */}
				{dispute.outcome ? (
					<span
						className={`iz-pill !text-[10px] ${
							dispute.outcome === "accepted"
								? "iz-pill-green"
								: dispute.outcome === "rejected"
									? "iz-pill-red"
									: "iz-pill-ink"
						}`}
					>
						{dispute.outcome === "accepted"
							? "Accepted"
							: dispute.outcome === "rejected"
								? "Rejected"
								: "Withdrawn"}
					</span>
				) : (
					<span className="iz-pill iz-pill-amber !text-[10px]">Open</span>
				)}
			</div>

			{/* WHICH SHIFT this money is about — above the figures, because the
			    answer to "is this claim right" starts with which night it was. */}
			<DisputeShiftFacts dispute={dispute} />

			<div className="mt-2 flex flex-wrap gap-4 text-sm">
				<span>
					<span className="iz-tiny iz-muted block">Voucher says</span>
					<span className="font-mono">{formatRM(dispute.disputedAmount)}</span>
				</span>
				{dispute.claimedAmount !== null && (
					<span>
						<span className="iz-tiny iz-muted block">PR claims</span>
						<span className="font-mono">{formatRM(dispute.claimedAmount)}</span>
					</span>
				)}
			</div>

			{dispute.reason && (
				<p className="iz-tiny mt-2">
					<span className="iz-muted">Reason: </span>
					{dispute.reason}
				</p>
			)}
			{dispute.note && <p className="iz-tiny iz-muted2 mt-1">{dispute.note}</p>}

			<div className="mt-2 flex items-center gap-1.5">
				{proof.length > 0 ? (
					<>
						<Paperclip className="h-3.5 w-3.5" />
						<span className="iz-tiny">
							What the PR attached · {proof.length} image
							{proof.length > 1 ? "s" : ""}
						</span>
					</>
				) : (
					<>
						<ImageOff className="h-3.5 w-3.5 opacity-60" />
						{/* Not a defect: a "missing record" claim has nothing to photograph. */}
						<span className="iz-tiny iz-muted2">No proof attached</span>
					</>
				)}
			</div>
			<ProofPhotos photos={proof} label="PR proof" />

			<DisputeEvidence dispute={dispute} receipts={receipts} />

			{/* A DECIDED claim is read-only. The server refuses a second decision, so
			    offering Accept/Reject on one already settled is a button that can
			    only fail — and worse, it invites the reviewer to think the outcome is
			    still theirs to change. What they need instead is the record: what was
			    decided, and what was said to the PR. */}
			{dispute.outcome ? (
				dispute.resolutionNote && (
					<p className="iz-tiny iz-muted mt-3">
						<span className="iz-muted2">Told the PR: </span>
						{dispute.resolutionNote}
					</p>
				)
			) : (
				<>
					<textarea
						className="iz-field-input mt-3 w-full"
						rows={2}
						placeholder="Note to the PR (required when rejecting)"
						value={note}
						onChange={(e) => {
							setNote(e.target.value);
							if (e.target.value.trim()) setRejecting(false);
						}}
					/>
					{rejecting && (
						<p className="iz-tiny mt-1 text-[var(--iz-amber,#d9b97a)]">
							Tell the PR why this was rejected.
						</p>
					)}

					<div className="mt-2 flex gap-2">
						<button
							type="button"
							className="iz-btn iz-btn-primary flex items-center gap-1.5"
							disabled={busy}
							onClick={() => submit("accepted")}
						>
							<Check className="h-4 w-4" /> Accept
						</button>
						<button
							type="button"
							className="iz-btn iz-btn-soft flex items-center gap-1.5"
							disabled={busy}
							onClick={() => submit("rejected")}
						>
							<X className="h-4 w-4" /> Reject
						</button>
					</div>
				</>
			)}
		</div>
	);
}

/**
 * The agency's dispute queue.
 *
 * Accepting records the DECISION and notifies the PR; it still does not rewrite
 * any amount by itself, because "the PR is right" and "here is the corrected
 * figure" are two different statements and only a person can make the second.
 *
 * What changed (4 Aug 2026): the correction no longer happens somewhere else.
 * The same `AgencyReceiptEditor` the Receipts sub-tab uses now opens on the
 * receipts behind the disputed cell, so a reviewer can fix the paper and settle
 * the claim in one place. That was previously impossible for a real reason —
 * the only edit path was `PUT /payment-voucher/:id`, which deletes and
 * re-inserts every line, so upholding a claim would have destroyed the PR's own
 * self-logged receipts that the claim rested on. The targeted receipt endpoints
 * removed that trap.
 */
/** Open = nobody has decided it yet. `outcome` stays null until somebody does. */
const isOpenDispute = (d: PaymentVoucherDispute) => !d.outcome;

type DisputeScope = "open" | "resolved" | "all";

export function DisputeQueuePanel() {
	const toast = useStore((s) => s.toast);
	/**
	 * EVERY dispute, not only the open ones.
	 *
	 * This asked the server for `?open=1`, so a settled dispute was never fetched
	 * by any agency screen — it existed in the database and appeared nowhere, and
	 * the panel read "No open disputes" whether none had ever been raised or one
	 * had been accepted an hour earlier. The owner caught exactly that: *"yesterday
	 * got one successful dispute right show where?"*. A decision the agency made
	 * about somebody's pay has to stay visible after it is made.
	 */
	const {
		disputes: allDisputes,
		isLoading,
		resolve,
		isResolving,
	} = useAgencyDisputes(false);
	const [scope, setScope] = useState<DisputeScope>("open");
	const [search, setSearch] = useState("");

	const openCount = allDisputes.filter(isOpenDispute).length;
	const resolvedCount = allDisputes.length - openCount;

	const disputes = useMemo(() => {
		const byScope = allDisputes.filter((d) =>
			scope === "all"
				? true
				: scope === "open"
					? isOpenDispute(d)
					: !isOpenDispute(d),
		);
		const q = search.trim().toLowerCase();
		if (!q) return byScope;
		// Everything a reviewer might have in their head when they come looking:
		// whose it is, which day, which bucket, why it was raised, how it ended.
		// Everything the row shows, so anything a reviewer can read they can also
		// search for — the PR (through the voucher join), the day, the bucket, why
		// it was raised, how it ended, and what was said back.
		return byScope.filter((d) =>
			[
				d.voucher?.prName,
				d.disputeDate,
				d.component,
				d.reason,
				d.resolutionNote,
				d.outcome,
			]
				.filter(Boolean)
				.some((field) => String(field).toLowerCase().includes(q)),
		);
	}, [allDisputes, scope, search]);
	// One query for the whole queue, not one per row — react-query dedupes on the
	// shared key, and the rows only ever read from it.
	const { receipts } = useAgencyReceipts();

	const handle = async (
		dispute: PaymentVoucherDispute,
		outcome: "accepted" | "rejected",
		note: string,
	) => {
		try {
			await resolve({
				disputeId: dispute.id,
				outcome,
				resolutionNote: note || undefined,
			});
			toast(
				outcome === "accepted" ? "Dispute accepted" : "Dispute rejected",
				"success",
			);
		} catch {
			toast("Could not record that decision", "warn");
		}
	};

	return (
		<>
			<IzSectionLabel>
				Disputes{openCount > 0 ? ` (${openCount} open)` : ""}
			</IzSectionLabel>
			<IzCard>
				{isLoading && <p className="iz-tiny iz-muted">Loading disputes…</p>}

				{!isLoading && allDisputes.length > 0 && (
					<div className="mb-2.5 flex flex-wrap items-center gap-1.5">
						{(
							[
								["open", "Open", openCount],
								["resolved", "Resolved", resolvedCount],
								["all", "All", allDisputes.length],
							] as [DisputeScope, string, number][]
						).map(([value, label, count]) => (
							// Same chip as the Payment Vouchers filter above — one filter
							// idiom on one screen, not two that merely look alike.
							<button
								key={value}
								type="button"
								className={`iz-filter-chip${scope === value ? " on" : ""}`}
								onClick={() => setScope(value)}
							>
								{label}
								<span className="iz-filter-chip__count">({count})</span>
							</button>
						))}
						<input
							className="iz-field-input ml-auto !h-8 !w-48 !text-[12px]"
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="PR, day, reason…"
							aria-label="Search disputes"
						/>
					</div>
				)}

				{/* Three different silences, three different sentences. "No open
				    disputes" was printed for all of them, so a settled claim and a
				    week nobody has ever disputed looked identical. */}
				{!isLoading && allDisputes.length === 0 && (
					<p className="iz-tiny iz-muted">
						No disputes raised. PRs raise these per day and per component from
						their Payment screen.
					</p>
				)}
				{!isLoading && allDisputes.length > 0 && disputes.length === 0 && (
					<p className="iz-tiny iz-muted">
						{search.trim()
							? `Nothing matches "${search.trim()}" in ${scope === "all" ? "any dispute" : `${scope} disputes`}.`
							: scope === "open"
								? `Nothing waiting on you — ${resolvedCount} already settled. Switch to Resolved to see ${resolvedCount === 1 ? "it" : "them"}.`
								: "None settled yet."}
					</p>
				)}

				{disputes.length > 0 && (
					<div className="space-y-3">
						<p className="iz-tiny iz-muted">
							Accepting records the decision and tells the PR. It does not
							change the money on its own — correct the receipt below first if
							the PR is right, then accept.
						</p>
						{disputes.map((d) => (
							<DisputeRow
								key={d.id}
								dispute={d}
								busy={isResolving}
								receipts={receipts}
								onResolve={(outcome, note) => handle(d, outcome, note)}
							/>
						))}
					</div>
				)}
			</IzCard>
		</>
	);
}
