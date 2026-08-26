import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format } from "date-fns";
import {
	AlertCircle,
	ArrowDown,
	ArrowUp,
	CheckCircle2,
	LayoutGrid,
	Loader2,
	Pencil,
	RefreshCw,
	XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	DateMultiFilter,
	DateSingleFilter,
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
	adminApproveJob,
	adminDeclineJob,
	fetchAdminPendingJobs,
	fetchSpecialServiceSummary,
	fetchSpecialServices,
	type SpecialService,
	type SpecialServiceCategory,
	type SpecialServiceInitiatedBy,
	type SpecialServiceStatus,
	type SpecialServicesQueryParams,
	type UpdateSpecialServiceInput,
	updateSpecialService,
	updateSpecialServiceStatus,
} from "@/services/special-service";

export const Route = createFileRoute("/admin/service/other")({
	component: SpecialServicesPage,
	/*
	 * Document title stays ENGLISH — `head()` is route metadata evaluated
	 * outside React, so there is no hook to read the locale from.
	 */
	head: () => ({
		meta: [{ title: "Jobs & Special Services — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

type ViewMode = "all" | "pending_review";
type StatusFilter = "all" | SpecialServiceStatus;
type CategoryFilter = "all" | SpecialServiceCategory;
type SourceFilter = "all" | SpecialServiceInitiatedBy;

const STATUSES: SpecialServiceStatus[] = [
	"open",
	"assigned",
	"in_progress",
	"completed",
	"cancelled",
];

const CATEGORIES: SpecialServiceCategory[] = [
	"transportation",
	"delivery",
	"wardrobe",
	"makeup",
	"vip_escort",
	"uniform",
	"emergency_cover",
	"training",
	"others",
];

/*
 * The record KEYS are the stored category / status values and never change —
 * only the words a human reads do, so each entry holds a LOOKUP rather than a
 * string. A module-scope map cannot call a hook, so `t` is passed in.
 */
const categoryLabels: Record<
	SpecialServiceCategory,
	(t: PortalTranslations) => string
> = {
	transportation: (t) => t.adminService.catTransportation,
	delivery: (t) => t.adminService.catDelivery,
	wardrobe: (t) => t.adminService.catWardrobe,
	makeup: (t) => t.adminService.catMakeup,
	vip_escort: (t) => t.adminService.catVipEscort,
	uniform: (t) => t.adminService.catUniform,
	emergency_cover: (t) => t.adminService.catEmergencyCover,
	training: (t) => t.adminService.catTraining,
	others: (t) => t.adminService.catOthers,
};

const statusLabels: Record<
	SpecialServiceStatus,
	(t: PortalTranslations) => string
> = {
	open: (t) => t.admin.jobOpen,
	assigned: (t) => t.admin.jobAssigned,
	in_progress: (t) => t.admin.jobInProgress,
	completed: (t) => t.admin.jobCompleted,
	cancelled: (t) => t.admin.jobCancelled,
};

const statusBadgeColors: Record<SpecialServiceStatus, string> = {
	open: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
	assigned: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	in_progress:
		"border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
	completed:
		"border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
	cancelled: "border-muted-foreground/30 bg-muted text-muted-foreground",
};

const sourceNameOf = (record: SpecialService) =>
	record.initiatedBy === "agency"
		? record.postingAgencyName || ""
		: record.initiatedBy === "pr"
			? record.postingPrName || ""
			: record.outletName;

/** "PR" is the product's own term for the role and stays PR in every locale. */
const roleLabelOf = (
	initiatedBy: SpecialServiceInitiatedBy,
	t: PortalTranslations,
) =>
	initiatedBy === "agency"
		? t.adminService.agency
		: initiatedBy === "pr"
			? t.table.pr
			: t.table.outlet;

const formatBudget = (budget: string | null) =>
	budget != null && budget.trim() !== "" ? `RM ${formatPrice(budget)}` : "—";

function SpecialServicesPage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [viewMode, setViewMode] = useState<ViewMode>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
	const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
	const [scheduledDates, setScheduledDates] = useState<Date[]>([]);
	const [requestedDates, setRequestedDates] = useState<Date[]>([]);
	const [idSearch, setIdSearch] = useState("");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
	const [page, setPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);
	const [editRecord, setEditRecord] = useState<SpecialService | null>(null);

	const queryParams: SpecialServicesQueryParams = {
		page,
		pageSize: PAGE_SIZE,
		order: sortOrder,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (categoryFilter !== "all") queryParams.category = categoryFilter;
	if (sourceFilter !== "all") queryParams.initiatedBy = sourceFilter;
	const trimmedIdSearch = idSearch.trim();
	if (trimmedIdSearch) queryParams.id = trimmedIdSearch;
	const scheduledDatesParam = datesToQueryParam(scheduledDates);
	if (scheduledDatesParam) queryParams.scheduledDates = scheduledDatesParam;
	const requestedDatesParam = datesToQueryParam(requestedDates);
	if (requestedDatesParam) queryParams.dates = requestedDatesParam;

	const isPendingView = viewMode === "pending_review";
	const dateFilterParams = {
		dates: requestedDatesParam,
		scheduledDates: scheduledDatesParam,
		order: sortOrder,
	};

	const servicesQuery = useQuery({
		queryKey: isPendingView
			? [
					"special-services",
					"admin-pending",
					{ page, pageSize: PAGE_SIZE, ...dateFilterParams },
				]
			: ["special-services", queryParams],
		queryFn: () =>
			isPendingView
				? fetchAdminPendingJobs(
						{ page, pageSize: PAGE_SIZE, ...dateFilterParams },
						logout,
					)
				: fetchSpecialServices(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const summaryQuery = useQuery({
		queryKey: ["special-services", "summary"],
		queryFn: () => fetchSpecialServiceSummary(logout),
		staleTime: 30_000,
	});

	const pendingCountQuery = useQuery({
		queryKey: ["special-services", "admin-pending", "count"],
		queryFn: () => fetchAdminPendingJobs({ page: 1, pageSize: 1 }, logout),
		staleTime: 30_000,
	});

	const statusMutation = useMutation({
		mutationFn: ({
			id,
			status,
		}: {
			id: string;
			status: SpecialServiceStatus;
		}) => updateSpecialServiceStatus(id, status, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || t.adminService.statusUpdated);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.statusUpdateFailed)?.message ??
					t.adminService.statusUpdateFailed,
			);
		},
	});

	const approveMutation = useMutation({
		mutationFn: (id: string) => adminApproveJob(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || t.adminService.jobApproved);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.jobApproveFailed)?.message ??
					t.adminService.jobApproveFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	const declineMutation = useMutation({
		mutationFn: (id: string) => adminDeclineJob(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || t.adminService.jobDeclined);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.jobDeclineFailed)?.message ??
					t.adminService.jobDeclineFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	const fieldsMutation = useMutation({
		mutationFn: ({
			id,
			...input
		}: { id: string } & UpdateSpecialServiceInput) =>
			updateSpecialService(id, input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || t.adminService.orderUpdated);
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, t.adminService.orderUpdateFailed)?.message ??
					t.adminService.orderUpdateFailed,
			);
		},
	});

	const records = servicesQuery.data?.data ?? [];
	const pagination = servicesQuery.data?.pagination;
	const showLoading = servicesQuery.isLoading && records.length === 0;
	const summary = summaryQuery.data?.data;
	const pendingCount = pendingCountQuery.data?.pagination.totalCount ?? 0;

	const summaryCards: Array<{ key: SpecialServiceStatus; label: string }> = [
		{ key: "open", label: t.admin.jobOpen },
		{ key: "assigned", label: t.admin.jobAssigned },
		{ key: "in_progress", label: t.admin.jobInProgress },
		{ key: "completed", label: t.admin.jobCompleted },
	];

	return (
		<PageShell>
			<PageHeader
				icon={LayoutGrid}
				title={t.adminService.jobsTitle}
				description={t.adminService.jobsSubtitle}
			/>

			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
				<Card
					className="cursor-pointer border-amber-500/30 bg-card transition-colors hover:bg-amber-500/5"
					onClick={() => {
						setViewMode("pending_review");
						setPage(1);
					}}
				>
					<CardHeader className="pb-2">
						<CardDescription>{t.adminService.pendingReview}</CardDescription>
						<CardTitle className="text-2xl text-amber-600 dark:text-amber-400">
							{formatNumber(pendingCount)}
						</CardTitle>
					</CardHeader>
				</Card>
				{summaryCards.map((card) => (
					<Card key={card.key} className="border-(--lavender-soft)/40 bg-card">
						<CardHeader className="pb-2">
							<CardDescription>{card.label}</CardDescription>
							<CardTitle className="text-2xl">
								{formatNumber(summary?.[card.key] ?? 0)}
							</CardTitle>
						</CardHeader>
					</Card>
				))}
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								{isPendingView
									? t.adminService.agencyJobPostings
									: t.adminService.allOrders}
								{servicesQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{isPendingView
									? t.adminService.agencyJobPostingsHint
									: t.adminService.allOrdersHint}
							</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
							{!isPendingView && (
								<>
									<div className="space-y-1.5 sm:mr-auto">
										<Label htmlFor="ss-id-search" className="sr-only">
											{t.adminService.searchServiceId}
										</Label>
										<Input
											id="ss-id-search"
											placeholder={t.adminService.searchServiceIdPlaceholder}
											className="font-mono text-xs sm:w-72"
											value={idSearch}
											onChange={(event) => {
												setIdSearch(event.target.value);
												setPage(1);
											}}
										/>
									</div>
									<SourceToggle
										value={sourceFilter}
										sources={["outlet", "agency", "pr"]}
										onChange={(value) => {
											setSourceFilter(value);
											setPage(1);
										}}
									/>
								</>
							)}

							<Select
								value={viewMode}
								onValueChange={(value) => {
									setViewMode(value as ViewMode);
									setPage(1);
								}}
							>
								<SelectTrigger
									className="sm:w-48"
									aria-label={t.adminService.viewMode}
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										{t.adminService.allOrders}
									</SelectItem>
									<SelectItem value="pending_review">
										{t.adminService.pendingReview}
										{pendingCount > 0 ? ` (${pendingCount})` : ""}
									</SelectItem>
								</SelectContent>
							</Select>

							{!isPendingView && (
								<>
									<Select
										value={categoryFilter}
										onValueChange={(value) => {
											setCategoryFilter(value as CategoryFilter);
											setPage(1);
										}}
									>
										<SelectTrigger
											className="sm:w-40"
											aria-label={t.adminService.filterByCategory}
										>
											<SelectValue placeholder={t.adminService.allCategories} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">
												{t.adminService.allCategories}
											</SelectItem>
											{CATEGORIES.map((category) => (
												<SelectItem key={category} value={category}>
													{categoryLabels[category](t)}
												</SelectItem>
											))}
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
											className="sm:w-40"
											aria-label={t.admin.filterByStatus}
										>
											<SelectValue placeholder={t.admin.allStatus} />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">{t.admin.allStatus}</SelectItem>
											{STATUSES.map((status) => (
												<SelectItem key={status} value={status}>
													{statusLabels[status](t)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</>
							)}

							<DateMultiFilter
								selectedDates={scheduledDates}
								onChange={(dates) => {
									setScheduledDates(dates);
									setPage(1);
								}}
								ariaLabel={t.adminService.filterByScheduledDate}
								emptyLabel={t.adminService.scheduledFor}
							/>
							<DateMultiFilter
								selectedDates={requestedDates}
								onChange={(dates) => {
									setRequestedDates(dates);
									setPage(1);
								}}
								ariaLabel={t.adminService.filterByRequestedDate}
								emptyLabel={t.adminService.requestedTime}
							/>
						</div>
					</div>
				</CardHeader>

				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[220px]">
										{t.adminService.colServiceId}
									</TableHead>
									<TableHead>{t.adminService.colTitle}</TableHead>
									<TableHead>{t.filters.source}</TableHead>
									<TableHead className="w-[160px]">
										{t.adminService.colCategory}
									</TableHead>
									<TableHead className="min-w-[200px]">
										{t.adminService.colDescription}
									</TableHead>
									<TableHead>{t.adminService.colBudget}</TableHead>
									<TableHead>{t.adminService.colThirdParty}</TableHead>
									<TableHead className="w-[150px]">
										{t.adminService.scheduledFor}
									</TableHead>
									<TableHead className="w-[160px]">
										<button
											type="button"
											className="flex items-center gap-1 transition-colors hover:text-foreground"
											onClick={() => {
												setSortOrder((order) =>
													order === "desc" ? "asc" : "desc",
												);
												setPage(1);
											}}
											aria-label={
												sortOrder === "desc"
													? t.adminService.sortedNewestFirst
													: t.adminService.sortedOldestFirst
											}
										>
											{t.adminService.requestedTime}
											{sortOrder === "desc" ? (
												<ArrowDown className="h-3.5 w-3.5" />
											) : (
												<ArrowUp className="h-3.5 w-3.5" />
											)}
										</button>
									</TableHead>
									{isPendingView ? (
										<TableHead className="w-[200px]">
											{t.admin.colActions}
										</TableHead>
									) : (
										<TableHead className="w-[170px]">
											{t.admin.colStatus}
										</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={10} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>{t.common.loading}</span>
											</div>
										</TableCell>
									</TableRow>
								) : servicesQuery.isError ? (
									<TableRow>
										<TableCell colSpan={10} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													{t.adminService.failedToLoad}
												</p>
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(servicesQuery.error)}
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={() => servicesQuery.refetch()}
												>
													<RefreshCw className="mr-2 h-4 w-4" />
													{t.admin.tryAgain}
												</Button>
											</div>
										</TableCell>
									</TableRow>
								) : records.length === 0 ? (
									<TableRow>
										<TableCell colSpan={10} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<LayoutGrid className="h-6 w-6" />
												<span>
													{isPendingView
														? t.adminService.noPendingJobs
														: t.adminService.noServicesFound}
												</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									records.map((record) => {
										const busy = actionId === record.id;
										return (
											<TableRow
												key={record.id}
												className="cursor-pointer"
												onClick={() => setEditRecord(record)}
											>
												<TableCell>
													<code
														className="block max-w-[200px] truncate font-mono text-xs text-muted-foreground"
														title={record.id}
													>
														{record.id}
													</code>
												</TableCell>
												<TableCell className="font-medium">
													{record.title}
												</TableCell>
												<TableCell>
													<div className="flex flex-col gap-1">
														<span className="text-sm">
															{sourceNameOf(record) || "—"}
														</span>
														<Badge
															variant="outline"
															className="w-fit text-muted-foreground"
														>
															{roleLabelOf(record.initiatedBy, t)}
														</Badge>
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className="w-fit border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender"
													>
														{categoryLabels[record.category]?.(t) ??
															record.category}
													</Badge>
												</TableCell>
												<TableCell className="max-w-[280px] text-sm text-muted-foreground">
													{record.description?.trim() ? (
														<span
															className="line-clamp-3"
															title={record.description}
														>
															{record.description}
														</span>
													) : (
														"—"
													)}
												</TableCell>
												<TableCell className="text-sm">
													{formatBudget(record.budget)}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{record.vendorName ?? "—"}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{record.scheduledFor
														? formatDate(record.scheduledFor)
														: "—"}
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{formatDate(record.createdAt)}
												</TableCell>
												<TableCell
													onClick={(e) => e.stopPropagation()}
													onKeyDown={(e) => e.stopPropagation()}
												>
													{isPendingView ? (
														<div className="flex flex-wrap gap-2">
															<Button
																size="sm"
																disabled={busy}
																onClick={() =>
																	approveMutation.mutate(record.id)
																}
															>
																{busy && approveMutation.isPending ? (
																	<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
																) : (
																	<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
																)}
																{t.common.approve}
															</Button>
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() =>
																	declineMutation.mutate(record.id)
																}
															>
																{busy && declineMutation.isPending ? (
																	<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
																) : (
																	<XCircle className="mr-1 h-3.5 w-3.5" />
																)}
																{t.common.decline}
															</Button>
														</div>
													) : (
														<div className="flex items-center gap-2">
															<Badge
																variant="outline"
																className={`${statusBadgeColors[record.status]} w-fit`}
															>
																{statusLabels[record.status](t)}
															</Badge>
															<Button
																size="icon"
																variant="ghost"
																className="h-8 w-8"
																aria-label={fill(t.adminService.editNamed, {
																	title: record.title,
																})}
																onClick={() => setEditRecord(record)}
															>
																<Pencil className="h-4 w-4" />
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
								{fill(
									isPendingView
										? t.adminService.showingJobs
										: t.adminService.showingOrders,
									{
										from: formatNumber((pagination.page - 1) * PAGE_SIZE + 1),
										to: formatNumber(
											Math.min(
												pagination.page * PAGE_SIZE,
												pagination.totalCount,
											),
										),
										total: formatNumber(pagination.totalCount),
									},
								)}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || servicesQuery.isFetching}
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
									disabled={!pagination.hasNextPage || servicesQuery.isFetching}
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
				open={editRecord != null}
				onOpenChange={(open) => {
					if (!open) setEditRecord(null);
				}}
			>
				<SheetContent
					side="right"
					className="w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
				>
					{editRecord && (
						<OrderEditForm
							key={editRecord.id}
							record={editRecord}
							isSaving={fieldsMutation.isPending || statusMutation.isPending}
							onSaveFields={(id, input) =>
								fieldsMutation.mutateAsync({ id, ...input })
							}
							onSaveStatus={(id, status) =>
								statusMutation.mutateAsync({ id, status })
							}
							onDone={() => setEditRecord(null)}
						/>
					)}
				</SheetContent>
			</Sheet>
		</PageShell>
	);
}

interface OrderEditFormProps {
	record: SpecialService;
	isSaving: boolean;
	onSaveFields: (
		id: string,
		input: UpdateSpecialServiceInput,
	) => Promise<unknown>;
	onSaveStatus: (id: string, status: SpecialServiceStatus) => Promise<unknown>;
	onDone: () => void;
}

function OrderEditForm({
	record,
	isSaving,
	onSaveFields,
	onSaveStatus,
	onDone,
}: OrderEditFormProps) {
	const { t } = usePortalLocale();
	const [title, setTitle] = useState(record.title);
	const [category, setCategory] = useState<SpecialServiceCategory>(
		record.category,
	);
	const [description, setDescription] = useState(record.description ?? "");
	const [budget, setBudget] = useState(record.budget ?? "");
	const [thirdParty, setThirdParty] = useState(record.vendorName ?? "");
	const [status, setStatus] = useState<SpecialServiceStatus>(record.status);
	const [scheduledFor, setScheduledFor] = useState<Date | undefined>(() =>
		record.scheduledFor ? new Date(record.scheduledFor) : undefined,
	);

	function sameCalendarDay(a: Date | undefined, b: Date | undefined): boolean {
		if (!a && !b) return true;
		if (!a || !b) return false;
		return format(a, "yyyy-MM-dd") === format(b, "yyyy-MM-dd");
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();

		const input: UpdateSpecialServiceInput = {};

		const trimmedTitle = title.trim();
		if (!trimmedTitle) {
			toast.error(t.adminService.titleRequired);
			return;
		}
		if (trimmedTitle !== record.title) input.title = trimmedTitle;

		if (category !== record.category) input.category = category;

		const trimmedDesc = description.trim();
		if (trimmedDesc !== (record.description ?? "").trim()) {
			input.description = trimmedDesc === "" ? null : trimmedDesc;
		}

		const rawBudget = String(budget).trim();
		if (rawBudget !== (record.budget ?? "").trim()) {
			if (rawBudget === "") {
				input.budget = null;
			} else {
				const parsed = Number(rawBudget);
				if (Number.isNaN(parsed) || parsed < 0) {
					toast.error(t.adminService.budgetInvalid);
					return;
				}
				input.budget = parsed;
			}
		}

		const trimmedThirdParty = thirdParty.trim();
		if (trimmedThirdParty !== (record.vendorName ?? "").trim()) {
			input.vendorName = trimmedThirdParty === "" ? null : trimmedThirdParty;
		}

		const prevScheduled = record.scheduledFor
			? new Date(record.scheduledFor)
			: undefined;
		if (!sameCalendarDay(scheduledFor, prevScheduled)) {
			input.scheduledFor = scheduledFor
				? format(scheduledFor, "yyyy-MM-dd")
				: null;
		}

		try {
			if (Object.keys(input).length > 0) {
				await onSaveFields(record.id, input);
			}
			if (status !== record.status) {
				await onSaveStatus(record.id, status);
			}
			onDone();
		} catch {
			// Error toasts are surfaced by the mutation onError handlers.
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
			<SheetHeader>
				<SheetTitle>{t.adminService.editOrder}</SheetTitle>
				<SheetDescription>{t.adminService.editOrderHint}</SheetDescription>
			</SheetHeader>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
				<div className="space-y-1.5">
					<Label htmlFor="order-id">{t.adminService.colServiceId}</Label>
					<Input
						id="order-id"
						value={record.id}
						readOnly
						disabled
						className="font-mono text-xs"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-title">{t.adminService.colTitle}</Label>
					<Input
						id="order-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</div>

				<div className="space-y-1.5">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="order-role">{t.adminService.role}</Label>
							<Input
								id="order-role"
								value={roleLabelOf(record.initiatedBy, t)}
								readOnly
								disabled
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="order-source-name">
								{fill(t.adminService.sourceNameLabel, {
									role: roleLabelOf(record.initiatedBy, t),
								})}
							</Label>
							<Input
								id="order-source-name"
								value={sourceNameOf(record) || "—"}
								readOnly
								disabled
							/>
						</div>
					</div>
					<p className="text-sm text-muted-foreground">
						{t.adminService.roleNameLocked}
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-category">{t.adminService.colCategory}</Label>
					<Select
						value={category}
						onValueChange={(value) =>
							setCategory(value as SpecialServiceCategory)
						}
					>
						<SelectTrigger id="order-category">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{CATEGORIES.map((option) => (
								<SelectItem key={option} value={option}>
									{categoryLabels[option](t)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-description">
						{category === "others"
							? t.adminService.descriptionRequiredForOthers
							: t.adminService.colDescription}
					</Label>
					<Textarea
						id="order-description"
						rows={3}
						placeholder={t.adminService.descriptionPlaceholder}
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="order-budget">
							{t.adminService.colBudget} (RM)
						</Label>
						<Input
							id="order-budget"
							type="number"
							min={0}
							step="0.01"
							inputMode="decimal"
							placeholder="0.00"
							value={budget}
							onChange={(e) => setBudget(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="order-status">{t.admin.colStatus}</Label>
						<Select
							value={status}
							onValueChange={(value) =>
								setStatus(value as SpecialServiceStatus)
							}
						>
							<SelectTrigger id="order-status">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{STATUSES.map((option) => (
									<SelectItem key={option} value={option}>
										{statusLabels[option](t)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-third-party">
						{t.adminService.thirdPartyOptional}
					</Label>
					<Input
						id="order-third-party"
						placeholder={t.adminService.thirdPartyPlaceholder}
						value={thirdParty}
						onChange={(e) => setThirdParty(e.target.value)}
					/>
					<p className="text-sm text-muted-foreground">
						{t.adminService.thirdPartyHint}
					</p>
				</div>

				<div className="space-y-1.5">
					<Label>{t.adminService.scheduledFor}</Label>
					<DateSingleFilter
						value={scheduledFor}
						onChange={setScheduledFor}
						ariaLabel={t.adminService.scheduledFor}
						emptyLabel={t.adminService.selectDate}
					/>
				</div>

				<dl className="space-y-2 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4 text-base">
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">
							{t.adminService.requestedTime}
						</dt>
						<dd className="text-right">{formatDate(record.createdAt)}</dd>
					</div>
				</dl>
			</div>

			<SheetFooter className="flex-row justify-end gap-2">
				<SheetClose asChild>
					<Button type="button" variant="outline">
						{t.common.cancel}
					</Button>
				</SheetClose>
				<Button type="submit" disabled={isSaving}>
					{isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
					{t.admin.setSaveChanges}
				</Button>
			</SheetFooter>
		</form>
	);
}
