import { useAgencyPvEvidence } from "@agency-portal/hooks/use-agency-pvs";
import { getAgencyIdentity } from "@agency-portal/lib/agency-identity";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { waiveCancelFee } from "@/services/agency-uncharged";

/**
 * Cancellation fees ALREADY ON this voucher, each with a Waive.
 *
 * 🔴 WHY THIS IS NOT IN UnchargedFeesPanel. That panel answers "what have we
 * sealed and never collected", and since 0130 the answer for cancellations is
 * almost always NOTHING: the fee attaches itself the moment the PR cancels, so
 * it is charged before anyone opens a Finance screen. A fee only reaches the
 * uncharged list when the attach could not happen — the week's voucher was
 * already sent. Putting the Waive there would have hidden it from every ordinary
 * case and shown it only in the rare one.
 *
 * The agency's real decision now happens HERE, looking at the voucher the
 * deduction is actually on. Charging is the default; waiving is the exception,
 * which is the whole point of the opt-out design.
 *
 * ── WHERE THE ASSIGNMENT ID COMES FROM ──────────────────────────────────────
 * Out of the line's own `ref`, not a second request. `penaltyLineRef` packs it
 * as `others|penalty|0.00|<assignmentId>-pen|`, and the `-pen` marker is the
 * same one `componentFromRef` keys the 'deduction' classification off. Reading
 * it here means this panel needs no endpoint of its own and cannot disagree with
 * the server about which line belongs to which cancellation.
 */

/** Matches `encodeRef` / REF_SEP in the backend controller. */
const REF_SEP = "|";

