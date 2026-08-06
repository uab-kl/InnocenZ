import { AgencyReceiptEditor } from "@agency-portal/components/agency/AgencyReceiptEditor";
import { ProofPhotos } from "@agency-portal/components/agency/ProofPhotoViewer";
import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { useAgencyPvReceiptReview } from "@agency-portal/hooks/use-agency-pv-receipt-review";
import { useAgencyPvEvidence } from "@agency-portal/hooks/use-agency-pvs";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { useStore } from "@agency-portal/lib/store";
import {
	Check,
	FileWarning,
	Pencil,
	Receipt,
	RotateCcw,
	ScanLine,
} from "lucide-react";
import { useState } from "react";
import type {
	PaymentVoucherComponent,
	PaymentVoucherLine,
	PaymentVoucherReceipt,
	PaymentVoucherReceiptStatus,
} from "@/services/payment-voucher";

const COMPONENT_LABELS: Record<PaymentVoucherComponent, string> = {
	wages: "Wages",
	drink_commission: "Drinks commission",
	tip_commission: "Tips commission",
	ot: "Overtime",
	deduction: "Deductions",
	other: "Other",
};

/** Commission is earned per receipt, so only these two need evidence. */
const NEEDS_EVIDENCE: PaymentVoucherComponent[] = [
	"drink_commission",
	"tip_commission",
];

const money = (n: number) => `RM ${n.toFixed(2)}`;
const sum = (lines: PaymentVoucherLine[]) =>
	lines.reduce((total, line) => total + Number(line.amount || 0), 0);

function sourceLabel(source: PaymentVoucherReceipt["source"]): string {
	if (source === "scan") return "Scanned";
	if (source === "manual") return "Self-logged";
	return "Check-in";
}

const STATUS_LABEL: Record<PaymentVoucherReceiptStatus, string> = {
	pending: "Waiting on you",
	approved: "Approved",
	verified: "Verified",
};

const STATUS_PILL: Record<PaymentVoucherReceiptStatus, string> = {
	pending: "iz-pill-amber",
	approved: "iz-pill-green",
	verified: "iz-pill-ink",
};

/**
 * A proof photo is stored as an opaque string — the PR app sends a data URL, but
 * older rows hold a path. Rendering a path as an image gives a broken icon that
 * reads as "the evidence is missing", which is the one thing this panel must
 * never say by accident. So only render what is certainly renderable, and print
 * the rest as the reference it is.
 */
/**
 * A voucher line's stored `component` in the editor's vocabulary.
 *
 * Only the two the agency may ADD are mapped. Everything else — wages, OT,
 * deductions, and an unclassified NULL — returns undefined, which the editor
 * reads as "cannot tell", leaving the category open rather than guessing a
 * bucket for a line that belongs in neither.
 */
const kindOfComponent = (
	component: string | null,
): "drinks" | "tips" | undefined => {
	if (component === "drink_commission") return "drinks";
	if (component === "tip_commission") return "tips";
	return undefined;
};

// `isRenderablePhoto` moved to ProofPhotoViewer — one rule about what counts as
// renderable evidence, in one place, rather than a private copy per panel.

/**
 * One receipt, with the agency's decision on it.
 *
 * The correction path is `AgencyReceiptEditor`, shared with the Receipts feed
 * rather than reimplemented here: one editor means one set of rules about what
 * may be changed, where two copies would disagree the first time either was
 * touched. Every write it makes is a `PATCH`/`POST` on an id, which is what
 * keeps this away from `PUT /payment-voucher/:id` — the wholesale rewrite that
 * once deleted the PR's proof photos.
 */
