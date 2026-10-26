import {
	AlertCircle,
	Building2,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	Search,
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
import { orgMemberIdStem } from "@/lib/member-code";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { Agency, AgencyPagination } from "@/services/agency";
import {
	ORG_STATUSES,
	type OrgStatusFilter,
	orgStatusBadgeColors,
	orgStatusLabel,
} from "./org-status";

interface AgenciesTableProps {
	agencies: Agency[];
	pagination: AgencyPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	search: string;
	statusFilter: OrgStatusFilter;
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: OrgStatusFilter) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onApprove: (id: string) => void;
	/** The off switch — `inactive`, refused at login until Activate. */
	onDeactivate: (id: string) => void;
	onSelect: (agency: Agency) => void;
	actionId: string | null;
}

export function AgenciesTable({
	agencies,
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
	onApprove,
	onDeactivate,
	onSelect,
	actionId,
}: AgenciesTableProps) {
	const { t } = usePortalLocale();
	const showLoading = isLoading && agencies.length === 0;

	return (
		<Card className="iz-admin-management-card border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{t.adminOrg.agencyOrganizations}
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>
							{t.adminOrg.agencyOrganizationsHint}
						</CardDescription>
					</div>

					<AdminFilters>
						<div className="iz-admin-management-filters flex flex-col gap-2 sm:flex-row sm:items-center">
							<div className="relative sm:w-56">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									value={search}
									onChange={(e) => onSearchChange(e.target.value)}
									placeholder={t.adminOrg.searchAgenciesPlaceholder}
									className="pl-8"
									aria-label={t.adminOrg.searchAgenciesAria}
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
								<TableHead>{t.admin.colName}</TableHead>
								<TableHead>{t.adminUsers.colContact}</TableHead>
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
											<span>{t.agencyLinks.loading}</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												{t.adminOrg.failedToLoadAgencies}
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
							) : agencies.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Building2 className="h-6 w-6" />
											<span>{t.adminOrg.noAgenciesFound}</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								agencies.map((agency) => {
									const busy = actionId === agency.id;
									return (
										<TableRow
											key={agency.id}
											className="cursor-pointer"
											onClick={() => onSelect(agency)}
										>
											<TableCell>
												<button
													type="button"
													className="iz-admin-record-name"
													onClick={(event) => {
														event.stopPropagation();
														onSelect(agency);
													}}
												>
													{agency.name}
												</button>
												<div className="iz-admin-record-secondary">
													{fill(t.adminOrg.ssmValue, { no: agency.ssmNo })}
												</div>
												<div className="iz-admin-record-secondary">
													{orgMemberIdStem("agency", agency.memberCodePrefix) ??
														"—"}
												</div>
											</TableCell>
											<TableCell data-label={t.adminUsers.colContact}>
												<div className="text-base">
													{agency.contactName || "—"}
												</div>
												<div className="text-sm text-muted-foreground">
													{[agency.contactEmail, agency.contactPhone]
														.filter(Boolean)
														.join(" · ") || "—"}
												</div>
											</TableCell>
											<TableCell data-label={t.admin.colStatus}>
												<Badge
													variant="outline"
													className={`text-sm ${orgStatusBadgeColors[agency.status]}`}
												>
													{orgStatusLabel(agency.status, t)}
												</Badge>
												<div className="iz-admin-record-secondary">
													{formatDate(agency.createdAt)}
												</div>
											</TableCell>
											<TableCell onClick={(event) => event.stopPropagation()}>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="outline"
															size="icon"
															aria-label={`${t.admin.colActions} · ${agency.name}`}
															disabled={busy}
														>
															<MoreHorizontal aria-hidden className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem onSelect={() => onSelect(agency)}>
															{t.adminOrg.viewAgencyDetails}
														</DropdownMenuItem>
														{agency.status === "pending_review" && (
															<DropdownMenuItem
																disabled={busy}
																onSelect={() => onApprove(agency.id)}
															>
																{t.common.approve}
															</DropdownMenuItem>
														)}
														{(agency.status === "active" ||
															agency.status === "suspended") && (
															<DropdownMenuItem
																className="text-destructive"
																disabled={busy}
																onSelect={() => onDeactivate(agency.id)}
															>
																{t.adminOrg.setInactive}
															</DropdownMenuItem>
														)}
														{agency.status === "suspended" && (
															<DropdownMenuItem
																disabled={busy}
																onSelect={() => onApprove(agency.id)}
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
							{fill(t.adminOrg.showingAgencies, {
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
