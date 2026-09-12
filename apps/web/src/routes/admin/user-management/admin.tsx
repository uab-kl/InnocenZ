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
import {
	type AccountTarget,
	useAccountActions,
} from "@/hooks/use-account-actions";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	adminNavLabel,
	userTypeDescription,
} from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	type AdminsQueryParams,
	type AdminUser,
	type CreateAdminInput,
	createAdmin,
	fetchAdmins,
} from "@/services/admin";

export const Route = createFileRoute("/admin/user-management/admin")({
	component: AdminUsersPage,
	head: () => ({
		meta: [{ title: "Admin Users — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

const toTarget = (admin: AdminUser): AccountTarget => ({
	id: admin.id,
	name: admin.displayName,
	status: admin.status,
});

function AdminUsersPage() {
	const { t } = usePortalLocale();
	// WHO is signed in — so the table can mark your own row instead of offering
	// you actions the server will refuse.
	const { user: currentUser } = useCurrentUser();
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
			toast.success(response.message || t.admin.adminCreated);
		},
	});

	/**
	 * Disabling an account and taking its admin role away are the two actions
	 * that had no way to be performed at all until 30 Jul 2026 — an account,
	 * once created, was permanent, and so was an admin.
	 *
	 * Both are confirmed rather than immediate, and both surface the SERVER's
	 * refusal verbatim: it declines self-disable, self-revoke and removing the
	 * last holder of a role, each with a sentence that explains itself. Showing
	 * a generic failure instead would hide the only thing worth reading.
	 *
	 * The mechanics live in `useAccountActions` so the PR tab runs the same copy
	 * and the same refusal handling rather than a second implementation of them.
	 */
	const accountActions = useAccountActions({
		roleName: "admin",
		roleLabel: t.admin.roleAdminAccess,
		queryKeys: ["admin-users"],
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
		t.admin.adminCreateFailed,
	);

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={adminNavLabel(`sidebar-user-${type.key}`, type.title, t)}
				description={userTypeDescription(type.key, type.description, t)}
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
				/*
				 * ⚠️ THE COMMENT THAT USED TO SIT HERE WAS STALE, and the `null` it
				 * justified made this screen offer Disable and Remove Admin on the
				 * signed-in admin's OWN row — two buttons the server always refuses
				 * ("You cannot change your own account status — ask another admin").
				 *
				 * The context does carry WHO: `/auth/me` returns `id`, `use-profile`
				 * maps it, and `useCurrentUser()` exposes it — `admin/dashboard.tsx`
				 * already calls it in this same portal. With a real id the table's
				 * self-row branch renders "This is you" instead of dead actions.
				 */
				currentUserId={currentUser?.id ?? null}
				busyUserId={accountActions.busyUserId}
				onSetStatus={(admin, next) =>
					accountActions.askSetStatus(toTarget(admin), next)
				}
				onRevokeAdmin={(admin) => accountActions.askRevokeRole(toTarget(admin))}
			/>

			{accountActions.dialog}

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
