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

const categoryLabels: Record<SpecialServiceCategory, string> = {
	transportation: "Transportation",
	delivery: "Deliveries",
	wardrobe: "Wardrobe & styling",
	makeup: "Makeup & grooming",
	vip_escort: "VIP escort",
	uniform: "Uniform & documents",
	emergency_cover: "Emergency cover",
	training: "Training top-up",
	others: "Others",
};

const statusLabels: Record<SpecialServiceStatus, string> = {
	open: "Open",
	assigned: "Assigned",
	in_progress: "In progress",
	completed: "Completed",
	cancelled: "Cancelled",
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

const roleLabelOf = (initiatedBy: SpecialServiceInitiatedBy) =>
	initiatedBy === "agency" ? "Agency" : initiatedBy === "pr" ? "PR" : "Outlet";

const formatBudget = (budget: string | null) =>
	budget != null && budget.trim() !== "" ? `RM ${formatPrice(budget)}` : "—";

function SpecialServicesPage() {
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
			toast.success(response.message || "Status updated");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to update status")?.message ??
					"Failed to update status",
			);
		},
	});

	const approveMutation = useMutation({
		mutationFn: (id: string) => adminApproveJob(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || "Job posting approved");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to approve job")?.message ??
					"Failed to approve job",
			);
		},
		onSettled: () => setActionId(null),
	});

	const declineMutation = useMutation({
		mutationFn: (id: string) => adminDeclineJob(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["special-services"] });
			toast.success(response.message || "Job posting declined");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to decline job")?.message ??
					"Failed to decline job",
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
			toast.success(response.message || "Order updated");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to update order")?.message ??
					"Failed to update order",
			);
		},
	});

	const records = servicesQuery.data?.data ?? [];
	const pagination = servicesQuery.data?.pagination;
	const showLoading = servicesQuery.isLoading && records.length === 0;
	const summary = summaryQuery.data?.data;
	const pendingCount = pendingCountQuery.data?.pagination.totalCount ?? 0;

	const summaryCards: Array<{ key: SpecialServiceStatus; label: string }> = [
		{ key: "open", label: "Open" },
		{ key: "assigned", label: "Assigned" },
		{ key: "in_progress", label: "In progress" },
		{ key: "completed", label: "Completed" },
	];

	return (
		<PageShell>
			<PageHeader
				icon={LayoutGrid}
				title="Jobs & Special Services"
				description="Browse orders and agency jobs. Click a row to open the editor and update details or status. Use the filters to narrow by source, category, or status."
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
						<CardDescription>Pending review</CardDescription>
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
								{isPendingView ? "Agency job postings" : "All orders"}
								{servicesQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{isPendingView
									? "Agency-submitted posts awaiting admin approve or decline"
									: "Outlet orders and agency jobs — status and assignment"}
							</CardDescription>
						</div>

						<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
							{!isPendingView && (
								<>
									<div className="space-y-1.5 sm:mr-auto">
										<Label htmlFor="ss-id-search" className="sr-only">
											Search special service ID
										</Label>
										<Input
											id="ss-id-search"
											placeholder="Search special service ID…"
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
								<SelectTrigger className="sm:w-48" aria-label="View mode">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All orders</SelectItem>
									<SelectItem value="pending_review">
										Pending review
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
											aria-label="Filter by category"
										>
											<SelectValue placeholder="All Categories" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Categories</SelectItem>
											{CATEGORIES.map((category) => (
												<SelectItem key={category} value={category}>
													{categoryLabels[category]}
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
											aria-label="Filter by status"
										>
											<SelectValue placeholder="All Status" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="all">All Status</SelectItem>
											{STATUSES.map((status) => (
												<SelectItem key={status} value={status}>
													{statusLabels[status]}
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
								ariaLabel="Filter by scheduled date"
								emptyLabel="Scheduled for"
							/>
							<DateMultiFilter
								selectedDates={requestedDates}
								onChange={(dates) => {
									setRequestedDates(dates);
									setPage(1);
								}}
								ariaLabel="Filter by requested date"
								emptyLabel="Requested time"
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
										Special Service ID
									</TableHead>
									<TableHead>Title</TableHead>
									<TableHead>Source</TableHead>
									<TableHead className="w-[160px]">Category</TableHead>
									<TableHead className="min-w-[200px]">Description</TableHead>
									<TableHead>Budget</TableHead>
									<TableHead>Third Party</TableHead>
									<TableHead className="w-[150px]">Scheduled For</TableHead>
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
													? "Sorted by requested time, newest first — click for oldest first"
													: "Sorted by requested time, oldest first — click for newest first"
											}
										>
											Requested Time
											{sortOrder === "desc" ? (
												<ArrowDown className="h-3.5 w-3.5" />
											) : (
												<ArrowUp className="h-3.5 w-3.5" />
											)}
										</button>
									</TableHead>
									{isPendingView ? (
										<TableHead className="w-[200px]">Actions</TableHead>
									) : (
										<TableHead className="w-[170px]">Status</TableHead>
									)}
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading ? (
									<TableRow>
										<TableCell colSpan={10} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>Loading…</span>
											</div>
										</TableCell>
									</TableRow>
								) : servicesQuery.isError ? (
									<TableRow>
										<TableCell colSpan={10} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													Failed to load
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
													Try Again
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
														? "No job postings pending review"
														: "No special services found"}
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
															{roleLabelOf(record.initiatedBy)}
														</Badge>
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className="w-fit border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender"
													>
														{categoryLabels[record.category] ?? record.category}
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
																Approve
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
																Decline
															</Button>
														</div>
													) : (
														<div className="flex items-center gap-2">
															<Badge
																variant="outline"
																className={`${statusBadgeColors[record.status]} w-fit`}
															>
																{statusLabels[record.status]}
															</Badge>
															<Button
																size="icon"
																variant="ghost"
																className="h-8 w-8"
																aria-label={`Edit ${record.title}`}
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
								{isPendingView ? "jobs" : "orders"}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || servicesQuery.isFetching}
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
									disabled={!pagination.hasNextPage || servicesQuery.isFetching}
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
			toast.error("Title is required");
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
					toast.error("Enter a valid non-negative budget");
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
				<SheetTitle>Edit order</SheetTitle>
				<SheetDescription>
					Update the order details or status, then save your changes.
				</SheetDescription>
			</SheetHeader>

			<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4">
				<div className="space-y-1.5">
					<Label htmlFor="order-id">Special Service ID</Label>
					<Input
						id="order-id"
						value={record.id}
						readOnly
						disabled
						className="font-mono text-xs"
					/>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-title">Title</Label>
					<Input
						id="order-title"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</div>

				<div className="space-y-1.5">
					<div className="grid grid-cols-2 gap-3">
						<div className="space-y-1.5">
							<Label htmlFor="order-role">Role</Label>
							<Input
								id="order-role"
								value={roleLabelOf(record.initiatedBy)}
								readOnly
								disabled
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="order-source-name">
								{`${roleLabelOf(record.initiatedBy)} name`}
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
						Role and requester name are set by whoever submitted the order and
						cannot be changed.
					</p>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-category">Category</Label>
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
									{categoryLabels[option]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-description">
						Description
						{category === "others" ? " (required for “Others”)" : ""}
					</Label>
					<Textarea
						id="order-description"
						rows={3}
						placeholder="PR / outlet note for this order…"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
					/>
				</div>

				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="order-budget">Budget (RM)</Label>
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
						<Label htmlFor="order-status">Status</Label>
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
										{statusLabels[option]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="space-y-1.5">
					<Label htmlFor="order-third-party">Third party (optional)</Label>
					<Input
						id="order-third-party"
						placeholder="Who's supporting this — vendor or partner name…"
						value={thirdParty}
						onChange={(e) => setThirdParty(e.target.value)}
					/>
					<p className="text-sm text-muted-foreground">
						Who you found to support this category. Leave blank if none yet.
					</p>
				</div>

				<div className="space-y-1.5">
					<Label>Scheduled for</Label>
					<DateSingleFilter
						value={scheduledFor}
						onChange={setScheduledFor}
						ariaLabel="Scheduled for date"
						emptyLabel="Select date"
					/>
				</div>

				<dl className="space-y-2 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-4 text-base">
					<div className="flex items-center justify-between gap-2">
						<dt className="text-muted-foreground">Requested time</dt>
						<dd className="text-right">{formatDate(record.createdAt)}</dd>
					</div>
				</dl>
			</div>

			<SheetFooter className="flex-row justify-end gap-2">
				<SheetClose asChild>
					<Button type="button" variant="outline">
						Cancel
					</Button>
				</SheetClose>
				<Button type="submit" disabled={isSaving}>
					{isSaving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
					Save changes
				</Button>
			</SheetFooter>
		</form>
	);
}
