import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import {
	type OrgStatusFilter,
	OutletDetailsSheet,
	OutletsTable,
} from "@/components/organization";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	adminNavLabel,
	userTypeDescription,
} from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	approveOutlet,
	fetchOutletById,
	fetchOutlets,
	type OutletsQueryParams,
	suspendOutlet,
} from "@/services/outlet";

export const Route = createFileRoute("/admin/user-management/outlet")({
	component: OutletOrgsPage,
	validateSearch: (search: Record<string, unknown>): { focus?: string } =>
		typeof search.focus === "string" ? { focus: search.focus } : {},
	/*
	 * Document title stays ENGLISH. `head()` is route metadata, evaluated
	 * outside React, so it cannot read the locale context — and reading the
	 * stored preference directly would be wrong as often as right, because the
	 * account's `preferred_locale` overrides the local value after hydration.
	 * A browser-tab title in the wrong language is worse than one consistently
	 * in English.
	 */
	head: () => ({
		meta: [{ title: "Outlet Organizations — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function OutletOrgsPage() {
	const { t } = usePortalLocale();
	const type = getUserTypeByKey("outlet")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const { focus } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Deep link from Pending Approvals: /admin/user-management/outlet?focus=<id>
	useEffect(() => {
		if (focus) setSelectedId(focus);
	}, [focus]);

	const queryParams: OutletsQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["outlets", queryParams],
		queryFn: () => fetchOutlets(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const selectedFromList =
		data?.data.find((outlet) => outlet.id === selectedId) ?? null;

	const selectedQuery = useQuery({
		queryKey: ["outlet-by-id", selectedId],
		queryFn: () => fetchOutletById(selectedId!, logout),
		enabled: Boolean(selectedId) && !selectedFromList,
		staleTime: 30_000,
	});

	const selectedOutlet = selectedFromList ?? selectedQuery.data?.data ?? null;

	const closeDetails = () => {
		setSelectedId(null);
		if (focus) navigate({ search: { focus: undefined }, replace: true });
	};

	const approveMutation = useMutation({
		mutationFn: (id: string) => approveOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			queryClient.invalidateQueries({ queryKey: ["outlet-by-id"] });
			toast.success(response.message || t.admin.outletApproved);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.admin.outletApproveFailed)?.message ??
					t.admin.outletApproveFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	const suspendMutation = useMutation({
		mutationFn: (id: string) => suspendOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			queryClient.invalidateQueries({ queryKey: ["outlet-by-id"] });
			toast.success(response.message || t.admin.outletSuspended);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.admin.outletSuspendFailed)?.message ??
					t.admin.outletSuspendFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={adminNavLabel(`sidebar-user-${type.key}`, type.title, t)}
				description={userTypeDescription(type.key, type.description, t)}
			/>

			<OutletsTable
				outlets={data?.data ?? []}
				pagination={data?.pagination}
				page={currentPage}
				pageSize={PAGE_SIZE}
				isLoading={isLoading}
				isFetching={isFetching}
				isError={isError}
				error={error as Error | null}
				statusFilter={statusFilter}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setCurrentPage(1);
				}}
				onPageChange={setCurrentPage}
				onRetry={() => refetch()}
				onApprove={(id) => approveMutation.mutate(id)}
				onSuspend={(id) => suspendMutation.mutate(id)}
				onSelect={(outlet) => setSelectedId(outlet.id)}
				actionId={actionId}
			/>

			<OutletDetailsSheet
				outlet={selectedOutlet}
				open={Boolean(selectedId)}
				onOpenChange={(open) => {
					if (!open) closeDetails();
				}}
				onApprove={(id) => approveMutation.mutate(id)}
				onSuspend={(id) => suspendMutation.mutate(id)}
				actionId={actionId}
			/>
		</PageShell>
	);
}
