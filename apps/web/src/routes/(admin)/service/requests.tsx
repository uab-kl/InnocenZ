import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	Handshake,
	Loader2,
	MailCheck,
	RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { ResolveRequestDialog } from "@/components/service/resolve-request-dialog";
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
import { fetchSubscriptions } from "@/services/subscription";

export const Route = createFileRoute("/(admin)/service/requests")({
	component: RequestsPage,
	head: () => ({
		meta: [{ title: "Plan Request — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type StatusFilter = "all" | AdminRequestStatus;
type RoleFilter = "all" | SubscriberType;
type TypeFilter = "all" | AdminRequestType;

const requestTypeLabels: Record<AdminRequestType, string> = {
	pos_integration_quote: "POS quote",
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
};

function RequestsPage() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
	const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
	const [page, setPage] = useState(1);
	const [draftQuotes, setDraftQuotes] = useState<Record<string, string>>({});
	const [draftWho, setDraftWho] = useState<Record<string, string>>({});
	const [draftRemarks, setDraftRemarks] = useState<Record<string, string>>({});
	const [resolveTarget, setResolveTarget] = useState<AdminRequest | null>(null);
	const [editingId, setEditingId] = useState<string | null>(null);

	const queryParams: AdminRequestsQueryParams = { page, pageSize: PAGE_SIZE };
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (roleFilter !== "all") queryParams.subscriberType = roleFilter;
	if (typeFilter !== "all") queryParams.type = typeFilter;

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

	// Resolve currentPlanId -> plan name so each quote shows the plan it belongs to.
	const plansQuery = useQuery({
		queryKey: ["subscriptions", "plan-name-lookup"],
		queryFn: () => fetchSubscriptions({ pageSize: 100 }, logout),
		staleTime: 60_000,
	});

	const planNameById = new Map(
		(plansQuery.data?.data ?? []).map((plan) => [plan.id, plan.name]),
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
			setResolveTarget(null);
			toast.success(response.message || "Request resolved");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to resolve request")?.message ??
					"Failed to resolve request",
			);
		},
	});

	const updateFieldsMutation = useMutation({
		mutationFn: ({
			id,
			...input
		}: {
			id: string;
			subscriberName?: string;
			subscriberType?: SubscriberType | null;
			type?: AdminRequestType;
			remarks?: string | null;
		}) => updateAdminRequest(id, input, logout),
		onMutate: ({ id }) => setEditingId(id),
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
		onSettled: () => setEditingId(null),
	});

	const saveWho = (request: AdminRequest) => {
		const next = (draftWho[request.id] ?? request.subscriberName).trim();
		if (!next || next === request.subscriberName) return;
		updateFieldsMutation.mutate({ id: request.id, subscriberName: next });
	};

	const saveRemarks = (request: AdminRequest) => {
		const draft = draftRemarks[request.id];
		if (draft === undefined) return;
		const next = draft.trim();
		if (next === (request.remarks ?? "").trim()) return;
		updateFieldsMutation.mutate({
			id: request.id,
			remarks: next === "" ? null : next,
		});
	};

	const openResolveDialog = (request: AdminRequest) => {
		const draft = draftQuotes[request.id];
		setResolveTarget({
			...request,
			quotedAmount:
				draft !== undefined && draft !== ""
					? draft
					: (request.quotedAmount ?? null),
		});
	};

	const quoteValueFor = (request: AdminRequest) =>
		draftQuotes[request.id] ?? request.quotedAmount ?? "";

	const records = requestsQuery.data?.data ?? [];
	const pagination = requestsQuery.data?.pagination;
	const showLoading = requestsQuery.isLoading && records.length === 0;
	const summary = summaryQuery.data;

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
				description="When an Outlet or Agency clicks “negotiate price”, the request appears here. Edit the Quoted (RM) cell or open Resolve to set the settled price."
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
						<CardContent className="text-xs text-muted-foreground">
							{formatNumber(card.count)} resolved with a price
						</CardContent>
					</Card>
				))}
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								Requests
								{requestsQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								Who asked, for which plan, and the price you settled on
							</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
							<Select
								value={roleFilter}
								onValueChange={(value) => {
									setRoleFilter(value as RoleFilter);
									setPage(1);
								}}
							>
								<SelectTrigger className="sm:w-36" aria-label="Filter by role">
									<SelectValue placeholder="All Roles" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Roles</SelectItem>
									<SelectItem value="outlet">Outlet</SelectItem>
									<SelectItem value="agency">Agency</SelectItem>
								</SelectContent>
							</Select>

							<Select
								value={typeFilter}
								onValueChange={(value) => {
									setTypeFilter(value as TypeFilter);
									setPage(1);
								}}
							>
								<SelectTrigger className="sm:w-40" aria-label="Filter by type">
									<SelectValue placeholder="All Types" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Types</SelectItem>
									<SelectItem value="pos_integration_quote">
										POS quote
									</SelectItem>
									<SelectItem value="plan_change">Plan change</SelectItem>
									<SelectItem value="contact">Contact</SelectItem>
									<SelectItem value="other">Other</SelectItem>
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
									<TableHead>Current Plan</TableHead>
									<TableHead>Quoted (RM)</TableHead>
									<TableHead className="w-[110px]">Status</TableHead>
									<TableHead className="w-[170px]">Requested</TableHead>
									<TableHead className="w-[190px]" />
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
										const planName = request.currentPlanId
											? (planNameById.get(request.currentPlanId) ?? "—")
											: "—";
										const isMutating =
											(contactedMutation.isPending &&
												contactedMutation.variables === request.id) ||
											(resolveMutation.isPending &&
												resolveMutation.variables?.id === request.id) ||
											editingId === request.id;

										return (
											<TableRow key={request.id}>
												<TableCell>
													<Input
														className="h-8 min-w-[140px] font-medium"
														aria-label={`Who for request ${request.id}`}
														disabled={isMutating}
														value={
															draftWho[request.id] ?? request.subscriberName
														}
														onChange={(e) =>
															setDraftWho((prev) => ({
																...prev,
																[request.id]: e.target.value,
															}))
														}
														onBlur={() => saveWho(request)}
														onKeyDown={(e) => {
															if (e.key === "Enter") e.currentTarget.blur();
														}}
													/>
												</TableCell>
												<TableCell>
													<Select
														value={request.subscriberType ?? "outlet"}
														disabled={isMutating}
														onValueChange={(value) =>
															updateFieldsMutation.mutate({
																id: request.id,
																subscriberType: value as SubscriberType,
															})
														}
													>
														<SelectTrigger
															className="h-8 w-[110px]"
															aria-label={`Role for ${request.subscriberName}`}
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="outlet">Outlet</SelectItem>
															<SelectItem value="agency">Agency</SelectItem>
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Select
														value={request.type}
														disabled={isMutating}
														onValueChange={(value) =>
															updateFieldsMutation.mutate({
																id: request.id,
																type: value as AdminRequestType,
															})
														}
													>
														<SelectTrigger
															className="h-8 w-[130px]"
															aria-label={`Type for ${request.subscriberName}`}
														>
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															{(
																Object.keys(
																	requestTypeLabels,
																) as AdminRequestType[]
															).map((type) => (
																<SelectItem key={type} value={type}>
																	{requestTypeLabels[type]}
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</TableCell>
												<TableCell>
													<Input
														className="h-8 min-w-[200px]"
														placeholder="Add remarks…"
														aria-label={`Remarks for ${request.subscriberName}`}
														disabled={isMutating}
														value={
															draftRemarks[request.id] ?? request.remarks ?? ""
														}
														onChange={(e) =>
															setDraftRemarks((prev) => ({
																...prev,
																[request.id]: e.target.value,
															}))
														}
														onBlur={() => saveRemarks(request)}
														onKeyDown={(e) => {
															if (e.key === "Enter") e.currentTarget.blur();
														}}
													/>
												</TableCell>
												<TableCell>{planName}</TableCell>
												<TableCell>
													{request.status === "resolved" ? (
														request.quotedAmount ? (
															formatPrice(request.quotedAmount)
														) : (
															"—"
														)
													) : (
														<div className="flex items-center gap-1">
															<span className="text-xs text-muted-foreground">
																RM
															</span>
															<Input
																type="number"
																min={0}
																step="0.01"
																inputMode="decimal"
																className="h-8 w-[110px]"
																placeholder="0.00"
																aria-label={`Quoted amount for ${request.subscriberName}`}
																value={quoteValueFor(request)}
																onChange={(e) =>
																	setDraftQuotes((prev) => ({
																		...prev,
																		[request.id]: e.target.value,
																	}))
																}
															/>
														</div>
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
												<TableCell className="text-muted-foreground text-sm">
													{formatDate(request.createdAt)}
												</TableCell>
												<TableCell>
													{request.status !== "resolved" && (
														<div className="flex items-center justify-end gap-1">
															{request.status === "pending" && (
																<Button
																	variant="ghost"
																	size="sm"
																	disabled={isMutating}
																	onClick={() =>
																		contactedMutation.mutate(request.id)
																	}
																>
																	<MailCheck className="mr-1 h-4 w-4" />
																	Contacted
																</Button>
															)}
															<Button
																variant="outline"
																size="sm"
																disabled={isMutating}
																onClick={() => openResolveDialog(request)}
															>
																<CheckCircle2 className="mr-1 h-4 w-4" />
																Set quote
															</Button>
														</div>
													)}
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
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

			<ResolveRequestDialog
				open={resolveTarget !== null}
				request={resolveTarget}
				planName={
					resolveTarget?.currentPlanId
						? (planNameById.get(resolveTarget.currentPlanId) ?? "—")
						: "—"
				}
				isSubmitting={resolveMutation.isPending}
				onOpenChange={(open) => {
					if (!open) setResolveTarget(null);
				}}
				onConfirm={(quotedAmount) => {
					if (!resolveTarget) return;
					resolveMutation.mutate({
						id: resolveTarget.id,
						quotedAmount,
					});
				}}
			/>
		</PageShell>
	);
}
