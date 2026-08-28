import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import type { SubscriptionRecordRow } from "@agency-portal/lib/subscription-record";
import { format, parseISO } from "date-fns";
import { ChevronDown, Receipt } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
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
	laneOf,
}: {
	invoices: SubscriptionInvoice[];
	isLoading?: boolean;
	/**
	 * Which lane a period belongs to — the plan, or the POS add-on. Optional so
	 * the agency screen, which can only ever hold ONE lane, passes nothing and
	 * renders no badge: labelling every row "Plan" where no other lane exists is
	 * noise, not information.
	 */
	laneOf?: (invoice: SubscriptionInvoice) => "plan" | "addon" | null;
}) {
	const { t } = usePortalLocale();
	/**
	 * Which half the tiles have narrowed the list to. Pressing PAID or UNPAID
	 * filters the rows to that half; pressing the active tile again clears it —
	 * a one-way control that cannot be undone without leaving the page is how a
	 * reader ends up convinced periods have gone missing.
	 *
	 * Declared before the early returns below: hooks must run on every render.
	 */
	const [filter, setFilter] = useState<"all" | "paid" | "unpaid">("all");
	if (isLoading && invoices.length === 0) {
		return (
			<IzCard flat>
				<p className="iz-tiny iz-muted py-4 text-center">
					{t.subscription.loadingPaymentHistory}
				</p>
			</IzCard>
		);
	}
	if (invoices.length === 0) {
		return (
			<IzCard flat>
				<p className="iz-tiny iz-muted py-4 text-center">
					{t.subscription.noBillingPeriods}
				</p>
			</IzCard>
		);
	}
	const unpaid = invoices.filter((invoice) => invoice.status !== "paid");
	const paid = invoices.filter((invoice) => invoice.status === "paid");

	const sum = (rows: SubscriptionInvoice[]) =>
		rows.reduce((total, invoice) => total + Number(invoice.amount), 0);

	return (
		<>
			{/*
			 * WHAT THIS ORGANISATION HAS PAID, AND WHAT IT STILL OWES.
			 *
			 * The admin's payment panel has carried these two figures since it was
			 * built; the org actually paying the bill could only read the rows and
			 * add them up itself. Same two numbers, now on the screen of the party
			 * the money is leaving.
			 *
			 * Summed over EVERY period this org holds, not the visible page — the
			 * list below tucks settled periods behind a disclosure, and a total that
			 * quietly ignored them would understate what has been paid.
			 *
			 * Green settled, amber waiting: the owner's colour rule, matching the
			 * status pills on the rows underneath so the tiles and the list cannot
			 * read as two different vocabularies.
			 */}
			<div className="mb-3 grid grid-cols-2 gap-2">
				{/* BUTTONS, not cards: pressing one narrows the list below to that
				    half — the tile IS the filter, the same control the admin's panel
				    uses, so the two screens read as one vocabulary. */}
				<button
					type="button"
					aria-pressed={filter === "paid"}
					onClick={() => setFilter(filter === "paid" ? "all" : "paid")}
					className={`iz-card iz-card-flat w-full text-left border-[rgba(57,217,138,.35)] bg-[rgba(57,217,138,.06)] ${
						filter === "paid" ? "ring-2 ring-[rgba(57,217,138,.5)]" : ""
					}`}
				>
					<p className="iz-tiny font-semibold uppercase tracking-wide text-[var(--iz-green)]">
						{t.subscription.statusPaid}
					</p>
					<p className="mt-0.5 font-sora text-base font-bold text-[var(--iz-green)]">
						{formatRM(sum(paid))}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{fill(t.subscription.periodsCount, { n: paid.length })}
					</p>
				</button>
				<button
					type="button"
					aria-pressed={filter === "unpaid"}
					onClick={() => setFilter(filter === "unpaid" ? "all" : "unpaid")}
					className={`iz-card iz-card-flat w-full text-left border-amber-300/40 bg-amber-300/5 ${
						filter === "unpaid" ? "ring-2 ring-amber-300/50" : ""
					}`}
				>
					<p className="iz-tiny font-semibold uppercase tracking-wide text-amber-300">
						{t.subscription.statusUnpaid}
					</p>
					<p className="mt-0.5 font-sora text-base font-bold text-amber-300">
						{formatRM(sum(unpaid))}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{fill(t.subscription.periodsCount, { n: unpaid.length })}
					</p>
				</button>
			</div>

			{filter !== "paid" &&
				(unpaid.length === 0 ? (
					<IzCard flat>
						<p className="iz-tiny iz-muted py-4 text-center">
							{t.subscription.nothingOutstanding}
						</p>
					</IzCard>
				) : (
					<div className="space-y-2">
						{groupByPeriod(unpaid).map((group) => (
							<PeriodCard key={group.key} rows={group.rows} laneOf={laneOf} />
						))}
					</div>
				))}
			{/*
			 * PAID filter active: the settled periods come OUT of the disclosure and
			 * stand as the list itself — that is what the press asked to see. With no
			 * filter, they stay tucked behind the disclosure so the one or two rows
			 * needing action are not buried; "which of these was the POS charge" gets
			 * asked about paid periods most, because that is where the arguing
			 * happens.
			 */}
			{filter === "paid" && (
				<div className="space-y-2">
					{groupByPeriod(paid).map((group) => (
						<PeriodCard key={group.key} rows={group.rows} laneOf={laneOf} />
					))}
				</div>
			)}
			{filter === "all" && (
				<PaidPeriodsDisclosure invoices={paid} laneOf={laneOf} />
			)}
		</>
	);
}

