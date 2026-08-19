import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Shield } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { RoleSheet, type RoleStatusFilter, RolesGrid } from "@/components/rbac";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	type CreateRoleInput,
	createRole,
	fetchRoles,
	type RbacRole,
	type RolesQueryParams,
	syncRolePermissions,
	updateRole,
} from "@/services/rbac";

export const Route = createFileRoute("/admin/rbac/role")({
	component: RolePage,
	head: () => ({
		meta: [{ title: "RBAC — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 50;

function RolePage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<RoleStatusFilter>("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [sheetOpen, setSheetOpen] = useState(false);
	const [sheetMode, setSheetMode] = useState<"create" | "manage">("create");
	const [selectedRole, setSelectedRole] = useState<RbacRole | null>(null);

	const queryParams: RolesQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["rbac-roles", queryParams],
		queryFn: () => fetchRoles(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const createMutation = useMutation({
		mutationFn: (input: CreateRoleInput) => createRole(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-roles"] });
			closeSheet();
			toast.success(response.message || t.rbac.roleCreated);
		},
	});

	const saveManageMutation = useMutation({
		mutationFn: async ({
			roleId,
			input,
			permissionIds,
		}: {
			roleId: string;
			input: CreateRoleInput;
			permissionIds: string[];
		}) => {
			const roleResponse = await updateRole(roleId, input, logout);
			const permissionsResponse = await syncRolePermissions(
				roleId,
				permissionIds,
				logout,
			);
			return { roleResponse, permissionsResponse };
		},
		onSuccess: ({ permissionsResponse }) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-roles"] });
			queryClient.invalidateQueries({ queryKey: ["rbac-role-permissions"] });
			closeSheet();
			toast.success(permissionsResponse.message || t.rbac.roleMatrixSaved);
		},
	});

	const closeSheet = () => {
		setSheetOpen(false);
		setSelectedRole(null);
		createMutation.reset();
		saveManageMutation.reset();
	};

	const sheetError = toMutationError(
		sheetMode === "manage" ? saveManageMutation.error : createMutation.error,
		sheetMode === "manage" ? t.rbac.roleUpdateFailed : t.rbac.roleCreateFailed,
	);

	return (
		<PageShell>
			<PageHeader icon={Shield} title={t.rbac.sectionRbacTitle} />

			<RolesGrid
				roles={data?.data ?? []}
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
				onCreateClick={() => {
					setSheetMode("create");
					setSelectedRole(null);
					setSheetOpen(true);
				}}
				onRoleClick={(role) => {
					setSheetMode("manage");
					setSelectedRole(role);
					setSheetOpen(true);
				}}
			/>

			<RoleSheet
				open={sheetOpen}
				onOpenChange={(open) => {
					if (!open) closeSheet();
					else setSheetOpen(true);
				}}
				mode={sheetMode}
				role={selectedRole}
				onCreate={(input) => createMutation.mutate(input)}
				onSaveManage={(input, permissionIds) => {
					if (!selectedRole) return;
					saveManageMutation.mutate({
						roleId: selectedRole.roleId,
						input,
						permissionIds,
					});
				}}
				isSubmitting={createMutation.isPending || saveManageMutation.isPending}
				error={sheetError}
				onRefreshFail={logout}
			/>
		</PageShell>
	);
}
