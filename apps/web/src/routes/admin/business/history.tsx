import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	History as HistoryIcon,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	DateMultiFilter,
	datesToQueryParam,
} from "@/components/admin/date-multi-filter";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	formatDate,
	formatNumber,
	formatPrice,
	getErrorMessage,
} from "@/lib/utils";
import { fetchAgencies } from "@/services/agency";
import {
	fetchMemberSubscriptions,
	type MemberBillingCycle,
	type MemberSubscriptionStatus,
	type MemberSubscriptionsQueryParams,
	type SubscriberType,
} from "@/services/member-subscription";
import { fetchOutlets } from "@/services/outlet";

export const Route = createFileRoute("/admin/business/history")({
	component: HistoryPage,
	head: () => ({
		meta: [{ title: "Current Plan — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type SubscriberTypeFilter = "all" | SubscriberType;
type StatusFilter = "all" | MemberSubscriptionStatus;

const statusBadgeColors: Record<MemberSubscriptionStatus, string> = {
	active:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
	expired: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
	past_due:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

const subscriberTypeColors: Record<SubscriberType, string> = {
	outlet: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	agency: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
};

/*
 * Rendered labels for the three stored enums on a ledger row. The record KEY is
 * the value the API sends and the filters compare on, so it never moves; only
 * the label does, which is why each entry holds a FUNCTION of the dictionary
 * rather than a string — a module-scope map cannot call a hook.
 */
const subscriberTypeLabels: Record<
	SubscriberType,
	(t: PortalTranslations) => string
> = {
	outlet: (t) => t.history.portalOutlet,
	agency: (t) => t.history.portalAgency,
};

const statusLabels: Record<
	MemberSubscriptionStatus,
	(t: PortalTranslations) => string
> = {
	active: (t) => t.subscription.statusActive,
	cancelled: (t) => t.subscription.statusCancelled,
	expired: (t) => t.adminBusiness.statusExpired,
	past_due: (t) => t.subscription.statusPastDue,
};

const billingCycleLabels: Record<
	MemberBillingCycle,
	(t: PortalTranslations) => string
> = {
	weekly: (t) => t.subscription.billedWeekly,
	monthly: (t) => t.subscription.billedMonthly,
	annually: (t) => t.subscription.billedAnnually,
};

function HistoryPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();

	const [subscriberTypeFilter, setSubscriberTypeFilter] =
		useState<SubscriberTypeFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [selectedDates, setSelectedDates] = useState<Date[]>([]);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	/**
	 * Current = one row per subscriber, the plan it is on today. History = every
	 * subscription row, so a venue that has changed plan several times shows each
	 * one with its dates instead of appearing once.
	 */
	const [view, setView] = useState<"current" | "history">("current");

	// Debounce the search box so a keystroke doesn't fire a request each time.
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	const queryParams: MemberSubscriptionsQueryParams = {
		page,
		pageSize: PAGE_SIZE,
		// Current view: the plan each subscriber is on NOW. A switch closes the old
		// row and opens a new one, so without this a venue lists every plan it has
		// ever held and the page cannot answer "what is this venue on today?".
		// History view shows exactly those older rows — nothing is deleted.
		latestPerSubscriber: view === "current",
	};
	if (subscriberTypeFilter !== "all")
		queryParams.subscriberType = subscriberTypeFilter;
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (search) queryParams.search = search;
	const datesParam = datesToQueryParam(selectedDates);
	if (datesParam) queryParams.dates = datesParam;

	const historyQuery = useQuery({
		queryKey: ["member-subscriptions", queryParams],
		queryFn: () => fetchMemberSubscriptions(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const records = historyQuery.data?.data ?? [];
	const pagination = historyQuery.data?.pagination;
	const showLoading = historyQuery.isLoading && records.length === 0;

	/**
	 * Every registered organisation, and the ledger ids that HAVE a charge.
	 *
	 * The table above is the `member_subscription` ledger, so a venue or agency
	 * that has never been billed simply is not in it — which reads as "missing"
	 * to an admin who knows the organisation exists and can sign in. These two
	 * queries let the page name them explicitly instead of leaving a silent gap.
	 * Nothing is invented: an organisation with no charge is listed as exactly
	 * that, never as a row in the ledger.
	 */
	const outletsQuery = useQuery({
		queryKey: ["outlets", "history-coverage"],
		queryFn: () => fetchOutlets({ pageSize: 200 }, logout),
		staleTime: 60_000,
	});
	const agenciesQuery = useQuery({
		queryKey: ["agencies", "history-coverage"],
		queryFn: () => fetchAgencies({ pageSize: 200 }, logout),
		staleTime: 60_000,
	});
	const ledgerIdsQuery = useQuery({
		queryKey: ["member-subscriptions", "history-coverage-ids"],
		queryFn: () => fetchMemberSubscriptions({ pageSize: 200 }, logout),
		staleTime: 30_000,
	});

	const subscribedIds = useMemo(
		() =>
			new Set((ledgerIdsQuery.data?.data ?? []).map((row) => row.subscriberId)),
		[ledgerIdsQuery.data],
	);

	type UnsubscribedOrg = { id: string; name: string; role: SubscriberType };
	const unsubscribedOrgs = useMemo<UnsubscribedOrg[]>(() => {
		const rows: UnsubscribedOrg[] = [
			...(outletsQuery.data?.data ?? []).map((outlet) => ({
				id: outlet.id,
				name: outlet.name,
				role: "outlet" as SubscriberType,
			})),
			...(agenciesQuery.data?.data ?? []).map((agency) => ({
				id: agency.id,
				name: agency.name,
				role: "agency" as SubscriberType,
			})),
		].filter((org) => !subscribedIds.has(org.id));
		const term = search.trim().toLowerCase();
		return rows
			.filter((org) =>
				subscriberTypeFilter === "all"
					? true
					: org.role === subscriberTypeFilter,
			)
			.filter((org) => (term ? org.name.toLowerCase().includes(term) : true))
			.sort((a, b) => a.name.localeCompare(b.name));
	}, [
		outletsQuery.data,
		agenciesQuery.data,
		subscribedIds,
		subscriberTypeFilter,
		search,
	]);

	const resetToFirstPage = () => setPage(1);

	return (
		<PageShell>
			<PageHeader
				icon={HistoryIcon}
				title={t.admin.navCurrentPlan}
				description={t.adminBusiness.currentPlanSubtitle}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.admin.navCurrentPlan}
								{historyQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{view === "current"
									? t.adminBusiness.currentViewHint
									: t.adminBusiness.historyViewHint}
							</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
							<SourceToggle
								className="sm:mr-auto"
								value={subscriberTypeFilter}
								onChange={(value) => {
									setSubscriberTypeFilter(value);
									resetToFirstPage();
								}}
							/>

							<div className="relative sm:w-56">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={searchInput}
									onChange={(event) => setSearchInput(event.target.value)}
									placeholder={t.adminBusiness.searchOutletOrAgencyPlaceholder}
									className="pl-8"
									aria-label={t.adminBusiness.searchOutletOrAgency}
								/>
							</div>

							{/* Current = the plan each subscriber is on today; History =
							    every subscription it has held, with dates. */}
							<Select
								value={view}
								onValueChange={(value) => {
									setView(value as "current" | "history");
									resetToFirstPage();
								}}
							>
								<SelectTrigger className="sm:w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="current">
										{t.adminBusiness.viewCurrentPlan}
									</SelectItem>
									<SelectItem value="history">
										{t.adminBusiness.viewFullHistory}
									</SelectItem>
								</SelectContent>
							</Select>

							<Select
								value={statusFilter}
								onValueChange={(value) => {
									setStatusFilter(value as StatusFilter);
									resetToFirstPage();
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
									<SelectItem value="active">
										{statusLabels.active(t)}
									</SelectItem>
									<SelectItem value="cancelled">
										{statusLabels.cancelled(t)}
									</SelectItem>
									<SelectItem value="expired">
										{statusLabels.expired(t)}
									</SelectItem>
									<SelectItem value="past_due">
										{statusLabels.past_due(t)}
									</SelectItem>
								</SelectContent>
							</Select>

							<DateMultiFilter
								selectedDates={selectedDates}
								onChange={(dates) => {
									setSelectedDates(dates);
									resetToFirstPage();
								}}
								ariaLabel={t.adminBusiness.filterBySubscribedDate}
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t.adminBusiness.colSubscriber}</TableHead>
									<TableHead className="w-[110px]">
										{t.adminBusiness.colRole}
									</TableHead>
									<TableHead>{t.adminBusiness.colPlan}</TableHead>
									<TableHead>{t.adminBusiness.colAmount}</TableHead>
									<TableHead>{t.adminBusiness.colBillingCycle}</TableHead>
									<TableHead className="w-[120px]">
										{t.admin.colStatus}
									</TableHead>
									<TableHead className="w-[190px]">
										{t.adminBusiness.colSubscribed}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>{t.adminBusiness.loadingHistory}</span>
											</div>
										</TableCell>
									</TableRow>
								) : historyQuery.isError ? (
									<TableRow>
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													{t.adminBusiness.historyLoadFailed}
												</p>
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(historyQuery.error)}
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={() => historyQuery.refetch()}
												>
													<RefreshCw className="mr-2 h-4 w-4" />
													{t.admin.tryAgain}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								) : records.length === 0 ? (
									<TableRow>
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<HistoryIcon className="h-6 w-6" />
												<span>{t.adminBusiness.noSubscriptionsFound}</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									records.map((record) => (
										<TableRow key={record.id}>
											<TableCell className="font-medium">
												{record.subscriberName}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`${subscriberTypeColors[record.subscriberType]} w-fit`}
												>
													{subscriberTypeLabels[record.subscriberType](t)}
												</Badge>
											</TableCell>
											<TableCell>{record.planName}</TableCell>
											<TableCell>{formatPrice(record.amount)}</TableCell>
											<TableCell>
												{billingCycleLabels[record.billingCycle](t)}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`${statusBadgeColors[record.status]} w-fit`}
												>
													{statusLabels[record.status](t)}
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{formatDate(record.startedAt)}
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
							<div>
								{fill(t.adminBusiness.showingSubscriptions, {
									from: formatNumber((pagination.page - 1) * PAGE_SIZE + 1),
									to: formatNumber(
										Math.min(
											pagination.page * PAGE_SIZE,
											pagination.totalCount,
										),
									),
									total: formatNumber(pagination.totalCount),
								})}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || historyQuery.isFetching}
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
									disabled={!pagination.hasNextPage || historyQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									{t.admin.next}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/*
			 * Registered organisations with NO charge in the ledger. Listed here so
			 * the page accounts for every outlet and agency that exists, rather than
			 * appearing to have lost the ones that were never billed.
			 */}
			{unsubscribedOrgs.length > 0 && (
				<Card className="border-(--lavender-soft)/40 bg-card">
					<CardHeader>
						<CardTitle>{t.adminBusiness.noSubscriptionOnRecord}</CardTitle>
						<CardDescription>
							{fill(
								unsubscribedOrgs.length === 1
									? t.adminBusiness.neverChargedOne
									: t.adminBusiness.neverChargedMany,
								{ n: formatNumber(unsubscribedOrgs.length) },
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t.adminBusiness.colSubscriber}</TableHead>
									<TableHead>{t.adminBusiness.colRole}</TableHead>
									<TableHead>{t.adminBusiness.colPlan}</TableHead>
									<TableHead>{t.admin.colStatus}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{unsubscribedOrgs.map((org) => (
									<TableRow key={`${org.role}-${org.id}`}>
										<TableCell className="font-medium">{org.name}</TableCell>
										<TableCell>
											<Badge variant="outline">
												{subscriberTypeLabels[org.role](t)}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground">—</TableCell>
										<TableCell>
											<Badge variant="outline">
												{t.adminBusiness.notSubscribed}
											</Badge>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</CardContent>
				</Card>
			)}
		</PageShell>
	);
}
