import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyDisputes } from "@agency-portal/hooks/use-agency-disputes";
import { useStore } from "@agency-portal/lib/store";
import { Check, ImageOff, Paperclip, X } from "lucide-react";
import { useState } from "react";
import type { PaymentVoucherDispute } from "@/services/payment-voucher";

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
}: {
	dispute: PaymentVoucherDispute;
	onResolve: (
		outcome: "accepted" | "rejected",
		note: string,
	) => Promise<void> | void;
	busy: boolean;
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
					<div className="text-sm font-semibold">
						{dispute.voucher.prName ?? "Unknown PR"} ·{" "}
						{COMPONENT_LABEL[dispute.component]}
					</div>
					<p className="iz-tiny iz-muted mt-0.5">
						{formatDay(dispute.disputeDate)}
						{dispute.voucher.weekStart && dispute.voucher.weekEnd
							? ` · week ${dispute.voucher.weekStart} to ${dispute.voucher.weekEnd}`
							: ""}
					</p>
				</div>
				<span className="iz-pill iz-pill-amber !text-[10px]">Open</span>
			</div>

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
							{proof.length} proof image{proof.length > 1 ? "s" : ""}
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
		</div>
	);
}

/**
 * The agency's dispute queue.
 *
 * Accepting records the decision and notifies the PR; it deliberately does NOT
 * rewrite the voucher's amounts. Editing the money stays a separate, explicit
 * action on the voucher itself, because saving a voucher deletes and re-inserts
 * every line on it — including the PR's own self-logged receipts, which would
 * vanish at the moment their claim was upheld.
 */
export function DisputeQueuePanel() {
	const toast = useStore((s) => s.toast);
	const { disputes, isLoading, resolve, isResolving } = useAgencyDisputes(true);

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
				Disputes{disputes.length > 0 ? ` (${disputes.length})` : ""}
			</IzSectionLabel>
			<IzCard>
				{isLoading && <p className="iz-tiny iz-muted">Loading disputes…</p>}

				{!isLoading && disputes.length === 0 && (
					<p className="iz-tiny iz-muted">
						No open disputes. PRs raise these per day and per component from
						their Payment screen.
					</p>
				)}

				{disputes.length > 0 && (
					<div className="space-y-3">
						<p className="iz-tiny iz-muted">
							Accepting records the decision and tells the PR. It does not
							change the voucher amounts — edit the voucher itself for that.
						</p>
						{disputes.map((d) => (
							<DisputeRow
								key={d.id}
								dispute={d}
								busy={isResolving}
								onResolve={(outcome, note) => handle(d, outcome, note)}
							/>
						))}
					</div>
				)}
			</IzCard>
		</>
	);
}