function ReceiptRow({
	receipt,
	lines,
	canReview,
	voucherSigned,
	busy,
	onApprove,
	onWithdraw,
}: {
	receipt: PaymentVoucherReceipt;
	lines: PaymentVoucherLine[];
	canReview: boolean;
	/** The PR has counter-signed — every correction endpoint refuses from here. */
	voucherSigned: boolean;
	busy: boolean;
	onApprove: () => void;
	onWithdraw: () => void;
}) {
	const [editing, setEditing] = useState(false);

	const proofPhotos = receipt.proofPhotos ?? [];
	// Verified means the week is closed. Nothing on it may be re-decided or
	// re-priced — the server refuses both, and offering the buttons anyway would
	// just produce a 409 the agency has to interpret.
	//
	// A PR-SIGNED voucher is the same situation and was missing here: every one
	// of these paths — reviewReceipt, editReceiptLine, addReceiptLine,
	// editReceipt — refuses on `prSignedAt`, so the buttons were offered for
	// writes that could only 409. Re-pricing behind a signature is exactly what
	// that refusal exists to stop.
	const editable = canReview && receipt.status !== "verified" && !voucherSigned;

	return (
		<div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-center gap-2">
					<ScanLine className="h-3.5 w-3.5" />
					<span className="text-sm font-medium">{receipt.receiptNo}</span>
					<span
						className={`iz-pill !text-[10px] ${receipt.source === "scan" ? "iz-pill-green" : "iz-pill-amber"}`}
					>
						{sourceLabel(receipt.source)}
					</span>
					<span
						className={`iz-pill !text-[10px] ${STATUS_PILL[receipt.status]}`}
					>
						{STATUS_LABEL[receipt.status]}
					</span>
				</div>
				<span className="font-medium">{money(sum(lines))}</span>
			</div>

			<p className="iz-tiny iz-muted2 mt-0.5">
				{receipt.receiptDate ?? "—"}
				{receipt.orderNo ? ` · order ${receipt.orderNo}` : ""} · {lines.length}{" "}
				{lines.length === 1 ? "line" : "lines"} ·{" "}
				{proofPhotos.length > 0
					? `${proofPhotos.length} proof photo${proofPhotos.length === 1 ? "" : "s"}`
					: "no proof photo"}
				{receipt.status !== "pending" &&
					` · ${receipt.reviewedBy ? `by ${receipt.reviewedBy}` : "reviewed"} ${
						receipt.reviewedAt
							? new Date(receipt.reviewedAt).toLocaleDateString()
							: "before this review existed"
					}`}
			</p>

			{receipt.note && (
				<p className="iz-tiny mt-1">
					<span className="iz-muted2">PR's note:</span> {receipt.note}
				</p>
			)}

			{/* Zoomable, like the dispute queue: a 64px thumbnail of a phone photo
			    cannot be read, and the whole point of this panel is checking the
			    printed figures against the lines. */}
			<ProofPhotos photos={proofPhotos} label={`${receipt.receiptNo} scan`} />

			<div className="mt-1.5">
				{lines.map((line) => (
					<div
						key={line.id}
						className="iz-tiny flex flex-wrap items-center gap-2 py-1"
					>
						<span className="iz-muted2">
							{line.quantity} × {line.description}
						</span>
						<span className="font-medium">
							{money(Number(line.amount || 0))}
						</span>
					</div>
				))}
			</div>

			{/* Say WHY the controls are gone. A row that simply loses its buttons
			    reads as a permissions bug; the rule is the useful thing. */}
			{canReview && voucherSigned && (
				<p className="iz-tiny iz-muted2 mt-1.5">
					The PR has signed this voucher — receipts on it can no longer be
					approved or corrected.
				</p>
			)}

			{editable && (
				<>
					<div className="mt-1.5 flex flex-wrap gap-2">
						{receipt.status === "pending" ? (
							<button
								type="button"
								className="iz-btn iz-btn-soft !h-7 !px-2.5 !text-[11px]"
								disabled={busy}
								onClick={onApprove}
							>
								<Check className="mr-1 h-3 w-3" /> Approve
							</button>
						) : (
							<button
								type="button"
								className="iz-btn iz-btn-ghost !h-7 !px-2.5 !text-[11px]"
								disabled={busy}
								onClick={onWithdraw}
							>
								<RotateCcw className="mr-1 h-3 w-3" /> Withdraw approval
							</button>
						)}
					</div>

					{/*
					 * Under Approve, not beside it: approving is the common move and
					 * correcting is the exception, and a row of equal buttons would make
					 * the two read as alternatives of the same weight.
					 */}
					<div className="mt-1.5">
						<button
							type="button"
							className="iz-btn iz-btn-ghost !h-7 !px-2.5 !text-[11px]"
							onClick={() => setEditing((v) => !v)}
							aria-expanded={editing}
						>
							<Pencil className="mr-1 h-3 w-3" />{" "}
							{editing ? "Close editor" : "Edit"}
						</button>
					</div>

					{editing && (
						<AgencyReceiptEditor
							receipt={receipt}
							// The voucher detail carries `component`, the editor speaks `kind`.
							// Translated here rather than widening the editor's props to accept
							// both spellings — the mapping is this panel's shape problem, not a
							// second vocabulary for every caller to learn.
							lines={lines.map((line) => ({
								...line,
								kind: kindOfComponent(line.component),
							}))}
						/>
					)}
				</>
			)}
		</div>
	);
}

/**
 * What the agency checks before issuing a week's voucher: every line grouped by
 * component, and — the point of the screen — which commission lines have no
 * receipt behind them.
 *
 * The distinction matters because of how the money works: the outlet pays the
 * agency on ALL sales, but a PR earns commission only on receipts they actually
 * scanned or self-logged. A self-declared line with no receipt is the one thing
 * an agency cannot check against anything, so it is surfaced rather than left to
 * be spotted in a list.
 *
 * The receipts card is where the owner's `PENDING → APPROVED → VERIFIED` review
 * happens: the photo and the PR's note beside the figures, with the correction
 * editor one click under Approve. Writes are gated on `raisePv`, mirroring the
 * server's `agencyOwnerOrFinance` on every one of those routes — the read stays
 * open, because seeing a decision is not the authority to make one.
 *
 * The component totals above it remain read-only: there is still no endpoint
 * that decides a whole week at once, and a button that only changed local state
 * would repeat the mistake the dispute "resolve" button already makes.
 */
