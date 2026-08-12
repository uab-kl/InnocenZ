import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import type { SubscriptionRecordRow } from "@agency-portal/lib/subscription-record";
import { format, parseISO } from "date-fns";
import { ChevronDown, Receipt } from "lucide-react";
import { useState } from "react";
import type { SubscriptionInvoice } from "@/services/subscription-invoice";

/** "1 Aug – 31 Aug 2026", with the year printed once. */
function periodLabel(startIso: string, endIso: string): string {
	try {
		const start = parseISO(startIso);
		const end = parseISO(endIso);
		const sameYear = start.getFullYear() === end.getFullYear();
		return `${format(start, sameYear ? "d MMM" : "d MMM yyyy")} – ${format(end, "d MMM yyyy")}`;
	} catch {
		return `${startIso} – ${endIso}`;
	}
}

/**
 * What this org has been BILLED, period by period, and whether InnocenZ has
 * marked it paid.
 *
 * The one honest answer to "show me our payment history": it reads
 * `subscription_invoice`, a row per charge, rather than `member_subscription`,
 * which records what an org subscribed to and carries no payment state at all.
 * Every period opens **Unpaid** and only an InnocenZ admin moves it — so an
 * unpaid row here means "not yet marked received", not "you are overdue".
 */
export function PaymentHistoryList({
	invoices,
	isLoading,
}: {
	invoices: SubscriptionInvoice[];
	isLoading?: boolean;
}) {
	if (isLoading && invoices.length === 0) {
		return (
			<IzCard flat>
				<p className="iz-tiny iz-muted py-4 text-center">
					Loading payment history…
				</p>
			</IzCard>
		);
	}
	if (invoices.length === 0) {
		return (
			<IzCard flat>
				<p className="iz-tiny iz-muted py-4 text-center">
					No billing periods yet — the first one opens when your plan's period
					starts.
				</p>
			</IzCard>
		);
	}
	const unpaid = invoices.filter((invoice) => invoice.status !== "paid");
	const paid = invoices.filter((invoice) => invoice.status === "paid");

	return (
		<>
			{unpaid.length === 0 ? (
				<IzCard flat>
					<p className="iz-tiny iz-muted py-4 text-center">
						Nothing outstanding — every billing period so far is marked paid.
					</p>
				</IzCard>
			) : (
				<div className="space-y-2">
					{unpaid.map((invoice) => (
						<InvoiceCard key={invoice.id} invoice={invoice} />
					))}
				</div>
			)}
			<PaidPeriodsDisclosure invoices={paid} />
		</>
	);
}

/** One billing period. Same card whether it is outstanding or settled. */
function InvoiceCard({ invoice }: { invoice: SubscriptionInvoice }) {
	const isPaid = invoice.status === "paid";
	return (
		<IzCard flat>
			<div className="iz-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
					<div className="min-w-0">
						<p className="iz-sm truncate font-semibold">
							{periodLabel(invoice.periodStart, invoice.periodEnd)}
						</p>
						<p className="iz-tiny iz-muted">
							{invoice.planName} ·{" "}
							{invoice.billingCycle === "weekly" ? "Weekly" : "Monthly"}
							{isPaid && invoice.paidAt
								? ` · paid ${format(parseISO(invoice.paidAt), "d MMM yyyy")}`
								: ""}
						</p>
					</div>
				</div>
				<div className="shrink-0 text-right">
					<p className="iz-sm font-bold">{formatRM(Number(invoice.amount))}</p>
					<IzPill variant={isPaid ? "green" : "amber"} className="!mt-1">
						{isPaid ? "Paid" : "Unpaid"}
					</IzPill>
				</div>
			</div>
		</IzCard>
	);
}

/**
 * Settled periods, collapsed.
 *
 * What an org needs from this screen is what it still OWES; a paid period is a
 * receipt, and a column of them buries the one or two rows that need acting on.
 * They stay reachable rather than hidden — an org must always be able to see
 * what it has paid — and the total sits on the summary line so the tab is worth
 * opening without it. Renders nothing until something has actually been paid, so
 * a new subscriber is never offered a control that opens onto an empty list.
 */
