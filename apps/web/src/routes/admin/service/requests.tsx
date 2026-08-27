import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowRight,
	CheckCircle2,
	Handshake,
	Loader2,
	MailCheck,
	RefreshCw,
	Search,
	XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	formatDate,
	formatNumber,
	formatPrice,
	getErrorMessage,
} from "@/lib/utils";
import {
	type AdminRequest,
	type AdminRequestStatus,
	type AdminRequestsQueryParams,
	type AdminRequestType,
	declineRequest,
	fetchAdminRequests,
	fetchNegotiatedSummary,
	markRequestContacted,
	resolveRequest,
	type SubscriberType,
	updateAdminRequest,
} from "@/services/admin-request";
import type { Subscription } from "@/services/subscription";
import { fetchSubscriptions } from "@/services/subscription";

export const Route = createFileRoute("/admin/service/requests")({
	component: RequestsPage,
	head: () => ({
		meta: [{ title: "Plan Request — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type StatusFilter = "all" | AdminRequestStatus;
type RoleFilter = "all" | SubscriberType;

// This inbox holds everything that touches a NEGOTIATED arrangement, in either
// direction — the server decides membership (`negotiated: "only"`), because a
// move INTO Custom is filed as an ordinary plan_change and a request type alone
// would miss it:
//  • outlet  → "Integrate with POS" add-on: the quote to join, and the request
//              to leave (which names the plan being kept)
//  • agency  → Custom (151+ PV): "Renegotiate Price", entering, and leaving

// The record KEY is the stored request type and never changes; only the label
// it renders is looked up, so the map holds resolvers rather than strings.
const requestTypeLabels: Record<
	AdminRequestType,
	(t: PortalTranslations) => string
> = {
	pos_integration_quote: (t) => t.admin.reqPosQuote,
	custom_renegotiation: (t) => t.admin.reqCustom,
	plan_change: (t) => t.admin.reqPlanChange,
	contact: (t) => t.admin.reqContact,
	other: (t) => t.admin.reqOther,
};

/** Same rule for the stored status: the value is compared, the label is shown. */
const requestStatusLabels: Record<
	AdminRequestStatus,
	(t: PortalTranslations) => string
> = {
	pending: (t) => t.admin.statusPending,
	contacted: (t) => t.adminRequests.statusContacted,
	resolved: (t) => t.adminRequests.statusResolved,
	declined: (t) => t.adminRequests.statusDeclined,
	direct: (t) => t.adminRequests.statusDirect,
	approved: (t) => t.adminRequests.statusApproved,
};

/**
 * The plan's billing cycle, as a word. Stored on the plan record as an enum, so
 * an unrecognised cycle falls through to the raw value rather than blanking the
 * one line that tells the admin what price they are anchoring against.
 */
const billingCycleLabels: Record<string, (t: PortalTranslations) => string> = {
	weekly: (t) => t.subscription.billedWeekly,
	monthly: (t) => t.subscription.billedMonthly,
	annually: (t) => t.subscription.billedAnnually,
};

function billingCycleLabel(cycle: string, t: PortalTranslations): string {
	return billingCycleLabels[cycle]?.(t) ?? cycle;
}

const statusBadgeColors: Record<AdminRequestStatus, string> = {
	pending:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	contacted: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	resolved:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	// Plan-change statuses — rows live on /admin/service/plan-changes, kept here
	// so the shared status map stays exhaustive.
	declined: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
	direct: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
	approved:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
};

// Who / Role / Type are a record of the originating request — read-only in admin.
const roleBadgeColors: Record<SubscriberType, string> = {
	outlet: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	agency: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
};

const roleLabels: Record<SubscriberType, (t: PortalTranslations) => string> = {
	outlet: (t) => t.adminRequests.roleOutlet,
	agency: (t) => t.adminRequests.roleAgency,
};

/** The subscriber's current tier — the "From plan" side of the request. */
function planForRequest(
	request: AdminRequest,
	planById: Map<string, Subscription>,
): Subscription | undefined {
	return request.currentPlanId
		? planById.get(request.currentPlanId)
		: undefined;
}

/**
 * The negotiated arrangement a request is about, or null for an ordinary switch.
 *
 * Both work the same way — quoted, re-quoted, dropped — so both are labelled by
 * the same rules below. They differ in one respect only: the outlet's POS add-on
 * is billed BESIDE the plan, while the agency's Custom IS the plan.
 *
 * Both names stay English in every locale: they are the add-on's and the tier's
 * names on the plan record, and this string is COMPARED against `plan.name`
 * below. Translating it would make `current?.name === arrangement` never match.
 */
function negotiatedArrangement(request: AdminRequest): string | null {
	if (request.type === "pos_integration_quote") return "Integrate with POS";
	if (request.type === "custom_renegotiation") return "Custom";
	return null;
}

/**
 * True when the request is the subscriber LEAVING the arrangement — a venue
 * dropping POS, or an agency coming off Custom — which is what naming an
 * ordinary tier as the requested plan means.
 */
function isNegotiatedExit(
	request: AdminRequest,
	requested: Subscription | undefined,
): boolean {
	const arrangement = negotiatedArrangement(request);
	if (!arrangement || !requested) return false;
	return requested.kind !== "addon" && requested.name !== arrangement;
}

/**
 * From plan = what the subscriber is moving away from.
 *
 * A POS request is NOT a move between plans — the add-on is bought, re-priced
 * or dropped while the plan carries on untouched — so the from-side shows the
 * add-on and its previous price when there is one, and nothing at all for a
 * first-time request. Showing the plan there read as "Scale → Integrate with
 * POS", a swap that never happens.
 *
 * Custom follows the same rule where it applies: an agency already ON Custom
 * shows the price being replaced or ended. But Custom IS the agency's tier, so
 * one moving onto it from Growth really is leaving Growth, and that is what the
 * from-side says — blanking it would hide a plan change that genuinely happens.
 */
function fromPlanLabel(
	request: AdminRequest,
	planById: Map<string, Subscription>,
): string {
	const price = request.previousNegotiatedAmount;
	if (request.type === "pos_integration_quote") {
		return price ? `Integrate with POS · RM ${formatPrice(price)}` : "—";
	}
	const current = planForRequest(request, planById);
	const arrangement = negotiatedArrangement(request);
	if (arrangement && current?.name === arrangement) {
		return price ? `${arrangement} · RM ${formatPrice(price)}` : arrangement;
	}
	return current?.name ?? "—";
}

/**
 * To plan = what the request is for.
 *
 * Usually entering a negotiated arrangement (the POS add-on, the Custom tier).
 * But a request can also be a subscriber LEAVING one — a venue dropping POS to
 * go back to plan-only billing, or an agency switching off Custom — and those
 * name the ordinary plan they are returning to.
 */
function toPlanLabel(
	request: AdminRequest,
	planById: Map<string, Subscription>,
	t: PortalTranslations,
): string {
	const requested = request.requestedPlanId
		? planById.get(request.requestedPlanId)
		: undefined;
	const arrangement = negotiatedArrangement(request);
	if (arrangement) {
		// Naming an ordinary tier ends the negotiated price. For a venue that is a
		// cancellation of its add-on; for an agency it is a RESET back to the rate
		// card, because an agency's tier follows its PV volume rather than a choice.
		if (isNegotiatedExit(request, requested)) {
			// The plan NAME stays English; only the verb around it is translated.
			return request.subscriberType === "agency"
				? fill(t.adminRequests.toPlanReset, { plan: requested?.name ?? "" })
				: fill(t.adminRequests.toPlanCancelOnly, {
						plan: requested?.name ?? "",
					});
		}
		return arrangement;
	}
	if (requested && requested.kind !== "addon") {
		// Older resets were filed as ordinary plan changes, before the reset had a
		// type of its own. Read them the same way so history stays legible.
		const from = planForRequest(request, planById);
		return request.subscriberType === "agency" && from?.name === "Custom"
			? fill(t.adminRequests.toPlanReset, { plan: requested.name })
			: requested.name;
	}
	return "—";
}

// Only two combos carry a price on this page: outlet POS-integration quotes
// and agency Custom (151+ PV) renegotiations. Everything else shows no price.
function isPriceNegotiable(request: AdminRequest): boolean {
	if (
		request.subscriberType === "outlet" &&
		request.type === "pos_integration_quote"
	) {
		return true;
	}
	return (
		request.subscriberType === "agency" &&
		request.type === "custom_renegotiation"
	);
}

/**
 * The estimate can be negotiated/changed while the request is open; Resolve
 * finalises it (defaulting to the current plan's actual price if left empty).
 */
function canEditQuote(request: AdminRequest): boolean {
	return isPriceNegotiable(request) && request.status !== "resolved";
}

function RequestsPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
	const [requestedDates, setRequestedDates] = useState<Date[]>([]);
	const [page, setPage] = useState(1);
	const [editRequest, setEditRequest] = useState<AdminRequest | null>(null);
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");

	// Debounce the search box so a keystroke doesn't fire a request each time.
	useEffect(() => {
		const timer = setTimeout(() => {
			setSearch(searchInput.trim());
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput]);

	// Everything that touches a negotiated arrangement, in either direction: the
	// POS add-on and the Custom tier, joining or leaving. A move INTO Custom is
	// filed as an ordinary plan_change, so type alone would miss it — and the
	// admin who agrees that price must see it start and stop in one place.
	const queryParams: AdminRequestsQueryParams = {
		page,
		pageSize: PAGE_SIZE,
		negotiated: "only",
	};
	if (search) queryParams.search = search;
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (roleFilter !== "all") queryParams.subscriberType = roleFilter;
	const requestedDatesParam = datesToQueryParam(requestedDates);
	if (requestedDatesParam) queryParams.dates = requestedDatesParam;

	const requestsQuery = useQuery({
		queryKey: ["admin-requests", queryParams],
		queryFn: () => fetchAdminRequests(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const summaryQuery = useQuery({
		queryKey: ["admin-requests", "negotiated-summary"],
		queryFn: () => fetchNegotiatedSummary(logout),
		staleTime: 30_000,
	});

	// Resolve currentPlanId -> plan (name + fixed price) for each request row.
	const plansQuery = useQuery({
		queryKey: ["subscriptions", "plan-name-lookup"],
		queryFn: () => fetchSubscriptions({ pageSize: 100 }, logout),
		staleTime: 60_000,
	});

	const planById = new Map(
		(plansQuery.data?.data ?? []).map((plan) => [plan.id, plan]),
	);

	const contactedMutation = useMutation({
		mutationFn: (id: string) => markRequestContacted(id, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(response.message || t.adminRequests.toastMarkedContacted);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastMarkContactedFailed)
					?.message ?? t.adminRequests.toastMarkContactedFailed,
			);
		},
	});

	const resolveMutation = useMutation({
		mutationFn: ({
			id,
			quotedAmount,
		}: {
			id: string;
			quotedAmount: number | undefined;
		}) => resolveRequest(id, quotedAmount, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(response.message || t.adminRequests.toastResolved);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastResolveFailed)?.message ??
					t.adminRequests.toastResolveFailed,
			);
		},
	});

	/**
	 * The other half of an answer. Resolve says yes and moves the ledger; this
	 * says no and moves nothing — the venue keeps its add-on, the agency keeps
	 * Custom at the agreed price. Every row here had only Resolve, so a request
	 * the admin did not agree to stayed Pending forever, and the subscriber's own
	 * screen went on saying "waiting for admin" with nothing coming.
	 */
	const declineMutation = useMutation({
		mutationFn: (id: string) => declineRequest(id, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(response.message || t.adminRequests.toastCancelled);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastCancelFailed)?.message ??
					t.adminRequests.toastCancelFailed,
			);
		},
	});

	// Admin can only annotate a request (remarks). Who / Role / Type are the
	// immutable record of the originating Outlet/Agency action and are not editable.
	const updateFieldsMutation = useMutation({
		mutationFn: ({
			id,
			remarks,
			quotedAmount,
		}: {
			id: string;
			remarks?: string | null;
			quotedAmount?: number | null;
		}) => updateAdminRequest(id, { remarks, quotedAmount }, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(response.message || t.adminRequests.toastUpdated);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastUpdateFailed)?.message ??
					t.adminRequests.toastUpdateFailed,
			);
		},
	});

	const records = requestsQuery.data?.data ?? [];
	const pagination = requestsQuery.data?.pagination;
	const showLoading = requestsQuery.isLoading && records.length === 0;
	const summary = summaryQuery.data;
	const isSaving =
		contactedMutation.isPending ||
		resolveMutation.isPending ||
		declineMutation.isPending ||
		updateFieldsMutation.isPending;

	const summaryCards = [
		{
			key: "outlet",
			label: t.adminRequests.summaryOutletQuotes,
			total: summary?.byRole.outlet.total ?? 0,
			count: summary?.byRole.outlet.count ?? 0,
		},
		{
			key: "agency",
			label: t.adminRequests.summaryAgencyQuotes,
			total: summary?.byRole.agency.total ?? 0,
			count: summary?.byRole.agency.count ?? 0,
		},
		{
			key: "total",
			label: t.adminRequests.summaryTotalNegotiated,
			total: summary?.totals.total ?? 0,
			count: summary?.totals.count ?? 0,
		},
	];

	return (
		<PageShell>
			<PageHeader
				icon={Handshake}
				title={t.admin.navPlanRequest}
				description={t.adminRequests.pageDescription}
			/>

			<div className="grid gap-4 sm:grid-cols-3">
				{summaryCards.map((card) => (
					<Card key={card.key} className="border-(--lavender-soft)/40 bg-card">
						<CardHeader className="pb-2">
							<CardDescription>{card.label}</CardDescription>
							<CardTitle className="text-2xl">
								RM {formatPrice(card.total)}
							</CardTitle>
						</CardHeader>
						<CardContent className="text-sm text-muted-foreground">
							{fill(t.adminRequests.summaryResolvedWithPrice, {
								n: formatNumber(card.count),
							})}
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminRequests.cardTitle}
								{requestsQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>{t.adminRequests.cardHint}</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
							<SourceToggle
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
									placeholder={t.adminRequests.searchPlaceholder}
									className="pl-8"
									aria-label={t.adminRequests.searchAria}
								/>
							</div>

							<Select
								value={statusFilter}
								onValueChange={(value) => {
									setStatusFilter(value as StatusFilter);
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
									{/* Values are the stored status; only the labels move. */}
									<SelectItem value="all">{t.admin.allStatus}</SelectItem>
									<SelectItem value="pending">
										{t.admin.statusPending}
									</SelectItem>
									<SelectItem value="contacted">
										{t.adminRequests.statusContacted}
									</SelectItem>
									<SelectItem value="resolved">
										{t.adminRequests.statusResolved}
									</SelectItem>
								</SelectContent>
							</Select>

							<DateMultiFilter
								selectedDates={requestedDates}
								onChange={(dates) => {
									setRequestedDates(dates);
									setPage(1);
								}}
								ariaLabel={t.adminRequests.filterByRequestedDate}
								emptyLabel={t.adminRequests.requestedDate}
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{t.adminRequests.colWho}</TableHead>
									<TableHead className="w-[100px]">
										{t.adminRequests.colRole}
									</TableHead>
									<TableHead>{t.admin.colType}</TableHead>
									<TableHead className="w-[220px]">
										{t.adminRequests.colRemarks}
									</TableHead>
									<TableHead>{t.adminRequests.colFromPlan}</TableHead>
									<TableHead>{t.adminRequests.colToPlan}</TableHead>
									<TableHead>{t.adminRequests.colQuoted}</TableHead>
									<TableHead className="w-[110px]">
										{t.admin.colStatus}
									</TableHead>
									<TableHead className="w-[170px]">
										{t.adminRequests.colRequestedAt}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>{t.adminRequests.loadingRequests}</span>
											</div>
										</TableCell>
									</TableRow>
								) : requestsQuery.isError ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													{t.adminRequests.failedToLoadRequests}
												</p>
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(requestsQuery.error)}
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={() => requestsQuery.refetch()}
												>
													<RefreshCw className="mr-2 h-4 w-4" />
													{t.admin.tryAgain}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								) : records.length === 0 ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Handshake className="h-6 w-6" />
												<span>{t.adminRequests.noRequestsFound}</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									records.map((request) => {
										const plan = planForRequest(request, planById);
										const fromPlan = fromPlanLabel(request, planById);
										const toPlan = toPlanLabel(request, planById, t);
										const negotiable = isPriceNegotiable(request);
										/*
										 * An EXIT is never quoted, so the Quoted column must not
										 * nag for one. It printed "Set before resolve" on a
										 * CANCELLATION — a figure the server never reads, since
										 * `applyResolvedPriceToLedger` ends the arrangement before
										 * it looks at the amount. The sheet behind this row already
										 * said "No quote needed"; the list contradicted it.
										 */
										const isExit = isNegotiatedExit(
											request,
											request.requestedPlanId
												? planById.get(request.requestedPlanId)
												: undefined,
										);

										return (
											<TableRow
												key={request.id}
												className="cursor-pointer hover:bg-muted/30"
												onClick={() => setEditRequest(request)}
											>
												<TableCell>
													<div className="text-base font-medium">
														{request.subscriberName}
													</div>
													{request.contactName && (
														<div className="text-sm text-muted-foreground">
															{request.contactName}
														</div>
													)}
												</TableCell>
												<TableCell>
													{request.subscriberType ? (
														<Badge
															variant="outline"
															className={`${roleBadgeColors[request.subscriberType]} w-fit`}
														>
															{roleLabels[request.subscriberType](t)}
														</Badge>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className="w-fit text-muted-foreground"
													>
														{requestTypeLabels[request.type](t)}
													</Badge>
												</TableCell>
												<TableCell className="max-w-[220px]">
													{request.remarks ? (
														<span className="line-clamp-2 text-base">
															{request.remarks}
														</span>
													) : (
														<span className="text-base text-muted-foreground">
															—
														</span>
													)}
												</TableCell>
												<TableCell className="text-base font-medium">
													{fromPlan}
												</TableCell>
												<TableCell className="text-base font-medium">
													{toPlan}
													{negotiable && request.status !== "resolved" && (
														<div className="text-sm text-muted-foreground">
															{t.adminRequests.requestedPill}
														</div>
													)}
												</TableCell>
												<TableCell className="text-base">
													{request.quotedAmount ? (
														<div className="flex flex-col leading-tight">
															<span>
																RM {formatPrice(request.quotedAmount)}
															</span>
															{request.status !== "resolved" && (
																<span className="text-sm text-muted-foreground">
																	{t.adminRequests.estimatePill}
																</span>
															)}
														</div>
													) : negotiable ? (
														request.status === "resolved" &&
														plan &&
														plan.name !== "Custom" ? (
															<div className="flex flex-col leading-tight">
																<span>RM {formatPrice(plan.price)}</span>
																<span className="text-sm text-muted-foreground">
																	{t.adminRequests.colFromPlan}
																</span>
															</div>
														) : (
															<span className="text-base text-muted-foreground">
																{request.status === "resolved" || isExit
																	? "—"
																	: t.adminRequests.setBeforeResolve}
															</span>
														)
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={`${statusBadgeColors[request.status]} w-fit`}
													>
														{requestStatusLabels[request.status](t)}
													</Badge>
												</TableCell>
												<TableCell className="text-base text-muted-foreground">
													{formatDate(request.createdAt)}
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							<div>
								{fill(t.adminRequests.showingRequests, {
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
									disabled={!pagination.hasPrevPage || requestsQuery.isFetching}
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
									disabled={!pagination.hasNextPage || requestsQuery.isFetching}
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
				open={editRequest != null}
				onOpenChange={(open) => {
					if (!open) setEditRequest(null);
				}}
			>
				<SheetContent
					side="right"
					className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
				>
					{editRequest && (
						<RequestEditForm
							key={editRequest.id}
							request={editRequest}
							fromPlan={fromPlanLabel(editRequest, planById)}
							toPlan={toPlanLabel(editRequest, planById, t)}
							plan={planForRequest(editRequest, planById)}
							requestedPlan={
								editRequest.requestedPlanId
									? planById.get(editRequest.requestedPlanId)
									: undefined
							}
							isSaving={isSaving}
							onSaveRemarks={(id, remarks) =>
								updateFieldsMutation.mutateAsync({ id, remarks })
							}
							onSaveQuote={(id, quotedAmount) =>
								updateFieldsMutation.mutateAsync({ id, quotedAmount })
							}
							onContacted={(id) => contactedMutation.mutateAsync(id)}
							onResolve={(id, quotedAmount) =>
								resolveMutation.mutateAsync({ id, quotedAmount })
							}
							onDecline={(id) => declineMutation.mutateAsync(id)}
							onDone={() => setEditRequest(null)}
						/>
					)}
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}

interface RequestEditFormProps {
	request: AdminRequest;
	fromPlan: string;
	toPlan: string;
	plan: Subscription | undefined;
	/** The plan named by the request — set only when it is an exit request. */
	requestedPlan: Subscription | undefined;
	isSaving: boolean;
	onSaveRemarks: (id: string, remarks: string | null) => Promise<unknown>;
	onSaveQuote: (id: string, quotedAmount: number | null) => Promise<unknown>;
	onContacted: (id: string) => Promise<unknown>;
	onResolve: (id: string, quotedAmount: number | undefined) => Promise<unknown>;
	/** Say no: the request is cancelled and nothing in the ledger moves. */
	onDecline: (id: string) => Promise<unknown>;
	onDone: () => void;
}

function RequestEditForm({
	request,
	fromPlan,
	toPlan,
	plan,
	requestedPlan,
	isSaving,
	onSaveRemarks,
	onSaveQuote,
	onContacted,
	onResolve,
	onDecline,
	onDone,
}: RequestEditFormProps) {
	const { t } = usePortalLocale();
	const negotiable = isPriceNegotiable(request);
	/**
	 * A POS quote buys an ADD-ON, not a plan: resolving it leaves the venue on
	 * its plan and bills the agreed price on top. Borrowing the plan-change
	 * wording ("From plan → To plan") read as a replacement and made the admin
	 * expect the venue to leave Pro, so an add-on request is labelled as one.
	 *
	 * The agency's Custom tier is the same negotiation with one difference: it
	 * REPLACES the tier price rather than being billed beside it. Both render
	 * through the block below; `isAddonRequest` is what decides the wording.
	 */
	const arrangementName = negotiatedArrangement(request);
	const isNegotiatedRequest = arrangementName !== null;
	const isAddonRequest = request.type === "pos_integration_quote";
	/**
	 * Each type covers JOINING the arrangement and LEAVING it — an exit names the
	 * ordinary tier the subscriber is returning to. Rendered with the joining
	 * labels it read backwards: the plan being kept appeared as the arrangement,
	 * and the arrangement being dropped appeared as the plan.
	 */
	const isExit = isNegotiatedExit(request, requestedPlan);
	const editableQuote = canEditQuote(request);
	const [remarks, setRemarks] = useState(request.remarks ?? "");
	const [quote, setQuote] = useState(request.quotedAmount ?? "");

	// Estimated After price for the reminder: the live estimate wins, then the
	// saved quote, then the current plan's actual price (Custom stays negotiated).
	const rawQuote = String(quote).trim();
	const parsedQuote = Number(rawQuote);
	/*
	 * ⚠️ An EXIT short-circuits the whole chain. Leaving POS or Custom needs no
	 * figure — the rate card supplies the number — so every branch below would be
	 * answering a question nobody asked, and the last one actively nagged for a
	 * quote the server never reads.
	 */
	const estimateLabel = isExit
		? "—"
		: rawQuote !== "" && !Number.isNaN(parsedQuote) && parsedQuote >= 0
			? `RM ${formatPrice(parsedQuote)}`
			: request.quotedAmount
				? `RM ${formatPrice(request.quotedAmount)}`
				: request.type === "pos_integration_quote" && plan
					? `RM ${formatPrice(plan.price)}`
					: negotiable
						? t.adminRequests.setBeforeResolve
						: "—";

	/*
	 * Is a price actually OWED here, and has one been given?
	 *
	 * A Custom tier has no list price to fall back on — resolve it blank and the
	 * agency lands on a negotiated tier priced at nothing. A POS quote is the one
	 * case with a real fallback (the current plan's price), so it is not nagged.
	 * RM 0 counts as unset: nobody negotiates a Custom plan down to free, and a
	 * silent zero is exactly the outcome this warning exists to prevent.
	 */
	const quoteGiven =
		rawQuote !== "" && !Number.isNaN(parsedQuote) && parsedQuote > 0;
	const quoteHasFallback = request.type === "pos_integration_quote" && !!plan;
	/*
	 * An EXIT is never quoted. The agency is LEAVING the negotiated price for an
	 * ordinary tier, so the rate card supplies the number — there is nothing to
	 * negotiate and nothing that can be dangerously left blank.
	 *
	 * Without this the warning fired on a cancellation and said the opposite of
	 * the card directly above it: "resolving now would put the agency on a
	 * negotiated tier costing nothing", on a request whose whole purpose is to
	 * move them OFF the negotiated tier and onto Starter's list price.
	 */
	const quoteMissing =
		editableQuote && negotiable && !isExit && !quoteHasFallback && !quoteGiven;
	/*
	 * A price to anchor against — only where one exists. On an exit the CURRENT
	 * plan is Custom itself, which by definition has no list price, so this
	 * printed the nonsense "Custom is RM 0.00 weekly — Custom replaces it".
	 */
	const quoteAnchor =
		plan && Number(plan.price) > 0 && plan.name !== "Custom" ? plan : null;
	/*
	 * Does the exit actually LAND the subscriber somewhere new?
	 *
	 * Only the agency's does: coming off Custom hands them to an ordinary tier.
	 * The venue's POS exit drops an add-on billed BESIDE the plan, so the plan
	 * continues untouched — nothing begins, and the row says so itself
	 * ("Plan (continues)").
	 */
	const exitLandsSomewhere = isExit && !isAddonRequest;

	/**
	 * What resolving actually does, in the subscriber's own terms. The two
	 * arrangements end differently — dropping POS leaves the venue's plan alone,
	 * while dropping Custom puts the agency back on an ordinary tier's list price
	 * — so the note says which, rather than one line covering both loosely.
	 */
	const negotiatedNote =
		request.status === "declined"
			? isExit
				? isAddonRequest
					? t.adminRequests.noteDeclinedExitAddon
					: t.adminRequests.noteDeclinedExitTier
				: isAddonRequest
					? t.adminRequests.noteDeclinedJoinAddon
					: t.adminRequests.noteDeclinedJoinTier
			: isExit
				? request.status === "resolved"
					? isAddonRequest
						? t.adminRequests.noteResolvedExitAddon
						: fill(t.adminRequests.noteResolvedExitTier, {
								plan: requestedPlan?.name ?? t.adminRequests.fallbackItsTier,
							})
					: isAddonRequest
						? fill(t.adminRequests.noteExitPendingAddon, {
								plan: requestedPlan?.name ?? t.adminRequests.fallbackItsPlan,
							})
						: fill(t.adminRequests.noteExitPendingTier, {
								plan: requestedPlan?.name ?? t.adminRequests.fallbackTierNamed,
							})
				: request.status === "resolved"
					? isAddonRequest
						? t.adminRequests.noteResolvedJoinAddon
						: t.adminRequests.noteResolvedJoinTier
					: isAddonRequest
						? t.adminRequests.notePendingJoinAddon
						: t.adminRequests.notePendingJoinTier;

	const remarksChanged = remarks.trim() !== (request.remarks ?? "").trim();
	const quoteChanged =
		editableQuote &&
		String(quote).trim() !== (request.quotedAmount ?? "").trim();

	async function persistRemarks() {
		if (!remarksChanged) return;
		await onSaveRemarks(
			request.id,
			remarks.trim() === "" ? null : remarks.trim(),
		);
	}

	async function persistQuote() {
		if (!editableQuote || !quoteChanged) return;
		const raw = String(quote).trim();
		if (raw === "") {
			await onSaveQuote(request.id, null);
			return;
		}
		const parsed = Number(raw);
		if (Number.isNaN(parsed) || parsed < 0) {
			toast.error(t.adminRequests.toastInvalidAmount);
			throw new Error("invalid quote");
		}
		await onSaveQuote(request.id, parsed);
	}

	async function handleSave() {
		try {
			await persistRemarks();
			await persistQuote();
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	async function handleContacted() {
		try {
			await persistRemarks();
			await onContacted(request.id);
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	/**
	 * Refuse the request. Remarks are saved first, because "why not" is the part
	 * the subscriber's next conversation turns on — losing it would leave a
	 * cancelled row with no reason on it.
	 */
	async function handleDecline() {
		try {
			await persistRemarks();
			await onDecline(request.id);
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	async function handleResolve() {
		// Resolve finalises the price. Entering or re-pricing a negotiation must
		// carry a figure — Custom has no list price to fall back on. LEAVING one
		// needs none: the subscriber lands on the ordinary tier it named, and that
		// tier's own price is what gets stamped.
		let amount: number | undefined;
		if (negotiable) {
			if (rawQuote !== "") {
				if (Number.isNaN(parsedQuote) || parsedQuote < 0) {
					toast.error(t.adminRequests.toastInvalidAmount);
					return;
				}
				amount = parsedQuote;
			} else if (isExit) {
				amount = requestedPlan?.price ? Number(requestedPlan.price) : undefined;
			} else if (request.type === "custom_renegotiation") {
				toast.error(t.adminRequests.toastSetCustomPrice);
				return;
			} else if (plan && plan.name !== "Custom" && plan.price) {
				amount = Number(plan.price);
			}
		}
		try {
			await persistRemarks();
			await onResolve(request.id, amount);
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SheetHeader>
				<SheetTitle>{t.adminRequests.editRequest}</SheetTitle>
				<SheetDescription>{t.adminRequests.editRequestHint}</SheetDescription>
			</SheetHeader>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
				{/* Immutable record of the originating Outlet/Agency action. */}
				<dl className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4 text-base">
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">{t.adminRequests.colWho}</dt>
						<dd className="text-right font-medium">{request.subscriberName}</dd>
					</div>
					{request.contactName && (
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">
								{t.adminRequests.colContact}
							</dt>
							<dd className="text-right">{request.contactName}</dd>
						</div>
					)}
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">{t.adminRequests.colRole}</dt>
						<dd className="text-right">
							{request.subscriberType
								? roleLabels[request.subscriberType](t)
								: "—"}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">{t.admin.colType}</dt>
						<dd className="text-right">{requestTypeLabels[request.type](t)}</dd>
					</div>
					{/*
						On an exit these two rows ARE the decision — what stops, and
						what the subscriber lands on — but they sat in the same grey as
						Role and Type, so the price that is about to end read as one
						more record field. Coloured as a pair: red ends, green begins.
						Left plain everywhere else, because on an ordinary request they
						are just the two sides of a switch and nothing is being lost.
					*/}
					<div
						className={`flex items-center justify-between gap-2${
							isExit ? " rounded-md bg-red-500/5 px-2 py-1" : ""
						}`}
					>
						<dt
							className={isExit ? "text-red-500/90" : "text-muted-foreground"}
						>
							{isExit
								? fill(t.adminRequests.arrangementEnds, {
										name: arrangementName ?? "",
									})
								: isAddonRequest
									? t.adminRequests.planStays
									: t.adminRequests.colFromPlan}
						</dt>
						<dd
							className={`text-right${isExit ? " font-semibold text-red-500" : ""}`}
						>
							{/*
								AN ADD-ON SITS ON TOP OF A PLAN, so "Plan (stays)" has to name
								the plan. `fromPlanLabel` returns "—" for a first-time POS
								request and is right to: nothing is being moved away FROM. But
								under a label promising the plan it read as though the venue had
								none, and the admin's whole question here is what the add-on is
								being billed on top of.

								`livePlanName` is what the org is on TODAY, resolved server-side
								beside the row's own stamp. The price rides along deliberately —
								the card below shows the plan's figure as the POS estimate, and
								naming it here is what stops the two being read as one price.
							*/}
							{isExit && fromPlan === "—"
								? arrangementName
								: isAddonRequest && fromPlan === "—" && request.livePlanName
									? `${request.livePlanName}${
											request.livePlanAmount
												? ` · RM ${formatPrice(request.livePlanAmount)}`
												: ""
										}`
									: fromPlan}
						</dd>
					</div>
					{/*
						Green means something BEGINS, so it belongs only to the agency
						exit, where the tier genuinely changes hands ("Tier (returns
						to) · Starter"). The venue's POS exit says "Plan (continues)" —
						the plan is untouched and carries on exactly as before. Marking
						that green announced a change on the one row whose whole point
						is that nothing happens to it.
					*/}
					<div
						className={`flex items-center justify-between gap-2${
							exitLandsSomewhere ? " rounded-md bg-emerald-500/5 px-2 py-1" : ""
						}`}
					>
						<dt
							className={
								exitLandsSomewhere
									? "text-emerald-500/90"
									: "text-muted-foreground"
							}
						>
							{isExit
								? isAddonRequest
									? t.adminRequests.planContinues
									: t.adminRequests.tierReturnsTo
								: isAddonRequest
									? t.adminRequests.addOn
									: isNegotiatedRequest
										? t.adminRequests.tier
										: t.adminRequests.colToPlan}
						</dt>
						<dd
							className={`text-right${
								exitLandsSomewhere ? " font-semibold text-emerald-500" : ""
							}`}
						>
							{toPlan}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">
							{t.adminRequests.colRequestedAt}
						</dt>
						<dd className="text-right">{formatDate(request.createdAt)}</dd>
					</div>
				</dl>

				{/*
				 * A negotiated request stands on its own: the arrangement being bought,
				 * re-priced or dropped, with the price it replaces beside it. The POS
				 * add-on has no before/after plan at all — the venue's plan is untouched
				 * throughout, and showing one read as "Scale → Integrate with POS", a
				 * swap that never happens. Custom does replace the agency's tier price,
				 * so only the wording differs; the shape is the same, which is the point.
				 */}
				{isNegotiatedRequest ? (
					<div className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
						<div className="rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
							<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
								{isExit
									? isAddonRequest
										? t.adminRequests.addonCancelling
										: t.adminRequests.tierResetting
									: isAddonRequest
										? t.adminRequests.addonBilledOnTop
										: t.adminRequests.tierReplacesPrice}
							</p>
							<p className="text-lg font-medium">{arrangementName}</p>
							<p className="text-base text-muted-foreground">
								{isExit ? t.adminRequests.chargeStopsOnResolve : estimateLabel}
							</p>
							{request.previousNegotiatedAmount && (
								<p className="text-base text-muted-foreground">
									{fill(
										isExit
											? t.adminRequests.previousPriceEnds
											: t.adminRequests.previousPriceRenegotiating,
										{ price: formatPrice(request.previousNegotiatedAmount) },
									)}
								</p>
							)}
						</div>
						<p className="text-base text-muted-foreground">{negotiatedNote}</p>
					</div>
				) : (
					<div className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
						<div className="flex items-center gap-2">
							<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
								<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
									{t.adminRequests.beforeFromPlan}
								</p>
								<p className="text-lg font-medium">{fromPlan}</p>
								<p className="text-base text-muted-foreground">
									{plan
										? plan.name === "Custom"
											? t.adminRequests.negotiated
											: `RM ${formatPrice(plan.price)}`
										: "—"}
								</p>
							</div>
							<ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
							<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
								<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
									{t.adminRequests.afterToPlan}
								</p>
								<p className="text-lg font-medium">{toPlan}</p>
								<p className="text-base text-muted-foreground">
									{estimateLabel}
								</p>
							</div>
						</div>
						<p className="text-base text-muted-foreground">
							{t.adminRequests.noPriceHint}
						</p>
					</div>
				)}

				<div className="space-y-1.5">
					<Label htmlFor="request-remarks">{t.adminRequests.colRemarks}</Label>
					<Textarea
						id="request-remarks"
						rows={3}
						placeholder={t.adminRequests.addRemarks}
						value={remarks}
						onChange={(e) => setRemarks(e.target.value)}
					/>
				</div>

				{/*
					A price with no fallback is the one field on this sheet that
					CANNOT be left alone, yet it looked exactly like Remarks — a
					plain input under a plain label, its "0.00" placeholder reading
					as a filled-in zero. Resolve sat two inches below, enabled.
					While it is unset the field is framed and labelled as owed; once
					a real number is in, the frame drops and the line below states
					what that number is about to become.
				*/}
				<div
					className={
						quoteMissing
							? "space-y-1.5 rounded-lg border border-amber-500/60 bg-amber-500/5 p-3 ring-1 ring-amber-500/25"
							: "space-y-1.5"
					}
				>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<Label
							htmlFor="request-quote"
							className={
								quoteMissing ? "flex items-center gap-1.5 text-amber-500" : ""
							}
						>
							{quoteMissing && <AlertCircle className="size-4 shrink-0" />}
							{t.adminRequests.colQuoted}
						</Label>
						{quoteMissing && (
							<span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-500">
								{t.adminRequests.neededToResolve}
							</span>
						)}
					</div>
					{editableQuote ? (
						<>
							{/* The RM sits INSIDE the field: the label says "(RM)" but
								the value is what the eye lands on, and a bare 1200
								reads as a quantity rather than money. The placeholder is
								dimmed hard — at normal muted weight "0.00" reads as a
								price already entered, which is the whole misreading. */}
							<div className="relative">
								<span
									className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold ${
										quoteMissing ? "text-amber-500/80" : "text-muted-foreground"
									}`}
								>
									RM
								</span>
								<Input
									id="request-quote"
									type="number"
									min={0}
									step="0.01"
									inputMode="decimal"
									placeholder="0.00"
									value={quote}
									onChange={(e) => setQuote(e.target.value)}
									className={`h-12 pl-11 text-xl font-semibold tabular-nums placeholder:font-normal placeholder:text-muted-foreground/35${
										quoteMissing
											? " border-amber-500/70 bg-amber-500/[0.03] focus-visible:ring-amber-500"
											: ""
									}`}
								/>
							</div>
							{quoteMissing ? (
								<>
									{/* One short sentence carries the consequence. The
										earlier three-line amber paragraph was the kind of
										warning people learn to scroll past. */}
									<p className="text-sm font-medium text-amber-500">
										{t.adminRequests.quoteMissingWarn}
									</p>
									{/* An anchor to price AGAINST. Custom replaces the tier
										price, so the tier it replaces is the one number the
										admin would otherwise go hunting for. */}
									{quoteAnchor && (
										<p className="text-xs text-muted-foreground">
											{fill(t.adminRequests.quoteAnchor, {
												plan: quoteAnchor.name,
												price: formatPrice(quoteAnchor.price),
												cycle: billingCycleLabel(quoteAnchor.billingCycle, t),
											})}
										</p>
									)}
								</>
							) : (
								<>
									{/*
										A RESET is not a quote. The agency is going back to the
										rate card, so the tier they land on already has a price
										and this field has nothing to set. Saying so beats an
										empty box that looks like unfinished work.
									*/}
									<p className="text-sm text-muted-foreground">
										{isExit
											? t.adminRequests.noQuoteNeeded
											: t.adminRequests.estimateHint}
										{!isExit && request.type === "pos_integration_quote" && plan
											? ` ${fill(t.adminRequests.leaveEmptyUsesPlanPrice, {
													price: formatPrice(plan.price),
												})}`
											: ""}
									</p>
									{/*
											⚠️ NOT ON AN EXIT. This rendered whenever a figure was
											typed, with no `isExit` guard — so on a CANCELLATION it
											appeared directly beneath "No quote needed", in green
											with a tick, contradicting the sentence above it and
											promising that a number the server never reads was about
											to become the price.

											It cannot become anything: `applyResolvedPriceToLedger`
											runs the removal branch first and returns, so a POS
											request naming a plan ends the add-on whatever sits in
											this box.
										*/}
										{quoteGiven && !isExit && (
										<p className="flex items-center gap-1.5 text-sm font-medium text-emerald-500">
											<CheckCircle2 className="size-4 shrink-0" />
											<span>
												{fill(t.adminRequests.quoteBecomesTierPrice, {
													price: formatPrice(parsedQuote),
												})}
											</span>
										</p>
									)}
								</>
							)}
						</>
					) : negotiable ? (
						<>
							<Input
								id="request-quote"
								readOnly
								className="bg-muted/40 text-base"
								value={
									request.quotedAmount
										? formatPrice(request.quotedAmount)
										: plan && plan.name !== "Custom"
											? formatPrice(plan.price)
											: "—"
								}
							/>
							<p className="text-sm text-muted-foreground">
								{t.adminRequests.resolvedPriceFinal}
							</p>
						</>
					) : request.quotedAmount ? (
						<Input
							id="request-quote"
							readOnly
							className="bg-muted/40"
							value={formatPrice(request.quotedAmount)}
						/>
					) : (
						<Input
							id="request-quote"
							readOnly
							className="bg-muted/40"
							value="—"
						/>
					)}
				</div>

				<div className="space-y-2 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
					<div className="flex items-center justify-between gap-2 text-base">
						<span className="text-muted-foreground">{t.admin.colStatus}</span>
						<Badge
							variant="outline"
							className={`${statusBadgeColors[request.status]} w-fit`}
						>
							{requestStatusLabels[request.status](t)}
						</Badge>
					</div>
					{request.status !== "resolved" && request.status !== "declined" && (
						<div className="flex flex-wrap gap-2 pt-1">
							{request.status === "pending" && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={isSaving}
									onClick={handleContacted}
								>
									<MailCheck className="mr-1 h-4 w-4" />
									{t.adminRequests.markContacted}
								</Button>
							)}
							{/*
							 * A request needs both answers. Cancelling leaves the ledger
							 * exactly as it is — the venue keeps its add-on, the agency keeps
							 * Custom at the agreed price — and releases the subscriber's own
							 * screen from "waiting for admin". A 'direct' row is refused by
							 * the server: it was applied when it was filed, so there is
							 * nothing left to call off.
							 */}
							{request.status !== "direct" && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
									disabled={isSaving}
									onClick={handleDecline}
								>
									<XCircle className="mr-1 h-4 w-4" />
									{t.adminRequests.cancelRequest}
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								disabled={isSaving}
								onClick={handleResolve}
							>
								<CheckCircle2 className="mr-1 h-4 w-4" />
								{t.adminRequests.resolve}
							</Button>
						</div>
					)}
				</div>
			</div>

			<SheetFooter className="flex-row justify-end gap-2">
				<SheetClose asChild>
					<Button type="button" variant="outline">
						{t.common.cancel}
					</Button>
				</SheetClose>
				<Button
					type="button"
					disabled={isSaving || (!remarksChanged && !quoteChanged)}
					onClick={handleSave}
				>
					{isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
					{t.adminRequests.saveChanges}
				</Button>
			</SheetFooter>
		</div>
	);
}
