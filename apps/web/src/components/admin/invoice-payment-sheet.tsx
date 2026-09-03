import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { addDays, format, parse } from "date-fns";
import {
	ArrowUpRight,
	Banknote,
	Building2,
	CreditCard,
	Landmark,
	Loader2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatDate, formatDay, formatPrice } from "@/lib/utils";
import type { PaymentMethod } from "@/services/payment-method";
import {
	type SubscriptionInvoiceStatus,
	setSubscriptionInvoiceStatus,
} from "@/services/subscription-invoice";
import {
	fetchInvoicePaymentDetail,
	type SubscriptionPayment,
	type SubscriptionPaymentStatus,
} from "@/services/subscription-payment";

/**
 * What one billing period actually looks like: who owes it, HOW they pay, and
 * every attempt made against it.
 *
 * The Plan Payment table can only ever show the invoice — a period, a figure and
 * one status flag. It cannot answer the two questions an admin actually opens a
 * row to ask: *what did they pay with*, and *did anything already fail*. Those
 * live in `payment_method` and `subscription_payment`, and this panel is where
 * the three finally meet.
 *
 * The subscriber gets a LINK into their full record, because "who is this
 * agency" is the next question after "did they pay", and making someone search a
 * second page for a row they already had in front of them is how a detail panel
 * stops being used.
 */

