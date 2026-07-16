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
			toast.success(response.message || "Module created successfully");
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
			toast.success(response.message || "Module updated successfully");
		},
	});

	const deactivateMutation = useMutation({
		mutationFn: (moduleId: string) => deactivateModule(moduleId, logout),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["rbac-modules"] });
			setDeactivateOpen(false);
			setSelectedModule(null);
			toast.success(response.message || "Module deactivated successfully");
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
		formMode === "edit" ? "Failed to update module" : "Failed to create module",
	);

	return (
		<PageShell>
			<PageHeader
				icon={LayoutGrid}
				title="Module Management"
				description="Manage application modules used to group permissions"
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
				title="Deactivate module"
				description={`Are you sure you want to deactivate "${selectedModule?.moduleName}"?`}
				confirmLabel="Deactivate"
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
