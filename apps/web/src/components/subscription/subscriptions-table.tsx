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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
export type SubscriptionRoleFilter = "all" | string;

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
	roleFilter: SubscriptionRoleFilter;
	roleOptions: Array<{ id: string; roleName: string }>;
	onStatusFilterChange: (value: SubscriptionStatusFilter) => void;
	onBillingCycleFilterChange: (value: BillingCycleFilter) => void;
	onRoleFilterChange: (value: SubscriptionRoleFilter) => void;
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
	roleFilter,
	roleOptions,
	onStatusFilterChange,
	onBillingCycleFilterChange,
	onRoleFilterChange,
	onPageChange,
	onRetry,
	onCreateClick,
	onEditClick,
}: SubscriptionsTableProps) {
	const showLoading = isLoading && subscriptions.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
						<Tabs
							value={roleFilter}
							onValueChange={(value) =>
								onRoleFilterChange(value as SubscriptionRoleFilter)
							}
						>
							<TabsList aria-label="Filter by role">
								<TabsTrigger value="all">All Roles</TabsTrigger>
								{roleOptions.map((role) => (
									<TabsTrigger key={role.id} value={role.id}>
										{formatRoleLabel(role.roleName)}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>

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
								<TableHead>Roles</TableHead>
								<TableHead>Price (RM)</TableHead>
								<TableHead>Billing Cycle</TableHead>
								<TableHead className="w-[120px]">Status</TableHead>
								<TableHead className="w-[180px]">Created</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading plans...</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
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
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<CreditCard className="h-6 w-6" />
											<span>No plans found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								subscriptions.map((sub) => (
									<TableRow key={sub.id}>
										<TableCell className="font-medium">{sub.name}</TableCell>
										<TableCell>
											{sub.roles.length > 0 ? (
												<div className="flex flex-wrap gap-1.5">
													{sub.roles.map((role) => (
														<Badge
															key={role.id}
															variant="outline"
															className="border-(--lavender-soft)/50 bg-(--lavender-soft)/10 text-foreground"
														>
															{formatRoleLabel(role.roleName)}
														</Badge>
													))}
												</div>
											) : (
												<span className="text-sm text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>{formatPrice(sub.price)}</TableCell>
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
											{formatDate(sub.createdAt)}
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
								))
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
