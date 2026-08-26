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
import {
	ConfirmDialog,
	RoleSheet,
	type RoleStatusFilter,
	RolesGrid,
} from "@/components/rbac";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	type CreateRoleInput,
	createRole,
	deleteRole,
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
	// The confirm lives at PAGE level, a sibling of the sheet — a Radix Dialog
	// nested inside the open Radix Sheet fights the sheet's focus trap.
	const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

	/**
	 * Delete, and say what the SERVER said.
	 *
	 * The refusals are the point: a seeded role, or one anything still
	 * references, comes back 409 with a sentence naming the way out ("3 accounts
	 * hold it"). Showing a generic "failed" would throw away the only useful part
	 * of the answer, so both paths surface `message`.
	 */
	const deleteMutation = useMutation({
		mutationFn: (roleId: string) => deleteRole(roleId, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-roles"] });
			queryClient.invalidateQueries({ queryKey: ["rbac-role-permissions"] });
			setDeleteConfirmOpen(false);
			closeSheet();
			toast.success(response.message || t.rbac.roleDeleted);
		},
		onError: (err) => {
			setDeleteConfirmOpen(false);
			toast.error(
				toMutationError(err, t.rbac.roleDeleteFailed)?.message ??
					t.rbac.roleDeleteFailed,
			);
		},
	});

	const closeSheet = () => {
		setSheetOpen(false);
		setSelectedRole(null);
		setDeleteConfirmOpen(false);
		createMutation.reset();
		saveManageMutation.reset();
		deleteMutation.reset();
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
				isSubmitting={
					createMutation.isPending ||
					saveManageMutation.isPending ||
					deleteMutation.isPending
				}
				error={sheetError}
				onRefreshFail={logout}
				onDelete={() => setDeleteConfirmOpen(true)}
			/>

			<ConfirmDialog
				open={deleteConfirmOpen}
				onOpenChange={setDeleteConfirmOpen}
				title={t.rbac.deleteRoleConfirmTitle}
				description={fill(t.rbac.deleteRoleConfirmBody, {
					name: selectedRole?.roleName ?? "",
				})}
				confirmLabel={t.rbac.deleteRole}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (!selectedRole) return;
					deleteMutation.mutate(selectedRole.roleId);
				}}
			/>
		</PageShell>
	);
}
