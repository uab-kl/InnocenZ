import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { PrDetailsSheet, type PrStatusFilter, PrsTable } from "@/components/pr";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAccountActions } from "@/hooks/use-account-actions";
import { useAuth } from "@/lib/auth-context";
import {
	adminNavLabel,
	userTypeDescription,
} from "@/lib/portal-i18n/admin-nav-label";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { fetchAgencies } from "@/services/agency";
import {
	fetchPrUsers,
	type PrUser,
	type PrUsersQueryParams,
} from "@/services/pr";

export const Route = createFileRoute("/admin/user-management/pr")({
	component: PrUsersPage,
	head: () => ({
		meta: [{ title: "PR Users — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

// `t` is threaded in rather than read here: this is module scope, where no hook
// can run, and the last fallback is the only part of the target that is COPY
// rather than data. The three before it are the account's own stored names.
const toTarget = (user: PrUser, t: PortalTranslations) => ({
	id: user.id,
	// The legal name is the one an admin can act on with confidence; the display
	// name is whatever the PR chose. Fall back rather than render an empty
	// confirm — a sentence about nobody is worse than a clumsy one.
	name:
		user.legalName ||
		user.displayName ||
		user.email ||
		t.adminUsers.thisAccount,
	status: user.status,
});

function PrUsersPage() {
	const { t } = usePortalLocale();
	const type = getUserTypeByKey("pr")!;
	const { logout } = useAuth();
	const [statusFilter, setStatusFilter] = useState<PrStatusFilter>("all");
	const [agencyFilter, setAgencyFilter] = useState("all");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
			setCurrentPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const agenciesQuery = useQuery({
		queryKey: ["agencies-options"],
		queryFn: () =>
			fetchAgencies({ page: 1, pageSize: 100, status: "active" }, logout),
		staleTime: 60_000,
	});

	const queryParams: PrUsersQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (agencyFilter !== "all") queryParams.agencyId = agencyFilter;
	if (debouncedSearch) queryParams.search = debouncedSearch;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["pr-users", queryParams],
		queryFn: () => fetchPrUsers(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	/**
	 * The same two controls the admin tab got on 30 Jul, on the tab where they
	 * matter most: PR accounts are the ones created in bulk and the ones that
	 * leave. Both endpoints are role-agnostic, so nothing here is PR-specific
	 * except which role a revoke takes back.
	 *
	 * `legacy-members` is invalidated alongside the list because a disabled PR
	 * lands on that tab — leaving it stale would show the account in both places
	 * at once, in two different states.
	 */
	const accountActions = useAccountActions({
		roleName: "pr",
		roleLabel: t.admin.rolePrAccess,
		queryKeys: ["pr-users", "legacy-members"],
	});

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={adminNavLabel(`sidebar-user-${type.key}`, type.title, t)}
				description={userTypeDescription(type.key, type.description, t)}
			/>

			<PrsTable
				users={data?.data ?? []}
				pagination={data?.pagination}
				page={currentPage}
				pageSize={PAGE_SIZE}
				isLoading={isLoading}
				isFetching={isFetching}
				isError={isError}
				error={error as Error | null}
				search={searchInput}
				statusFilter={statusFilter}
				agencyFilter={agencyFilter}
				agencies={agenciesQuery.data?.data ?? []}
				onSearchChange={setSearchInput}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setCurrentPage(1);
				}}
				onAgencyFilterChange={(value) => {
					setAgencyFilter(value);
					setCurrentPage(1);
				}}
				onPageChange={setCurrentPage}
				onRetry={() => refetch()}
				onSelect={(user) => setSelectedId(user.id)}
				busyUserId={accountActions.busyUserId}
				onSetStatus={(user, next) =>
					accountActions.askSetStatus(toTarget(user, t), next)
				}
				onRevokeRole={(user) => accountActions.askRevokeRole(toTarget(user, t))}
			/>

			{accountActions.dialog}

			<PrDetailsSheet
				user={data?.data.find((user) => user.id === selectedId) ?? null}
				open={Boolean(selectedId)}
				onOpenChange={(open) => {
					if (!open) setSelectedId(null);
				}}
				busy={accountActions.busyUserId === selectedId}
				onSetStatus={(next) => {
					const user = data?.data.find((row) => row.id === selectedId);
					if (user) accountActions.askSetStatus(toTarget(user, t), next);
				}}
			/>
		</PageShell>
	);
}
