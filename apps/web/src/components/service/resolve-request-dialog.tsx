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
	const [quote, setQuote] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open && request) {
			setQuote(request.quotedAmount ?? "");
			setError(null);
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
			setError("Enter a valid non-negative amount in RM");
			return;
		}
		onConfirm(parsed);
	};

	if (!request) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Set negotiated quote</DialogTitle>
					<DialogDescription>
						Users who click “negotiate price” land here as a Plan Request. Enter
						the settled price, then resolve.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-2">
					<div className="rounded-lg border border-(--lavender-soft)/30 bg-muted/30 px-3 py-2 text-sm">
						<p className="font-medium">{request.subscriberName}</p>
						<p className="text-muted-foreground">
							{planName !== "—" ? `Plan: ${planName}` : "No current plan"}
							{request.message ? ` · ${request.message}` : ""}
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="quoted-amount">Quoted price (RM)</Label>
						<Input
							id="quoted-amount"
							type="number"
							min={0}
							step="0.01"
							inputMode="decimal"
							placeholder="e.g. 4500"
							value={quote}
							onChange={(e) => {
								setQuote(e.target.value);
								setError(null);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleConfirm();
								}
							}}
							autoFocus
						/>
						{error ? (
							<p className="text-xs text-destructive">{error}</p>
						) : (
							<p className="text-xs text-muted-foreground">
								Leave blank to resolve without recording a price.
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
						Cancel
					</Button>
					<Button disabled={isSubmitting} onClick={handleConfirm}>
						{isSubmitting ? "Saving…" : "Save quote & resolve"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
