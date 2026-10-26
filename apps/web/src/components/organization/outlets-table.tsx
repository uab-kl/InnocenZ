import {
	AlertCircle,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	Search,
	Store,
} from "lucide-react";
import { AdminFilters } from "@/components/admin/admin-filters";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { Outlet, OutletPagination } from "@/services/outlet";
import {
	ORG_STATUSES,
	type OrgStatusFilter,
	orgStatusBadgeColors,
	orgStatusLabel,
} from "./org-status";

interface OutletsTableProps {
	outlets: Outlet[];
	pagination: OutletPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	statusFilter: OrgStatusFilter;
	onStatusFilterChange: (value: OrgStatusFilter) => void;
	/** Raw box contents — the route debounces before it becomes a query. */
	search: string;
	onSearchChange: (value: string) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onApprove: (id: string) => void;
	/** The off switch — `inactive`, refused at login until Activate. */
	onDeactivate: (id: string) => void;
	onSelect: (outlet: Outlet) => void;
	actionId: string | null;
}

export function OutletsTable({
	outlets,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	statusFilter,
	onStatusFilterChange,
	search,
	onSearchChange,
	onPageChange,
	onRetry,
	onApprove,
	onDeactivate,
	onSelect,
	actionId,
}: OutletsTableProps) {
	const { t } = usePortalLocale();
	const showLoading = isLoading && outlets.length === 0;

	return (
		<Card className="iz-admin-management-card border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{t.admin.outletOrganizations}
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>{t.admin.outletOrganizationsHint}</CardDescription>
					</div>

					{/* Same shape as the agency table's bar: the box sits BEFORE the
					    status select, so both org screens read identically. */}
					<AdminFilters>
						<div className="iz-admin-management-filters flex flex-col gap-2 sm:flex-row sm:items-center">
							<div className="relative sm:w-56">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(e) => onSearchChange(e.target.value)}
									placeholder={t.adminOrg.searchOutletsPlaceholder}
									className="pl-8"
									aria-label={t.adminOrg.searchOutletsAria}
								/>
							</div>
							<Select
								value={statusFilter}
								onValueChange={(value) =>
									onStatusFilterChange(value as OrgStatusFilter)
								}
							>
								<SelectTrigger
									className="sm:w-48"
									aria-label={t.admin.filterByStatus}
								>
									<SelectValue placeholder={t.admin.filterByStatus} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t.admin.allStatus}</SelectItem>
									{ORG_STATUSES.map((status) => (
										<SelectItem key={status} value={status}>
											{orgStatusLabel(status, t)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</AdminFilters>
				</div>
			</CardHeader>

			<CardContent>
				<div className="iz-admin-management-scroll overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table className="iz-admin-management-table">
						<TableHeader>
							<TableRow>
								<TableHead>
									{t.admin.colName} / {t.admin.colLocation}
								</TableHead>
								<TableHead>{t.admin.colSsmLicense}</TableHead>
								<TableHead>
									{t.admin.colStatus} / {t.admin.colCreated}
								</TableHead>
								<TableHead>{t.admin.colActions}</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>{t.admin.loadingOutlets}</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												{t.admin.failedToLoadOutlets}
											</p>
											<p className="text-sm text-muted-foreground">
												{getErrorMessage(error)}
											</p>
											<Button variant="outline" size="sm" onClick={onRetry}>
												<RefreshCw className="mr-2 h-4 w-4" />
												{t.admin.tryAgain}
											</Button>
										</div>
									</TableCell>
								</TableRow>
							) : outlets.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Store className="h-6 w-6" />
											<span>{t.admin.noOutletsFound}</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								outlets.map((outlet) => {
									const busy = actionId === outlet.id;
									const location = [
										outlet.addressLine1,
										outlet.state,
										outlet.postcode,
									]
										.filter(Boolean)
										.join(", ");
									return (
										<TableRow
											key={outlet.id}
											className="cursor-pointer"
											onClick={() => onSelect(outlet)}
										>
											<TableCell>
												<button
													type="button"
													className="iz-admin-record-name"
													onClick={(event) => {
														event.stopPropagation();
														onSelect(outlet);
													}}
												>
													{outlet.name}
												</button>
												<div className="iz-admin-record-secondary">
													{location || "—"}
												</div>
											</TableCell>
											<TableCell data-label={t.admin.colSsmLicense}>
												<div>{outlet.ssmNo || "—"}</div>
												{outlet.businessLicense && (
													<div className="text-sm text-muted-foreground">
														{outlet.businessLicense}
													</div>
												)}
											</TableCell>
											<TableCell data-label={t.admin.colStatus}>
												<Badge
													variant="outline"
													className={`text-sm ${orgStatusBadgeColors[outlet.status]}`}
												>
													{orgStatusLabel(outlet.status, t)}
												</Badge>
												<div className="iz-admin-record-secondary">
													{formatDate(outlet.createdAt)}
												</div>
											</TableCell>
											<TableCell onClick={(event) => event.stopPropagation()}>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="outline"
															size="icon"
															aria-label={`${t.admin.colActions} · ${outlet.name}`}
															disabled={busy}
														>
															<MoreHorizontal aria-hidden className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem onSelect={() => onSelect(outlet)}>
															{t.admin.viewOutletDetails}
														</DropdownMenuItem>
														{outlet.status === "pending_review" && (
															<DropdownMenuItem
																disabled={busy}
																onSelect={() => onApprove(outlet.id)}
															>
																{t.common.approve}
															</DropdownMenuItem>
														)}
														{(outlet.status === "active" ||
															outlet.status === "suspended") && (
															<DropdownMenuItem
																className="text-destructive"
																disabled={busy}
																onSelect={() => onDeactivate(outlet.id)}
															>
																{t.adminOrg.setInactive}
															</DropdownMenuItem>
														)}
														{outlet.status === "suspended" && (
															<DropdownMenuItem
																disabled={busy}
																onSelect={() => onApprove(outlet.id)}
															>
																{t.adminUsers.reactivate}
															</DropdownMenuItem>
														)}
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>

				{pagination && pagination.totalCount > 0 && (
					<div className="iz-admin-management-pagination text-muted-foreground">
						<div>
							{fill(t.adminOrg.showingOutlets, {
								from: (pagination.page - 1) * pageSize + 1,
								to: Math.min(pagination.page * pageSize, pagination.totalCount),
								total: pagination.totalCount,
							})}
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasPrevPage || isFetching}
								onClick={() => onPageChange(page - 1)}
							>
								{t.admin.previous}
							</Button>
							<span>
								{fill(t.admin.pageOf, {
									page: pagination.page,
									total: pagination.totalPages,
								})}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={!pagination.hasNextPage || isFetching}
								onClick={() => onPageChange(page + 1)}
							>
								{t.admin.next}
							</Button>
						</div>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
