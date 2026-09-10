import {
	AlertCircle,
	Ban,
	CheckCircle2,
	Eye,
	Loader2,
	RefreshCw,
	Search,
	Store,
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
		<Card className="border-(--lavender-soft)/40 bg-card">
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
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
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
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>{t.admin.colName}</TableHead>
								<TableHead>{t.admin.colLocation}</TableHead>
								<TableHead>{t.admin.colSsmLicense}</TableHead>
								<TableHead className="w-[140px]">{t.admin.colStatus}</TableHead>
								<TableHead className="w-[140px]">
									{t.admin.colCreated}
								</TableHead>
								<TableHead className="w-[200px]">
									{t.admin.colActions}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>{t.admin.loadingOutlets}</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
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
									<TableCell colSpan={7} className="h-32">
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
												<Button
													variant="ghost"
													size="icon"
													className="h-8 w-8"
													aria-label={t.admin.viewOutletDetails}
													onClick={(e) => {
														e.stopPropagation();
														onSelect(outlet);
													}}
												>
													<Eye className="h-4 w-4" />
												</Button>
											</TableCell>
											<TableCell className="font-medium text-base">
												{outlet.name}
											</TableCell>
											<TableCell className="max-w-[280px] whitespace-normal text-base text-muted-foreground">
												{location || "—"}
											</TableCell>
											<TableCell className="text-base">
												<div>{outlet.ssmNo || "—"}</div>
												{outlet.businessLicense && (
													<div className="text-sm text-muted-foreground">
														{outlet.businessLicense}
													</div>
												)}
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={`text-sm ${orgStatusBadgeColors[outlet.status]}`}
												>
													{orgStatusLabel(outlet.status, t)}
												</Badge>
											</TableCell>
											<TableCell className="text-base text-muted-foreground">
												{formatDate(outlet.createdAt)}
											</TableCell>
											<TableCell onClick={(e) => e.stopPropagation()}>
												<div className="flex flex-wrap gap-2">
													{outlet.status === "pending_review" && (
														<Button
															size="sm"
															disabled={busy}
															onClick={() => onApprove(outlet.id)}
														>
															{busy ? (
																<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
															) : (
																<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
															)}
															{t.common.approve}
														</Button>
													)}
													{(outlet.status === "active" ||
														outlet.status === "suspended") && (
														<Button
															size="sm"
															variant="destructive"
															disabled={busy}
															onClick={() => onDeactivate(outlet.id)}
														>
															{busy ? (
																<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
															) : (
																<Ban className="mr-1 h-3.5 w-3.5" />
															)}
															{t.adminOrg.setInactive}
														</Button>
													)}
													{outlet.status === "suspended" && (
														<Button
															size="sm"
															disabled={busy}
															onClick={() => onApprove(outlet.id)}
														>
															{busy ? (
																<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
															) : (
																<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
															)}
															{t.adminUsers.reactivate}
														</Button>
													)}
												</div>
											</TableCell>
										</TableRow>
									);
								})
							)}
						</TableBody>
					</Table>
				</div>

				{pagination && pagination.totalCount > 0 && (
					<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
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
