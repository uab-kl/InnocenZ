import {
	AlertCircle,
	Check,
	CheckCircle2,
	ChevronDown,
	ChevronsUpDown,
	Loader2,
	Megaphone,
	RefreshCw,
	Search,
	XCircle,
} from "lucide-react";
import { useState } from "react";
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
						<AgencyFilterCombobox
							agencies={agencies}
							value={agencyFilter}
							onChange={onAgencyFilterChange}
						/>
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
								<TableHead>Legal name</TableHead>
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
									<TableCell colSpan={7} className="h-32">
										<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
											<Loader2 className="h-6 w-6 animate-spin" />
											<span>Loading PR users…</span>
										</div>
									</TableCell>
								</TableRow>
							) : isError ? (
								<TableRow>
									<TableCell colSpan={7} className="h-32">
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
									<TableCell colSpan={7} className="h-32">
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
										<TableCell>
											{user.legalName ? (
												<div className="font-medium">{user.legalName}</div>
											) : (
												<span className="text-sm text-muted-foreground">—</span>
											)}
											{user.idNo && (
												<div className="font-mono text-xs text-muted-foreground">
													{user.idType ? `${user.idType} · ` : ""}
													{user.idNo}
												</div>
											)}
										</TableCell>
										<TableCell>{user.email || "—"}</TableCell>
										<TableCell>{user.phoneNum || "—"}</TableCell>
										<TableCell>
											<PrAgenciesCell agencies={user.agencies} />
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

// Searchable agency filter: many agencies are hard to scan in a plain Select,
// so this combobox lets the admin type to narrow the list before picking one.
function AgencyFilterCombobox({
	agencies,
	value,
	onChange,
}: {
	agencies: Agency[];
	value: string;
	onChange: (value: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const selected = agencies.find((agency) => agency.id === value);
	const label = value === "all" ? "All agencies" : (selected?.name ?? "Agency");

	const needle = query.trim().toLowerCase();
	const filtered = needle
		? agencies.filter(
				(agency) =>
					agency.name.toLowerCase().includes(needle) ||
					agency.agencyCode?.toLowerCase().includes(needle),
			)
		: agencies;

	const pick = (next: string) => {
		onChange(next);
		setOpen(false);
		setQuery("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) setQuery("");
			}}
		>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					role="combobox"
					aria-expanded={open}
					aria-label="Filter by agency"
					className="justify-between font-normal sm:w-52"
				>
					<span className="truncate">{label}</span>
					<ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-56 p-0">
				<div className="border-b p-2">
					<div className="relative">
						<Search className="pointer-events-none absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search agencies…"
							className="h-8 pl-7"
							aria-label="Search agencies"
						/>
					</div>
				</div>
				<ul className="max-h-64 overflow-y-auto p-1">
					<li>
						<button
							type="button"
							onClick={() => pick("all")}
							className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
						>
							All agencies
							{value === "all" && <Check className="h-4 w-4 shrink-0" />}
						</button>
					</li>
					{filtered.map((agency) => (
						<li key={agency.id}>
							<button
								type="button"
								onClick={() => pick(agency.id)}
								className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
							>
								<span className="truncate">{agency.name}</span>
								<span className="flex shrink-0 items-center gap-1.5">
									<span className="font-mono text-xs text-muted-foreground">
										{agency.agencyCode}
									</span>
									{value === agency.id && <Check className="h-4 w-4" />}
								</span>
							</button>
						</li>
					))}
					{filtered.length === 0 && (
						<li className="px-2 py-3 text-center text-sm text-muted-foreground">
							No agencies found
						</li>
					)}
				</ul>
			</PopoverContent>
		</Popover>
	);
}

// The Agencies column truncates long names, so every PR gets a dropdown button
// that reveals the full name + code of each agency it belongs to.
function PrAgenciesCell({ agencies }: { agencies: PrUser["agencies"] }) {
	if (agencies.length === 0) {
		return <span className="text-sm text-muted-foreground">—</span>;
	}

	const [first] = agencies;
	const extra = agencies.length - 1;
	const plural = agencies.length === 1 ? "agency" : "agencies";

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={`Show ${agencies.length} ${plural} for this PR`}
					className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 text-sm transition-colors hover:bg-muted"
				>
					<span className="truncate">{first.name}</span>
					{extra > 0 && (
						<span className="shrink-0 rounded-full bg-(--lavender-soft)/30 px-1.5 text-xs font-medium text-muted-foreground">
							+{extra}
						</span>
					)}
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-72 p-2">
				<p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
					Agencies ({agencies.length})
				</p>
				<ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
					{agencies.map((agency) => (
						<li
							key={agency.id}
							className="flex items-start justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
						>
							<span className="min-w-0 break-words">{agency.name}</span>
							<span className="shrink-0 font-mono text-xs text-muted-foreground">
								{agency.code}
							</span>
						</li>
					))}
				</ul>
			</PopoverContent>
		</Popover>
	);
}
