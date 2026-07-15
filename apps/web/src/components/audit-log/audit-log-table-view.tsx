import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	AlertCircle,
	ArrowLeft,
	Calendar,
	ChevronLeft,
	ChevronRight,
	Eye,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { AuditLogDetailDialog } from "@/components/audit-log/audit-log-detail-dialog";
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
import { Label } from "@/components/ui/label";
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
import {
	type AuditLogRoleKey,
	getAuditLogRoleByKey,
} from "@/constants/audit-log-roles";
import {
	formatAuditDate,
	formatAuditEntity,
	formatRoleLabel,
	getAuditActionBadgeColor,
	getErrorMessage,
	truncateId,
} from "@/lib/utils";
import {
	type AuditLog,
	type AuditLogsQueryParams,
	fetchAuditLogActions,
	fetchAuditLogEntities,
	fetchAuditLogs,
} from "@/services/audit-log";

const PAGE_SIZE = 10;

interface AuditLogTableViewProps {
	role: AuditLogRoleKey;
}

export function AuditLogTableView({ role }: AuditLogTableViewProps) {
	const roleMeta = getAuditLogRoleByKey(role)!;
	const RoleIcon = roleMeta.icon;
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [selectedAction, setSelectedAction] = useState("all");
	const [selectedEntity, setSelectedEntity] = useState("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	const queryParams: AuditLogsQueryParams = useMemo(() => {
		const params: AuditLogsQueryParams = {
			page: currentPage,
			pageSize: PAGE_SIZE,
			sortField: "CREATED_AT",
			sortDirection: "DESC",
			role,
		};

		if (dateFrom) params.dateFrom = dateFrom;
		if (dateTo) params.dateTo = dateTo;
		if (selectedAction !== "all") params.action = selectedAction;
		if (selectedEntity !== "all") params.entity = selectedEntity;

		return params;
	}, [currentPage, dateFrom, dateTo, role, selectedAction, selectedEntity]);

	const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
		queryKey: ["audit-log", role, queryParams],
		queryFn: () => fetchAuditLogs(queryParams),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const { data: actionsData } = useQuery({
		queryKey: ["audit-log-actions"],
		queryFn: () => fetchAuditLogActions(),
		staleTime: 5 * 60_000,
	});

	const { data: entitiesData } = useQuery({
		queryKey: ["audit-log-entities"],
		queryFn: () => fetchAuditLogEntities(),
		staleTime: 5 * 60_000,
	});

	const auditLogs = data?.query ?? [];
	const pagination = data?.pagination;
	const uniqueActions = actionsData?.data ?? [];
	const uniqueEntities = entitiesData?.data ?? [];

	const handleViewDetail = (log: AuditLog) => {
		setSelectedLog(log);
		setDetailOpen(true);
	};

	const showTableLoading = isLoading && auditLogs.length === 0;

	return (
		<PageShell>
			<PageHeader
				icon={RoleIcon}
				title={`${roleMeta.label} Audit Log`}
				description={roleMeta.description}
				actions={
					<Button variant="outline" size="sm" asChild>
						<Link to="/audit-log">
							<ArrowLeft className="mr-2 h-4 w-4" />
							Back to roles
						</Link>
					</Button>
				}
			/>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<CardTitle className="flex items-center gap-2">
									{roleMeta.label} Activity
									{isFetching && !showTableLoading && (
										<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
									)}
								</CardTitle>
								<CardDescription>
									Audited actions performed by {roleMeta.label.toLowerCase()}{" "}
									users
								</CardDescription>
							</div>
						</div>

						<div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:flex-wrap">
							<div className="flex items-center gap-2">
								<Calendar className="h-4 w-4 text-muted-foreground" />
								<Label
									htmlFor="audit-date-from"
									className="text-xs whitespace-nowrap"
								>
									From
								</Label>
								<Input
									id="audit-date-from"
									type="date"
									value={dateFrom}
									onChange={(event) => {
										setDateFrom(event.target.value);
										setCurrentPage(1);
									}}
									className="w-[140px]"
								/>
							</div>
							<div className="flex items-center gap-2">
								<Label
									htmlFor="audit-date-to"
									className="text-xs whitespace-nowrap"
								>
									To
								</Label>
								<Input
									id="audit-date-to"
									type="date"
									value={dateTo}
									onChange={(event) => {
										setDateTo(event.target.value);
										setCurrentPage(1);
									}}
									className="w-[140px]"
								/>
							</div>
							<Select
								value={selectedAction}
								onValueChange={(value) => {
									setSelectedAction(value);
									setCurrentPage(1);
								}}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="All Actions" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Actions</SelectItem>
									{uniqueActions.map((action) => (
										<SelectItem key={action} value={action}>
											{action}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={selectedEntity}
								onValueChange={(value) => {
									setSelectedEntity(value);
									setCurrentPage(1);
								}}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue placeholder="All Tables" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Tables</SelectItem>
									{uniqueEntities.map((entity) => (
										<SelectItem key={entity} value={entity}>
											{formatAuditEntity(entity)}
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
									<TableHead>Timestamp</TableHead>
									<TableHead>User</TableHead>
									<TableHead>Action</TableHead>
									<TableHead>Table</TableHead>
									<TableHead>IP Address</TableHead>
									<TableHead className="w-[60px]">Detail</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showTableLoading ? (
									<TableRow>
										<TableCell colSpan={6} className="h-24 text-center">
											<div className="flex items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-5 w-5 animate-spin" />
												Loading audit logs...
											</div>
										</TableCell>
									</TableRow>
								) : isError ? (
									<TableRow>
										<TableCell colSpan={6} className="h-24">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													Failed to load audit logs
												</p>
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(error)}
												</p>
												<Button
													variant="outline"
													size="sm"
													onClick={() => refetch()}
												>
													<RefreshCw className="mr-2 h-4 w-4" />
													Try Again
												</Button>
											</div>
										</TableCell>
									</TableRow>
								) : auditLogs.length === 0 ? (
									<TableRow>
										<TableCell
											colSpan={6}
											className="h-24 text-center text-muted-foreground"
										>
											No audit logs found.
										</TableCell>
									</TableRow>
								) : (
									auditLogs.map((log) => (
										<TableRow
											key={log.auditLogId}
											className="cursor-pointer hover:bg-muted/50"
											onClick={() => handleViewDetail(log)}
										>
											<TableCell>{formatAuditDate(log.createdAt)}</TableCell>
											<TableCell>
												<div className="flex flex-col">
													<span className="font-medium">
														{log.username ||
															(log.userId ? truncateId(log.userId) : "System")}
													</span>
													{log.role && (
														<span className="text-xs text-muted-foreground capitalize">
															{formatRoleLabel(log.role)}
														</span>
													)}
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant="outline"
													className={getAuditActionBadgeColor(log.action)}
												>
													{log.action}
												</Badge>
											</TableCell>
											<TableCell>{formatAuditEntity(log.entity)}</TableCell>
											<TableCell className="font-mono text-xs">
												{log.ipAddress}
											</TableCell>
											<TableCell>
												<Button
													variant="ghost"
													size="icon"
													onClick={(event) => {
														event.stopPropagation();
														handleViewDetail(log);
													}}
													aria-label="View audit log detail"
												>
													<Eye className="h-4 w-4" />
												</Button>
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
									{(pagination.currentPage - 1) * PAGE_SIZE + 1}
								</span>{" "}
								-{" "}
								<span className="font-medium">
									{Math.min(
										pagination.currentPage * PAGE_SIZE,
										pagination.totalCount,
									)}
								</span>{" "}
								of <span className="font-medium">{pagination.totalCount}</span>{" "}
								entries
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="icon"
									disabled={!pagination.hasPrevPage || isFetching}
									onClick={() =>
										setCurrentPage((page) => Math.max(1, page - 1))
									}
									aria-label="Previous page"
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span>
									Page {pagination.currentPage} of {pagination.totalPages}
								</span>
								<Button
									variant="outline"
									size="icon"
									disabled={!pagination.hasNextPage || isFetching}
									onClick={() =>
										setCurrentPage((page) =>
											Math.min(pagination.totalPages, page + 1),
										)
									}
									aria-label="Next page"
								>
									<ChevronRight className="h-4 w-4" />
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<AuditLogDetailDialog
				log={selectedLog}
				open={detailOpen}
				onOpenChange={setDetailOpen}
			/>
		</PageShell>
	);
}
