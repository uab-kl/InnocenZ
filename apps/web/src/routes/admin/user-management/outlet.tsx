import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { type OrgStatusFilter, OutletsTable } from "@/components/organization";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	approveOutlet,
	fetchOutlets,
	type OutletsQueryParams,
	suspendOutlet,
} from "@/services/outlet";

export const Route = createFileRoute("/admin/user-management/outlet")({
	component: OutletOrgsPage,
	head: () => ({
		meta: [{ title: "Outlet Organizations — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function OutletOrgsPage() {
	const type = getUserTypeByKey("outlet")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);

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

	const approveMutation = useMutation({
		mutationFn: (id: string) => approveOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			toast.success(response.message || "Outlet approved");
		},
		onError: (err) => {
			toast.error(toMutationError(err, "Failed to approve outlet").message);
		},
		onSettled: () => setActionId(null),
	});

	const suspendMutation = useMutation({
		mutationFn: (id: string) => suspendOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			toast.success(response.message || "Outlet suspended");
		},
		onError: (err) => {
			toast.error(toMutationError(err, "Failed to suspend outlet").message);
		},
		onSettled: () => setActionId(null),
	});

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={type.title}
				description={type.description}
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
				actionId={actionId}
			/>
		</PageShell>
	);
}
