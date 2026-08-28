import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	CreditCard,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { InvoicePaymentSheet } from "@/components/admin/invoice-payment-sheet";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { SourceToggle } from "@/components/admin/source-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { formatPrice, getErrorMessage } from "@/lib/utils";
import {
	fetchSubscriptionInvoiceGroups,
	generateSubscriptionInvoices,
	type SubscriberType,
	type SubscriptionInvoiceGroup,
	type SubscriptionInvoiceQueryParams,
	type SubscriptionInvoiceStatus,
} from "@/services/subscription-invoice";

export const Route = createFileRoute("/admin/service/plan-payment")({
	component: PlanPaymentPage,
	/*
	 * Document title stays ENGLISH — `head()` is route metadata evaluated
	 * outside React, so it cannot read the locale context.
	 */
	head: () => ({ meta: [{ title: "Plan Payment — Innocenz Admin" }] }),
});

const PAGE_SIZE = 10;

/**
 * What one org owes, across every lane it holds.
 *
 * Summed from the group's OWN invoices rather than re-queried, because the
 * server already sent every period for the orgs on this page — see
 * `fetchSubscriptionInvoiceGroups` on why the grouping cannot happen here.
 *
 * `lanes` is what makes the plan / Custom / POS combination legible: an org on
 * Enterprise with a POS add-on is billed on two lanes, each opening its own
 * invoice, and a card that showed one figure with no explanation would look
 * like an arithmetic error. Deduplicated by name — the same lane repeats once
 * per period, and listing it once per week is the "doubles" this page exists
 * to remove.
 */
function summarise(group: SubscriptionInvoiceGroup) {
	let owed = 0;
	let paidCount = 0;
	for (const invoice of group.invoices) {
		if (invoice.status === "paid") paidCount += 1;
		else owed += Number(invoice.amount);
	}
	return {
		periods: group.invoices.length,
		paidCount,
		unpaidCount: group.invoices.length - paidCount,
		owed,
		lanes: [...new Set(group.invoices.map((invoice) => invoice.planName))],
	};
}

/*
 * The record KEYS are the stored values and never change — only the words a
 * human reads do, so each entry holds a lookup that takes `t`.
 */
const statusLabels: Record<
	SubscriptionInvoiceStatus,
	(t: PortalTranslations) => string
> = {
	unpaid: (t) => t.subscription.statusUnpaid,
	paid: (t) => t.subscription.statusPaid,
};

