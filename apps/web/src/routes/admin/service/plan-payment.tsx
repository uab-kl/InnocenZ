import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { format, parse } from "date-fns";
import {
	AlertCircle,
	CreditCard,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { toMutationError } from "@/lib/mutation-error";
import { formatDate, formatPrice, getErrorMessage } from "@/lib/utils";
import {
	fetchSubscriptionInvoices,
	generateSubscriptionInvoices,
	type SubscriberType,
	type SubscriptionInvoiceQueryParams,
	type SubscriptionInvoiceStatus,
	setSubscriptionInvoiceStatus,
} from "@/services/subscription-invoice";

export const Route = createFileRoute("/admin/service/plan-payment")({
	component: PlanPaymentPage,
	head: () => ({ meta: [{ title: "Plan Payment — Innocenz Admin" }] }),
});

const PAGE_SIZE = 10;

/**
 * A period boundary as a DAY.
 *
 * The shared `formatDate` prints a time, which rendered every period as
 * "10 Aug 2026, 08:00 am" — a clock reading on a fact that has no clock, and
 * 08:00 at that, being midnight UTC seen from Kuala Lumpur. `period_start` /
 * `period_end` are `date` columns; they arrive as plain `YYYY-MM-DD` and are
 * parsed as such rather than through `new Date()`, which would read them as UTC
 * and shift the day back for anyone east of Greenwich.
 */
function periodDay(day: string): string {
	const parsed = parse(day, "yyyy-MM-dd", new Date());
	return Number.isNaN(parsed.getTime()) ? day : format(parsed, "d MMM yyyy");
}

const statusLabels: Record<SubscriptionInvoiceStatus, string> = {
	unpaid: "Unpaid",
	paid: "Paid",
};

const statusBadgeColors: Record<SubscriptionInvoiceStatus, string> = {
	unpaid: "border-amber-400/40 bg-amber-400/10 text-amber-300",
	paid: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
};

const roleLabels: Record<SubscriberType, string> = {
	outlet: "Outlet",
	agency: "Agency",
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
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] = useState<string>("all");
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
		queryKey: ["subscription-invoices", queryParams],
		queryFn: () => fetchSubscriptionInvoices(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const statusMutation = useMutation({
		mutationFn: ({
			id,
			status,
		}: {
			id: string;
			status: SubscriptionInvoiceStatus;
		}) => setSubscriptionInvoiceStatus(id, status, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-invoices"] });
			toast.success(response.message || "Payment status updated");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to update payment status")?.message ??
					"Failed to update payment status",
			);
		},
	});

	// Opens any period that has started and has no row yet. Idempotent — the
	// server refuses to bill a period twice — so this is safe to press.
	const generateMutation = useMutation({
		mutationFn: () => generateSubscriptionInvoices(logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-invoices"] });
			toast.success(response.message || "Ledger up to date");
		},
		onError: (error) => {
			toast.error(
				toMutationError(error, "Failed to refresh the ledger")?.message ??
					"Failed to refresh the ledger",
			);
		},
	});

	const records = invoicesQuery.data?.data ?? [];
	const pagination = invoicesQuery.data?.pagination;
	const showLoading = invoicesQuery.isLoading && records.length === 0;
	const isSaving = statusMutation.isPending || generateMutation.isPending;

	return (
		<PageShell>
			<PageHeader
				icon={CreditCard}
				title="Plan Payment"
				description="What each outlet and agency owes InnocenZ for its plan, period by period. Agencies are billed weekly (Sun–Sat), outlets monthly. Every period opens Unpaid until you mark it paid."
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="space-y-4">
						<div>
							<CardTitle className="flex items-center gap-2">
								Billing periods
								{invoicesQuery.isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								One row per period each subscriber is charged for — agencies
								weekly (Sun–Sat), outlets monthly from the day they subscribed.
								Generated from the subscription itself, so this is what was
								BILLED, not what was asked for; the switches behind it live on{" "}
								<Link
									to="/admin/service/plan-changes"
									className="text-lavender underline underline-offset-2"
								>
									Plan Change
								</Link>
								. Every period opens Unpaid until you mark it paid.
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
									placeholder="Search outlet or agency..."
									className="pl-8"
									aria-label="Search outlet or agency"
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
									aria-label="Filter by status"
								>
									<SelectValue placeholder="All Status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Status</SelectItem>
									<SelectItem value="unpaid">Unpaid</SelectItem>
									<SelectItem value="paid">Paid</SelectItem>
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
								Refresh periods
							</Button>
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
									<TableHead>Plan</TableHead>
									<TableHead className="w-[210px]">Billing period</TableHead>
									<TableHead>Amount (RM)</TableHead>
									<TableHead className="w-[110px]">Status</TableHead>
									<TableHead className="w-[170px]">Paid on</TableHead>
									<TableHead className="w-[130px] text-right">Action</TableHead>
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
												Try Again
											</Button>
										</TableCell>
									</TableRow>
								) : records.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={8}
											className="py-10 text-center text-muted-foreground"
										>
											No billing periods match this filter.
										</TableCell>
									</TableRow>
								) : (
									records.map((invoice) => (
										<TableRow key={invoice.id}>
											<TableCell className="text-base font-medium">
												{invoice.subscriberName}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`${roleBadgeColors[invoice.subscriberType]} w-fit`}
												>
													{roleLabels[invoice.subscriberType]}
												</Badge>
											</TableCell>
											<TableCell>
												{invoice.planName}
												<span className="block text-sm text-muted-foreground">
													{invoice.billingCycle === "weekly"
														? "Weekly"
														: "Monthly"}
												</span>
											</TableCell>
											<TableCell className="text-base whitespace-nowrap">
												{periodDay(invoice.periodStart)} –{" "}
												{periodDay(invoice.periodEnd)}
											</TableCell>
											<TableCell className="text-base whitespace-nowrap">
												{formatPrice(Number(invoice.amount))}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`${statusBadgeColors[invoice.status]} w-fit`}
												>
													{statusLabels[invoice.status]}
												</Badge>
											</TableCell>
											<TableCell className="text-base whitespace-nowrap text-muted-foreground">
												{invoice.paidAt ? formatDate(invoice.paidAt) : "—"}
											</TableCell>
											<TableCell className="text-right">
												{/*
												 * Both directions, always — an admin who marks the wrong
												 * period paid has to be able to take it back, and a
												 * one-way button is how a wrong figure becomes permanent.
												 */}
												<Button
													size="sm"
													variant={
														invoice.status === "paid" ? "outline" : "default"
													}
													disabled={isSaving}
													onClick={() =>
														statusMutation.mutate({
															id: invoice.id,
															status:
																invoice.status === "paid" ? "unpaid" : "paid",
														})
													}
												>
													{invoice.status === "paid"
														? "Mark unpaid"
														: "Mark paid"}
												</Button>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							<span>
								Showing {(pagination.page - 1) * pagination.pageSize + 1} -{" "}
								{Math.min(
									pagination.page * pagination.pageSize,
									pagination.totalCount,
								)}{" "}
								of {pagination.totalCount} billing periods
							</span>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || invoicesQuery.isFetching}
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
									disabled={!pagination.hasNextPage || invoicesQuery.isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									Next
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
