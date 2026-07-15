import {
	AlertCircle,
	Ban,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Loader2,
	RefreshCw,
	Store,
} from "lucide-react";
import { Fragment, useState } from "react";
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
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { Outlet, OutletPagination } from "@/services/outlet";
import { OrgMembersPanel } from "./org-members-panel";
import {
	ORG_STATUSES,
	type OrgStatusFilter,
	orgStatusBadgeColors,
	orgStatusLabels,
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
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onApprove: (id: string) => void;
	onSuspend: (id: string) => void;
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
	onPageChange,
	onRetry,
	onApprove,
	onSuspend,
	actionId,
}: OutletsTableProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const showLoading = isLoading && outlets.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							Outlet organizations
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>
							Review signup applications, approve active outlets, or suspend
							venues.
						</CardDescription>
					</div>

					<Select
						value={statusFilter}
						onValueChange={(value) =>
							onStatusFilterChange(value as OrgStatusFilter)
						}
					>
						<SelectTrigger className="sm:w-48" aria-label="Filter by status">
							<SelectValue placeholder="Filter by status" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All Status</SelectItem>
							{ORG_STATUSES.map((status) => (
								<SelectItem key={status} value={status}>
									{orgStatusLabels[status]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>Name</TableHead>
								<TableHead>Location</TableHead>
								<TableHead>SSM / License</TableHead>
								<TableHead className="w-[140px]">Status</TableHead>
								<TableHead className="w-[140px]">Created</TableHead>
								<TableHead className="w-[200px]">Actions</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading outlets…</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												Failed to load outlets
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
							) : outlets.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Store className="h-6 w-6" />
											<span>No outlets found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								outlets.map((outlet) => {
									const expanded = expandedId === outlet.id;
									const busy = actionId === outlet.id;
									const location = [
										outlet.addressLine1,
										outlet.state,
										outlet.postcode,
									]
										.filter(Boolean)
										.join(", ");
									return (
										<Fragment key={outlet.id}>
											<TableRow>
												<TableCell>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														aria-label={
															expanded ? "Collapse members" : "Expand members"
														}
														onClick={() =>
															setExpandedId(expanded ? null : outlet.id)
														}
													>
														{expanded ? (
															<ChevronDown className="h-4 w-4" />
														) : (
															<ChevronRight className="h-4 w-4" />
														)}
													</Button>
												</TableCell>
												<TableCell className="font-medium">
													{outlet.name}
												</TableCell>
												<TableCell className="max-w-[220px] text-sm text-muted-foreground">
													{location || "—"}
												</TableCell>
												<TableCell className="text-sm">
													<div>{outlet.ssmNo || "—"}</div>
													{outlet.businessLicense && (
														<div className="text-xs text-muted-foreground">
															{outlet.businessLicense}
														</div>
													)}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={orgStatusBadgeColors[outlet.status]}
													>
														{orgStatusLabels[outlet.status]}
													</Badge>
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{formatDate(outlet.createdAt)}
												</TableCell>
												<TableCell>
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
																Approve
															</Button>
														)}
														{outlet.status === "active" && (
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() => onSuspend(outlet.id)}
															>
																{busy ? (
																	<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
																) : (
																	<Ban className="mr-1 h-3.5 w-3.5" />
																)}
																Suspend
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
																Reactivate
															</Button>
														)}
													</div>
												</TableCell>
											</TableRow>
											{expanded && (
												<TableRow>
													<TableCell colSpan={7} className="bg-muted/20 px-6">
														<OrgMembersPanel orgId={outlet.id} kind="outlet" />
													</TableCell>
												</TableRow>
											)}
										</Fragment>
									);
								})
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
							outlets
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
