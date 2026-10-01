import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { formatPrice } from "@/lib/utils";
import type {
	RefundDue,
	RefundDueReason,
} from "@/services/subscription-payment";
import { MarkRefundedDialog } from "./mark-refunded-dialog";

/** The stored reason KIND never changes; only the words a human reads do. */
const reasonLabels: Record<RefundDueReason, (t: PortalTranslations) => string> =
	{
		voided: (t) => t.adminService.refundReasonVoided,
		paid_twice: (t) => t.adminService.refundReasonPaidTwice,
	};

/**
 * MONEY INNOCENZ OWES BACK, at the top of Plan Payment in red (30 Sep 2026).
 *
 * A payment that lands on a VOIDED bill, or on one already PAID, settles
 * nothing — the server records it with a refund-due note and, until this card,
 * said so only in a log line. There is no admin bell to carry it (a new
 * notification kind needs a migration), so the page an admin already works
 * money from is where it surfaces.
 *
 * Each line does two things, kept as two buttons: the line itself opens that
 * bill's payment panel, and "Mark refunded" records the money going back
 * (`MarkRefundedDialog`) — after which the line leaves the card.
 *
 * The page owns the list's query, so this renders the same whatever page,
 * filter or search the ledger below is on — a refund is owed regardless.
 * Nothing at all when nothing is owed; a failed read says so rather than
 * rendering nothing, because "could not look" must never read as "none owed".
 */
export function RefundsDueCard({
	rows,
	failed,
	onRetry,
	onOpenInvoice,
}: {
	rows: RefundDue[] | undefined;
	failed: boolean;
	onRetry: () => void;
	/** Opens that invoice's payment panel — where the refund-due attempt is listed. */
	onOpenInvoice: (invoiceId: string) => void;
}) {
	const { t } = usePortalLocale();
	/** The line whose "Mark refunded" dialog is open. */
	const [refunding, setRefunding] = useState<RefundDue | null>(null);
	const owed = rows ?? [];

	if (owed.length === 0) {
		if (!failed) return null;
		return (
			<div
				role="alert"
				className="flex items-center gap-3 rounded-lg border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-300"
			>
				<AlertTriangle className="h-4 w-4 shrink-0" />
				<span className="mr-auto">{t.adminService.refundsDueLoadFailed}</span>
				<Button variant="outline" size="sm" onClick={onRetry}>
					{t.admin.tryAgain}
				</Button>
			</div>
		);
	}

	return (
		<>
			<Card role="alert" className="gap-4 border-red-400/40 bg-red-400/10">
				<CardHeader>
					<CardTitle className="flex items-center gap-2 text-red-300">
						<AlertTriangle className="h-5 w-5 shrink-0" />
						{owed.length === 1
							? t.adminService.refundsDueTitleOne
							: fill(t.adminService.refundsDueTitleMany, { n: owed.length })}
					</CardTitle>
					<CardDescription>{t.adminService.refundsDueHint}</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="divide-y divide-red-400/20 rounded-lg border border-red-400/30">
						{owed.map((row) => (
							<li
								key={row.paymentId}
								className="flex flex-wrap items-center gap-2 pr-3 hover:bg-red-400/10"
							>
								<button
									type="button"
									onClick={() => onOpenInvoice(row.invoiceId)}
									className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-left text-sm"
								>
									<span className="font-medium whitespace-nowrap">
										{row.invoiceNo}
									</span>
									{/* The org's LIVE name; "—" only when its row is gone. */}
									<span className="min-w-0 truncate">
										{row.subscriberName ?? "—"}
									</span>
									<span className="font-medium whitespace-nowrap">
										{row.currency === "MYR" ? "RM" : row.currency}{" "}
										{formatPrice(row.amount)}
									</span>
									<span className="text-red-300">
										{/* A kind a newer server adds shows as sent, never a crash. */}
										{reasonLabels[row.reason]?.(t) ?? row.reason}
									</span>
									<ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
								</button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									// Every line has this button; the name says WHICH bill, after
									// the visible words (WCAG 2.5.3, label in name).
									aria-label={fill(t.adminService.markRefundedFor, {
										invoice: row.invoiceNo,
									})}
									onClick={() => setRefunding(row)}
								>
									{t.adminService.markRefunded}
								</Button>
							</li>
						))}
					</ul>
				</CardContent>
			</Card>
			{refunding && (
				<MarkRefundedDialog
					key={refunding.paymentId}
					payment={refunding}
					onClose={() => setRefunding(null)}
				/>
			)}
		</>
	);
}
