import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
	type AdminStatusFilter,
	AdminsTable,
	CreateAdminSheet,
} from "@/components/admin";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	type AdminsQueryParams,
	type CreateAdminInput,
	createAdmin,
	fetchAdmins,
} from "@/services/admin";

export const Route = createFileRoute("/(admin)/user-management/admin")({
	component: AdminUsersPage,
	head: () => ({
		meta: [{ title: "Admin Users — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function AdminUsersPage() {
	const type = getUserTypeByKey("admin")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<AdminStatusFilter>("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [createOpen, setCreateOpen] = useState(false);

	const queryParams: AdminsQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["admin-users", queryParams],
		queryFn: () => fetchAdmins(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const createMutation = useMutation({
		mutationFn: (input: CreateAdminInput) => createAdmin(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
			setCreateOpen(false);
			toast.success(response.message || "Admin user created successfully");
		},
	});

	const handleCreateSubmit = (input: CreateAdminInput) => {
		createMutation.mutate(input);
	};

	const handleCreateOpenChange = (open: boolean) => {
		setCreateOpen(open);
		if (!open) createMutation.reset();
	};

	const createError = toMutationError(
		createMutation.error,
		"Failed to create admin user",
	);

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={type.title}
				description={type.description}
			/>

			<AdminsTable
				admins={data?.data ?? []}
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
				onCreateClick={() => setCreateOpen(true)}
			/>

			<CreateAdminSheet
				open={createOpen}
				onOpenChange={handleCreateOpenChange}
				onSubmit={handleCreateSubmit}
				isSubmitting={createMutation.isPending}
				error={createError}
			/>
		</PageShell>
	);
}
