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
import { LimitTypeFormSheet } from "@/components/subscription/limit-type-form-sheet";
import {
	type LimitTypeStatusFilter,
	LimitTypesTable,
} from "@/components/subscription/limit-types-table";
import { SubscriptionFeatureFormSheet } from "@/components/subscription/subscription-feature-form-sheet";
import {
	type SubscriptionFeatureFilter,
	SubscriptionFeaturesTable,
} from "@/components/subscription/subscription-features-table";
import { SubscriptionFormSheet } from "@/components/subscription/subscription-form-sheet";
import {
	type BillingCycleFilter,
	type SubscriptionRoleFilter,
	type SubscriptionStatusFilter,
	SubscriptionsTable,
} from "@/components/subscription/subscriptions-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { fetchRoles } from "@/services/rbac";
import {
	type CreateLimitTypeInput,
	type CreateSubscriptionFeatureInput,
	type CreateSubscriptionInput,
	createLimitType,
	createSubscription,
	createSubscriptionFeature,
	deactivateLimitType,
	deleteSubscriptionFeature,
	fetchLimitTypes,
	fetchSubscriptionFeatures,
	fetchSubscriptions,
	type LimitType,
	type LimitTypesQueryParams,
	type Subscription,
	type SubscriptionFeature,
	type SubscriptionFeaturesQueryParams,
	type SubscriptionsQueryParams,
	updateLimitType,
	updateSubscription,
	updateSubscriptionFeature,
} from "@/services/subscription";

export const Route = createFileRoute("/admin/business/plan")({
	component: PlanPage,
	head: () => ({
		meta: [{ title: "Plan — Innocenz Admin" }],
	}),
});

type PlanTab = "plans" | "limit-types" | "features";

const PAGE_SIZE = 10;

