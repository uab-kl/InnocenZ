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
} from "lucide-react";
import { useState } from "react";
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

// This inbox holds exactly two request kinds:
//  • outlet  → "Integrate with POS" add-on quote ("Request admin quote")
//  • agency  → Custom (151+ PV) tier "Renegotiate Price"
const INBOX_TYPES: AdminRequestType[] = [
	"pos_integration_quote",
	"custom_renegotiation",
];

const requestTypeLabels: Record<AdminRequestType, string> = {
	pos_integration_quote: "POS quote",
	custom_renegotiation: "Custom",
	plan_change: "Plan change",
	contact: "Contact",
	other: "Other",
};

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

const roleLabels: Record<SubscriberType, string> = {
	outlet: "Outlet",
	agency: "Agency",
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

/** From plan = the tier the subscriber is on right now. */
function fromPlanLabel(
	request: AdminRequest,
	planById: Map<string, Subscription>,
): string {
	return planForRequest(request, planById)?.name ?? "—";
}

/** To plan = what the request is for: the POS add-on or the Custom tier. */
function toPlanLabel(request: AdminRequest): string {
	if (request.type === "pos_integration_quote") return "Integrate with POS";
	if (request.type === "custom_renegotiation") return "Custom";
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
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
	const [requestedDates, setRequestedDates] = useState<Date[]>([]);
	const [page, setPage] = useState(1);
	const [editRequest, setEditRequest] = useState<AdminRequest | null>(null);

	// Only the two inbox kinds are listed here — plan changes have their own
	// page, and contact/other requests are not part of this flow.
	const queryParams: AdminRequestsQueryParams = {
		page,
		pageSize: PAGE_SIZE,
		types: INBOX_TYPES,
	};
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
			toast.success(response.message || "Marked as contacted");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to mark as contacted")?.message ??
					"Failed to mark as contacted",
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
			toast.success(response.message || "Request resolved");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to resolve request")?.message ??
					"Failed to resolve request",
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
			toast.success(response.message || "Request updated");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to update request")?.message ??
					"Failed to update request",
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
		updateFieldsMutation.isPending;

	const summaryCards = [
		{
			key: "outlet",
			label: "Outlet quotes",
			total: summary?.byRole.outlet.total ?? 0,
			count: summary?.byRole.outlet.count ?? 0,
		},
		{
			key: "agency",
			label: "Agency quotes",
			total: summary?.byRole.agency.total ?? 0,
			count: summary?.byRole.agency.count ?? 0,
		},
		{
			key: "total",
			label: "Total negotiated",
			total: summary?.totals.total ?? 0,
			count: summary?.totals.count ?? 0,
		},
	];

	return (
		<PageShell>
			<PageHeader
				icon={Handshake}
				title="Plan Request"
				description="Two request kinds land here: outlets asking for an Integrate-with-POS quote, and agencies renegotiating the Custom (151+ PV) tier. Negotiate or change the estimate before Resolve — once resolved the price is final."
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
							{formatNumber(card.count)} resolved with a price
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								Requests
								{requestsQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								Click a row to open the editor — who asked, for which plan, and
								the price you settled on
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

							<Select
								value={statusFilter}
								onValueChange={(value) => {
									setStatusFilter(value as StatusFilter);
									setPage(1);
								}}
							>
								<SelectTrigger
									className="sm:w-36"
									aria-label="Filter by status"
								>
									<SelectValue placeholder="All Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Status</SelectItem>
									<SelectItem value="pending">Pending</SelectItem>
									<SelectItem value="contacted">Contacted</SelectItem>
									<SelectItem value="resolved">Resolved</SelectItem>
								</SelectContent>
							</Select>

							<DateMultiFilter
								selectedDates={requestedDates}
								onChange={(dates) => {
									setRequestedDates(dates);
									setPage(1);
								}}
								ariaLabel="Filter by requested date"
								emptyLabel="Requested date"
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Who</TableHead>
									<TableHead className="w-[100px]">Role</TableHead>
									<TableHead>Type</TableHead>
									<TableHead className="w-[220px]">Remarks</TableHead>
									<TableHead>From plan</TableHead>
									<TableHead>To plan</TableHead>
									<TableHead>Quoted (RM)</TableHead>
									<TableHead className="w-[110px]">Status</TableHead>
									<TableHead className="w-[170px]">Requested</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>Loading requests...</span>
											</div>
										</TableCell>
									</TableRow>
								) : requestsQuery.isError ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													Failed to load requests
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
													Try Again
												</Button>
											</div>
										</TableCell>
									</TableRow>
								) : records.length === 0 ? (
									<TableRow>
										<TableCell colSpan={9} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Handshake className="h-6 w-6" />
												<span>No requests found</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									records.map((request) => {
										const plan = planForRequest(request, planById);
										const fromPlan = fromPlanLabel(request, planById);
										const toPlan = toPlanLabel(request);
										const negotiable = isPriceNegotiable(request);

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
															{roleLabels[request.subscriberType]}
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
														{requestTypeLabels[request.type]}
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
															Requested
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
																	Estimate
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
																	From plan
																</span>
															</div>
														) : (
															<span className="text-base text-muted-foreground">
																{request.status === "resolved"
																	? "—"
																	: "Set before resolve"}
															</span>
														)
													) : (
														<span className="text-muted-foreground">—</span>
													)}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={`${statusBadgeColors[request.status]} w-fit capitalize`}
													>
														{request.status}
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
								Showing{" "}
								<span className="font-medium">
									{formatNumber((pagination.page - 1) * PAGE_SIZE + 1)}
								</span>{" "}
								-{" "}
								<span className="font-medium">
									{formatNumber(
										Math.min(
											pagination.page * PAGE_SIZE,
											pagination.totalCount,
										),
									)}
								</span>{" "}
								of{" "}
								<span className="font-medium">
									{formatNumber(pagination.totalCount)}
								</span>{" "}
								requests
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || requestsQuery.isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									Previous
								</Button>
								<span>
									Page {pagination.page} of {pagination.totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasNextPage || requestsQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									Next
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
				<SheetContent side="right" className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
					{editRequest && (
						<RequestEditForm
							key={editRequest.id}
							request={editRequest}
							fromPlan={fromPlanLabel(editRequest, planById)}
							toPlan={toPlanLabel(editRequest)}
							plan={planForRequest(editRequest, planById)}
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
	isSaving: boolean;
	onSaveRemarks: (id: string, remarks: string | null) => Promise<unknown>;
	onSaveQuote: (id: string, quotedAmount: number | null) => Promise<unknown>;
	onContacted: (id: string) => Promise<unknown>;
	onResolve: (id: string, quotedAmount: number | undefined) => Promise<unknown>;
	onDone: () => void;
}

function RequestEditForm({
	request,
	fromPlan,
	toPlan,
	plan,
	isSaving,
	onSaveRemarks,
	onSaveQuote,
	onContacted,
	onResolve,
	onDone,
}: RequestEditFormProps) {
	const negotiable = isPriceNegotiable(request);
	const editableQuote = canEditQuote(request);
	const [remarks, setRemarks] = useState(request.remarks ?? "");
	const [quote, setQuote] = useState(request.quotedAmount ?? "");

	// Estimated After price for the reminder: the live estimate wins, then the
	// saved quote, then the current plan's actual price (Custom stays negotiated).
	const rawQuote = String(quote).trim();
	const parsedQuote = Number(rawQuote);
	const estimateLabel =
		rawQuote !== "" && !Number.isNaN(parsedQuote) && parsedQuote >= 0
			? `RM ${formatPrice(parsedQuote)}`
			: request.quotedAmount
				? `RM ${formatPrice(request.quotedAmount)}`
				: request.type === "pos_integration_quote" && plan
					? `RM ${formatPrice(plan.price)}`
					: negotiable
					? "Set before resolve"
						: "—";

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
			toast.error("Enter a valid non-negative amount");
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

	async function handleResolve() {
		// Resolve finalises the price. Custom renegotiations must carry an
		// entered amount; POS quotes can default to the outlet's current tier.
		let amount: number | undefined;
		if (negotiable) {
			if (rawQuote !== "") {
				if (Number.isNaN(parsedQuote) || parsedQuote < 0) {
					toast.error("Enter a valid non-negative amount");
					return;
				}
				amount = parsedQuote;
			} else if (request.type === "custom_renegotiation") {
				toast.error("Set a Custom price before resolving");
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
				<SheetTitle>Edit request</SheetTitle>
				<SheetDescription>
					Annotate remarks, set the quote where negotiable, and move the request
					forward.
				</SheetDescription>
			</SheetHeader>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
				{/* Immutable record of the originating Outlet/Agency action. */}
				<dl className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4 text-base">
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">Who</dt>
						<dd className="text-right font-medium">{request.subscriberName}</dd>
					</div>
					{request.contactName && (
						<div className="flex items-center justify-between gap-2">
							<dt className="text-muted-foreground">Contact</dt>
							<dd className="text-right">{request.contactName}</dd>
						</div>
					)}
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">Role</dt>
						<dd className="text-right">
							{request.subscriberType
								? roleLabels[request.subscriberType]
								: "—"}
						</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">Type</dt>
						<dd className="text-right">{requestTypeLabels[request.type]}</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">From plan</dt>
						<dd className="text-right">{fromPlan}</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">To plan</dt>
						<dd className="text-right">{toPlan}</dd>
					</div>
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">Requested</dt>
						<dd className="text-right">{formatDate(request.createdAt)}</dd>
					</div>
				</dl>

				{/* Before/after price reminder — the estimate stays negotiable until Resolve. */}
				<div className="space-y-3 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4">
					<div className="flex items-center gap-2">
						<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
							<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
								Before · From plan
							</p>
							<p className="text-lg font-medium">{fromPlan}</p>
							<p className="text-base text-muted-foreground">
								{plan
									? plan.name === "Custom"
										? "Negotiated"
										: `RM ${formatPrice(plan.price)}`
									: "—"}
							</p>
						</div>
						<ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
						<div className="flex-1 rounded-md border border-(--lavender-soft)/25 bg-card px-4 py-4">
							<p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
								After · To plan
							</p>
							<p className="text-lg font-medium">{toPlan}</p>
							<p className="text-base text-muted-foreground">{estimateLabel}</p>
						</div>
					</div>
					<p className="text-base text-muted-foreground">
						{negotiable
							? request.status === "resolved"
								? "Resolved — the price is final."
								: "Reminder: the To-plan amount is an estimate — negotiate or change it before Resolve. Once resolved the price is final."
							: "This request type carries no price — only outlet POS quotes and agency Custom renegotiations are negotiable."}
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="request-remarks">Remarks</Label>
					<Textarea
						id="request-remarks"
						rows={3}
						placeholder="Add remarks…"
						value={remarks}
						onChange={(e) => setRemarks(e.target.value)}
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="request-quote">Quoted (RM)</Label>
					{editableQuote ? (
						<>
							<Input
								id="request-quote"
								type="number"
								min={0}
								step="0.01"
								inputMode="decimal"
								placeholder="0.00"
								value={quote}
								onChange={(e) => setQuote(e.target.value)}
							/>
							<p className="text-sm text-muted-foreground">
								Estimate — negotiate or change it before Resolve.
								{request.type === "pos_integration_quote" && plan
									? ` Leave empty to use the current plan price (RM ${formatPrice(plan.price)}) on Resolve.`
									: ""}
							</p>
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
								Resolved — the price is final.
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
						<span className="text-muted-foreground">Status</span>
						<Badge
							variant="outline"
							className={`${statusBadgeColors[request.status]} w-fit capitalize`}
						>
							{request.status}
						</Badge>
					</div>
					{request.status !== "resolved" && (
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
									Mark contacted
								</Button>
							)}
							<Button
								type="button"
								size="sm"
								disabled={isSaving}
								onClick={handleResolve}
							>
								<CheckCircle2 className="mr-1 h-4 w-4" />
								Resolve
							</Button>
						</div>
					)}
				</div>
			</div>

			<SheetFooter className="flex-row justify-end gap-2">
				<SheetClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</SheetClose>
				<Button
					type="button"
					disabled={isSaving || (!remarksChanged && !quoteChanged)}
					onClick={handleSave}
				>
					{isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
					Save changes
				</Button>
			</SheetFooter>
		</div>
	);
}
