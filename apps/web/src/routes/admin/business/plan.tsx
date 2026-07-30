import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { SubscriptionFormSheet } from "@/components/subscription/subscription-form-sheet";
import {
	type BillingCycleFilter,
	type SubscriptionAudienceFilter,
	type SubscriptionStatusFilter,
	SubscriptionsTable,
} from "@/components/subscription/subscriptions-table";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	type CreateSubscriptionInput,
	createSubscription,
	fetchSubscriptions,
	type Subscription,
	type SubscriptionsQueryParams,
	updateSubscription,
} from "@/services/subscription";

export const Route = createFileRoute("/admin/business/plan")({
	component: PlanPage,
	head: () => ({
		meta: [{ title: "Plan — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function PlanPage() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [statusFilter, setStatusFilter] =
		useState<SubscriptionStatusFilter>("all");
	const [billingCycleFilter, setBillingCycleFilter] =
		useState<BillingCycleFilter>("all");
	const [audienceFilter, setAudienceFilter] =
		useState<SubscriptionAudienceFilter>("all");
	const [plansPage, setPlansPage] = useState(1);
	const [planFormOpen, setPlanFormOpen] = useState(false);
	const [planEditTarget, setPlanEditTarget] = useState<Subscription | null>(
		null,
	);

	const plansQueryParams: SubscriptionsQueryParams = {
		page: plansPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") plansQueryParams.status = statusFilter;
	if (billingCycleFilter !== "all")
		plansQueryParams.billingCycle = billingCycleFilter;
	// Audience is stored on the plan (subscription.subscription_type, migration
	// 0036), so filter on it directly — it then ANDs with the billing-cycle
	// dropdown instead of overwriting it.
	if (audienceFilter !== "all")
		plansQueryParams.subscriptionType = audienceFilter;

	const plansQuery = useQuery({
		queryKey: ["subscriptions", plansQueryParams],
		queryFn: () => fetchSubscriptions(plansQueryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const createPlanMutation = useMutation({
		mutationFn: (input: CreateSubscriptionInput) =>
			createSubscription(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
			setPlanFormOpen(false);
			toast.success(response.message || "Plan created successfully");
		},
	});

	const updatePlanMutation = useMutation({
		mutationFn: (input: CreateSubscriptionInput) =>
			updateSubscription(planEditTarget!.id, input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscriptions"] });
			setPlanFormOpen(false);
			toast.success(response.message || "Plan updated successfully");
		},
	});

	const isPlanSubmitting =
		createPlanMutation.isPending || updatePlanMutation.isPending;
	const planMutationError = toMutationError(
		planEditTarget ? updatePlanMutation.error : createPlanMutation.error,
		planEditTarget ? "Failed to update plan" : "Failed to create plan",
	);

	return (
		<PageShell>
			<PageHeader
				icon={CreditCard}
				title="Plan"
				description="Manage agency and outlet plans and billing cycles."
			/>

			<SubscriptionsTable
				subscriptions={plansQuery.data?.data ?? []}
				pagination={plansQuery.data?.pagination}
				page={plansPage}
				pageSize={PAGE_SIZE}
				isLoading={plansQuery.isLoading}
				isFetching={plansQuery.isFetching}
				isError={plansQuery.isError}
				error={plansQuery.error as Error | null}
				statusFilter={statusFilter}
				billingCycleFilter={billingCycleFilter}
				audienceFilter={audienceFilter}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setPlansPage(1);
				}}
				onBillingCycleFilterChange={(value) => {
					setBillingCycleFilter(value);
					setPlansPage(1);
				}}
				onAudienceFilterChange={(value) => {
					setAudienceFilter(value);
					setPlansPage(1);
				}}
				onPageChange={setPlansPage}
				onRetry={() => plansQuery.refetch()}
				onCreateClick={() => {
					setPlanEditTarget(null);
					createPlanMutation.reset();
					updatePlanMutation.reset();
					setPlanFormOpen(true);
				}}
				onEditClick={(subscription) => {
					setPlanEditTarget(subscription);
					createPlanMutation.reset();
					updatePlanMutation.reset();
					setPlanFormOpen(true);
				}}
			/>

			<SubscriptionFormSheet
				open={planFormOpen}
				onOpenChange={(open) => {
					setPlanFormOpen(open);
					if (!open) {
						setPlanEditTarget(null);
						createPlanMutation.reset();
						updatePlanMutation.reset();
					}
				}}
				onSubmit={(input) => {
					if (planEditTarget) {
						updatePlanMutation.mutate(input);
					} else {
						createPlanMutation.mutate(input);
					}
				}}
				isSubmitting={isPlanSubmitting}
				error={planMutationError}
				editTarget={planEditTarget}
			/>
		</PageShell>
	);
}
