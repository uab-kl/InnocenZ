import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowRight,
	ArrowRightLeft,
	CheckCircle2,
	Loader2,
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
	type AdminRequestsQueryParams,
	approvePlanChange,
	declineRequest,
	fetchAdminRequests,
	type SubscriberType,
	updateAdminRequest,
} from "@/services/admin-request";
import type { Subscription } from "@/services/subscription";
import { fetchSubscriptions } from "@/services/subscription";

export const Route = createFileRoute("/admin/service/plan-changes")({
	component: PlanChangesPage,
	head: () => ({
		meta: [{ title: "Plan Change — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

// Plan-change lifecycle:
//   • agency  → switched automatically by PR count, logged as 'direct'
//   • outlet  → 'pending' until the admin approves or declines
type PlanChangeStatus = "direct" | "pending" | "approved" | "declined";
type StatusFilter = "all" | PlanChangeStatus;
type RoleFilter = "all" | SubscriberType;

// The record KEY is the stored/derived status and never changes; only the label
// it renders is looked up, so the map holds resolvers rather than strings.
const statusLabels: Record<
	PlanChangeStatus,
	(t: PortalTranslations) => string
> = {
	direct: (t) => t.adminRequests.statusDirect,
	pending: (t) => t.admin.statusPending,
	approved: (t) => t.adminRequests.statusApproved,
	declined: (t) => t.adminRequests.statusDeclined,
};

const statusBadgeColors: Record<PlanChangeStatus, string> = {
	direct: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
	pending:
		"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	approved:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	declined: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

const roleBadgeColors: Record<SubscriberType, string> = {
	outlet: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	agency: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
};

const roleLabels: Record<SubscriberType, (t: PortalTranslations) => string> = {
	outlet: (t) => t.adminRequests.roleOutlet,
	agency: (t) => t.adminRequests.roleAgency,
};

/**
 * Display status for a plan-change row. Agency switches are always Direct
 * (auto-applied); legacy 'resolved' outlet rows read as Approved.
 */
function planChangeStatus(request: AdminRequest): PlanChangeStatus {
	if (request.subscriberType === "agency") return "direct";
	if (request.status === "resolved" || request.status === "approved") {
		return "approved";
	}
	if (request.status === "declined") return "declined";
	return "pending";
}

/**
 * Outlet plans and agency plans are separate tiers (they can share names like
 * "Enterprise" at different prices), so a row only matches plans linked to
 * its own role.
 */
function planMatchesRole(
	plan: Subscription | undefined,
	subscriberType: SubscriberType | null,
): boolean {
	if (!plan) return false;
	if (!subscriberType || !plan.subscriptionType) return true;
	return plan.subscriptionType === subscriberType;
}

function fromPlanOf(
	request: AdminRequest,
	planById: Map<string, Subscription>,
): Subscription | undefined {
	const plan = request.currentPlanId
		? planById.get(request.currentPlanId)
		: undefined;
	return planMatchesRole(plan, request.subscriberType) ? plan : undefined;
}

function toPlanOf(
	request: AdminRequest,
	planById: Map<string, Subscription>,
): Subscription | undefined {
	const plan = request.requestedPlanId
		? planById.get(request.requestedPlanId)
		: undefined;
	return planMatchesRole(plan, request.subscriberType) ? plan : undefined;
}

/**
 * What the subscriber is moving TO, in words.
 *
 * A plan switch names a plan. A negotiated move does not always: joining the
 * POS add-on or entering Custom has no requested plan row, and LEAVING one
 * names the ordinary plan being returned to. Without this such rows rendered
 * "—" and the page could not show a move to or from POS/Custom at all.
 *
 * Every branch returns a NAME — the plan's own, the add-on's, or the tier's —
 * and plan names stay English in every locale by the owner's decision, so
 * nothing here is translated.
 */
function toLabelOf(
	request: AdminRequest,
	requested: Subscription | undefined,
): string {
	if (requested && requested.kind !== "addon") return requested.name;
	if (request.type === "pos_integration_quote") return "Integrate with POS";
	if (request.type === "custom_renegotiation") return "Custom";
	return "—";
}

/**
 * Agency Custom (151+ PV) is the only negotiated tier on this page — its price
 * is the quoted amount, never the plan-table price. Everything else follows
 * the Plan page exactly.
 */
function isNegotiatedCustom(
	request: AdminRequest,
	plan: Subscription | undefined,
): boolean {
	return request.subscriberType === "agency" && plan?.name === "Custom";
}

/** Plan-table price label; agency Custom shows the negotiated amount instead. */
function planPriceLabel(
	request: AdminRequest,
	plan: Subscription | undefined,
	negotiatedAmount: string | null,
	t: PortalTranslations,
): string {
	if (!plan) return "—";
	if (isNegotiatedCustom(request, plan)) {
		return negotiatedAmount
			? `RM ${formatPrice(negotiatedAmount)}`
			: t.adminRequests.negotiated;
	}
	return `RM ${formatPrice(plan.price)}`;
}

/**
 * Price shown for the row — always the Plan page price of the plan the
 * subscriber is on: from-plan while an outlet switch is pending/declined,
 * to-plan once direct/approved. The only exception is the negotiated agency
 * Custom tier, which uses the quoted amount.
 */
function priceOf(
	request: AdminRequest,
	planById: Map<string, Subscription>,
	t: PortalTranslations,
): { amount: string | null; note: string | null } {
	const status = planChangeStatus(request);
	if (status === "direct" || status === "approved") {
		const toPlan = toPlanOf(request, planById);
		if (isNegotiatedCustom(request, toPlan)) {
			return request.quotedAmount
				? {
						amount: request.quotedAmount,
						note: t.adminRequests.priceNoteNegotiatedCustom,
					}
				: { amount: null, note: t.adminRequests.negotiated };
		}
		const amount = toPlan?.price ?? null;
		return { amount, note: amount != null ? t.adminRequests.colToPlan : null };
	}
	const fromPrice = fromPlanOf(request, planById)?.price ?? null;
	return {
		amount: fromPrice,
		note:
			fromPrice == null
				? null
				: status === "declined"
					? t.adminRequests.priceNoteFromPlanStays
					: t.adminRequests.priceNoteFromPlanUntilApproved,
	};
}

function PlanChangesPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
	const [switchedDates, setSwitchedDates] = useState<Date[]>([]);
	const [page, setPage] = useState(1);
	const [editRequest, setEditRequest] = useState<AdminRequest | null>(null);
	/**
	 * Latest = one row per subscriber, what still needs answering. All = every
	 * switch ever filed, so a venue that has moved plan several times can be
	 * traced rather than appearing once.
	 */
	/**
	 * Defaults to the FULL record: every switch each outlet and agency has ever
	 * filed, so a subscriber appears once per change rather than once in total —
	 * that trail is what the page is for. "Latest only" narrows it to the one
	 * row per subscriber that still needs answering.
	 */
	const [view, setView] = useState<"latest" | "all">("all");
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

	// Only plan-change activity is listed here.
	const queryParams: AdminRequestsQueryParams = {
		page,
		pageSize: PAGE_SIZE,
		type: "plan_change",
		// Latest view: a venue that tapped Switch three times is one decision to
		// make, not three, and approving a stale request would apply a plan it has
		// since moved off. Older rows are never deleted — the All view shows them.
		latestPerSubscriber: view === "latest",
		// Ordinary plan-to-plan switches only. Anything touching the POS add-on
		// or the Custom tier carries a negotiated price and belongs on Plan
		// Request, so it is excluded here rather than shown in both places.
		negotiated: "exclude",
	};
	if (search) queryParams.search = search;
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (roleFilter !== "all") queryParams.subscriberType = roleFilter;
	const switchedDatesParam = datesToQueryParam(switchedDates);
	if (switchedDatesParam) queryParams.dates = switchedDatesParam;

	const requestsQuery = useQuery({
		queryKey: ["admin-requests", "plan-changes", queryParams],
		queryFn: () => fetchAdminRequests(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	// Resolve plan ids -> plan (name + price) for the from/to tiers.
	const plansQuery = useQuery({
		queryKey: ["subscriptions", "plan-name-lookup"],
		queryFn: () => fetchSubscriptions({ pageSize: 100 }, logout),
		staleTime: 60_000,
	});

	const planById = new Map(
		(plansQuery.data?.data ?? []).map((plan) => [plan.id, plan]),
	);

	const approveMutation = useMutation({
		mutationFn: ({
			id,
			quotedAmount,
		}: {
			id: string;
			quotedAmount: number | undefined;
		}) => approvePlanChange(id, quotedAmount, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(
				response.message || t.adminRequests.toastPlanChangeApproved,
			);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastPlanChangeApproveFailed)
					?.message ?? t.adminRequests.toastPlanChangeApproveFailed,
			);
		},
	});

	const declineMutation = useMutation({
		mutationFn: (id: string) => declineRequest(id, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(
				response.message || t.adminRequests.toastPlanChangeDeclined,
			);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastPlanChangeDeclineFailed)
					?.message ?? t.adminRequests.toastPlanChangeDeclineFailed,
			);
		},
	});

	const remarksMutation = useMutation({
		mutationFn: ({ id, remarks }: { id: string; remarks: string | null }) =>
			updateAdminRequest(id, { remarks }, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-requests"] });
			toast.success(response.message || t.adminRequests.toastRemarksUpdated);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminRequests.toastRemarksUpdateFailed)
					?.message ?? t.adminRequests.toastRemarksUpdateFailed,
			);
		},
	});

	const records = requestsQuery.data?.data ?? [];
	const pagination = requestsQuery.data?.pagination;
	const showLoading = requestsQuery.isLoading && records.length === 0;
	const isSaving =
		approveMutation.isPending ||
		declineMutation.isPending ||
		remarksMutation.isPending;

	return (
		<PageShell>
			<PageHeader
				icon={ArrowRightLeft}
				title={t.admin.navPlanChange}
				description={t.adminRequests.planChangeDescription}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminRequests.activityTitle}
								{requestsQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{view === "latest"
									? t.adminRequests.activityHintLatest
									: t.adminRequests.activityHintAll}{" "}
								{/* The link now CLOSES the sentence, so the copy before it is one whole key rather than fragments glued either side of the anchor. */}
								{t.adminRequests.billedRecordHint}{" "}
								<Link
									to="/admin/business/history"
									className="text-lavender underline underline-offset-2"
								>
									{t.adminRequests.currentPlanFullHistoryLink}
								</Link>
							</CardDescription>
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

							{/* Latest = what still needs answering; All = every switch a
							    subscriber has ever filed, so its history can be traced. */}
							<Select
								value={view}
								onValueChange={(value) => {
									setView(value as "latest" | "all");
									setPage(1);
								}}
							>
								<SelectTrigger className="sm:w-40">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{/* Values drive the query; only the labels move. */}
									<SelectItem value="latest">
										{t.adminRequests.viewLatestOnly}
									</SelectItem>
									<SelectItem value="all">
										{t.adminRequests.viewFullHistory}
									</SelectItem>
								</SelectContent>
							</Select>

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
									<SelectItem value="direct">
										{t.adminRequests.statusDirect}
									</SelectItem>
									<SelectItem value="pending">
										{t.admin.statusPending}
									</SelectItem>
									<SelectItem value="approved">
										{t.adminRequests.statusApproved}
									</SelectItem>
									<SelectItem value="declined">
										{t.adminRequests.statusDeclined}
									</SelectItem>
								</SelectContent>
							</Select>

							<DateMultiFilter
								selectedDates={switchedDates}
								onChange={(dates) => {
									setSwitchedDates(dates);
									setPage(1);
								}}
								ariaLabel={t.adminRequests.filterBySwitchedDate}
								emptyLabel={t.adminRequests.switchedDate}
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
									<TableHead>{t.adminRequests.colFromPlan}</TableHead>
									<TableHead>{t.adminRequests.colToPlan}</TableHead>
									<TableHead>{t.adminRequests.colPrice}</TableHead>
									<TableHead className="w-[110px]">
										{t.admin.colStatus}
									</TableHead>
									<TableHead className="w-[170px]">
										{t.adminRequests.colSwitchedAt}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>{t.adminRequests.loadingPlanChanges}</span>
											</div>
										</TableCell>
									</TableRow>
								) : requestsQuery.isError ? (
									<TableRow>
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													{t.adminRequests.failedToLoadPlanChanges}
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
										<TableCell colSpan={7} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<ArrowRightLeft className="h-6 w-6" />
												<span>{t.adminRequests.noPlanChangesFound}</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									records.map((request) => {
										const status = planChangeStatus(request);
										const fromPlan = fromPlanOf(request, planById);
										const toPlan = toPlanOf(request, planById);
										const price = priceOf(request, planById, t);

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
												<TableCell className="text-base font-medium">
													{fromPlan?.name ?? "—"}
												</TableCell>
												<TableCell className="text-base font-medium">
													{toLabelOf(request, toPlan)}
													{status === "pending" && (
														<div className="text-sm text-muted-foreground">
															{t.adminRequests.requestedPill}
														</div>
													)}
												</TableCell>
												<TableCell className="text-base">
													{price.amount != null ? (
														<div className="flex flex-col leading-tight">
															<span>RM {formatPrice(price.amount)}</span>
															{price.note && (
																<span className="text-sm text-muted-foreground">
																	{price.note}
																</span>
															)}
														</div>
													) : price.note ? (
														<span className="text-base text-muted-foreground">
															{price.note}
														</span>
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={`${statusBadgeColors[status]} w-fit`}
													>
														{statusLabels[status](t)}
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
								{fill(t.adminRequests.showingPlanChanges, {
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
						<PlanChangeEditForm
							key={editRequest.id}
							request={editRequest}
							fromPlan={fromPlanOf(editRequest, planById)}
							toPlan={toPlanOf(editRequest, planById)}
							isSaving={isSaving}
							onSaveRemarks={(id, remarks) =>
								remarksMutation.mutateAsync({ id, remarks })
							}
							onApprove={(id, quotedAmount) =>
								approveMutation.mutateAsync({ id, quotedAmount })
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

interface PlanChangeEditFormProps {
	request: AdminRequest;
	fromPlan: Subscription | undefined;
	toPlan: Subscription | undefined;
	isSaving: boolean;
	onSaveRemarks: (id: string, remarks: string | null) => Promise<unknown>;
	onApprove: (id: string, quotedAmount: number | undefined) => Promise<unknown>;
	onDecline: (id: string) => Promise<unknown>;
	onDone: () => void;
}

function PlanChangeEditForm({
	request,
	fromPlan,
	toPlan,
	isSaving,
	onSaveRemarks,
	onApprove,
	onDecline,
	onDone,
}: PlanChangeEditFormProps) {
	const { t } = usePortalLocale();
	const status = planChangeStatus(request);
	const needsApproval = status === "pending";
	const [remarks, setRemarks] = useState(request.remarks ?? "");

	const remarksChanged = remarks.trim() !== (request.remarks ?? "").trim();

	async function persistRemarks() {
		if (!remarksChanged) return;
		await onSaveRemarks(
			request.id,
			remarks.trim() === "" ? null : remarks.trim(),
		);
	}

	async function handleSave() {
		try {
			await persistRemarks();
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	async function handleApprove() {
		// Approving stamps the to-plan price — the outlet pays it from now on.
		const parsed = toPlan ? Number(toPlan.price) : Number.NaN;
		const amount = Number.isNaN(parsed) ? undefined : parsed;
		try {
			await persistRemarks();
			await onApprove(request.id, amount);
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	async function handleDecline() {
		try {
			await persistRemarks();
			await onDecline(request.id);
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<SheetHeader>
				<SheetTitle>{t.admin.navPlanChange}</SheetTitle>
				<SheetDescription>
					{status === "direct"
						? t.adminRequests.sheetHintDirect
						: needsApproval
							? t.adminRequests.sheetHintPending
							: t.adminRequests.sheetHintActioned}
				</SheetDescription>
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
						<dt className="text-muted-foreground">
							{t.adminRequests.colSwitchedAt}
						</dt>
						<dd className="text-right">{formatDate(request.createdAt)}</dd>
					</div>
				</dl>

				{/* Before/after reminder — from-plan price rides until approve, then to-plan. */}
				<div className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
					<div className="flex items-center gap-2">
						<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
							<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
								{t.adminRequests.beforeFromPlan}
							</p>
							<p className="text-lg font-medium">{fromPlan?.name ?? "—"}</p>
							<p className="text-base text-muted-foreground">
								{planPriceLabel(request, fromPlan, null, t)}
							</p>
						</div>
						<ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
						<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
							<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
								{t.adminRequests.afterToPlan}
							</p>
							<p className="text-lg font-medium">
								{toLabelOf(request, toPlan)}
							</p>
							<p className="text-base text-muted-foreground">
								{planPriceLabel(request, toPlan, request.quotedAmount, t)}
							</p>
						</div>
					</div>
					<p className="text-base text-muted-foreground">
						{status === "direct"
							? t.adminRequests.noteDirect
							: needsApproval
								? t.adminRequests.notePendingApproval
								: status === "approved"
									? t.adminRequests.noteApproved
									: t.adminRequests.noteDeclinedPlanChange}
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="plan-change-remarks">
						{t.adminRequests.colRemarks}
					</Label>
					<Textarea
						id="plan-change-remarks"
						rows={3}
						placeholder={t.adminRequests.addRemarks}
						value={remarks}
						onChange={(e) => setRemarks(e.target.value)}
					/>
				</div>

				<div className="space-y-2 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
					<div className="flex items-center justify-between gap-2 text-base">
						<span className="text-muted-foreground">{t.admin.colStatus}</span>
						<Badge
							variant="outline"
							className={`${statusBadgeColors[status]} w-fit`}
						>
							{statusLabels[status](t)}
						</Badge>
					</div>
					{/*
					 * WHAT THE ORG IS ON TODAY, beside the switch this row records.
					 *
					 * This page shows one row per subscriber and presents it as the
					 * latest — but any later move that touches Custom files as a
					 * `custom_renegotiation` and lands on Plan REQUEST instead, so the
					 * newest row HERE can be weeks stale with nothing saying so. Atlas
					 * read "Growth → Enterprise, 17 Jul" as its current position while
					 * the ledger said Starter at RM 125, and that switch had never
					 * reached the ledger at all.
					 *
					 * The before/after above stays exactly as written — it is the record
					 * of a decision, not a claim about the present. This line is the
					 * present, and the amber note is what makes a stale or
					 * never-applied row impossible to read as current.
					 */}
					{request.livePlanName && (
						<div className="space-y-1 border-t border-(--lavender-soft)/20 pt-2">
							<div className="flex items-center justify-between gap-2 text-base">
								<span className="text-muted-foreground">
									{t.adminRequests.currentlyOn}
								</span>
								<span className="font-medium">
									{request.livePlanName}
									{request.livePlanAmount
										? ` · RM ${formatPrice(request.livePlanAmount)}`
										: ""}
								</span>
							</div>
							{toPlan?.name && request.livePlanName !== toPlan.name && (
								<p className="text-sm text-amber-300/90">
									{t.adminRequests.livePlanDiffers}
								</p>
							)}
						</div>
					)}
					{needsApproval && (
						<div className="flex flex-wrap gap-2 pt-1">
							<Button
								type="button"
								size="sm"
								disabled={isSaving}
								onClick={handleApprove}
							>
								<CheckCircle2 className="mr-1 h-4 w-4" />
								{t.common.approve}
							</Button>
							<Button
								type="button"
								variant="outline"
								size="sm"
								disabled={isSaving}
								onClick={handleDecline}
							>
								<XCircle className="mr-1 h-4 w-4" />
								{t.common.decline}
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
					disabled={isSaving || !remarksChanged}
					onClick={handleSave}
				>
					{isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
					{t.adminRequests.saveChanges}
				</Button>
			</SheetFooter>
		</div>
	);
}
