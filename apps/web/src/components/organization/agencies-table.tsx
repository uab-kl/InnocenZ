import {
	AlertCircle,
	Ban,
	Building2,
	CheckCircle2,
	ChevronDown,
	ChevronRight,
	Loader2,
	RefreshCw,
	Search,
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
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { Agency, AgencyPagination } from "@/services/agency";
import { AgencyDetails } from "./agency-details";
import { OrgMembersPanel } from "./org-members-panel";
import {
	ORG_STATUSES,
	type OrgStatusFilter,
	orgStatusBadgeColors,
	orgStatusLabels,
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
	onSuspend: (id: string) => void;
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
	onSuspend,
	actionId,
}: AgenciesTableProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const showLoading = isLoading && agencies.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							PR Agency organizations
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>
							Expand a row to see linked PRs. Search agencies or filter by
							status.
						</CardDescription>
					</div>

					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<div className="relative sm:w-56">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="Search agencies…"
								className="pl-8"
								aria-label="Search agencies by name"
							/>
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
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-10" />
								<TableHead>Name</TableHead>
								<TableHead>Code</TableHead>
								<TableHead>Contact</TableHead>
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
											<span>Loading agencies…</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												Failed to load agencies
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
							) : agencies.length === 0 ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Building2 className="h-6 w-6" />
											<span>No agencies found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								agencies.map((agency) => {
									const expanded = expandedId === agency.id;
									const busy = actionId === agency.id;
									return (
										<Fragment key={agency.id}>
											<TableRow>
												<TableCell>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														aria-label={
															expanded ? "Collapse PR list" : "Expand PR list"
														}
														onClick={() =>
															setExpandedId(expanded ? null : agency.id)
														}
													>
														{expanded ? (
															<ChevronDown className="h-4 w-4" />
														) : (
															<ChevronRight className="h-4 w-4" />
														)}
													</Button>
												</TableCell>
												<TableCell>
													<div className="font-medium">{agency.name}</div>
													<div className="text-xs text-muted-foreground">
														SSM {agency.ssmNo}
													</div>
												</TableCell>
												<TableCell className="font-mono text-sm">
													{agency.agencyCode}
												</TableCell>
												<TableCell>
													<div className="text-sm">
														{agency.contactName || "—"}
													</div>
													<div className="text-xs text-muted-foreground">
														{[agency.contactEmail, agency.contactPhone]
															.filter(Boolean)
															.join(" · ") || "—"}
													</div>
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={orgStatusBadgeColors[agency.status]}
													>
														{orgStatusLabels[agency.status]}
													</Badge>
												</TableCell>
												<TableCell className="text-sm text-muted-foreground">
													{formatDate(agency.createdAt)}
												</TableCell>
												<TableCell>
													<div className="flex flex-wrap gap-2">
														{agency.status === "pending_review" && (
															<Button
																size="sm"
																disabled={busy}
																onClick={() => onApprove(agency.id)}
															>
																{busy ? (
																	<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
																) : (
																	<CheckCircle2 className="mr-1 h-3.5 w-3.5" />
																)}
																Approve
															</Button>
														)}
														{agency.status === "active" && (
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() => onSuspend(agency.id)}
															>
																{busy ? (
																	<Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
																) : (
																	<Ban className="mr-1 h-3.5 w-3.5" />
																)}
																Suspend
															</Button>
														)}
														{agency.status === "suspended" && (
															<Button
																size="sm"
																disabled={busy}
																onClick={() => onApprove(agency.id)}
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
													<TableCell
														colSpan={7}
														className="space-y-4 bg-muted/20 px-6 py-4"
													>
														<AgencyDetails agency={agency} />
														<OrgMembersPanel orgId={agency.id} kind="agency" />
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
							agencies
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
