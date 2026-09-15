import { InvoiceReceipt } from "@agency-portal/components/iz/InvoiceReceipt";
import { formatRM, IzCard, IzPill } from "@agency-portal/components/iz/ui";
import {
	countBillingWindows,
	dueStatusFor,
	formatDueDate,
	overdueSummary,
} from "@agency-portal/lib/subscription-due";
import { periodLabel } from "@agency-portal/lib/subscription-record";
import { useMutation } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ChevronDown, Receipt } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { SubscriptionInvoice } from "@/services/subscription-invoice";
import { createCheckout } from "@/services/subscription-payment";

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
	canPay = false,
}: {
	invoices: SubscriptionInvoice[];
	isLoading?: boolean;
	/**
	 * May this viewer actually SPEND the organisation's money?
	 *
	 * Owner, 11 Sep 2026: "only the owner can make payment fpx … other member
	 * only can see the history that paid or unpaid and the current list."
	 *
	 * ⚠️ Defaults to FALSE. This component had no permission prop at all, so the
	 * tick boxes and "Pay RM X by FPX" rendered for every lane — an outlet
	 * Finance head could start a real checkout. A default of `true` would
	 * re-open that hole at any call site that forgets the prop; defaulting
	 * closed means a forgotten prop hides a button instead of spending money.
	 *
	 * The HISTORY is deliberately NOT gated by this: paid and unpaid periods and
	 * the current list stay readable by every member, which is the other half of
	 * the same rule.
	 */
	canPay?: boolean;
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
	/**
	 * TICK-TO-PAY. The periods the payer has ticked, and the checkout that sends
	 * them to the provider's page. The total is re-summed server-side from the
	 * ids — the figure on the button is for the payer's eyes, never the charge.
	 *
	 * Until a gateway is registered the server answers 503 with its own sentence
	 * ("not connected yet — InnocenZ will mark this paid once your transfer
	 * arrives"); that sentence is shown as-is rather than a generic error, so the
	 * payer knows what to do instead.
	 */
	const { logout } = useAuth();
	const [selected, setSelected] = useState<Set<string>>(() => new Set());
	const [payMessage, setPayMessage] = useState<string | null>(null);
	const checkout = useMutation({
		mutationFn: (ids: string[]) => createCheckout(ids, logout),
		onSuccess: ({ payUrl }) => {
			window.location.assign(payUrl);
		},
		onError: (error) =>
			setPayMessage(
				toMutationError(error, t.subscription.payNotConnected)?.message ??
					t.subscription.payNotConnected,
			),
	});
	/**
	 * ONE TICK PER PERIOD, ALL ITS LANES TOGETHER (owner, 28 Aug 2026: "this
	 * should be pay together"). A venue on Enterprise + POS owes one month, not
	 * two bills, so the box sits on the period and takes every unpaid lane in
	 * it. All-or-nothing: unticking the period drops every lane it added.
	 */
	const toggle = (ids: string[]) => {
		setPayMessage(null);
		setSelected((prev) => {
			const next = new Set(prev);
			const allIn = ids.every((id) => next.has(id));
			for (const id of ids) {
				if (allIn) next.delete(id);
				else next.add(id);
			}
			return next;
		});
	};
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
					<p className="mt-0.5 iz-heading text-base font-bold text-[var(--iz-green)]">
						{formatRM(sum(paid))}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{/* PERIODS, not invoice rows — see `countBillingWindows`. */}
						{fill(t.subscription.periodsCount, {
							n: countBillingWindows(paid),
						})}
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
					<p className="mt-0.5 iz-heading text-base font-bold text-amber-300">
						{formatRM(sum(unpaid))}
					</p>
					<p className="iz-tiny iz-muted2 mt-0.5">
						{fill(t.subscription.periodsCount, {
							n: countBillingWindows(unpaid),
						})}
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
						<OverduePaymentWarning invoices={unpaid} />
						{/*
						 * "Tick the periods to pay" is an instruction, so it goes with
						 * the ticking. A member who may not pay still sees WHAT is
						 * outstanding — that is the list they are entitled to — without
						 * being told to do something the page will not let them do.
						 */}
						{canPay && (
							<p className="iz-tiny iz-muted2">{t.subscription.selectToPay}</p>
						)}
						{groupByPeriod(unpaid).map((group) => (
							<PeriodCard
								key={group.key}
								rows={group.rows}
								laneOf={laneOf}
								selected={selected}
								// No handler, no checkbox — `PeriodCard` renders the box only
								// when `onToggle` is passed, so this is the whole gate.
								onToggle={canPay ? toggle : undefined}
							/>
						))}
						{/*
						 * The pay bar appears only once something is ticked: an
						 * always-present button reads as "you owe this", and the tiles
						 * above already say that.
						 */}
						{canPay && selected.size > 0 && (
							<IzCard flat>
								<div className="iz-between gap-3">
									<span className="iz-tiny iz-muted">
										{fill(t.subscription.paySelectedCount, {
											// Periods, not lanes — that is what the payer ticked.
											n: groupByPeriod(unpaid).filter((group) =>
												group.rows.every((invoice) => selected.has(invoice.id)),
											).length,
										})}
									</span>
									<button
										type="button"
										className="iz-btn iz-btn-gold"
										disabled={checkout.isPending}
										onClick={() => checkout.mutate([...selected])}
									>
										{checkout.isPending
											? t.subscription.payOpening
											: fill(t.subscription.paySelected, {
													amount: formatRM(
														unpaid
															.filter((invoice) => selected.has(invoice.id))
															.reduce(
																(cents, invoice) =>
																	cents +
																	Math.round(Number(invoice.amount) * 100),
																0,
															) / 100,
													),
												})}
									</button>
								</div>
								{/* Says what the next page offers, so "FPX or e-wallet" is
								    not a riddle: the payer picks the bank or wallet there. */}
								<p className="iz-tiny iz-muted2 mt-2">
									{t.subscription.payWaysNote}
								</p>
								{payMessage && (
									<p className="iz-tiny mt-2 text-amber-300">{payMessage}</p>
								)}
							</IzCard>
						)}
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
/**
 * THE RED WARNING: what is genuinely LATE.
 *
 * ⚠️ It reports OVERDUE money, never unpaid money, and the difference is the
 * whole reason it earns a place on the screen. The amber UNPAID tile above
 * already counts every open period INCLUDING the one being used right now — an
 * agency that pays on time, every week, always has one of those. Warning on
 * "unpaid" would put a red banner in front of a customer who owes nothing yet,
 * every single week, and a warning that is always on is a warning nobody reads.
 *
 * Red, not amber, and that is deliberate against the house rule that amber
 * means WAITING: nobody is waiting here. The money is late. `UnpaidBillingBanner`
 * on the home page stays amber precisely because it reports the other thing.
 *
 * Renders NOTHING when nothing is late.
 */
function OverduePaymentWarning({
	invoices,
}: {
	invoices: SubscriptionInvoice[];
}) {
	const { t } = usePortalLocale();
	/*
	 * The clock is read ONCE per render and passed down, so every row and the
	 * summary agree on what "today" is. Separate `new Date()` calls a few lines
	 * apart can straddle midnight and print a period as both due and overdue.
	 */
	const summary = overdueSummary(invoices, "weekly", new Date());
	if (summary.count === 0) return null;
	return (
		<div className="iz-card iz-card-flat border-[rgba(240,138,138,.45)] bg-[rgba(240,138,138,.08)]">
			<p className="iz-sm font-bold text-[var(--iz-red)]">
				{t.subscription.agingOverdue}
			</p>
			<p className="iz-tiny iz-muted mt-1">
				{fill(t.subscription.overdueWarning, {
					amount: formatRM(summary.amountRm),
					n: summary.count,
					date: formatDueDate(summary.oldestDueIso),
					days: summary.oldestDaysOverdue,
				})}
			</p>
		</div>
	);
}

/**
 * "Due 29 Aug 2026 · 10 days overdue" under a period that still owes.
 *
 * Takes the period’s ROWS rather than one invoice because a period can hold
 * several lanes (an outlet’s plan beside its POS add-on). They share a window,
 * so they share a due date; the WORST bucket wins the pill, because a period is
 * as late as its latest part.
 */
function PeriodDueLine({ rows }: { rows: SubscriptionInvoice[] }) {
	const { t } = usePortalLocale();
	const today = new Date();
	const owing = rows.filter((row) => row.status !== "paid");
	const first = owing[0];
	if (!first) return null;
	// `billingCycle` rides on the invoice, so the fallback here is never the
	// thing deciding the term — it only keeps the types honest.
	const status = dueStatusFor(first, "weekly", today);
	if (!status.dueIso) return null;

	const tone =
		status.bucket === "overdue"
			? "text-[var(--iz-red)]"
			: status.bucket === "due_soon"
				? "text-amber-300"
				: "iz-muted2";

	/*
	 * ONE is a different sentence, not the plural with the "s" filed off.
	 * "Due in 1 days" reached the screen before this existed — and the same
	 * trap sits on the overdue side the first day something is a day late.
	 * Two whole strings per case, because Chinese has no plural to append.
	 */
	const suffix =
		status.bucket === "overdue"
			? status.daysOverdue === 1
				? t.subscription.overdueByOneDay
				: fill(t.subscription.overdueByDays, { n: status.daysOverdue })
			: status.periodInProgress
				? t.subscription.currentPeriodNotDue
				: status.daysUntilDue === 1
					? t.subscription.dueInOneDay
					: fill(t.subscription.dueInDays, { n: status.daysUntilDue });

	return (
		<span className={`iz-tiny block truncate ${tone}`}>
			{fill(t.subscription.dueOn, { date: formatDueDate(status.dueIso) })}
			{" · "}
			{suffix}
		</span>
	);
}

function PeriodCard({
	rows,
	laneOf,
	selected,
	onToggle,
}: {
	rows: SubscriptionInvoice[];
	laneOf?: (invoice: SubscriptionInvoice) => "plan" | "addon" | null;
	/** Tick-to-pay, offered only by the unpaid list — one box per period, every lane in it. */
	selected?: Set<string>;
	onToggle?: (ids: string[]) => void;
}) {
	const { t } = usePortalLocale();
	// Which PAID row has its receipt open. Local to the card so it works inside
	// the disclosure too, with nothing threaded through.
	const [receiptFor, setReceiptFor] = useState<string | null>(null);
	/**
	 * Collapsed by default (owner, 2 Sep 2026): the card shows the date range
	 * and the total, and the lane rows — plan, upgrade, add-on — open on a tap.
	 * Four lines of arithmetic per month is the detail, not the headline.
	 */
	const [open, setOpen] = useState(false);
	const first = rows[0];
	if (!first) return null;
	// What the period's box selects: every lane in this window that still owes.
	const unpaidIds = rows
		.filter((invoice) => invoice.status !== "paid")
		.map((invoice) => invoice.id);
	/**
	 * READ TOP-DOWN AS A SUM. The plan first, its upgrade lines indented under
	 * it as "+", a plan subtotal when there is one, then the add-ons. The first
	 * cut listed rows in database order — Upgrade above the plan it belonged
	 * to — which is arithmetic nobody can follow at a glance.
	 */
	const rank = (invoice: SubscriptionInvoice) =>
		invoice.kind === "upgrade" ? 1 : laneOf?.(invoice) === "addon" ? 2 : 0;
	const ordered = [...rows].sort((a, b) => rank(a) - rank(b));
	const upgrades = ordered.filter((invoice) => invoice.kind === "upgrade");
	const lastUpgradeId = upgrades[upgrades.length - 1]?.id ?? null;
	const planCents = ordered
		.filter((invoice) => rank(invoice) < 2)
		.reduce(
			(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
			0,
		);
	const cents = rows.reduce(
		(total, invoice) => total + Math.round(Number(invoice.amount) * 100),
		0,
	);
	return (
		<IzCard flat>
			<div className="flex items-center gap-2">
				{/* The box is on the PERIOD: ticking it takes every unpaid lane in
				    the window into one payment — the plan and its POS add-on are
				    one month's bill, not two. It sits OUTSIDE the disclosure button
				    so a tick never opens the card and a tap never ticks the box. */}
				{onToggle && unpaidIds.length > 0 && (
					<input
						type="checkbox"
						className="h-4 w-4 shrink-0 accent-[var(--iz-accent)]"
						checked={unpaidIds.every((id) => selected?.has(id))}
						onChange={() => onToggle(unpaidIds)}
						aria-label={periodLabel(first.periodStart, first.periodEnd)}
					/>
				)}
				{/* The headline: date range and the period's total, always — the
				    total used to print only when a period had more than one lane,
				    which left a one-lane month with no figure once collapsed. */}
				<button
					type="button"
					className="iz-between min-w-0 flex-1 cursor-pointer gap-2 text-left"
					aria-expanded={open}
					onClick={() => setOpen((prev) => !prev)}
				>
					<span className="flex min-w-0 items-center gap-2">
						<Receipt className="h-4 w-4 shrink-0 text-[var(--iz-muted)]" />
						<span className="min-w-0">
							<span className="iz-sm block truncate font-semibold">
								{periodLabel(first.periodStart, first.periodEnd)}
							</span>
							{/* WHEN it has to be paid, under WHICH period it is for. Only on
							    a period that still owes: a settled one has a paid stamp in
							    its rows, and a due date beside that answers nothing. */}
							<PeriodDueLine rows={rows} />
						</span>
					</span>
					<span className="flex shrink-0 items-center gap-2">
						<span className="iz-sm font-bold">{formatRM(cents / 100)}</span>
						<ChevronDown
							className={`h-4 w-4 text-[var(--iz-muted)] transition-transform ${
								open ? "rotate-180" : ""
							}`}
						/>
					</span>
				</button>
			</div>
			{open && (
				<div className="mt-2 space-y-2">
					{ordered.map((invoice) => {
						const isPaid = invoice.status === "paid";
						const lane = laneOf?.(invoice) ?? null;
						const isUpgrade = invoice.kind === "upgrade";
						return (
							<div key={invoice.id}>
								<div
									className={`flex items-center justify-between gap-3 ${
										isUpgrade ? "ml-2 border-l-2 border-amber-300/40 pl-3" : ""
									}`}
								>
									{/* Paid: the row's number opens its receipt. Unpaid rows carry
								    no box of their own — the period's box above covers them. */}
									{isPaid && (
										<button
											type="button"
											className="iz-tiny iz-muted2 shrink-0 underline-offset-2 hover:underline"
											onClick={() =>
												setReceiptFor(
													receiptFor === invoice.id ? null : invoice.id,
												)
											}
											aria-expanded={receiptFor === invoice.id}
										>
											{invoice.invoiceNo}
										</button>
									)}
									<span className="min-w-0">
										<span className="iz-tiny flex items-center gap-2">
											{lane === "addon" && (
												<IzPill variant="violet">
													{t.subscription.lanePosAddon}
												</IzPill>
											)}
											{lane === "plan" && invoice.kind !== "upgrade" && (
												<IzPill variant="ink">{t.subscription.lanePlan}</IzPill>
											)}
											{isUpgrade && (
												<IzPill variant="amber">
													{t.subscription.laneUpgrade}
												</IzPill>
											)}
											<span className="iz-muted truncate">
												{isUpgrade
													? fill(t.subscription.upgradeTo, {
															plan: invoice.planName,
														})
													: `${invoice.planName} · ${
															invoice.billingCycle === "weekly"
																? t.subscription.billedWeekly
																: t.subscription.billedMonthly
														}`}
											</span>
										</span>
										{isPaid && invoice.paidAt && (
											<span className="iz-tiny iz-muted2 block">
												{fill(t.subscription.paidOn, {
													date: format(parseISO(invoice.paidAt), "d MMM yyyy"),
												})}
											</span>
										)}
										{/* THE DEDUCTION, IN THE OPEN. A net figure alone reads as a
									    wrong price; the plan price and what came off it are printed
									    together, with the sentence that explains it. */}
										{Number(invoice.creditApplied) > 0 && (
											<span className="iz-tiny block text-[var(--iz-green)]">
												{fill(t.subscription.priceBeforeDeduction, {
													amount: formatRM(Number(invoice.baseAmount)),
												})}
												{" · "}
												{fill(t.subscription.creditDeducted, {
													amount: formatRM(Number(invoice.creditApplied)),
												})}
											</span>
										)}
										{invoice.note && (
											<span className="iz-tiny iz-muted2 block">
												{invoice.note}
											</span>
										)}
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<span className="iz-sm font-bold">
											{isUpgrade ? "+" : ""}
											{formatRM(Number(invoice.amount))}
										</span>
										<IzPill variant={isPaid ? "green" : "amber"}>
											{isPaid
												? t.subscription.statusPaid
												: t.subscription.statusUnpaid}
										</IzPill>
									</span>
								</div>
								{/* The sum the upgrade lines add up to — printed once, under the
							    last of them, so "Enterprise + 3,000 = Scale" is on the page. */}
								{invoice.id === lastUpgradeId && (
									<div className="iz-between ml-2 mt-1 border-l-2 border-amber-300/40 pl-3">
										<span className="iz-tiny iz-muted">
											{fill(t.subscription.planTotalWith, {
												plan: invoice.planName,
											})}
										</span>
										<span className="iz-sm font-semibold">
											{formatRM(planCents / 100)}
										</span>
									</div>
								)}
								{receiptFor === invoice.id && (
									<InvoiceReceipt invoiceId={invoice.id} />
								)}
							</div>
						);
					})}
				</div>
			)}
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