const statusBadgeColors: Record<SubscriptionInvoiceStatus, string> = {
	unpaid: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	paid: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

const roleLabels: Record<SubscriberType, (t: PortalTranslations) => string> = {
	outlet: (t) => t.table.outlet,
	agency: (t) => t.adminService.agency,
};

const roleBadgeColors: Record<SubscriberType, string> = {
	outlet: "border-sky-400/40 bg-sky-400/10 text-sky-300",
	agency: "border-violet-400/40 bg-violet-400/10 text-violet-300",
};

/**
 * What each org owes InnocenZ, period by period, and whether it has paid.
 *
 * The rows are GENERATED from `member_subscription` — agency weekly (Sun–Sat),
 * outlet monthly (anchored on the day it subscribed) — and every one starts
 * `Unpaid`. Nothing in this app can watch a bank transfer, so `Paid` means an
 * admin here said so; that is the only thing this page writes.
 */
function PlanPaymentPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<string>("all");
	/**
	 * Which invoice the right-hand panel is showing.
	 *
	 * The table can only carry the invoice — a period, a figure, one status flag.
	 * The two questions an admin opens a row to ask (what did they pay WITH, and
	 * did anything already fail) live in `payment_method` and
	 * `subscription_payment`, so they need a panel rather than more columns.
	 */
	const [detailId, setDetailId] = useState<string | null>(null);
	// "all" plus the two payer roles — a PR never holds a subscription, so the
	// PR button is deliberately not offered.
	const [roleFilter, setRoleFilter] = useState<"all" | SubscriberType>("all");
	const [page, setPage] = useState(1);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const queryParams: SubscriptionInvoiceQueryParams = {
		page,
		pageSize: PAGE_SIZE,
	};
	if (search) queryParams.search = search;
	if (statusFilter !== "all")
		queryParams.status = statusFilter as SubscriptionInvoiceStatus;
	if (roleFilter !== "all") queryParams.subscriberType = roleFilter;

	const invoicesQuery = useQuery({
		queryKey: ["subscription-invoices", "by-subscriber", queryParams],
		queryFn: () => fetchSubscriptionInvoiceGroups(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	/**
	 * Which orgs are open. Ids, not indexes — a filter change reorders the page,
	 * and an index would carry the open state onto whoever now sits in that slot.
	 */

	// Opens any period that has started and has no row yet. Idempotent — the
	// server refuses to bill a period twice — so this is safe to press.
	const generateMutation = useMutation({
		mutationFn: () => generateSubscriptionInvoices(logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-invoices"] });
			toast.success(response.message || t.adminService.ledgerUpToDate);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.ledgerRefreshFailed)?.message ??
					t.adminService.ledgerRefreshFailed,
			);
		},
	});

	const groups = invoicesQuery.data?.data ?? [];
	const pagination = invoicesQuery.data?.pagination;
	const showLoading = invoicesQuery.isLoading && groups.length === 0;
	const isSaving = generateMutation.isPending;

	return (
		<PageShell>
			<PageHeader
				icon={CreditCard}
				title={t.admin.navPlanPayment}
				description={t.adminService.planPaymentSubtitle}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminService.billingPeriods}
								{invoicesQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{/* Split around the inline link, not concatenated from
								    fragments: each half is a whole clause, so Chinese can put
								    the link where its own grammar needs it. */}
								{t.adminService.billingPeriodsHintBefore}
								<Link
									to="/admin/service/plan-changes"
									className="text-lavender underline underline-offset-2"
								>
									{t.admin.navPlanChange}
								</Link>
								{t.adminService.billingPeriodsHintAfter}
							</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
							<SourceToggle<"all" | SubscriberType>
								className="sm:mr-auto"
								value={roleFilter}
								onChange={(value) => {
									setRoleFilter(value);
									setPage(1);
								}}
							/>

							<div className="relative sm:w-56">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={searchInput}
									onChange={(event) => setSearchInput(event.target.value)}
									placeholder={t.adminService.searchOutletOrAgencyPlaceholder}
									className="pl-8"
									aria-label={t.adminService.searchOutletOrAgency}
								/>
							</div>

							<Select
								value={statusFilter}
								onValueChange={(value) => {
									setStatusFilter(value);
									setPage(1);
								}}
							>
								<SelectTrigger
									className="sm:w-36"
									aria-label={t.admin.filterByStatus}
								>
									<SelectValue placeholder={t.admin.allStatus} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t.admin.allStatus}</SelectItem>
									<SelectItem value="unpaid">
										{statusLabels.unpaid(t)}
									</SelectItem>
									<SelectItem value="paid">{statusLabels.paid(t)}</SelectItem>
								</SelectContent>
							</Select>

							{/* Idempotent — the server refuses to bill a period twice — so this
							    is safe to press, and it exists so a newly-started period does
							    not wait for the nightly job. */}
							<Button
								variant="outline"
								disabled={isSaving}
								onClick={() => generateMutation.mutate()}
							>
								{generateMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="mr-2 h-4 w-4" />
								)}
								{t.adminService.refreshPeriods}
							</Button>
						</div>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t.adminService.colWho}</TableHead>
									<TableHead className="w-[100px]">
										{t.adminService.role}
									</TableHead>
									<TableHead>{t.adminService.colPlan}</TableHead>
									<TableHead className="w-[210px]">
										{t.adminService.colBillingPeriod}
									</TableHead>
									<TableHead>{t.adminService.colAmount} (RM)</TableHead>
									<TableHead className="w-[110px]">
										{t.admin.colStatus}
									</TableHead>
									<TableHead className="w-[170px]">
										{t.adminService.colPaidOn}
									</TableHead>
									<TableHead className="w-[130px] text-right">
										{t.admin.colAction}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={8} className="py-10 text-center">
											<Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
										</TableCell>
									</TableRow>
								) : invoicesQuery.isError ? (
									<TableRow>
										<TableCell colSpan={8} className="py-10 text-center">
											<AlertCircle className="mx-auto mb-2 h-5 w-5 text-red-400" />
											<p className="text-sm text-muted-foreground">
												{getErrorMessage(invoicesQuery.error)}
											</p>
											<Button
												variant="outline"
												className="mt-3"
												onClick={() => invoicesQuery.refetch()}
											>
												{t.admin.tryAgain}
											</Button>
										</TableCell>
									</TableRow>
								) : groups.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={8}
											className="py-10 text-center text-muted-foreground"
										>
											{t.adminService.noBillingPeriods}
										</TableCell>
									</TableRow>
								) : (
									groups.flatMap((group) => {
										const summary = summarise(group);
										/*
										 * ONE ROW PER ORG, its periods nested under it.
										 *
										 * The header carries what an admin came to find — how many
										 * periods, how much is outstanding, and which lanes the org
										 * is billed on — so the common question is answered without
										 * opening anything. The periods themselves are the detail,
										 * and each keeps its own Mark paid, because settling is per
										 * period and always was.
										 */
										/*
										 * TWO ACTIONS ON ONE ROW, deliberately separated.
										 *
										 * The chevron expands the periods inline; the rest of the row
										 * opens the right-hand panel, which is where "all the details
										 * and the current state" live — every billing lane with the
										 * live one ringed, the payment methods on file, and every
										 * attempt made against the period.
										 *
										 * The panel is keyed on an INVOICE, so the newest period is
										 * what it is handed: it is the one an admin is answering
										 * questions about, and the panel widens from there to the
										 * org's other lanes by itself.
										 */
										const newest = group.invoices[0];
										const header = (
											<TableRow
												key={`group-${group.subscriberId}`}
												className="cursor-pointer bg-muted/30 hover:bg-muted/50"
												onClick={() => newest && setDetailId(newest.id)}
											>
												<TableCell className="text-base font-medium">
														{group.subscriberName}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={`${roleBadgeColors[group.subscriberType]} w-fit`}
													>
														{roleLabels[group.subscriberType](t)}
													</Badge>
												</TableCell>
												{/* Every lane the org is billed on — plan, Custom, POS —
												    named once rather than once per period. */}
												<TableCell className="text-base">
													{summary.lanes.join(" · ")}
												</TableCell>
												<TableCell className="text-base whitespace-nowrap text-muted-foreground">
													{fill(t.adminService.periodsCount, {
														n: summary.periods,
													})}
												</TableCell>
												<TableCell className="text-base font-medium whitespace-nowrap">
													{formatPrice(summary.owed)}
												</TableCell>
												<TableCell>
													{summary.unpaidCount === 0 ? (
														<Badge
															variant="outline"
															className={`${statusBadgeColors.paid} w-fit`}
														>
															{statusLabels.paid(t)}
														</Badge>
													) : (
														<Badge
															variant="outline"
															className={`${statusBadgeColors.unpaid} w-fit`}
														>
															{fill(t.adminService.unpaidOfTotal, {
																unpaid: summary.unpaidCount,
																total: summary.periods,
															})}
														</Badge>
													)}
												</TableCell>
												<TableCell className="text-base whitespace-nowrap text-muted-foreground">
													{summary.paidCount > 0
														? fill(t.adminService.paidCount, {
																n: summary.paidCount,
															})
														: "—"}
												</TableCell>
												<TableCell />
											</TableRow>
										);
										// The per-period rows used to unfold here. They now live in the
										// payment panel, which holds the same list PLUS the paid/unpaid
										// totals and the Mark-paid action — so keeping them here was two
										// renderings of one fact, and the worse of the two.
										return [header];
									})
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							<span>
								{fill(t.adminService.showingSubscribers, {
									from: (pagination.page - 1) * pagination.pageSize + 1,
									to: Math.min(
										pagination.page * pagination.pageSize,
										pagination.totalCount,
									),
									total: pagination.totalCount,
								})}
							</span>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || invoicesQuery.isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									{t.admin.previous}
								</Button>
								<span>
									{fill(t.admin.pageOf, {
										page: pagination.page,
										total: pagination.totalPages,
									})}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasNextPage || invoicesQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									{t.admin.next}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<Sheet
				open={detailId != null}
				onOpenChange={(open) => {
					if (!open) setDetailId(null);
				}}
			>
				<SheetContent
					side="right"
					className="w-full overflow-y-auto sm:max-w-xl md:max-w-2xl"
				>
					{/* Keyed on the id so switching rows remounts rather than showing
					    the previous invoice's figures while the next one loads. */}
					{detailId && (
						<InvoicePaymentSheet
							key={detailId}
							invoiceId={detailId}
							// Lets the panel's billing history move the focus to another of
							// the subscriber's periods without closing and re-opening.
							onSelectInvoice={setDetailId}
						/>
					)}
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}
