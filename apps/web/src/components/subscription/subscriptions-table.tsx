import {
	AlertCircle,
	CheckCircle2,
	CreditCard,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	XCircle,
} from "lucide-react";
import {
	SourceToggle,
	type SourceValue,
} from "@/components/admin/source-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
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
import {
	formatDate,
	formatNumber,
	formatPrice,
	formatRoleLabel,
	getErrorMessage,
	statusColors,
} from "@/lib/utils";
import type {
	BillingCycle,
	Subscription,
	SubscriptionPagination,
	SubscriptionStatus,
} from "@/services/subscription";

export type SubscriptionStatusFilter = "all" | SubscriptionStatus;
export type BillingCycleFilter = "all" | BillingCycle;
export type PlanAudience = "agency" | "outlet";
export type SubscriptionAudienceFilter = "all" | PlanAudience;

/** Audience is stored on the plan since migration 0036, not inferred from the billing cycle. */
function audienceFor(sub: Subscription): PlanAudience {
	return sub.subscriptionType;
}

// Volume tier per plan, taken from the InnocenZ prototype rate cards. Keyed by
// audience because "Plus"/"Enterprise"/"Scale" exist for both with different
// ranges and units: agency bills weekly on PV volume, outlet monthly on PRs/day.
const PLAN_COVERAGE: Record<string, Record<string, string>> = {
	agency: {
		Starter: "5 PV/week",
		Plus: "6–10 PV/week",
		Growth: "11–25 PV/week",
		Enterprise: "26–75 PV/week",
		Scale: "76–150 PV/week",
		Custom: "151+ PV/week",
	},
	outlet: {
		Essential: "5 PRs/day",
		Plus: "6–10 PRs/day",
		Pro: "11–25 PRs/day",
		Enterprise: "26–50 PRs/day",
		Scale: "51–100 PRs/day",
		Premier: "101+ PRs/day",
	},
};

function coverageFor(sub: Subscription): string {
	return PLAN_COVERAGE[audienceFor(sub)]?.[sub.name] ?? "—";
}

/** Agency Custom (151+ PV/week) is priced per deal — not a fixed catalog price. */
function isAgencyCustomPlan(sub: Subscription): boolean {
	return sub.name === "Custom" && audienceFor(sub) === "agency";
}

function priceLabelFor(sub: Subscription): string {
	if (isAgencyCustomPlan(sub)) return "Renegotiate price";
	return formatPrice(sub.price);
}

interface SubscriptionsTableProps {
	subscriptions: Subscription[];
	pagination: SubscriptionPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	statusFilter: SubscriptionStatusFilter;
	billingCycleFilter: BillingCycleFilter;
	audienceFilter: SubscriptionAudienceFilter;
	onStatusFilterChange: (value: SubscriptionStatusFilter) => void;
	onBillingCycleFilterChange: (value: BillingCycleFilter) => void;
	onAudienceFilterChange: (value: SubscriptionAudienceFilter) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onCreateClick: () => void;
	onEditClick: (subscription: Subscription) => void;
}

