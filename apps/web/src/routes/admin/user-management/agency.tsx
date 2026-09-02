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
	AgenciesTable,
	AgencyDetailsSheet,
	type OrgStatusFilter,
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
	type AgenciesQueryParams,
	approveAgency,
	deactivateAgency,
	fetchAgencies,
	fetchAgencyById,
} from "@/services/agency";

export const Route = createFileRoute("/admin/user-management/agency")({
	component: AgencyOrgsPage,
	validateSearch: (search: Record<string, unknown>): { focus?: string } =>
		typeof search.focus === "string" ? { focus: search.focus } : {},
	/*
	 * Document title stays ENGLISH — the same reason as the outlet tab: `head()`
	 * is route metadata, evaluated outside React, so there is no locale context
	 * to read and no hook that could reach one.
	 */
	head: () => ({
		meta: [{ title: "Agency Organizations — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function AgencyOrgsPage() {
	const { t } = usePortalLocale();
	const type = getUserTypeByKey("agency")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const { focus } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [statusFilter, setStatusFilter] = useState<OrgStatusFilter>("all");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);

	// Deep link from Pending Approvals: /admin/user-management/agency?focus=<id>
	useEffect(() => {
		if (focus) setSelectedId(focus);
	}, [focus]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
			setCurrentPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const queryParams: AgenciesQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (debouncedSearch) queryParams.name = debouncedSearch;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["agencies", queryParams],
		queryFn: () => fetchAgencies(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const selectedFromList =
		data?.data.find((agency) => agency.id === selectedId) ?? null;

	const selectedQuery = useQuery({
		queryKey: ["agency-by-id", selectedId],
		queryFn: () => fetchAgencyById(selectedId!, logout),
		enabled: Boolean(selectedId) && !selectedFromList,
		staleTime: 30_000,
	});

	const selectedAgency = selectedFromList ?? selectedQuery.data?.data ?? null;

	const closeDetails = () => {
		setSelectedId(null);
		if (focus) navigate({ search: { focus: undefined }, replace: true });
	};

	const approveMutation = useMutation({
		mutationFn: (id: string) => approveAgency(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["agencies"] });
			queryClient.invalidateQueries({ queryKey: ["agency-by-id"] });
			toast.success(response.message || t.adminUsers.agencyApproved);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.adminUsers.agencyApproveFailed)?.message ??
					t.adminUsers.agencyApproveFailed,
			);
		},
		onSettled: () => setActionId(null),
	});

	/**
	 * The hard off switch. `inactive` is the one status the auth layer refuses,
	 * so every account in the organisation is signed out and refused at login
	 * until Reactivate. The server's own sentence is what the admin sees.
	 */
	const deactivateMutation = useMutation({
		mutationFn: (id: string) => deactivateAgency(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["agencies"] });
			queryClient.invalidateQueries({ queryKey: ["agency-by-id"] });
			toast.success(response.message || t.adminUsers.agencyDeactivated);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, t.adminUsers.agencyDeactivateFailed)?.message ??
					t.adminUsers.agencyDeactivateFailed,
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

			<AgenciesTable
				agencies={data?.data ?? []}
				pagination={data?.pagination}
				page={currentPage}
				pageSize={PAGE_SIZE}
				isLoading={isLoading}
				isFetching={isFetching}
				isError={isError}
				error={error as Error | null}
				search={searchInput}
				statusFilter={statusFilter}
				onSearchChange={setSearchInput}
				onStatusFilterChange={(value) => {
					setStatusFilter(value);
					setCurrentPage(1);
				}}
				onPageChange={setCurrentPage}
				onRetry={() => refetch()}
				onApprove={(id) => approveMutation.mutate(id)}
				onDeactivate={(id) => deactivateMutation.mutate(id)}
				onSelect={(agency) => setSelectedId(agency.id)}
				actionId={actionId}
			/>

			<AgencyDetailsSheet
				agency={selectedAgency}
				open={Boolean(selectedId)}
				onOpenChange={(open) => {
					if (!open) closeDetails();
				}}
				onApprove={(id) => approveMutation.mutate(id)}
				onDeactivate={(id) => deactivateMutation.mutate(id)}
				actionId={actionId}
			/>
		</PageShell>
	);
}