const paymentToneOf: Record<SubscriptionPaymentStatus, string> = {
	// Green = settled, amber = waiting, red = failed, grey = retracted — the
	// project's status colour code, same as every other receipt surface.
	succeeded: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
	pending: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	initiated: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	failed: "border-red-400/40 bg-red-400/10 text-red-300",
	refunded: "border-red-400/40 bg-red-400/10 text-red-300",
	voided: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

function MethodIcon({ type }: { type: PaymentMethod["type"] }) {
	if (type === "manual_transfer") return <Landmark className="h-4 w-4" />;
	if (type === "fpx" || type === "fpx_mandate")
		return <Banknote className="h-4 w-4" />;
	return <CreditCard className="h-4 w-4" />;
}

/**
 * The org's mark, or its initials when it has none.
 *
 * Initials rather than a generic placeholder icon: every outlet without a logo
 * would otherwise render the identical grey square, which tells the reader
 * nothing and looks like a broken image. `onError` falls back the same way, so a
 * key that no longer resolves in R2 degrades to initials instead of a torn icon.
 */
function OrgLogo({
	name,
	src,
	isAgency,
}: {
	name: string;
	src: string | null;
	isAgency: boolean;
}) {
	const [failed, setFailed] = useState(false);
	const initials = name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");

	if (src && !failed) {
		return (
			<img
				src={src}
				alt=""
				onError={() => setFailed(true)}
				className="h-10 w-10 shrink-0 rounded-md object-cover"
			/>
		);
	}
	return (
		<span
			aria-hidden
			className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-semibold ${
				isAgency
					? "bg-violet-400/15 text-violet-300"
					: "bg-sky-400/15 text-sky-300"
			}`}
		>
			{initials || <Building2 className="h-4 w-4" />}
		</span>
	);
}

export function InvoicePaymentSheet({
	invoiceId,
	onSelectInvoice,
}: {
	invoiceId: string;
	/**
	 * Re-point the panel at another of this subscriber's periods.
	 *
	 * The panel describes ONE period and its Mark-paid button acts on that one,
	 * so the history rows have to be able to move the focus — otherwise settling
	 * the other lane means closing the drawer and hunting for its row.
	 */
	onSelectInvoice?: (id: string) => void;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();

	/**
	 * Which half of the billing history is on screen. The two tiles are the
	 * control — pressing PAID or UNPAID narrows the list under them, pressing the
	 * active one again clears it.
	 *
	 * Local to the panel and reset by remounting on a different invoice, so a
	 * filter chosen while reading one subscriber never silently hides periods for
	 * the next one.
	 */
	const [historyFilter, setHistoryFilter] = useState<"all" | "paid" | "unpaid">(
		"all",
	);
	const queryClient = useQueryClient();

	/**
	 * Which row is asking for a bank reference, and what has been typed so far.
	 *
	 * Marking a period PAID asserts money arrived, so it asks what paid it —
	 * `subscription_payment.reference` is the column that lets a settled period be
	 * matched against a statement later. Taking a mark BACK asks nothing: no money
	 * moved, and demanding a reference to undo a mistake is how wrong figures
	 * become permanent.
	 */
	const [referenceFor, setReferenceFor] = useState<{
		id: string;
		value: string;
	} | null>(null);

	const statusMutation = useMutation({
		mutationFn: ({
			id,
			status,
			reference,
		}: {
			id: string;
			status: SubscriptionInvoiceStatus;
			reference?: string | null;
		}) => setSubscriptionInvoiceStatus(id, status, logout, reference),
		onSuccess: (response) => {
			// BOTH keys. This panel reads `invoice-payment-detail` and the table
			// behind it reads `subscription-invoices`; refreshing only one leaves the
			// list showing Unpaid over a period this panel has just settled.
			queryClient.invalidateQueries({ queryKey: ["invoice-payment-detail"] });
			queryClient.invalidateQueries({ queryKey: ["subscription-invoices"] });
			setReferenceFor(null);
			toast.success(response.message || t.adminService.paymentStatusUpdated);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.paymentStatusUpdateFailed)
					?.message ?? t.adminService.paymentStatusUpdateFailed,
			);
		},
	});
	const isSaving = statusMutation.isPending;

	const { data, isLoading, isError } = useQuery({
		queryKey: ["invoice-payment-detail", invoiceId],
		queryFn: () => fetchInvoicePaymentDetail(invoiceId, logout),
		staleTime: 15_000,
	});

	if (isLoading) {
		return (
			<div className="flex h-40 items-center justify-center">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}
	if (isError || !data) {
		// This is the panel failing to LOAD. It used to borrow the mutation's
		// message and tell the admin a payment UPDATE had failed — a read error
		// reported as a write error is how someone goes looking for money that
		// never moved.
		return (
			<div className="p-6 text-sm text-muted-foreground">
				{t.adminService.paymentDetailLoadFailed}
			</div>
		);
	}

	const {
		invoice,
		payments,
		methods,
		org,
		lanes,
		history,
		actors,
		r2PublicUrl,
	} = data;

	const isAgency = invoice.subscriberType === "agency";
	/**
	 * The org's CURRENT billing window — its newest billed period.
	 *
	 * The per-lane dates below match invoices to lanes by FK, which goes dark
	 * the moment an org SWITCHES: the old period belongs to the predecessor row
	 * and the new lane has no invoice yet (exactly Emhub after Enterprise→Scale
	 * — owner: "Still not show"). The window itself is still a fact the ledger
	 * holds, so it is stated once at org level instead of vanishing.
	 */
	const newestPeriod = history.reduce<(typeof history)[number] | null>(
		(newest, row) =>
			!newest || row.periodStart > newest.periodStart ? row : newest,
		null,
	);

	/**
	 * Legacy rows still hold base64 data URLs and absolute URLs; newer ones hold
	 * a bare R2 key that has to be joined with the base. Checked in that order so
	 * an already-usable value is never mangled by prefixing.
	 */
	const logoSrc = org?.logoImage
		? /^(https?:|data:)/.test(org.logoImage)
			? org.logoImage
			: r2PublicUrl
				? `${r2PublicUrl}/${org.logoImage.replace(/^\//, "")}`
				: null
		: null;
	// Both admin org pages take ?focus=<id> and open that record — the same
	// entry point their own lists use, so this is a jump, not a parallel screen.
	const orgHref = isAgency
		? "/admin/user-management/agency"
		: "/admin/user-management/outlet";

	const methodLabelOf = (method: PaymentMethod) => {
		if (method.type === "manual_transfer") return t.subscription.savedTransfer;
		if (method.type === "fpx") return t.subscription.savedFpxLink;
		if (method.type === "fpx_mandate") return t.subscription.savedFpx;
		if (method.type === "ewallet")
			return method.walletProvider
				? `${t.subscription.methodEwallet} · ${method.walletProvider}`
				: t.subscription.methodEwallet;
		return `${method.brand} ···· ${method.last4 ?? "····"}`;
	};

	const methodTypeLabelOf = (type: SubscriptionPayment["methodType"]) => {
		if (type === "manual_transfer") return t.subscription.methodTransfer;
		if (type === "fpx") return t.subscription.methodFpxLink;
		if (type === "fpx_mandate") return t.subscription.methodFpx;
		return t.subscription.methodCard;
	};

	/**
	 * The attempt's state, in the reader's language. The badge printed the raw
	 * enum — "succeeded", "voided" — inside a portal with a 中文 switch in its
	 * own sidebar, on the panel that explains what happened to money.
	 */
	const paymentStatusLabelOf = (status: SubscriptionPayment["status"]) =>
		({
			initiated: t.adminService.attemptInitiated,
			pending: t.adminService.attemptPending,
			succeeded: t.adminService.attemptSucceeded,
			failed: t.adminService.attemptFailed,
			refunded: t.adminService.attemptRefunded,
			voided: t.adminService.attemptVoided,
		})[status] ?? status;

	/**
	 * Who recorded it. The server resolves a uuid to a person's name; a stamp
	 * that is not a person keeps its own word. Falls back to the raw value
	 * rather than blanking — an unrecognised actor is still evidence.
	 */
	const actorLabelOf = (actor: string) => {
		if (actor === "system") return t.adminService.actorSystem;
		if (actor.startsWith("gateway:")) return actor.slice("gateway:".length);
		return actors?.[actor] ?? actor;
	};

	return (
		<div className="flex h-full flex-col gap-5 overflow-y-auto">
			<SheetHeader className="space-y-1 p-0">
				<SheetTitle>{t.admin.navPlanPayment}</SheetTitle>
				<SheetDescription>{t.adminService.paymentPanelIntro}</SheetDescription>
			</SheetHeader>

			{/* WHO — logo, live name, and the way out to their full record. */}
			<section className="rounded-lg border border-border/60 p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="flex min-w-0 items-center gap-3">
						<OrgLogo
							name={org?.name ?? invoice.subscriberName}
							src={logoSrc}
							isAgency={isAgency}
						/>
						<div className="min-w-0">
							{/* The org's CURRENT name — the invoice's copy is a snapshot kept
							    so history survives a rename, which is wrong for a header. */}
							<p className="truncate text-lg font-semibold">
								{org?.name ?? invoice.subscriberName}
							</p>
							<Badge
								variant="outline"
								className={`mt-1 ${isAgency ? "border-violet-400/40 bg-violet-400/10 text-violet-300" : "border-sky-400/40 bg-sky-400/10 text-sky-300"}`}
							>
								{isAgency ? t.adminService.agency : t.table.outlet}
							</Badge>
						</div>
					</div>
					<Button asChild size="sm" variant="outline">
						<Link to={orgHref} search={{ focus: invoice.subscriberId }}>
							{t.adminService.openFullRecord}
							<ArrowUpRight className="ml-1 h-3.5 w-3.5" />
						</Link>
					</Button>
				</div>
			</section>

			{/*
			 * WHAT THEY ARE ON — the org's CURRENT subscription, and nothing else.
			 *
			 * This section used to describe the OPENED invoice — its plan, period
			 * and amount — which for a venue that had switched read "Enterprise
			 * 3,999" directly above a second card reading "Scale 6,999": two answers
			 * stacked with nothing saying which was history (owner: "still cannot
			 * understand … no blur"). One section now states today's subscription;
			 * what any period was billed under — the current plan or one since left
			 * — lives in Billing history below, where each row carries its own
			 * figure, status and Mark paid.
			 */}
			{lanes.length > 0 && (
				<section className="rounded-lg border border-border/60 p-4">
					<p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t.adminService.subscriptionDetails}
					</p>
					<p className="mb-2 text-xs text-muted-foreground">
						{t.adminService.allBillingLanesHint}
					</p>
					{newestPeriod && (
						<p className="mb-2 text-xs">
							<span className="text-muted-foreground">
								{t.adminService.billingPeriodLabel}:{" "}
							</span>
							<span className="font-medium">
								{formatDay(newestPeriod.periodStart)} –{" "}
								{formatDay(newestPeriod.periodEnd)}
							</span>
							<span className="text-muted-foreground">
								{" · "}
								{fill(t.outletSubscription.nextRenewal, {
									date: format(
										addDays(
											parse(newestPeriod.periodEnd, "yyyy-MM-dd", new Date()),
											1,
										),
										"d MMM yyyy",
									),
								})}
							</span>
						</p>
					)}
					<ul className="space-y-2">
						{lanes.map((lane) => {
							const isThisOne = lane.id === invoice.memberSubscriptionId;
							return (
								<li
									key={lane.id}
									className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
										isThisOne
											? "bg-primary/10 ring-1 ring-primary/40"
											: "bg-muted/30"
									}`}
								>
									<span className="min-w-0">
										<span className="block truncate font-medium">
											{lane.planName}
										</span>
										<span className="text-xs text-muted-foreground">
											{lane.billingCycle}
										</span>
									</span>
									<span className="flex shrink-0 items-center gap-2">
										<span className="font-medium">
											{formatPrice(lane.amount)}
										</span>
										{isThisOne && (
											<Badge variant="outline">
												{t.adminService.thisPeriodBadge}
											</Badge>
										)}
									</span>
								</li>
							);
						})}
						{lanes.length > 1 && (
							<li className="flex items-center justify-between gap-3 px-3 pt-1 text-sm font-semibold">
								<span>{t.adminService.totalPerCycle}</span>
								<span>
									{formatPrice(
										lanes
											.reduce((sum, lane) => sum + Number(lane.amount), 0)
											.toFixed(2),
									)}
								</span>
							</li>
						)}
					</ul>
				</section>
			)}

			{/*
			 * BILLING HISTORY — every period this subscriber has, paid and unpaid.
			 *
			 * "Subscription details" above describes ONE period, because that is what
			 * was opened. A venue on a plan plus the POS add-on is billed on two
			 * lanes and opens two invoices for the same month, so a panel showing one
			 * of them looks like the other has gone missing.
			 *
			 * It is also the decision this panel exists for: marking a period paid
			 * needs the neighbours — is this the only thing outstanding, or the fourth
			 * unpaid week running? Without this the only way to see was to close the
			 * drawer, expand the org card, and come back.
			 *
			 * The period being viewed is MARKED rather than removed: a list missing
			 * the row you are looking at reads as a gap in the ledger.
			 */}
			{history.length > 0 && (
				<section className="rounded-lg border border-border/60 p-4">
					<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						{t.adminService.billingHistory}
					</p>

					{/*
					 * THE TWO NUMBERS AN ADMIN IS ACTUALLY AFTER: what this subscriber
					 * has settled, and what it still owes. Summed over EVERY period, so
					 * the answer does not depend on which row happened to be opened.
					 *
					 * Green settled, amber waiting — the owner's colour rule, the same
					 * pairing the status pills below use, so the tiles and the rows
					 * cannot read as two different vocabularies.
					 */}
					<div className="mb-3 grid grid-cols-2 gap-2">
						{(
							[
								{
									key: "paid" as const,
									label: t.subscription.statusPaid,
									rows: history.filter((row) => row.status === "paid"),
									tone: "emerald",
								},
								{
									key: "unpaid" as const,
									label: t.subscription.statusUnpaid,
									rows: history.filter((row) => row.status !== "paid"),
									tone: "amber",
								},
							] as const
						).map((tile) => {
							const active = historyFilter === tile.key;
							return (
								<button
									key={tile.key}
									type="button"
									// Pressing the active tile clears the filter. A one-way
									// control that cannot be undone without closing the panel is
									// how a reader ends up convinced periods have gone missing.
									onClick={() => setHistoryFilter(active ? "all" : tile.key)}
									aria-pressed={active}
									className={`rounded-md border px-3 py-2 text-left transition-colors ${
										tile.tone === "emerald"
											? "border-emerald-500/25 bg-emerald-500/5 hover:bg-emerald-500/10"
											: "border-amber-500/25 bg-amber-500/5 hover:bg-amber-500/10"
									} ${
										active
											? tile.tone === "emerald"
												? "ring-2 ring-emerald-500/50"
												: "ring-2 ring-amber-500/50"
											: ""
									}`}
								>
									<p
										className={`text-[11px] font-medium uppercase tracking-wide ${
											tile.tone === "emerald"
												? "text-emerald-500"
												: "text-amber-500"
										}`}
									>
										{tile.label}
									</p>
									<p
										className={`text-base font-semibold ${
											tile.tone === "emerald"
												? "text-emerald-500"
												: "text-amber-500"
										}`}
									>
										{formatPrice(
											tile.rows
												.reduce((sum, row) => sum + Number(row.amount), 0)
												.toFixed(2),
										)}
									</p>
									<p className="text-xs text-muted-foreground">
										{fill(t.adminService.periodsCount, { n: tile.rows.length })}
									</p>
								</button>
							);
						})}
					</div>

					{/* Says what the list is showing whenever it is NOT everything —
					    otherwise a filtered list is indistinguishable from a short one. */}
					{historyFilter !== "all" && (
						<button
							type="button"
							onClick={() => setHistoryFilter("all")}
							className="mb-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground"
						>
							{fill(t.adminService.showingFilteredPeriods, {
								n: history.filter((row) =>
									historyFilter === "paid"
										? row.status === "paid"
										: row.status !== "paid",
								).length,
								total: history.length,
							})}
						</button>
					)}

					<ul className="space-y-1.5">
						{(() => {
							/**
							 * GROUPED BY PERIOD. A venue on a plan plus the POS add-on opens
							 * TWO invoices for the SAME window, and two rows each restating
							 * "3 Aug – 2 Sep" read as a duplicate (owner: "can design the UI
							 * because is same date"). One date header per window; the lanes
							 * sit under it, each keeping its own figure, status and Mark
							 * paid, with the window's total beside the date when there is
							 * more than one lane to add up.
							 */
							const filtered = history.filter((row) =>
								historyFilter === "all"
									? true
									: historyFilter === "paid"
										? row.status === "paid"
										: row.status !== "paid",
							);
							const groups: {
								key: string;
								periodStart: string;
								periodEnd: string;
								rows: typeof filtered;
							}[] = [];
							for (const row of filtered) {
								const key = `${row.periodStart}|${row.periodEnd}`;
								const found = groups.find((group) => group.key === key);
								if (found) found.rows.push(row);
								else
									groups.push({
										key,
										periodStart: row.periodStart,
										periodEnd: row.periodEnd,
										rows: [row],
									});
							}
							return groups.map((group) => (
								<li
									key={group.key}
									className="rounded-md bg-muted/30 px-3 py-2 text-sm"
								>
									<div className="flex items-center justify-between gap-3">
										<span className="font-medium">
											{formatDay(group.periodStart)} –{" "}
											{formatDay(group.periodEnd)}
										</span>
										{group.rows.length > 1 && (
											<span className="text-xs text-muted-foreground">
												{t.adminService.totalThisPeriod} ·{" "}
												{formatPrice(
													(
														group.rows.reduce(
															(sum, row) =>
																sum + Math.round(Number(row.amount) * 100),
															0,
														) / 100
													).toFixed(2),
												)}
											</span>
										)}
									</div>
									<ul className="mt-1.5 space-y-1">
										{group.rows.map((row) => {
											const isThisOne = row.id === invoice.id;
											const refocusable =
												!isThisOne &&
												!!onSelectInvoice &&
												referenceFor?.id !== row.id;
											return (
												<li
													key={row.id}
													className={`rounded px-2 py-1.5 ${
														isThisOne
															? "bg-primary/10 ring-1 ring-primary/40"
															: ""
													} ${refocusable ? "cursor-pointer hover:bg-muted/50" : ""}`}
													// Clicking another lane re-points the panel; stands
													// down while this row's reference form is open —
													// refocusing remounts the panel and eats the typing.
													// The target guard skips events bubbling out of the
													// row's own button and input.
													role={refocusable ? "button" : undefined}
													tabIndex={refocusable ? 0 : undefined}
													onKeyDown={
														refocusable
															? (event) => {
																	if (event.target !== event.currentTarget)
																		return;
																	if (
																		event.key === "Enter" ||
																		event.key === " "
																	) {
																		event.preventDefault();
																		onSelectInvoice?.(row.id);
																	}
																}
															: undefined
													}
													onClick={
														refocusable
															? () => onSelectInvoice?.(row.id)
															: undefined
													}
												>
													<div className="flex items-center justify-between gap-3">
														<span className="min-w-0 truncate text-xs text-muted-foreground">
															{row.planName} ·{" "}
															{row.billingCycle === "weekly"
																? t.subscription.billedWeekly
																: t.subscription.billedMonthly}
														</span>
														<span className="flex shrink-0 items-center gap-2">
															<span className="font-medium">
																{formatPrice(row.amount)}
															</span>
															<Badge
																variant="outline"
																className={
																	row.status === "paid"
																		? "border-emerald-500/40 text-emerald-500"
																		: "border-amber-500/40 text-amber-500"
																}
															>
																{row.status === "paid"
																	? t.subscription.statusPaid
																	: t.subscription.statusUnpaid}
															</Badge>
															{isThisOne && (
																<Badge variant="outline">
																	{t.adminService.thisPeriodBadge}
																</Badge>
															)}
															{referenceFor?.id !== row.id && (
																<Button
																	size="sm"
																	variant={
																		row.status === "paid"
																			? "outline"
																			: "default"
																	}
																	disabled={isSaving}
																	onClick={(event) => {
																		// A press here settles, never navigates.
																		event.stopPropagation();
																		if (row.status === "paid") {
																			statusMutation.mutate({
																				id: row.id,
																				status: "unpaid",
																			});
																			return;
																		}
																		setReferenceFor({
																			id: row.id,
																			value: "",
																		});
																	}}
																>
																	{row.status === "paid"
																		? t.adminService.markUnpaid
																		: t.adminService.markPaid}
																</Button>
															)}
														</span>
													</div>
													{referenceFor?.id === row.id && (
														<div className="mt-2 flex flex-col gap-1 border-t border-border/50 pt-2">
															<Input
																autoFocus
																value={referenceFor.value}
																maxLength={120}
																placeholder={
																	t.adminService.paymentReferencePlaceholder
																}
																aria-label={t.adminService.paymentReference}
																disabled={isSaving}
																className="h-8 text-sm"
																onChange={(e) =>
																	setReferenceFor({
																		id: row.id,
																		value: e.target.value,
																	})
																}
																onKeyDown={(e) => {
																	if (e.key === "Enter" && !isSaving)
																		statusMutation.mutate({
																			id: row.id,
																			status: "paid",
																			reference:
																				referenceFor.value.trim() || null,
																		});
																	if (e.key === "Escape") setReferenceFor(null);
																}}
															/>
															<span className="text-xs text-muted-foreground">
																{t.adminService.paymentReferenceHint}
															</span>
															<div className="flex justify-end gap-2 pt-1">
																<Button
																	size="sm"
																	variant="outline"
																	disabled={isSaving}
																	onClick={() => setReferenceFor(null)}
																>
																	{t.common.cancel}
																</Button>
																<Button
																	size="sm"
																	disabled={isSaving}
																	onClick={() =>
																		statusMutation.mutate({
																			id: row.id,
																			status: "paid",
																			reference:
																				referenceFor.value.trim() || null,
																		})
																	}
																>
																	{t.adminService.confirmPayment}
																</Button>
															</div>
														</div>
													)}
												</li>
											);
										})}
									</ul>
								</li>
							));
						})()}
					</ul>
				</section>
			)}

			{/* HOW THEY PAY — the half the invoice cannot hold. */}
			<section className="rounded-lg border border-border/60 p-4">
				<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t.subscription.payHow}
				</p>
				{methods.length === 0 ? (
					// Said plainly rather than left blank: an empty box reads as a
					// loading fault, and "no method on file" is a real, actionable answer.
					<p className="text-sm text-muted-foreground">
						{t.adminService.noMethodOnFile}
					</p>
				) : (
					<ul className="space-y-2">
						{methods.map((method) => (
							<li
								key={method.id}
								className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-3 py-2"
							>
								<span className="flex items-center gap-2 text-sm">
									<MethodIcon type={method.type} />
									{methodLabelOf(method)}
								</span>
								<span className="flex items-center gap-2">
									{method.isDefault && (
										<Badge variant="outline">
											{t.adminService.defaultMethod}
										</Badge>
									)}
									{method.mandateStatus === "pending" && (
										<Badge className={paymentToneOf.pending}>
											{t.adminService.mandatePendingShort}
										</Badge>
									)}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			{/* EVERY ATTEMPT — including the ones that failed, which is the point. */}
			<section className="rounded-lg border border-border/60 p-4">
				<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					{t.adminService.paymentAttempts}
				</p>
				{payments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t.adminService.noAttemptsYet}
					</p>
				) : (
					<ul className="space-y-2">
						{payments.map((payment) => (
							<li
								key={payment.id}
								className="rounded-md bg-muted/30 px-3 py-2 text-sm"
							>
								<div className="flex items-center justify-between gap-3">
									<span className="font-medium">
										{methodTypeLabelOf(payment.methodType)}
									</span>
									<Badge className={paymentToneOf[payment.status]}>
										{paymentStatusLabelOf(payment.status)}
									</Badge>
								</div>
								<div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
									<p>
										{formatPrice(payment.amount)} ·{" "}
										{formatDate(payment.paidAt ?? payment.createdAt)}
									</p>
									{payment.reference && (
										<p className="break-all">
											{t.adminService.paymentReference}: {payment.reference}
										</p>
									)}
									{payment.gateway && (
										<p className="break-all">
											{payment.gateway}
											{payment.gatewayPaymentId
												? ` · ${payment.gatewayPaymentId}`
												: ""}
										</p>
									)}
									{payment.failureReason && (
										<p className="text-red-300">{payment.failureReason}</p>
									)}
									<p>
										{t.adminService.recordedBy}:{" "}
										{actorLabelOf(payment.createdBy)}
									</p>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