export function SubscriptionsTable({
	subscriptions,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	statusFilter,
	billingCycleFilter,
	audienceFilter,
	onStatusFilterChange,
	onBillingCycleFilterChange,
	onAudienceFilterChange,
	onPageChange,
	onRetry,
	onCreateClick,
	onEditClick,
}: SubscriptionsTableProps) {
	const showLoading = isLoading && subscriptions.length === 0;

	// Show the cheapest plan first. Sort is applied to the current page (all
	// plans fit on one page), so the lowest price always sits on top.
	const sortedSubscriptions = [...subscriptions].sort(
		(a, b) => Number(a.price) - Number(b.price),
	);

	const showOutletPosAddonRow =
		audienceFilter === "outlet" && !showLoading && !isError;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="space-y-4">
					<div>
						<CardTitle className="flex items-center gap-2">
							Plans
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>Manage plans and billing cycles</CardDescription>
					</div>

					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<SourceToggle
							className="sm:mr-auto"
							value={audienceFilter as SourceValue}
							onChange={(value) =>
								onAudienceFilterChange(value as SubscriptionAudienceFilter)
							}
						/>

						<Select
							value={billingCycleFilter}
							onValueChange={(value) =>
								onBillingCycleFilterChange(value as BillingCycleFilter)
							}
						>
							<SelectTrigger
								className="sm:w-40"
								aria-label="Filter by billing cycle"
							>
								<SelectValue placeholder="All Cycles" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Cycles</SelectItem>
								<SelectItem value="weekly">Weekly</SelectItem>
								<SelectItem value="monthly">Monthly</SelectItem>
								<SelectItem value="annually">Annually</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as SubscriptionStatusFilter)
							}
						>
							<SelectTrigger className="sm:w-40" aria-label="Filter by status">
								<SelectValue placeholder="Filter by status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Status</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>

						<Button onClick={onCreateClick} className="shrink-0">
							<Plus className="mr-2 h-4 w-4" />
							Create Plan
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Name</TableHead>
								<TableHead>Audience</TableHead>
								<TableHead>Price (RM)</TableHead>
								<TableHead>Coverage</TableHead>
								<TableHead>Billing Cycle</TableHead>
								<TableHead className="w-[120px]">Status</TableHead>
								<TableHead className="w-[180px]">Last edited</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading plans...</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												Failed to load plans
											</p>
											<p className="text-sm text-muted-foreground">
												{getErrorMessage(error)}
											</p>
											<Button variant="outline" size="sm" onClick={onRetry}>
												<RefreshCw className="mr-2 h-4 w-4" />
												Try Again
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : subscriptions.length === 0 ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<CreditCard className="h-6 w-6" />
											<span>No plans found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								<>
									{sortedSubscriptions.map((sub) => (
										<TableRow key={sub.id}>
											<TableCell className="font-medium">{sub.name}</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className="border-(--lavender-soft)/50 bg-(--lavender-soft)/10 text-foreground"
												>
													{formatRoleLabel(audienceFor(sub))}
												</Badge>
											</TableCell>
											<TableCell
												className={
													isAgencyCustomPlan(sub)
														? "text-sm text-muted-foreground italic"
														: undefined
												}
											>
												{priceLabelFor(sub)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{sub.coverage || coverageFor(sub)}
											</TableCell>
											<TableCell className="capitalize">
												{sub.billingCycle}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`${statusColors[sub.status] ?? statusColors.inactive} flex w-fit items-center gap-1 capitalize`}
												>
													{sub.status === "active" ? (
														<CheckCircle2 className="h-3 w-3" />
													) : (
														<XCircle className="h-3 w-3" />
													)}
													{sub.status}
												</Badge>
											</TableCell>
											<TableCell className="text-muted-foreground text-sm">
												{formatDate(sub.updatedAt)}
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon"
													onClick={() => onEditClick(sub)}
													aria-label={`Edit ${sub.name}`}
												>
													<Pencil className="h-4 w-4" />
												</Button>
											</TableCell>
										</TableRow>
									))}
									{showOutletPosAddonRow && (
										<TableRow className="bg-muted/20 hover:bg-muted/20">
											<TableCell className="font-medium">
												<div className="flex flex-wrap items-center gap-2">
													<span>Integrate with POS</span>
													<Badge
														variant="outline"
														className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
													>
														Add-on
													</Badge>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className="border-(--lavender-soft)/50 bg-(--lavender-soft)/10 text-foreground"
												>
													{formatRoleLabel("outlet")}
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-muted-foreground italic">
												Call to get price
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												POS sync add-on
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												—
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
												>
													Add-on
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												—
											</TableCell>
											<TableCell />
										</TableRow>
									)}
								</>
							)}
						</TableBody>
					</Table>
				</div>

				{pagination && pagination.totalCount > 0 && (
					<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
						<div>
							Showing{" "}
							<span className="font-medium">
								{formatNumber((pagination.page - 1) * pageSize + 1)}
							</span>{" "}
							-{" "}
							<span className="font-medium">
								{formatNumber(
									Math.min(pagination.page * pageSize, pagination.totalCount),
								)}
							</span>{" "}
							of{" "}
							<span className="font-medium">
								{formatNumber(pagination.totalCount)}
							</span>{" "}
							plans
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasPrevPage || isFetching}
								onClick={() => onPageChange(page - 1)}
							>
								Previous
							</Button>
							<span>
								Page {pagination.page} of {pagination.totalPages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasNextPage || isFetching}
								onClick={() => onPageChange(page + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
