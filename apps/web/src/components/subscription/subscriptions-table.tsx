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
import {
	billingCycleLabel,
	planAudienceLabel,
} from "@/components/subscription/plan-labels";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { planCapacityLabel } from "@/lib/portal-i18n/plan-label";
import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import {
	formatDate,
	formatNumber,
	formatPrice,
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
//
// `id` is the plan's id in the shared catalogue, so the band is rendered by
// `planCapacityLabel` — the same copy the agency and outlet plan cards show —
// rather than a second translation of the same fact. `english` stays as the
// resolver's fallback for a plan id the dictionary has never seen.
const PLAN_COVERAGE: Record<
	PlanAudience,
	Record<string, { id: string; english: string }>
> = {
	agency: {
		Starter: { id: "starter", english: "5 PV/week" },
		Plus: { id: "plus", english: "6–10 PV/week" },
		Growth: { id: "growth", english: "11–25 PV/week" },
		Enterprise: { id: "enterprise", english: "26–75 PV/week" },
		Scale: { id: "scale", english: "76–150 PV/week" },
		Custom: { id: "renego", english: "151+ PV/week" },
	},
	outlet: {
		Essential: { id: "starter", english: "5 PRs/day" },
		Plus: { id: "plus", english: "6–10 PRs/day" },
		Pro: { id: "pro", english: "11–25 PRs/day" },
		Enterprise: { id: "enterprise", english: "26–50 PRs/day" },
		Scale: { id: "scale", english: "51–100 PRs/day" },
		Premier: { id: "premier", english: "101+ PRs/day" },
	},
};

function coverageFor(sub: Subscription, t: PortalTranslations): string {
	const audience = audienceFor(sub);
	const entry = PLAN_COVERAGE[audience]?.[sub.name];
	if (!entry) return "—";
	return planCapacityLabel(audience, entry.id, entry.english, t);
}

/** Agency Custom (151+ PV/week) is priced per deal — not a fixed catalog price. */
function isAgencyCustomPlan(sub: Subscription): boolean {
	return sub.name === "Custom" && audienceFor(sub) === "agency";
}

function priceLabelFor(sub: Subscription, t: PortalTranslations): string {
	if (isAgencyCustomPlan(sub)) return t.subscription.renegotiatePrice;
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
	const { t } = usePortalLocale();
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
							{t.adminSubscription.plansTitle}
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>{t.adminSubscription.plansHint}</CardDescription>
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
								aria-label={t.adminSubscription.filterByBillingCycle}
							>
								<SelectValue placeholder={t.adminSubscription.allCycles} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">
									{t.adminSubscription.allCycles}
								</SelectItem>
								<SelectItem value="weekly">
									{t.subscription.billedWeekly}
								</SelectItem>
								<SelectItem value="monthly">
									{t.subscription.billedMonthly}
								</SelectItem>
								<SelectItem value="annually">
									{t.subscription.billedAnnually}
								</SelectItem>
							</SelectContent>
						</Select>

						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as SubscriptionStatusFilter)
							}
						>
							<SelectTrigger
								className="sm:w-40"
								aria-label={t.admin.filterByStatus}
							>
								<SelectValue placeholder={t.admin.filterByStatus} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t.admin.allStatus}</SelectItem>
								<SelectItem value="active">{t.rbac.statusActive}</SelectItem>
								<SelectItem value="inactive">
									{t.rbac.statusInactive}
								</SelectItem>
							</SelectContent>
						</Select>

						<Button onClick={onCreateClick} className="shrink-0">
							<Plus className="mr-2 h-4 w-4" />
							{t.adminSubscription.createPlan}
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.admin.colName}</TableHead>
								<TableHead>{t.adminSubscription.colAudience}</TableHead>
								<TableHead>{t.adminSubscription.colPrice}</TableHead>
								<TableHead>{t.adminSubscription.colCoverage}</TableHead>
								<TableHead>{t.adminBusiness.colBillingCycle}</TableHead>
								<TableHead className="w-[120px]">{t.admin.colStatus}</TableHead>
								<TableHead className="w-[180px]">
									{t.adminSubscription.colLastEdited}
								</TableHead>
								<TableHead className="w-[80px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>{t.adminSubscription.loadingPlans}</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												{t.adminSubscription.plansLoadFailed}
											</p>
											<p className="text-sm text-muted-foreground">
												{getErrorMessage(error)}
											</p>
											<Button variant="outline" size="sm" onClick={onRetry}>
												<RefreshCw className="mr-2 h-4 w-4" />
												{t.admin.tryAgain}
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : subscriptions.length === 0 ? (
								<TableRow>
									<TableCell colSpan={8} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<CreditCard className="h-6 w-6" />
											<span>{t.adminSubscription.noPlansFound}</span>
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
													{planAudienceLabel(audienceFor(sub), t)}
												</Badge>
											</TableCell>
											<TableCell
												className={
													isAgencyCustomPlan(sub)
														? "text-sm text-muted-foreground italic"
														: undefined
												}
											>
												{priceLabelFor(sub, t)}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{sub.coverage || coverageFor(sub, t)}
											</TableCell>
											<TableCell className="capitalize">
												{billingCycleLabel(sub.billingCycle, t)}
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
													{recordStatusLabel(sub.status, t)}
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
													aria-label={fill(t.adminSubscription.editPlanNamed, {
														name: sub.name,
													})}
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
													<span>{t.plans.posAddon}</span>
													<Badge
														variant="outline"
														className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
													>
														{t.outletSubscription.addOn}
													</Badge>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className="border-(--lavender-soft)/50 bg-(--lavender-soft)/10 text-foreground"
												>
													{planAudienceLabel("outlet", t)}
												</Badge>
											</TableCell>
											<TableCell className="text-sm text-muted-foreground italic">
												{t.plans.posAddonPrice}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												{t.adminSubscription.posSyncAddon}
											</TableCell>
											<TableCell className="text-sm text-muted-foreground">
												—
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className="border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400"
												>
													{t.outletSubscription.addOn}
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
							{fill(t.adminSubscription.showingPlans, {
								from: formatNumber((pagination.page - 1) * pageSize + 1),
								to: formatNumber(
									Math.min(pagination.page * pageSize, pagination.totalCount),
								),
								total: formatNumber(pagination.totalCount),
							})}
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasPrevPage || isFetching}
								onClick={() => onPageChange(page - 1)}
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
								disabled={!pagination.hasNextPage || isFetching}
								onClick={() => onPageChange(page + 1)}
							>
								{t.admin.next}
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
