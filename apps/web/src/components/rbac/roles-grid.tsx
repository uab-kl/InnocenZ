import {
	AlertCircle,
	CheckCircle2,
	ChevronRight,
	Loader2,
	Plus,
	RefreshCw,
	Shield,
	XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn, getErrorMessage, statusColors } from "@/lib/utils";
import type { PortalCode, RbacPagination, RbacRole } from "@/services/rbac";

export type RoleStatusFilter = "all" | "active" | "inactive";

interface RolesGridProps {
	roles: RbacRole[];
	pagination?: RbacPagination;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	statusFilter: RoleStatusFilter;
	onStatusFilterChange: (value: RoleStatusFilter) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onCreateClick: () => void;
	onRoleClick: (role: RbacRole) => void;
}

type PortalGroupKey = PortalCode | "none";

const PORTAL_GROUPS: {
	key: PortalGroupKey;
	label: string;
	hint: string;
	accent: string;
	dot: string;
}[] = [
	{
		key: "admin",
		label: "Admin",
		hint: "Platform control",
		accent: "from-sky-500/20 via-sky-500/5 to-transparent",
		dot: "bg-sky-400",
	},
	{
		key: "agency",
		label: "Agency",
		hint: "Agency portal access",
		accent: "from-violet-500/20 via-violet-500/5 to-transparent",
		dot: "bg-violet-400",
	},
	{
		key: "outlet",
		label: "Outlet",
		hint: "Outlet portal access",
		accent: "from-amber-500/20 via-amber-500/5 to-transparent",
		dot: "bg-amber-400",
	},
	{
		key: "none",
		label: "Unassigned",
		hint: "No portal",
		accent: "from-muted-foreground/15 via-muted/5 to-transparent",
		dot: "bg-muted-foreground",
	},
];

function formatRoleName(name: string) {
	return name.replace(/_/g, " ");
}

function groupKey(role: RbacRole): PortalGroupKey {
	return role.portalCode ?? "none";
}

export function RolesGrid({
	roles,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	statusFilter,
	onStatusFilterChange,
	onPageChange,
	onRetry,
	onCreateClick,
	onRoleClick,
}: RolesGridProps) {
	const groups = PORTAL_GROUPS.map((meta) => ({
		...meta,
		roles: roles
			.filter((r) => groupKey(r) === meta.key)
			.sort((a, b) =>
				formatRoleName(a.roleName).localeCompare(formatRoleName(b.roleName)),
			),
	})).filter((g) => g.roles.length > 0);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center justify-end gap-2">
				{isFetching && (
					<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
				)}
				<Select
					value={statusFilter}
					onValueChange={(value) =>
						onStatusFilterChange(value as RoleStatusFilter)
					}
				>
					<SelectTrigger className="w-36" aria-label="Filter by status">
						<SelectValue placeholder="Status" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All status</SelectItem>
						<SelectItem value="active">Active</SelectItem>
						<SelectItem value="inactive">Inactive</SelectItem>
					</SelectContent>
				</Select>
				<Button onClick={onCreateClick} className="shrink-0">
					<Plus className="mr-2 h-4 w-4" />
					Create Role
				</Button>
			</div>

			{isLoading && roles.length === 0 ? (
				<div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-(--lavender-soft)/30 bg-card/50 text-muted-foreground">
					<Loader2 className="h-7 w-7 animate-spin" />
					<span className="text-sm">Loading roles…</span>
				</div>
			) : isError ? (
				<div className="flex min-h-56 flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-card/50">
					<AlertCircle className="h-9 w-9 text-destructive" />
					<div className="text-center">
						<p className="font-medium text-destructive">Failed to load roles</p>
						<p className="mt-1 text-sm text-muted-foreground">
							{getErrorMessage(error)}
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={onRetry}>
						<RefreshCw className="mr-2 h-4 w-4" />
						Try again
					</Button>
				</div>
			) : roles.length === 0 ? (
				<div className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-(--lavender-soft)/40 bg-card/40 text-muted-foreground">
					<Shield className="h-7 w-7 opacity-60" />
					<span className="text-sm">No roles yet</span>
				</div>
			) : (
				<div className="space-y-4">
					{groups.map((group) => (
						<section
							key={group.key}
							className="overflow-hidden rounded-2xl border border-(--lavender-soft)/30 bg-card"
						>
							<div
								className={cn(
									"flex items-center justify-between gap-3 border-b border-(--lavender-soft)/20 bg-gradient-to-r px-5 py-3.5",
									group.accent,
								)}
							>
								<div className="flex min-w-0 items-center gap-3">
									<span
										className={cn("h-2.5 w-2.5 shrink-0 rounded-full", group.dot)}
										aria-hidden
									/>
									<div className="min-w-0">
										<h2 className="text-base font-semibold tracking-tight text-foreground">
											{group.label}
										</h2>
										<p className="text-sm text-muted-foreground">{group.hint}</p>
									</div>
								</div>
								<span className="rounded-full border border-border/60 bg-background/50 px-3 py-1 text-sm font-medium text-muted-foreground tabular-nums">
									{group.roles.length}
								</span>
							</div>

							{group.roles.length === 0 ? (
								<p className="px-5 py-8 text-center text-base text-muted-foreground">
									No roles in this portal
								</p>
							) : (
								<ul className="divide-y divide-(--lavender-soft)/15">
									{group.roles.map((role) => (
										<li key={role.roleId}>
											<button
												type="button"
												onClick={() => onRoleClick(role)}
												className={cn(
													"group flex w-full items-center gap-3.5 px-5 py-4 text-left",
													"transition-colors hover:bg-[color:var(--lavender-soft)]/25",
													"focus-visible:outline-none focus-visible:bg-[color:var(--lavender-soft)]/30",
												)}
											>
												<span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-(--lavender-soft)/35 bg-background/60 text-lavender">
													<Shield className="h-5 w-5" />
												</span>
												<span className="min-w-0 flex-1 truncate text-lg font-semibold capitalize tracking-tight text-foreground">
													{formatRoleName(role.roleName)}
												</span>
												<Badge
													variant="outline"
													className={cn(
														statusColors[role.status],
														"shrink-0 gap-1.5 px-2.5 py-1 text-sm capitalize",
													)}
												>
													{role.status === "active" ? (
														<CheckCircle2 className="h-3.5 w-3.5" />
													) : (
														<XCircle className="h-3.5 w-3.5" />
													)}
													{role.status}
												</Badge>
												<ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-lavender" />
											</button>
										</li>
									))}
								</ul>
							)}
						</section>
					))}
				</div>
			)}

			{pagination && pagination.totalCount > 0 && (
				<div className="flex items-center justify-between text-sm text-muted-foreground">
					<div>
						Showing{" "}
						<span className="font-medium">
							{(pagination.page - 1) * pageSize + 1}
						</span>{" "}
						–{" "}
						<span className="font-medium">
							{Math.min(pagination.page * pageSize, pagination.totalCount)}
						</span>{" "}
						of <span className="font-medium">{pagination.totalCount}</span> roles
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
		</div>
	);
}
