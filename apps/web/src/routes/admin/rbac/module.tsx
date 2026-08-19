import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import {
	ConfirmDialog,
	ModuleFormSheet,
	type ModuleStatusFilter,
	ModulesTable,
} from "@/components/rbac";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	type CreateModuleInput,
	createModule,
	deactivateModule,
	fetchModules,
	type ModulesQueryParams,
	type RbacModule,
	updateModule,
} from "@/services/rbac";

export const Route = createFileRoute("/admin/rbac/module")({
	component: ModulePage,
	head: () => ({
		meta: [{ title: "Module — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;

function ModulePage() {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const queryClient = useQueryClient();
	const [statusFilter, setStatusFilter] = useState<ModuleStatusFilter>("all");
	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [currentPage, setCurrentPage] = useState(1);
	const [formOpen, setFormOpen] = useState(false);
	const [formMode, setFormMode] = useState<"create" | "edit">("create");
	const [selectedModule, setSelectedModule] = useState<RbacModule | null>(null);
	const [deactivateOpen, setDeactivateOpen] = useState(false);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
			setCurrentPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const queryParams: ModulesQueryParams = {
		page: currentPage,
		pageSize: PAGE_SIZE,
	};
	if (statusFilter !== "all") queryParams.status = statusFilter;
	if (debouncedSearch) queryParams.moduleName = debouncedSearch;

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["rbac-modules", queryParams],
		queryFn: () => fetchModules(queryParams, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const createMutation = useMutation({
		mutationFn: (input: CreateModuleInput) => createModule(input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-modules"] });
			setFormOpen(false);
			toast.success(response.message || t.rbac.moduleCreated);
		},
	});

	const updateMutation = useMutation({
		mutationFn: ({
			moduleId,
			input,
		}: {
			moduleId: string;
			input: CreateModuleInput;
		}) => updateModule(moduleId, input, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-modules"] });
			setFormOpen(false);
			setSelectedModule(null);
			toast.success(response.message || t.rbac.moduleUpdated);
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (moduleId: string) => deactivateModule(moduleId, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-modules"] });
			setDeactivateOpen(false);
			setSelectedModule(null);
			toast.success(response.message || t.rbac.moduleDeactivated);
		},
	});

	const handleFormSubmit = (input: CreateModuleInput) => {
		if (formMode === "edit" && selectedModule) {
			updateMutation.mutate({ moduleId: selectedModule.moduleId, input });
			return;
		}
		createMutation.mutate(input);
	};

	const formError = toMutationError(
		formMode === "edit" ? updateMutation.error : createMutation.error,
		formMode === "edit" ? t.rbac.moduleUpdateFailed : t.rbac.moduleCreateFailed,
	);

	return (
		<PageShell>
			<PageHeader
				icon={LayoutGrid}
				title={t.rbac.sectionModulesTitle}
				description={t.rbac.modulesSubtitle}
			/>

			<ModulesTable
				modules={data?.data ?? []}
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
				onCreateClick={() => {
					setFormMode("create");
					setSelectedModule(null);
					setFormOpen(true);
				}}
				onEditClick={(module) => {
					setFormMode("edit");
					setSelectedModule(module);
					setFormOpen(true);
				}}
				onDeactivateClick={(module) => {
					setSelectedModule(module);
					setDeactivateOpen(true);
				}}
			/>

			<ModuleFormSheet
				open={formOpen}
				onOpenChange={(open) => {
					setFormOpen(open);
					if (!open) {
						createMutation.reset();
						updateMutation.reset();
						setSelectedModule(null);
					}
				}}
				mode={formMode}
				module={selectedModule}
				onSubmit={handleFormSubmit}
				isSubmitting={createMutation.isPending || updateMutation.isPending}
				error={formError}
			/>

			<ConfirmDialog
				open={deactivateOpen}
				onOpenChange={(open) => {
					setDeactivateOpen(open);
					if (!open) {
						deactivateMutation.reset();
						setSelectedModule(null);
					}
				}}
				title={t.rbac.deactivateModule}
				description={fill(t.rbac.deactivateConfirm, {
					name: selectedModule?.moduleName ?? "",
				})}
				confirmLabel={t.rbac.deactivate}
				onConfirm={() => {
					if (selectedModule) {
						deactivateMutation.mutate(selectedModule.moduleId);
					}
				}}
				isPending={deactivateMutation.isPending}
			/>
		</PageShell>
	);
}
