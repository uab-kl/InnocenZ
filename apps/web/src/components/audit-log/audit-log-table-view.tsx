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
import {
	auditLogRoleDescription,
	auditLogRoleLabel,
} from "@/components/audit-log/audit-log-role-copy";
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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
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

/**
 * `YYYY-MM-DD` from `<input type="date">` → the first instant of that day IN
 * THE READER'S ZONE, as ISO.
 *
 * `new Date(y, m - 1, d)` is local by construction; `new Date('YYYY-MM-DD')`
 * would be UTC, which is the whole bug. Returns `undefined` for anything that
 * is not a real date so the caller can fall back to sending the raw value
 * rather than a silent `Invalid Date`.
 */
function localDayStartIso(day: string): string | undefined {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return undefined;
	const at = new Date(y, m - 1, d, 0, 0, 0, 0);
	return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

/** The twin of `localDayStartIso` — the LAST instant of the reader's day. */
function localDayEndIso(day: string): string | undefined {
	const [y, m, d] = day.split("-").map(Number);
	if (!y || !m || !d) return undefined;
	const at = new Date(y, m - 1, d, 23, 59, 59, 999);
	return Number.isNaN(at.getTime()) ? undefined : at.toISOString();
}

interface AuditLogTableViewProps {
	role: AuditLogRoleKey;
}

export function AuditLogTableView({ role }: AuditLogTableViewProps) {
	const { t } = usePortalLocale();
	const roleMeta = getAuditLogRoleByKey(role)!;
	const RoleIcon = roleMeta.icon;
	const roleLabel = auditLogRoleLabel(role, roleMeta.label, t);
	const [dateFrom, setDateFrom] = useState("");
	const [dateTo, setDateTo] = useState("");
	const [selectedAction, setSelectedAction] = useState("all");
	const [selectedEntity, setSelectedEntity] = useState("all");
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
	const [detailOpen, setDetailOpen] = useState(false);

	/*
	 * Request only — every value below is a STORED code the API filters on
	 * ("CREATED_AT", "DESC", the role key, the raw action and entity). Nothing
	 * here reads `t`, so `t` is deliberately absent from the dependency list.
	 */
	const queryParams: AuditLogsQueryParams = useMemo(() => {
		const params: AuditLogsQueryParams = {
			page: currentPage,
			pageSize: PAGE_SIZE,
			sortField: "CREATED_AT",
			sortDirection: "DESC",
			role,
		};

		/*
		 * ⚠️ THE READER'S DAY, SENT AS INSTANTS — not the bare `YYYY-MM-DD`.
		 *
		 * `new Date('2026-09-13')` parses as UTC midnight, so the server read a
		 * UTC day while this input means the day on the READER'S calendar. In
		 * Malaysia (UTC+8) that is eight hours out at both ends: picking "13 Sep"
		 * missed everything logged between 00:00 and 08:00 local, and instead
		 * showed the last eight hours of the 13th UTC — which is the morning of
		 * the 14th to the person reading it. An audit log that quietly answers
		 * about a different day than the one asked for is worse than one that
		 * refuses, because nothing on screen says so.
		 *
		 * The browser is the only party that knows this reader's zone, so it
		 * resolves the boundaries here: `new Date(y, m-1, d, …)` is LOCAL by
		 * construction. The server's contract already covers this — a value
		 * carrying a time is honoured exactly as sent, and only a bare date is
		 * widened to a UTC day.
		 */
		if (dateFrom) params.dateFrom = localDayStartIso(dateFrom) ?? dateFrom;
		if (dateTo) params.dateTo = localDayEndIso(dateTo) ?? dateTo;
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
				title={fill(t.adminAudit.roleAuditLogTitle, { role: roleLabel })}
				description={auditLogRoleDescription(role, roleMeta.description, t)}
				actions={
					<Button variant="outline" size="sm" asChild>
						<Link to="/admin/audit-log">
							<ArrowLeft className="mr-2 h-4 w-4" />
							{t.common.back}
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
									{fill(t.adminAudit.roleActivity, { role: roleLabel })}
									{isFetching && !showTableLoading && (
										<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
									)}
								</CardTitle>
								<CardDescription>
									{fill(t.adminAudit.auditedActionsBy, { role: roleLabel })}
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
									{t.adminAudit.dateFrom}
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
									{t.adminAudit.dateTo}
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
									<SelectValue placeholder={t.adminAudit.allActions} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t.adminAudit.allActions}</SelectItem>
									{/* The RECORDED action codes — the value AND the label. */}
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
									<SelectValue placeholder={t.adminAudit.allTables} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t.adminAudit.allTables}</SelectItem>
									{/* Table names as recorded — data on both sides. */}
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
									<TableHead>{t.adminAudit.colTimestamp}</TableHead>
									<TableHead>{t.adminAudit.colUser}</TableHead>
									<TableHead>{t.adminAudit.colAction}</TableHead>
									<TableHead>{t.adminAudit.colTable}</TableHead>
									<TableHead>{t.adminAudit.colIpAddress}</TableHead>
									<TableHead className="w-[60px]">
										{t.adminAudit.colDetail}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showTableLoading ? (
									<TableRow>
										<TableCell colSpan={6} className="h-24 text-center">
											<div className="flex items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-5 w-5 animate-spin" />
												{t.adminAudit.loadingLogs}
											</div>
										</TableCell>
									</TableRow>
								) : isError ? (
									<TableRow>
										<TableCell colSpan={6} className="h-24">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="font-medium text-destructive">
													{t.adminAudit.loadFailed}
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
													{t.admin.tryAgain}
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
											{t.adminAudit.noLogsFound}
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
															(log.userId
																? truncateId(log.userId)
																: t.adminAudit.systemActor)}
													</span>
													{/* The role AS RECORDED on the log row. */}
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
													aria-label={t.adminAudit.viewDetail}
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
								{fill(t.adminAudit.showingEntries, {
									from: (pagination.currentPage - 1) * PAGE_SIZE + 1,
									to: Math.min(
										pagination.currentPage * PAGE_SIZE,
										pagination.totalCount,
									),
									total: pagination.totalCount,
								})}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="icon"
									disabled={!pagination.hasPrevPage || isFetching}
									onClick={() =>
										setCurrentPage((page) => Math.max(1, page - 1))
									}
									aria-label={t.adminAudit.previousPage}
								>
									<ChevronLeft className="h-4 w-4" />
								</Button>
								<span>
									{fill(t.admin.pageOf, {
										page: pagination.currentPage,
										total: pagination.totalPages,
									})}
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
									aria-label={t.adminAudit.nextPage}
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
