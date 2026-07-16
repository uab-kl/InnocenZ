import {
	AlertCircle,
	CheckCircle2,
	Loader2,
	Megaphone,
	RefreshCw,
	Search,
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
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
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
import type { Agency } from "@/services/agency";
import type { PrPagination, PrUser } from "@/services/pr";

export type PrStatusFilter = "all" | "active" | "inactive";

interface PrsTableProps {
	users: PrUser[];
	pagination: PrPagination | undefined;
	page: number;
	pageSize: number;
	isLoading: boolean;
	isFetching: boolean;
	isError: boolean;
	error: Error | null;
	search: string;
	statusFilter: PrStatusFilter;
	agencyFilter: string;
	agencies: Agency[];
	onSearchChange: (value: string) => void;
	onStatusFilterChange: (value: PrStatusFilter) => void;
	onAgencyFilterChange: (value: string) => void;
	onPageChange: (page: number) => void;
	onRetry: () => void;
}

export function PrsTable({
	users,
	pagination,
	page,
	pageSize,
	isLoading,
	isFetching,
	isError,
	error,
	search,
	statusFilter,
	agencyFilter,
	agencies,
	onSearchChange,
	onStatusFilterChange,
	onAgencyFilterChange,
	onPageChange,
	onRetry,
}: PrsTableProps) {
	const showLoading = isLoading && users.length === 0;

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							PR accounts
							{isFetching && !showLoading && (
								<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
							)}
						</CardTitle>
						<CardDescription>
							Platform users with the PR role. Agencies column shows every
							agency a PR belongs to.
						</CardDescription>
					</div>

					<div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
						<div className="relative sm:w-56">
							<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								value={search}
								onChange={(e) => onSearchChange(e.target.value)}
								placeholder="Search PRs…"
								className="pl-8"
								aria-label="Search PRs by name, email, or agency"
							/>
						</div>
						<Select value={agencyFilter} onValueChange={onAgencyFilterChange}>
							<SelectTrigger className="sm:w-52" aria-label="Filter by agency">
								<SelectValue placeholder="All agencies" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All agencies</SelectItem>
								{agencies.map((agency) => (
									<SelectItem key={agency.id} value={agency.id}>
										{agency.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Select
							value={statusFilter}
							onValueChange={(value) =>
								onStatusFilterChange(value as PrStatusFilter)
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
					</div>
				</div>
			</CardHeader>

			<CardContent>
				<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Display Name</TableHead>
								<TableHead>Email</TableHead>
								<TableHead>Phone</TableHead>
								<TableHead>Agencies</TableHead>
								<TableHead className="w-[120px]">Status</TableHead>
								<TableHead className="w-[180px]">Created</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{showLoading ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading PR users…</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex flex-col items-center justify-center gap-3">
											<AlertCircle className="h-8 w-8 text-destructive" />
											<p className="font-medium text-destructive">
												Failed to load PR users
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
							) : users.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Megaphone className="h-6 w-6" />
											<span>No PR users found</span>
										</div>
									</TableCell>
								</TableRow>
							) : (
								users.map((user) => (
									<TableRow key={user.id}>
										<TableCell className="font-medium">
											{user.displayName}
										</TableCell>
										<TableCell>{user.email || "—"}</TableCell>
										<TableCell>{user.phoneNum || "—"}</TableCell>
										<TableCell>
											{user.agencies.length === 0 ? (
												<span className="text-sm text-muted-foreground">—</span>
											) : (
												<div className="flex max-w-[300px] flex-wrap items-center gap-1.5">
													{user.agencies.slice(0, 2).map((agency) => (
														<Badge
															key={agency.id}
															variant="outline"
															className="max-w-[170px] font-normal"
															title={`${agency.name} (${agency.code})`}
														>
															<span className="truncate">{agency.name}</span>
															<span className="ml-1 shrink-0 text-muted-foreground">
																{agency.code}
															</span>
														</Badge>
													))}
													{user.agencies.length > 2 && (
														<Popover>
															<PopoverTrigger asChild>
																<button
																	type="button"
																	className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
																>
																	+{user.agencies.length - 2} more
																</button>
															</PopoverTrigger>
															<PopoverContent
																align="start"
																className="w-64 p-2"
															>
																<p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
																	All agencies ({user.agencies.length})
																</p>
																<ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
																	{user.agencies.map((agency) => (
																		<li
																			key={agency.id}
																			className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
																		>
																			<span className="truncate">
																				{agency.name}
																			</span>
																			<span className="shrink-0 font-mono text-xs text-muted-foreground">
																				{agency.code}
																			</span>
																		</li>
																	))}
																</ul>
															</PopoverContent>
														</Popover>
													)}
												</div>
											)}
										</TableCell>
										<TableCell>
											<Badge
												variant="outline"
												className={`${statusColors[user.status] ?? statusColors.inactive} flex w-fit items-center gap-1 capitalize`}
											>
												{user.status === "active" ? (
													<CheckCircle2 className="h-3 w-3" />
												) : (
													<XCircle className="h-3 w-3" />
												)}
												{user.status}
											</Badge>
										</TableCell>
										<TableCell className="text-sm text-muted-foreground">
											{formatDate(user.createdAt)}
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
							PRs
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
