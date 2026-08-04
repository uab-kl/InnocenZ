import {
	AlertCircle,
	CheckCircle2,
	LayoutGrid,
	Loader2,
	MoreHorizontal,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
	XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate, getErrorMessage, statusColors } from "@/lib/utils";
import type { RbacModule, RbacPagination } from "@/services/rbac";

export type ModuleStatusFilter = "all" | "active" | "inactive";

interface ModulesTableProps {
	modules: RbacModule[];
	pagination: RbacPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	search: string;
	statusFilter: ModuleStatusFilter;
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: ModuleStatusFilter) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onCreateClick: () => void;
	onEditClick: (module: RbacModule) => void;
	onDeactivateClick: (module: RbacModule) => void;
}

export function ModulesTable({
	modules,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	search,
	statusFilter,
	onSearchChange,
	onStatusFilterChange,
	onPageChange,
	onRetry,
	onCreateClick,
	onEditClick,
	onDeactivateClick,
}: ModulesTableProps) {
	const showLoading = isLoading && modules.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							Modules
							{isFetching && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>
							Application modules used to group permissions.
						</CardDescription>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
						<div className="relative sm:w-56">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="Search modules…"
								className="pl-8"
								aria-label="Search modules by name"
							/>
						</div>
						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as ModuleStatusFilter)
							}
						>
							<SelectTrigger className="sm:w-40" aria-label="Filter by status">
								<SelectValue placeholder="Filter by status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All Status</SelectItem>
								<SelectItem value="active">Active</SelectItem>
								<SelectItem value="inactive">Inactive</SelectItem>
							</SelectContent>
						</Select>
						<Button onClick={onCreateClick} className="shrink-0">
							<Plus className="mr-2 h-4 w-4" />
							Create Module
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Module Name</TableHead>
								<TableHead className="w-[120px]">Status</TableHead>
								<TableHead className="w-[180px]">Created</TableHead>
								<TableHead className="w-[60px]" />
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading modules...</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												Failed to load modules
											</p>
											<p className="text-sm text-muted-foreground">
												{getErrorMessage(error)}
											</p>
											<Button variant="outline" size="sm" onClick={onRetry}>
												<RefreshCw className="mr-2 h-4 w-4" />
												Try Again
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : modules.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<LayoutGrid className="h-6 w-6" />
											<span>No modules found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								modules.map((module) => (
									<TableRow key={module.moduleId}>
										<TableCell className="font-medium">
											{module.moduleName}
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className={`${statusColors[module.status]} flex w-fit items-center gap-1 capitalize`}
											>
												{module.status === "active" ? (
													<CheckCircle2 className="h-3 w-3" />
												) : (
													<XCircle className="h-3 w-3" />
												)}
												{module.status}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatDate(module.createdAt)}
										</TableCell>
										<TableCell>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														aria-label={`Actions for ${module.moduleName}`}
													>
														<MoreHorizontal className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem onClick={() => onEditClick(module)}>
														<Pencil className="mr-2 h-4 w-4" />
														Edit
													</DropdownMenuItem>
													{module.status === "active" && (
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onClick={() => onDeactivateClick(module)}
														>
															<Trash2 className="mr-2 h-4 w-4" />
															Deactivate
														</DropdownMenuItem>
													)}
												</DropdownMenuContent>
											</DropdownMenu>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>

				{pagination && pagination.totalCount > 0 && (
					<div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
						<div>
							Showing{" "}
							<span className="font-medium">
								{(pagination.page - 1) * pageSize + 1}
							</span>{" "}
							-{" "}
							<span className="font-medium">
								{Math.min(pagination.page * pageSize, pagination.totalCount)}
							</span>{" "}
							of <span className="font-medium">{pagination.totalCount}</span>{" "}
							modules
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasPrevPage || isFetching}
								onClick={() => onPageChange(page - 1)}
							>
								Previous
							</Button>
							<span>
								Page {pagination.page} of {pagination.totalPages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasNextPage || isFetching}
								onClick={() => onPageChange(page + 1)}
							>
								Next
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