function PlanPage() {
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [activeTab, setActiveTab] = useState<PlanTab>("plans");

	const [statusFilter, setStatusFilter] =
		useState<SubscriptionStatusFilter>("all");
	const [billingCycleFilter, setBillingCycleFilter] =
		useState<BillingCycleFilter>("all");
	const [roleFilter, setRoleFilter] = useState<SubscriptionRoleFilter>("all");
	const [plansPage, setPlansPage] = useState(1);
	const [planFormOpen, setPlanFormOpen] = useState(false);
	const [planEditTarget, setPlanEditTarget] = useState<Subscription | null>(
		null,
	);

	const [limitTypeStatusFilter, setLimitTypeStatusFilter] =
		useState<LimitTypeStatusFilter>("all");
	const [limitTypesPage, setLimitTypesPage] = useState(1);
	const [limitTypeFormOpen, setLimitTypeFormOpen] = useState(false);
	const [limitTypeEditTarget, setLimitTypeEditTarget] =
		useState<LimitType | null>(null);

	const [featureSubscriptionFilter, setFeatureSubscriptionFilter] =
		useState<SubscriptionFeatureFilter>("all");
	const [featureRoleFilter, setFeatureRoleFilter] =
		useState<SubscriptionFeatureFilter>("all");
	const [featureLimitTypeFilter, setFeatureLimitTypeFilter] =
		useState<SubscriptionFeatureFilter>("all");
	const [featuresPage, setFeaturesPage] = useState(1);
	const [featureFormOpen, setFeatureFormOpen] = useState(false);
	const [featureEditTarget, setFeatureEditTarget] =
		useState<SubscriptionFeature | null>(null);

	const plansQueryParams: SubscriptionsQueryParams = {
		page: plansPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") plansQueryParams.status = statusFilter;
	if (billingCycleFilter !== "all")
		plansQueryParams.billingCycle = billingCycleFilter;
	if (roleFilter !== "all") plansQueryParams.roleId = roleFilter;

	const limitTypesQueryParams: LimitTypesQueryParams = {
		page: limitTypesPage,
		pageSize: PAGE_SIZE,
	};
	if (limitTypeStatusFilter !== "all")
		limitTypesQueryParams.status = limitTypeStatusFilter;

	const featuresQueryParams: SubscriptionFeaturesQueryParams = {
		page: featuresPage,
		pageSize: PAGE_SIZE,
	};
	if (featureSubscriptionFilter !== "all")
		featuresQueryParams.subscriptionId = featureSubscriptionFilter;
	if (featureRoleFilter !== "all")
		featuresQueryParams.roleId = featureRoleFilter;
	if (featureLimitTypeFilter !== "all")
		featuresQueryParams.limitTypeId = featureLimitTypeFilter;

	const rolesQuery = useQuery({
		queryKey: ["rbac-roles", "plan-page"],
		queryFn: () => fetchRoles({ status: "active", pageSize: 100 }, logout),
		staleTime: 60_000,
		enabled: activeTab === "plans" || activeTab === "features",
	});

	const roleOptions =
		rolesQuery.data?.data.map((role) => ({
			id: role.roleId,
			roleName: role.roleName,
		})) ?? [];

	const roleNameById = new Map(
		roleOptions.map((role) => [role.id, role.roleName]),
	);

	// Plans apply to outlets and agencies only — restrict the plan role filter.
	const planRoleOptions = roleOptions.filter(
		(role) => role.roleName === "agency" || role.roleName === "outlet",
	);

	const allPlansQuery = useQuery({
		queryKey: ["subscriptions", "dropdown"],
		queryFn: () =>
			fetchSubscriptions({ status: "active", pageSize: 100 }, logout),
		staleTime: 60_000,
		enabled: activeTab === "features" || featureFormOpen,
	});

	const subscriptionOptions =
		allPlansQuery.data?.data.map((sub) => ({ id: sub.id, name: sub.name })) ??
		[];

	const subscriptionNameById = new Map(
		subscriptionOptions.map((sub) => [sub.id, sub.name]),
	);

	const allLimitTypesQuery = useQuery({
		queryKey: ["limit-types", "dropdown"],
		queryFn: () => fetchLimitTypes({ status: "active", pageSize: 100 }, logout),
		staleTime: 60_000,
		enabled: activeTab === "features" || featureFormOpen,
	});

	const limitTypeOptions =
		allLimitTypesQuery.data?.data.map((lt) => ({ id: lt.id, name: lt.name })) ??
		[];

	const limitTypes = allLimitTypesQuery.data?.data ?? [];

	const limitTypeNameById = new Map(
		limitTypeOptions.map((lt) => [lt.id, lt.name]),
	);

	const plansQuery = useQuery({
		queryKey: ["subscriptions", plansQueryParams],
		queryFn: () => fetchSubscriptions(plansQueryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
		enabled: activeTab === "plans",
	});

	const limitTypesQuery = useQuery({
		queryKey: ["limit-types", limitTypesQueryParams],
		queryFn: () => fetchLimitTypes(limitTypesQueryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
		enabled: activeTab === "limit-types",
	});

	const featuresQuery = useQuery({
		queryKey: ["subscription-features", featuresQueryParams],
		queryFn: () => fetchSubscriptionFeatures(featuresQueryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
		enabled: activeTab === "features",
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

	const createLimitTypeMutation = useMutation({
		mutationFn: (input: CreateLimitTypeInput) => createLimitType(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["limit-types"] });
			setLimitTypeFormOpen(false);
			toast.success(response.message || "Limit type created successfully");
		},
	});

	const updateLimitTypeMutation = useMutation({
		mutationFn: (input: CreateLimitTypeInput) =>
			updateLimitType(limitTypeEditTarget!.id, input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["limit-types"] });
			setLimitTypeFormOpen(false);
			toast.success(response.message || "Limit type updated successfully");
		},
	});

	const deactivateLimitTypeMutation = useMutation({
		mutationFn: (id: string) => deactivateLimitType(id, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["limit-types"] });
			toast.success(response.message || "Limit type deactivated successfully");
		},
	});

	const createFeatureMutation = useMutation({
		mutationFn: (input: CreateSubscriptionFeatureInput) =>
			createSubscriptionFeature(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-features"] });
			setFeatureFormOpen(false);
			toast.success(response.message || "Feature created successfully");
		},
	});

	const updateFeatureMutation = useMutation({
		mutationFn: (input: CreateSubscriptionFeatureInput) =>
			updateSubscriptionFeature(featureEditTarget!.id, input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-features"] });
			setFeatureFormOpen(false);
			toast.success(response.message || "Feature updated successfully");
		},
	});

	const deleteFeatureMutation = useMutation({
		mutationFn: (id: string) => deleteSubscriptionFeature(id, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["subscription-features"] });
			toast.success(response.message || "Feature deleted successfully");
		},
	});

	const isPlanSubmitting =
		createPlanMutation.isPending || updatePlanMutation.isPending;
	const planMutationError = toMutationError(
		planEditTarget ? updatePlanMutation.error : createPlanMutation.error,
		planEditTarget ? "Failed to update plan" : "Failed to create plan",
	);

	const isLimitTypeSubmitting =
		createLimitTypeMutation.isPending || updateLimitTypeMutation.isPending;
	const limitTypeMutationError = toMutationError(
		limitTypeEditTarget
			? updateLimitTypeMutation.error
			: createLimitTypeMutation.error,
		limitTypeEditTarget
			? "Failed to update limit type"
			: "Failed to create limit type",
	);

	const isFeatureSubmitting =
		createFeatureMutation.isPending || updateFeatureMutation.isPending;
	const featureMutationError = toMutationError(
		featureEditTarget
			? updateFeatureMutation.error
			: createFeatureMutation.error,
		featureEditTarget ? "Failed to update feature" : "Failed to create feature",
	);

	return (
		<PageShell>
			<PageHeader
				icon={CreditCard}
				title="Plan"
				description="Manage plans, limit types, and feature assignments."
			/>

			<Tabs
				value={activeTab}
				onValueChange={(value) => setActiveTab(value as PlanTab)}
				className="space-y-6"
			>
				<TabsList>
					<TabsTrigger value="plans">Plans</TabsTrigger>
					<TabsTrigger value="limit-types">Limit Types</TabsTrigger>
					<TabsTrigger value="features">Features</TabsTrigger>
				</TabsList>

				<TabsContent value="plans" className="mt-0">
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
						roleFilter={roleFilter}
						roleOptions={planRoleOptions}
						onStatusFilterChange={(value) => {
							setStatusFilter(value);
							setPlansPage(1);
						}}
						onBillingCycleFilterChange={(value) => {
							setBillingCycleFilter(value);
							setPlansPage(1);
						}}
						onRoleFilterChange={(value) => {
							setRoleFilter(value);
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
				</TabsContent>

				<TabsContent value="limit-types" className="mt-0">
					<LimitTypesTable
						limitTypes={limitTypesQuery.data?.data ?? []}
						pagination={limitTypesQuery.data?.pagination}
						page={limitTypesPage}
						pageSize={PAGE_SIZE}
						isLoading={limitTypesQuery.isLoading}
						isFetching={limitTypesQuery.isFetching}
						isError={limitTypesQuery.isError}
						error={limitTypesQuery.error as Error | null}
						statusFilter={limitTypeStatusFilter}
						onStatusFilterChange={(value) => {
							setLimitTypeStatusFilter(value);
							setLimitTypesPage(1);
						}}
						onPageChange={setLimitTypesPage}
						onRetry={() => limitTypesQuery.refetch()}
						onCreateClick={() => {
							setLimitTypeEditTarget(null);
							createLimitTypeMutation.reset();
							updateLimitTypeMutation.reset();
							setLimitTypeFormOpen(true);
						}}
						onEditClick={(limitType) => {
							setLimitTypeEditTarget(limitType);
							createLimitTypeMutation.reset();
							updateLimitTypeMutation.reset();
							setLimitTypeFormOpen(true);
						}}
						onDeactivateClick={(limitType) => {
							if (
								window.confirm(
									`Deactivate limit type "${limitType.name}"? This cannot be undone from the UI.`,
								)
							) {
								deactivateLimitTypeMutation.mutate(limitType.id);
							}
						}}
					/>
				</TabsContent>

				<TabsContent value="features" className="mt-0">
					<SubscriptionFeaturesTable
						features={featuresQuery.data?.data ?? []}
						pagination={featuresQuery.data?.pagination}
						page={featuresPage}
						pageSize={PAGE_SIZE}
						isLoading={featuresQuery.isLoading}
						isFetching={featuresQuery.isFetching}
						isError={featuresQuery.isError}
						error={featuresQuery.error as Error | null}
						subscriptionFilter={featureSubscriptionFilter}
						roleFilter={featureRoleFilter}
						limitTypeFilter={featureLimitTypeFilter}
						subscriptionOptions={subscriptionOptions}
						roleOptions={roleOptions}
						limitTypeOptions={limitTypeOptions}
						limitTypes={limitTypes}
						subscriptionNameById={subscriptionNameById}
						roleNameById={roleNameById}
						limitTypeNameById={limitTypeNameById}
						onSubscriptionFilterChange={(value) => {
							setFeatureSubscriptionFilter(value);
							setFeaturesPage(1);
						}}
						onRoleFilterChange={(value) => {
							setFeatureRoleFilter(value);
							setFeaturesPage(1);
						}}
						onLimitTypeFilterChange={(value) => {
							setFeatureLimitTypeFilter(value);
							setFeaturesPage(1);
						}}
						onPageChange={setFeaturesPage}
						onRetry={() => featuresQuery.refetch()}
						onCreateClick={() => {
							setFeatureEditTarget(null);
							createFeatureMutation.reset();
							updateFeatureMutation.reset();
							setFeatureFormOpen(true);
						}}
						onEditClick={(feature) => {
							setFeatureEditTarget(feature);
							createFeatureMutation.reset();
							updateFeatureMutation.reset();
							setFeatureFormOpen(true);
						}}
						onDeleteClick={(feature) => {
							const subName = resolveFeatureLabel(
								feature.subscriptionId,
								subscriptionNameById,
							);
							const roleName = feature.roleId
								? (roleNameById.get(feature.roleId) ?? feature.roleId)
								: "—";
							const ltName = resolveFeatureLabel(
								feature.limitTypeId,
								limitTypeNameById,
							);
							if (
								window.confirm(
									`Delete feature linking "${subName}" / "${roleName}" / "${ltName}"?`,
								)
							) {
								deleteFeatureMutation.mutate(feature.id);
							}
						}}
					/>
				</TabsContent>
			</Tabs>

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

			<LimitTypeFormSheet
				open={limitTypeFormOpen}
				onOpenChange={(open) => {
					setLimitTypeFormOpen(open);
					if (!open) {
						setLimitTypeEditTarget(null);
						createLimitTypeMutation.reset();
						updateLimitTypeMutation.reset();
					}
				}}
				onSubmit={(input) => {
					if (limitTypeEditTarget) {
						updateLimitTypeMutation.mutate(input);
					} else {
						createLimitTypeMutation.mutate(input);
					}
				}}
				isSubmitting={isLimitTypeSubmitting}
				error={limitTypeMutationError}
				editTarget={limitTypeEditTarget}
			/>

			<SubscriptionFeatureFormSheet
				open={featureFormOpen}
				onOpenChange={(open) => {
					setFeatureFormOpen(open);
					if (!open) {
						setFeatureEditTarget(null);
						createFeatureMutation.reset();
						updateFeatureMutation.reset();
					}
				}}
				onSubmit={(input) => {
					if (featureEditTarget) {
						updateFeatureMutation.mutate(input);
					} else {
						createFeatureMutation.mutate(input);
					}
				}}
				isSubmitting={isFeatureSubmitting}
				error={featureMutationError}
				editTarget={featureEditTarget}
				subscriptionOptions={subscriptionOptions}
				roleOptions={roleOptions}
				limitTypeOptions={limitTypeOptions}
				limitTypes={limitTypes}
			/>
		</PageShell>
	);
}

function resolveFeatureLabel(
	id: string | null,
	lookup: Map<string, string>,
): string {
	if (!id) return "—";
	return lookup.get(id) ?? id;
}