/**
 * One billing WINDOW, every lane inside it.
 *
 * A venue on a plan plus the POS add-on is billed twice for the SAME window,
 * and two cards each restating "3 Aug – 2 Sep" read as a duplicate charge
 * (owner: "can design the UI because is same date"). The date prints once;
 * the lanes sit under it with their own figures and status — and the window's
 * total beside the date when there is more than one lane to add up.
 */
function PeriodCard({
	rows,
	laneOf,
}: {
	rows: SubscriptionInvoice[];
	laneOf?: (invoice: SubscriptionInvoice) => "plan" | "addon" | null;
}) {
	const { t } = usePortalLocale();
	const first = rows[0];
	if (!first) return null;
	const cents = rows.reduce(
		(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
		0,
	);
	return (
		<IzCard flat>
			<div className="iz-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					<Receipt className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
					<p className="iz-sm truncate font-semibold">
						{periodLabel(first.periodStart, first.periodEnd)}
					</p>
				</div>
				{rows.length > 1 && (
					<p className="iz-sm shrink-0 font-bold">{formatRM(cents / 100)}</p>
				)}
			</div>
			<div className="mt-2 space-y-2">
				{rows.map((invoice) => {
					const isPaid = invoice.status === "paid";
					const lane = laneOf?.(invoice) ?? null;
					return (
						<div
							key={invoice.id}
							className="flex items-center justify-between gap-3"
						>
							<span className="min-w-0">
								<span className="iz-tiny flex items-center gap-2">
									{lane === "addon" && (
										<IzPill variant="violet">
											{t.subscription.lanePosAddon}
										</IzPill>
									)}
									{lane === "plan" && (
										<IzPill variant="ink">{t.subscription.lanePlan}</IzPill>
									)}
									<span className="iz-muted truncate">
										{invoice.planName} ·{" "}
										{invoice.billingCycle === "weekly"
											? t.subscription.billedWeekly
											: t.subscription.billedMonthly}
									</span>
								</span>
								{isPaid && invoice.paidAt && (
									<span className="iz-tiny iz-muted2 block">
										{fill(t.subscription.paidOn, {
											date: format(parseISO(invoice.paidAt), "d MMM yyyy"),
										})}
									</span>
								)}
							</span>
							<span className="flex shrink-0 items-center gap-2">
								<span className="iz-sm font-bold">
									{formatRM(Number(invoice.amount))}
								</span>
								<IzPill variant={isPaid ? "green" : "amber"}>
									{isPaid
										? t.subscription.statusPaid
										: t.subscription.statusUnpaid}
								</IzPill>
							</span>
						</div>
					);
				})}
			</div>
		</IzCard>
	);
}

/** Windows in first-seen order — the caller already sorts newest first. */
function groupByPeriod(invoices: SubscriptionInvoice[]) {
	const groups: {
		key: string;
		rows: SubscriptionInvoice[];
	}[] = [];
	for (const invoice of invoices) {
		const key = `${invoice.periodStart}|${invoice.periodEnd}`;
		const found = groups.find((group) => group.key === key);
		if (found) found.rows.push(invoice);
		else groups.push({ key, rows: [invoice] });
	}
	return groups;
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
	laneOf,
}: {
	invoices: SubscriptionInvoice[];
	laneOf?: (invoice: SubscriptionInvoice) => "plan" | "addon" | null;
}) {
	const { t } = usePortalLocale();
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
					<p className="iz-sm font-semibold">{t.subscription.paidPeriods}</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{fill(
							invoices.length === 1
								? t.subscription.settledPeriodsOne
								: t.subscription.settledPeriodsMany,
							{ n: invoices.length, total: formatRM(total) },
						)}
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
					{groupByPeriod(invoices).map((group) => (
						<PeriodCard key={group.key} rows={group.rows} laneOf={laneOf} />
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
	const { t } = usePortalLocale();
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
					<p className="iz-sm font-semibold">
						{t.subscription.planChangeHistory}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{fill(
							rows.length === 1
								? t.subscription.pastPlansOne
								: t.subscription.pastPlansMany,
							{ n: rows.length },
						)}
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