/** `others|penalty|0.00|<uuid>-pen|` -> `<uuid>`, or null when it is not one. */
export function assignmentIdFromPenaltyRef(
	ref: string | null | undefined,
): string | null {
	if (!ref || !ref.includes(REF_SEP)) return null;
	const dedupe = ref.split(REF_SEP)[3];
	if (!dedupe?.endsWith("-pen")) return null;
	const id = dedupe.slice(0, -"-pen".length);
	// A weekly penalty_charge id packs the same way, and waiving one of those is
	// not what this endpoint does. Both are uuids, so shape cannot separate them;
	// the caller passes only lines it already knows are cancellation fees.
	return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * Statuses in which a line may still come OFF the voucher.
 *
 * The mirror of the server's OPEN_WEEK_STATUSES, which is what the waive
 * endpoint actually enforces. Held here too so the button DISAPPEARS rather than
 * offering an action that will 409 — but the server stays the authority, and a
 * stale tab that clicks anyway is refused there.
 */
const OPEN_WEEK_STATUSES = ["pending_review", "disputed"];

export function CancellationFeesPanel({
	voucherId,
	canWaive,
}: {
	voucherId: string | null;
	canWaive: boolean;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const identity = useMemo(() => getAgencyIdentity(), []);
	const agencyId = identity?.agencyId ?? null;

	// Fetches its own lines rather than taking them as a prop, so mounting this
	// is one line in a route file two other sessions are also editing — and so it
	// reads the SAME cached voucher PayrollVerifyPanel does, never a second copy
	// that could disagree about which lines exist.
	const { voucher } = useAgencyPvEvidence(voucherId);

	const [openFor, setOpenFor] = useState<string | null>(null);
	const [reason, setReason] = useState("");
	const [error, setError] = useState<string | null>(null);

	const editable = OPEN_WEEK_STATUSES.includes(voucher?.status ?? "");

	const fees = useMemo(
		() =>
			(voucher?.lines ?? [])
				// `component` is the authoritative classification — the typed column,
				// filled on insert. The ref is only how the ASSIGNMENT id is recovered.
				.filter((l) => l.component === "deduction")
				.map((l) => ({
					line: l,
					assignmentId: assignmentIdFromPenaltyRef(l.ref),
				}))
				.filter((x): x is { line: (typeof x)["line"]; assignmentId: string } =>
					Boolean(x.assignmentId),
				),
		[voucher],
	);

	const waiveMut = useMutation({
		mutationFn: (vars: { assignmentId: string; reason: string | null }) =>
			waiveCancelFee(
				agencyId as string,
				vars.assignmentId,
				vars.reason,
				logout,
			),
		onSuccess: (res) => {
			if (!res.success) {
				setError(res.message);
				return;
			}
			setOpenFor(null);
			setReason("");
			setError(null);
			// The voucher's lines and totals both moved, and the Finance list keys
			// off the same rows — refresh all of them rather than patching one and
			// letting the others describe a voucher that no longer exists.
			void queryClient.invalidateQueries({
				queryKey: ["agency", "payment-voucher"],
			});
			void queryClient.invalidateQueries({ queryKey: ["agency-uncharged"] });
		},
		onError: () => setError(t.agencyQueues.couldNotWaive),
	});

	// Nothing to show is the common case — most vouchers carry no cancellation.
	// A permanent empty "Cancellation fees" card trains people to stop reading it.
	if (fees.length === 0) return null;

	return (
		<section className="iz-card mt-3 p-3">
			<div className="flex items-baseline justify-between gap-2">
				<b className="iz-sm text-[var(--iz-txt)]">
					{fees.length === 1
						? t.agencyQueues.cancellationFeeOnVoucherOne
						: t.agencyQueues.cancellationFeeOnVoucherMany}
				</b>
				<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-red)]">
					-RM{" "}
					{fees
						.reduce((s, f) => s + Math.abs(Number(f.line.amount) || 0), 0)
						.toFixed(2)}
				</b>
			</div>
			<p className="iz-tiny iz-muted2 mt-1">
				{editable
					? t.agencyQueues.waiveBeforeSendHint
					: t.agencyQueues.voucherSentCannotWaive}
			</p>

			<div className="mt-2 flex flex-col gap-1.5">
				{fees.map(({ line, assignmentId }) => (
					<div
						key={line.id}
						className="rounded-lg border border-[var(--iz-line)] bg-[rgba(255,255,255,0.02)] p-2"
					>
						<div className="flex items-baseline justify-between gap-2">
							<span className="iz-sm min-w-0 flex-1 text-[var(--iz-txt)]">
								{line.description}
							</span>
							<b className="iz-sm shrink-0 tabular-nums text-[var(--iz-red)]">
								-RM {Math.abs(Number(line.amount) || 0).toFixed(2)}
							</b>
						</div>
						<span className="iz-tiny iz-muted2 block">
							{line.lineDate ?? "—"}
						</span>

						{editable && canWaive && openFor !== assignmentId && (
							<button
								type="button"
								className="iz-btn iz-btn-soft mt-2 !py-1 !text-xs"
								onClick={() => {
									setOpenFor(assignmentId);
									setReason("");
									setError(null);
								}}
							>
								{t.agencyQueues.waiveThisCharge}
							</button>
						)}

						{openFor === assignmentId && (
							<div className="mt-2 border-t border-[var(--iz-line)] pt-2">
								{/* A reason is asked for, not required. The endpoint stores it
								    on the assignment beside who waived it, and "why" is the
								    only thing that makes giving money back auditable later. */}
								<label
									className="iz-sm block font-semibold text-[var(--iz-txt)]"
									htmlFor="waive-why"
								>
									{t.agencyQueues.whyWaiving}
								</label>
								{/* `iz-field-input` is the house field style — a real border,
								    background and 12px padding. This used `iz-input`, which is
								    NOT DEFINED IN THE THEME AT ALL, so the control rendered as
								    bare text: the placeholder read like a caption and nothing
								    looked typeable. AgencyLinksPanel carries a comment about
								    hitting exactly this, so it has now cost two people. If you
								    add a field here, copy this class — do not invent one. */}
								<input
									id="waive-why"
									className="iz-field-input mt-1.5 !text-sm"
									value={reason}
									maxLength={500}
									// The AGENCY types this, so it reads in their voice: "we", not
									// "the agency". The two examples are the two kinds of reason
									// that actually come up — something that happened to the PR,
									// and the agency having caused the cancellation itself, which
									// is the commonest fair reason to waive.
									placeholder={t.agencyQueues.waiveReasonPlaceholder}
									onChange={(e) => setReason(e.target.value)}
								/>
								{error && (
									<p className="iz-tiny mt-1 text-[var(--iz-red)]">{error}</p>
								)}
								<div className="mt-2 flex gap-2">
									<button
										type="button"
										className="iz-btn iz-btn-soft flex-1 !py-1 !text-xs"
										onClick={() => {
											setOpenFor(null);
											setError(null);
										}}
									>
										{t.agencyQueues.keepTheCharge}
									</button>
									<button
										type="button"
										className="iz-btn iz-btn-primary flex-1 !py-1 !text-xs"
										disabled={waiveMut.isPending || !agencyId || !voucherId}
										onClick={() =>
											waiveMut.mutate({
												assignmentId,
												reason: reason.trim() || null,
											})
										}
									>
										{waiveMut.isPending
											? t.agencyQueues.waiving
											: t.agencyQueues.waive}
									</button>
								</div>
							</div>
						)}
					</div>
				))}
			</div>
		</section>
	);
}
