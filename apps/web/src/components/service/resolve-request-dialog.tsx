import { useEffect, useState } from "react";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { AdminRequest } from "@/services/admin-request";

interface ResolveRequestDialogProps {
	open: boolean;
	request: AdminRequest | null;
	planName: string;
	isSubmitting: boolean;
	onOpenChange: (open: boolean) => void;
	onConfirm: (quotedAmount: number | undefined) => void;
}

export function ResolveRequestDialog({
	open,
	request,
	planName,
	isSubmitting,
	onOpenChange,
	onConfirm,
}: ResolveRequestDialogProps) {
	const { t } = usePortalLocale();
	const [quote, setQuote] = useState("");
	// A FLAG, not the sentence: holding the resolved string here would freeze the
	// locale it was in when the click happened, and the message would stay in the
	// old language after a switch.
	const [isInvalid, setIsInvalid] = useState(false);

	useEffect(() => {
		if (open && request) {
			setQuote(request.quotedAmount ?? "");
			setIsInvalid(false);
		}
	}, [open, request]);

	const handleConfirm = () => {
		const trimmed = quote.trim();
		if (trimmed === "") {
			onConfirm(undefined);
			return;
		}
		const parsed = Number(trimmed);
		if (Number.isNaN(parsed) || parsed < 0) {
			setIsInvalid(true);
			return;
		}
		onConfirm(parsed);
	};

	if (!request) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t.adminBits.setNegotiatedQuote}</DialogTitle>
					<DialogDescription>
						{t.adminBits.setNegotiatedQuoteHint}
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="rounded-lg border border-(--lavender-soft)/30 bg-muted/30 px-3 py-2 text-sm">
						<p className="font-medium">{request.subscriberName}</p>
						<p className="text-muted-foreground">
							{/* "—" is the caller's own no-plan sentinel, and the plan NAME
							    stays English in every locale. */}
							{planName !== "—"
								? fill(t.adminBits.planNamed, { name: planName })
								: t.adminBits.noCurrentPlan}
							{request.message ? ` · ${request.message}` : ""}
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="quoted-amount">{t.adminBits.quotedPriceRm}</Label>
						<Input
							id="quoted-amount"
							type="number"
							min={0}
							step="0.01"
							inputMode="decimal"
							placeholder={t.adminBits.quotePlaceholder}
							value={quote}
							onChange={(e) => {
								setQuote(e.target.value);
								setIsInvalid(false);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleConfirm();
								}
							}}
							autoFocus
						/>
						{isInvalid ? (
							<p className="text-xs text-destructive">
								{t.adminBits.enterValidAmountRm}
							</p>
						) : (
							<p className="text-xs text-muted-foreground">
								{t.adminBits.leaveBlankNoPrice}
							</p>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						disabled={isSubmitting}
						onClick={() => onOpenChange(false)}
					>
						{t.common.cancel}
					</Button>
					<Button disabled={isSubmitting} onClick={handleConfirm}>
						{isSubmitting ? t.common.saving : t.adminBits.saveQuoteAndResolve}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
