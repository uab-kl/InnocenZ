import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatPrice } from "@/lib/utils";
import {
	markPaymentRefunded,
	REFUND_REFERENCE_MAX,
	REFUNDS_DUE_QUERY_KEY,
	type RefundDue,
} from "@/services/subscription-payment";
import { localiseRefundMessage } from "./refund-copy";

/**
 * "MARK REFUNDED" — the confirm step behind one line of the refunds-due card.
 *
 * It asks for the ONE thing the server requires: the refund's own bank or
 * gateway reference, because "refunded" with nothing to match on a statement is
 * an assertion nobody can check. The confirm button waits for a reference the
 * server would accept: trimmed, and no longer than `REFUND_REFERENCE_MAX`. A
 * longer one is never cut short in the field — it is shown as too long.
 *
 * The server decides and its sentence is what the admin reads, translated by
 * `localiseRefundMessage`: the confirmation as a toast, a refusal inside the
 * dialog above the buttons so it is read before any retry, and cleared as soon
 * as the reference is edited. A 409 or 404 means the row moved under this
 * dialog — refunded from another tab, or gone — so the card is refreshed and
 * the stale line goes.
 *
 * Mounted per line (keyed on the payment) and closed by unmounting, so a second
 * line never opens with the first one's reference or refusal still in it.
 */
export function MarkRefundedDialog({
	payment,
	onClose,
}: {
	payment: RefundDue;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const inputId = useId();
	const hintId = useId();
	const [reference, setReference] = useState("");
	const trimmed = reference.trim();
	const tooLong = trimmed.length > REFUND_REFERENCE_MAX;
	const acceptable = trimmed.length > 0 && !tooLong;

	const mutation = useMutation({
		mutationFn: () => markPaymentRefunded(payment.paymentId, trimmed, logout),
		onSuccess: (response) => {
			toast.success(
				localiseRefundMessage(
					response.message || t.adminService.markedRefunded,
					t,
				),
			);
			queryClient.invalidateQueries({ queryKey: REFUNDS_DUE_QUERY_KEY });
			// The payment panel lists this attempt too; its cached copy is stale.
			queryClient.invalidateQueries({ queryKey: ["invoice-payment-detail"] });
			onClose();
		},
		onError: (error) => {
			// 409: refunded from another tab. 404: the payment is gone. Either way
			// the line on the card is stale.
			const status = axios.isAxiosError(error) ? error.response?.status : null;
			if (status === 409 || status === 404) {
				queryClient.invalidateQueries({ queryKey: REFUNDS_DUE_QUERY_KEY });
			}
		},
	});

	const refusal = mutation.error
		? localiseRefundMessage(
				toMutationError(mutation.error, t.adminService.markRefundedFailed)
					?.message ?? t.adminService.markRefundedFailed,
				t,
			)
		: null;
	const amount = `${payment.currency === "MYR" ? "RM" : payment.currency} ${formatPrice(payment.amount)}`;

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !mutation.isPending) onClose();
			}}
		>
			<DialogContent className="sm:max-w-md">
				<form
					className="grid gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (acceptable && !mutation.isPending) mutation.mutate();
					}}
				>
					<DialogHeader>
						<DialogTitle>
							{fill(t.adminService.markRefundedTitle, {
								invoice: payment.invoiceNo,
							})}
						</DialogTitle>
						<DialogDescription>
							{fill(t.adminService.markRefundedIntro, {
								amount,
								org: payment.subscriberName ?? "—",
							})}
						</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor={inputId}>{t.adminService.refundReference}</Label>
						{/* No maxLength: a pasted reference is never silently cut short
						    — an over-long one is SHOWN as too long, and Confirm waits. */}
						<Input
							id={inputId}
							value={reference}
							onChange={(event) => {
								setReference(event.target.value);
								// The refusal described the reference as it WAS.
								if (mutation.error) mutation.reset();
							}}
							placeholder={t.adminService.refundReferencePlaceholder}
							autoComplete="off"
							aria-invalid={tooLong}
							aria-describedby={hintId}
							disabled={mutation.isPending}
						/>
						<p
							id={hintId}
							aria-live="polite"
							className={`text-xs ${tooLong ? "text-destructive" : "text-muted-foreground"}`}
						>
							{tooLong
								? fill(t.adminService.refundReferenceTooLong, {
										n: trimmed.length,
										max: REFUND_REFERENCE_MAX,
									})
								: fill(t.adminService.refundReferenceHint, {
										max: REFUND_REFERENCE_MAX,
									})}
						</p>
					</div>
					{refusal && (
						<p className="text-destructive text-sm" role="alert">
							{refusal}
						</p>
					)}
					<DialogFooter className="gap-2 sm:gap-0">
						<Button
							type="button"
							variant="outline"
							onClick={onClose}
							disabled={mutation.isPending}
						>
							{t.common.cancel}
						</Button>
						<Button type="submit" disabled={!acceptable || mutation.isPending}>
							{mutation.isPending ? (
								<>
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									{t.rbac.processing}
								</>
							) : (
								t.adminService.confirmRefunded
							)}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
