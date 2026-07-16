import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { type PrStatusFilter, PrsTable } from "@/components/pr";
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { fetchAgencies } from "@/services/agency";
import { fetchPrUsers, type PrUsersQueryParams } from "@/services/pr";

export const Route = createFileRoute("/admin/user-management/pr")({
	component: PrUsersPage,
	head: () => ({
		meta: [{ title: "PR Users — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function PrUsersPage() {
	const type = getUserTypeByKey("pr")!;
	const { logout } = useAuth();
	const [statusFilter, setStatusFilter] = useState<PrStatusFilter>("all");
	const [agencyFilter, setAgencyFilter] = useState("all");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [currentPage, setCurrentPage] = useState(1);

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

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={type.title}
				description={type.description}
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
			/>
		</PageShell>
	);
}
