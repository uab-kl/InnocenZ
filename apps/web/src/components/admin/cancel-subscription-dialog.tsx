import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { MemberSubscription } from "@/services/member-subscription";

/**
 * A row the org is still ON — the only kind "Cancel subscription" is offered
 * for. The same test as the server's LIVE statuses: `past_due` has not left.
 * An ended row is history; the server refuses to re-date it anyway.
 */
export function isCancellable(
	record: Pick<MemberSubscription, "endedAt" | "status">,
): boolean {
	return (
		record.endedAt === null &&
		(record.status === "active" || record.status === "past_due")
	);
}

/**
 * Confirm step for ending a subscription row (Admin → Current Plan).
 *
 * Its own dialog rather than the shared rbac ConfirmDialog because that one's
 * dismiss button reads "Cancel" — beside "Cancel subscription" that is two
 * buttons saying cancel, and the wrong one ends a paying org's plan.
 *
 * The server decides, and its sentence is what the admin reads: a refusal (the
 * org's only plan, an already-ended row) stays in the dialog above the
 * buttons, so the reason is read before any retry.
 */
export function CancelSubscriptionDialog({
	record,
	onOpenChange,
	onConfirm,
	isPending,
	error,
}: {
	record: Pick<MemberSubscription, "subscriberName" | "planName"> | null;
	onOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	isPending: boolean;
	error: Error | null;
}) {
	const { t } = usePortalLocale();
	return (
		<Dialog open={record !== null} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t.adminBusiness.cancelSubscriptionTitle}</DialogTitle>
					<DialogDescription>
						{record
							? fill(t.adminBusiness.cancelSubscriptionConfirm, {
									name: record.subscriberName,
									plan: record.planName,
								})
							: null}
					</DialogDescription>
				</DialogHeader>
				{error && (
					<p className="text-destructive text-sm" role="alert">
						{error.message}
					</p>
				)}
				<DialogFooter className="gap-2 sm:gap-0">
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						{t.adminBusiness.keepSubscription}
					</Button>
					<Button
						type="button"
						variant="destructive"
						onClick={onConfirm}
						disabled={isPending}
					>
						{isPending ? (
							<>
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								{t.rbac.processing}
							</>
						) : (
							t.adminBusiness.cancelSubscription
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