function PaidPeriodsDisclosure({
	invoices,
}: {
	invoices: SubscriptionInvoice[];
}) {
	const [open, setOpen] = useState(false);
	if (invoices.length === 0) return null;
	const total = invoices.reduce(
		(sum, invoice) => sum + Number(invoice.amount),
		0,
	);
	return (
		<div className="mt-2">
			<button
				type="button"
				className="iz-card iz-between w-full cursor-pointer text-left"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
			>
				<div className="min-w-0">
					<p className="iz-sm font-semibold">Paid periods</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{invoices.length} settled{" "}
						{invoices.length === 1 ? "period" : "periods"} · {formatRM(total)}{" "}
						paid to InnocenZ
					</p>
				</div>
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			{open && (
				<div className="mt-2 space-y-2">
					{invoices.map((invoice) => (
						<InvoiceCard key={invoice.id} invoice={invoice} />
					))}
				</div>
			)}
		</div>
	);
}

/**
 * One `member_subscription` row as a card. Shared by the agency and outlet
 * Subscription screens, which show the same record from the same side — the two
 * had copies of this markup that had already drifted apart in class order.
 */
export function SubscriptionRecordCard({
	row,
	showAmount = true,
}: {
	row: SubscriptionRecordRow;
	/**
	 * Whether to print the price. Off for past plans: `member_subscription`
	 * records what was SUBSCRIBED TO, never what was charged, and most ended rows
	 * are a plan switch that started and ended the same day — so the figure beside
	 * them is a rate that was never billed, on a card that reads like a receipt.
	 * The live rows keep it, because that is what the org is paying now.
	 */
	showAmount?: boolean;
}) {
	return (
		<IzCard flat>
			<div className="iz-between gap-2">
				<div className="flex min-w-0 items-start gap-2">
					<Receipt className="mt-0.5 h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
					<div className="min-w-0">
						<p className="iz-sm truncate font-semibold">{row.title}</p>
						<p className="iz-tiny iz-muted">
							{row.dateLabel}
							{row.detail ? ` · ${row.detail}` : ""}
						</p>
					</div>
				</div>
				<div className="shrink-0 text-right">
					{showAmount && (
						<p className="iz-sm font-bold">{formatRM(row.amountRm)}</p>
					)}
					<IzPill variant={row.tone} className={showAmount ? "!mt-1" : ""}>
						{row.statusLabel}
					</IzPill>
				</div>
			</div>
		</IzCard>
	);
}

/**
 * Plans this org has been on and is no longer, collapsed by default.
 *
 * A switch ENDS one `member_subscription` row and STARTS another, so an org that
 * has changed plan a few times has a column of priced cards that all read like
 * bills — which is why the live subscription is listed on its own above and the
 * rest lives in here. Renders nothing at all when there is no history, so a new
 * org is not offered a control that opens onto an empty list.
 */
export function PastSubscriptionsDisclosure({
	rows,
}: {
	rows: SubscriptionRecordRow[];
}) {
	const [open, setOpen] = useState(false);
	if (rows.length === 0) return null;
	return (
		<div className="mt-2">
			<button
				type="button"
				className="iz-card iz-between w-full cursor-pointer text-left"
				aria-expanded={open}
				onClick={() => setOpen((prev) => !prev)}
			>
				<div className="min-w-0">
					<p className="iz-sm font-semibold">Plan change history</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{rows.length} {rows.length === 1 ? "plan" : "plans"} you were on
						before · not billing. A switch closes one record and opens another,
						so most of these ran for a day or less.
					</p>
				</div>
				<ChevronDown
					className={`h-4 w-4 shrink-0 text-[var(--iz-muted)] transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			{open && (
				<div className="mt-2 space-y-2">
					{rows.map((row) => (
						<SubscriptionRecordCard key={row.id} row={row} showAmount={false} />
					))}
				</div>
			)}
		</div>
	);
}
