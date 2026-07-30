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
import { ConfirmDialog } from "@/components/rbac";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import {
	type AdminsQueryParams,
	type AdminUser,
	type CreateAdminInput,
	createAdmin,
	fetchAdmins,
	revokeAdminRole,
	setUserStatus,
} from "@/services/admin";

export const Route = createFileRoute("/admin/user-management/admin")({
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

	/**
	 * Disabling an account and taking its admin role away are the two actions
	 * that had no way to be performed at all until 30 Jul 2026 — an account,
	 * once created, was permanent, and so was an admin.
	 *
	 * Both are confirmed rather than immediate, and both surface the SERVER's
	 * refusal verbatim: it declines self-disable, self-revoke and removing the
	 * last holder of a role, each with a sentence that explains itself. Showing
	 * a generic failure instead would hide the only thing worth reading.
	 */
	const [pending, setPending] = useState<{
		admin: AdminUser;
		kind: "status" | "revoke";
		next?: "active" | "inactive";
	} | null>(null);

	/**
	 * The dialog animates OUT after `pending` is cleared, and Radix keeps
	 * rendering its content while it does. Reading `pending` directly there made
	 * the closing dialog flash "undefined will be able to sign in again" — the
	 * same defect this codebase keeps finding, one field short of a fact. So the
	 * copy is rendered from the last real target, which outlives the close.
	 */
	const [lastTarget, setLastTarget] = useState<{
		admin: AdminUser;
		kind: "status" | "revoke";
		next?: "active" | "inactive";
	} | null>(null);
	const open = (target: NonNullable<typeof pending>) => {
		setLastTarget(target);
		setPending(target);
	};
	const shown = pending ?? lastTarget;

	const settle = (message: string) => {
		queryClient.invalidateQueries({ queryKey: ["admin-users"] });
		setPending(null);
		toast.success(message);
	};
	const refuse = (err: unknown, fallback: string) => {
		setPending(null);
		// The server's sentence, not a generic failure: every refusal here explains
		// itself ("last account holding this role", "cannot change your own"), and
		// that explanation is the only useful part of the response.
		toast.error(toMutationError(err, fallback)?.message ?? fallback);
	};

	const statusMutation = useMutation({
		mutationFn: (vars: { id: string; next: "active" | "inactive" }) =>
			setUserStatus(vars.id, vars.next, logout),
		onSuccess: (r) => settle(r.message || "Account updated"),
		onError: (err) => refuse(err, "Could not change that account"),
	});

	const revokeMutation = useMutation({
		mutationFn: (id: string) => revokeAdminRole(id, logout),
		onSuccess: (r) => settle(r.message || "Admin role removed"),
		onError: (err) => refuse(err, "Could not remove that role"),
	});

	const busyUserId = statusMutation.isPending
		? statusMutation.variables?.id
		: revokeMutation.isPending
			? revokeMutation.variables
			: null;

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
				// The web auth context tracks only whether someone is signed in, not
				// WHO — so a row cannot be recognised as your own here. The action is
				// therefore offered on every row, and the server's refusal ("You
				// cannot change your own account status — ask another admin") is what
				// explains it. Pass a real id the moment the context carries one.
				currentUserId={null}
				busyUserId={busyUserId ?? null}
				onSetStatus={(admin, next) => open({ admin, kind: "status", next })}
				onRevokeAdmin={(admin) => open({ admin, kind: "revoke" })}
			/>

			<ConfirmDialog
				open={pending !== null}
				onOpenChange={(open) => {
					if (!open) setPending(null);
				}}
				title={
					shown?.kind === "revoke"
						? "Remove admin access?"
						: shown?.next === "inactive"
							? "Disable this account?"
							: "Re-enable this account?"
				}
				description={
					!shown
						? ""
						: shown.kind === "revoke"
							? `${shown.admin.displayName} keeps their account but loses admin access. Roles can be granted again afterwards.`
							: shown.next === "inactive"
								? `${shown.admin.displayName} will be signed out on their next request and cannot sign in again until this is undone. Nothing is deleted.`
								: `${shown.admin.displayName} will be able to sign in again.`
				}
				confirmLabel={shown?.kind === "revoke" ? "Remove access" : "Confirm"}
				isPending={statusMutation.isPending || revokeMutation.isPending}
				onConfirm={() => {
					if (!pending) return;
					if (pending.kind === "revoke") {
						revokeMutation.mutate(pending.admin.id);
					} else if (pending.next) {
						statusMutation.mutate({ id: pending.admin.id, next: pending.next });
					}
				}}
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