export function PayrollVerifyPanel({
	voucherId,
}: {
	voucherId: string | null;
}) {
	const { voucher, isLoading } = useAgencyPvEvidence(voucherId);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const canReview = agencyCan(agencySubRole, "raisePv");
	const {
		pendingCount,
		reviewReceipt,
		isSaving,
		error: reviewError,
	} = useAgencyPvReceiptReview(voucherId);

	if (!voucherId) return null;
	if (isLoading) {
		return (
			<>
				<IzSectionLabel>Verify</IzSectionLabel>
				<IzCard>
					<p className="iz-tiny iz-muted">Loading receipts…</p>
				</IzCard>
			</>
		);
	}
	if (!voucher) return null;

	const lines = voucher.lines ?? [];
	const receipts = voucher.receipts ?? [];

	const commissionLines = lines.filter(
		(line) =>
			line.component !== null && NEEDS_EVIDENCE.includes(line.component),
	);
	const unbacked = commissionLines.filter((line) => !line.receiptId);
	const unclassified = lines.filter((line) => line.component === null);

	// Group every line by bucket so the week reconciles on screen.
	const groups = new Map<string, PaymentVoucherLine[]>();
	for (const line of lines) {
		const key = line.component ?? "unclassified";
		groups.set(key, [...(groups.get(key) ?? []), line]);
	}

	return (
		<>
			<IzSectionLabel>Verify</IzSectionLabel>

			{unbacked.length > 0 ? (
				<IzCard className="border-[rgba(217,185,122,.35)]">
					<div className="flex items-start gap-2">
						<FileWarning className="mt-0.5 h-4 w-4 text-[var(--iz-amber,#d9b97a)]" />
						<div>
							<div className="text-sm font-semibold">
								{unbacked.length} commission{" "}
								{unbacked.length === 1 ? "line has" : "lines have"} no receipt
							</div>
							<p className="iz-tiny iz-muted mt-1">
								{money(sum(unbacked))} was self-declared with nothing to check
								it against. Confirm with the outlet before issuing.
							</p>
							<ul className="mt-2 space-y-1">
								{unbacked.map((line) => (
									<li key={line.id} className="iz-tiny iz-muted2">
										{line.lineDate ?? "—"} · {line.description} ·{" "}
										{money(Number(line.amount || 0))}
									</li>
								))}
							</ul>
						</div>
					</div>
				</IzCard>
			) : (
				<IzCard>
					<p className="iz-tiny iz-muted">
						{commissionLines.length > 0
							? "Every commission line on this voucher is backed by a receipt."
							: "This voucher has no commission lines to verify."}
					</p>
				</IzCard>
			)}

			<IzCard>
				<div className="text-sm font-semibold">This week by component</div>
				<div className="mt-2">
					{[...groups.entries()].map(([key, groupLines]) => (
						<div
							key={key}
							className="flex items-center justify-between border-b border-[var(--iz-line)] py-2 last:border-0"
						>
							<div>
								<div className="text-sm">
									{key === "unclassified"
										? "Unclassified"
										: COMPONENT_LABELS[key as PaymentVoucherComponent]}
								</div>
								<div className="iz-tiny iz-muted2">
									{groupLines.length}{" "}
									{groupLines.length === 1 ? "line" : "lines"}
								</div>
							</div>
							<div className="font-medium">{money(sum(groupLines))}</div>
						</div>
					))}
				</div>
				{unclassified.length > 0 && (
					<p className="iz-tiny iz-muted2 mt-2">
						Unclassified lines predate component tracking — they are counted in
						the totals but cannot be disputed per component.
					</p>
				)}
			</IzCard>

			<IzCard>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-sm font-semibold">
						<Receipt className="h-4 w-4" /> Receipts ({receipts.length})
					</div>
					{pendingCount > 0 && (
						<span className="iz-pill iz-pill-amber !text-[10px]">
							{pendingCount} waiting on you
						</span>
					)}
				</div>

				{pendingCount > 0 && (
					<p className="iz-tiny iz-muted mt-1.5">
						This voucher cannot be sent until each of these is approved — and
						the PR cannot dispute the money behind one until you have.
					</p>
				)}

				{reviewError && (
					<p className="iz-tiny mt-1.5 text-[var(--iz-red,#c0554f)]">
						{reviewError}
					</p>
				)}

				{receipts.length === 0 ? (
					<p className="iz-tiny iz-muted mt-2">
						No receipts logged for this week.
					</p>
				) : (
					<div className="mt-2">
						{receipts.map((receipt) => (
							<ReceiptRow
								key={receipt.id}
								receipt={receipt}
								lines={lines.filter((line) => line.receiptId === receipt.id)}
								canReview={canReview}
								voucherSigned={Boolean(voucher?.prSignedAt)}
								busy={isSaving}
								onApprove={() =>
									reviewReceipt({ receiptId: receipt.id, status: "approved" })
								}
								onWithdraw={() =>
									reviewReceipt({ receiptId: receipt.id, status: "pending" })
								}
							/>
						))}
					</div>
				)}

				{!canReview && receipts.length > 0 && (
					<p className="iz-tiny iz-muted2 mt-2">
						Your agency role can see these receipts but not approve them — owner
						and finance review receipts.
					</p>
				)}
			</IzCard>
		</>
	);
}
