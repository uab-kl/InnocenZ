import {
	AlertCircle,
	CheckCircle2,
	Loader2,
	Plus,
	RefreshCw,
	Shield,
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
import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import { formatDate, getErrorMessage, statusColors } from "@/lib/utils";
import type { AdminPagination, AdminUser } from "@/services/admin";

export type AdminStatusFilter = "all" | "active" | "inactive";

interface AdminsTableProps {
	admins: AdminUser[];
	pagination: AdminPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	statusFilter: AdminStatusFilter;
	/**
	 * The signed-in admin's own id. Their row shows no actions: the server
	 * refuses self-disable and self-revoke (nobody could undo either — the
	 * endpoint that would is the one they just lost), and offering a control
	 * that is guaranteed to fail is worse than not offering it.
	 */
	currentUserId?: string | null;
	/** The row currently being written, so only its buttons go busy. */
	busyUserId?: string | null;
	onSetStatus?: (admin: AdminUser, next: "active" | "inactive") => void;
	onRevokeAdmin?: (admin: AdminUser) => void;
	onStatusFilterChange: (value: AdminStatusFilter) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
	onCreateClick: () => void;
}

export function AdminsTable({
	admins,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	statusFilter,
	currentUserId,
	busyUserId,
	onSetStatus,
	onRevokeAdmin,
	onStatusFilterChange,
	onPageChange,
	onRetry,
	onCreateClick,
}: AdminsTableProps) {
	const { t } = usePortalLocale();
	const showLoading = isLoading && admins.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							{t.admin.adminUsers}
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>{t.admin.adminUsersHint}</CardDescription>
					</div>

					<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as AdminStatusFilter)
							}
						>
							<SelectTrigger
								className="sm:w-40"
								aria-label={t.admin.filterByStatus}
							>
								<SelectValue placeholder={t.admin.filterByStatus} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">{t.admin.allStatus}</SelectItem>
								<SelectItem value="active">{t.admin.statusActive}</SelectItem>
								<SelectItem value="inactive">
									{t.admin.statusInactive}
								</SelectItem>
							</SelectContent>
						</Select>

						<Button onClick={onCreateClick} className="shrink-0">
							<Plus className="mr-2 h-4 w-4" />
							{t.admin.createAdmin}
						</Button>
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.admin.colDisplayName}</TableHead>
								<TableHead>{t.admin.colEmail}</TableHead>
								<TableHead className="w-[120px]">{t.admin.colStatus}</TableHead>
								<TableHead className="w-[180px]">
									{t.admin.colCreated}
								</TableHead>
								<TableHead className="w-[200px] text-right">
									{t.admin.colActions}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={5} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>{t.admin.loadingAdmins}</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={5} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												{t.admin.adminsLoadFailed}
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
							) : admins.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Shield className="h-6 w-6" />
											<span>{t.admin.noAdminsFound}</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								admins.map((admin) => (
									<TableRow key={admin.id}>
										<TableCell className="font-medium">
											{admin.displayName}
										</TableCell>
										<TableCell>{admin.email}</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className={`${statusColors[admin.status] ?? statusColors.inactive} flex w-fit items-center gap-1 capitalize`}
											>
												{admin.status === "active" ? (
													<CheckCircle2 className="h-3 w-3" />
												) : (
													<XCircle className="h-3 w-3" />
												)}
												{recordStatusLabel(admin.status, t)}
											</Badge>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{formatDate(admin.createdAt)}
										</TableCell>
										<TableCell className="text-right">
											{admin.id === currentUserId ? (
												<span className="text-muted-foreground text-xs">
													{t.admin.thisIsYou}
												</span>
											) : (
												<div className="flex justify-end gap-2">
													<Button
														variant="outline"
														size="sm"
														disabled={busyUserId === admin.id}
														onClick={() =>
															onSetStatus?.(
																admin,
																admin.status === "active"
																	? "inactive"
																	: "active",
															)
														}
													>
														{admin.status === "active"
															? t.admin.disable
															: t.admin.enable}
													</Button>
													<Button
														variant="outline"
														size="sm"
														className="text-destructive"
														disabled={busyUserId === admin.id}
														onClick={() => onRevokeAdmin?.(admin)}
													>
														{t.admin.removeAdmin}
													</Button>
												</div>
											)}
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
							{fill(t.admin.showingAdmins, {
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
