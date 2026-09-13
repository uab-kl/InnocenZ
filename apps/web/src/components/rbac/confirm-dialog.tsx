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

interface ConfirmDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirmLabel?: string;
	onConfirm: () => void;
	isPending?: boolean;
	/**
	 * The server's refusal, when the confirmed action failed.
	 *
	 * ⚠️ This dialog had NO way to show one. Every screen using it confirms a
	 * DESTRUCTIVE act — deactivating an RBAC module, deleting a role, disabling
	 * an account — and on failure it simply stayed open and idle, which reads as
	 * "nothing happened, press it again". Optional, so the callers that do not
	 * pass it are unchanged.
	 *
	 * `Error | null` rather than a string, matching `toMutationError` and the
	 * `error` prop the module FORM beside this already takes — one shape for the
	 * same fact, so a caller cannot pass the wrong half of it.
	 */
	error?: Error | null;
}

export function ConfirmDialog({
	open,
	onOpenChange,
	title,
	description,
	confirmLabel,
	onConfirm,
	isPending = false,
	error = null,
}: ConfirmDialogProps) {
	const { t } = usePortalLocale();
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>
				{/* Above the buttons, so the reason is read BEFORE the retry is
				    pressed rather than after. */}
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
						{t.rbac.cancel}
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
							(confirmLabel ?? t.rbac.confirm)
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
