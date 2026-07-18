import {
	keepPreviousData,
	useMutation,
	useQueries,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	Archive,
	CheckCircle2,
	Eye,
	Info,
	Loader2,
	RefreshCw,
	Search,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import {
	AgencyDetailsSheet,
	OutletDetailsSheet,
	orgStatusBadgeColors,
	orgStatusLabels,
} from "@/components/organization";
import { PrDetailsSheet } from "@/components/pr";
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
import { getUserTypeByKey } from "@/constants/user-types";
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { formatDate, formatNumber, getErrorMessage } from "@/lib/utils";
import {
	approveAgency,
	fetchAgencies,
	fetchAgencyById,
	type Agency,
} from "@/services/agency";
import {
	approveOutlet,
	fetchOutletById,
	fetchOutlets,
	type Outlet,
} from "@/services/outlet";
import { fetchPrUsers, type PrUser } from "@/services/pr";

export const Route = createFileRoute(
	"/admin/user-management/legacy-member",
)({
	component: LegacyMemberPage,
	head: () => ({
		meta: [{ title: "Legacy Member — Innocenz Admin" }],
	}),
});

const PAGE_SIZE = 10;
const FETCH_SIZE = 100;

type LegacyRoleFilter = "all" | "agency" | "outlet" | "pr";
type SortBy = "name" | "createdAt" | "updatedAt";
type SortOrder = "asc" | "desc";

type LegacyRow = {
	id: string;
	role: "agency" | "outlet" | "pr";
	name: string;
	code: string;
	contact: string;
	detail: string;
	statusLabel: string;
	statusClass: string;
	createdAt: string;
	updatedAt: string;
};

const roleLabels: Record<Exclude<LegacyRoleFilter, "all">, string> = {
	agency: "Agency",
	outlet: "Outlet",
	pr: "PR",
};

const roleBadgeColors: Record<Exclude<LegacyRoleFilter, "all">, string> = {
	agency: "border-(--lavender-soft)/50 bg-(--lavender-soft)/15 text-lavender",
	outlet: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400",
	pr: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

async function fetchAllAgencies(
	onRefreshFail: () => void,
): Promise<Agency[]> {
	const rows: Agency[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchAgencies(
			{ status: "suspended", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllOutlets(
	onRefreshFail: () => void,
): Promise<Outlet[]> {
	const rows: Outlet[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchOutlets(
			{ status: "suspended", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

async function fetchAllInactivePrs(
	onRefreshFail: () => void,
): Promise<PrUser[]> {
	const rows: PrUser[] = [];
	let page = 1;
	let hasNextPage = true;
	while (hasNextPage) {
		const response = await fetchPrUsers(
			{ status: "inactive", page, pageSize: FETCH_SIZE },
			onRefreshFail,
		);
		rows.push(...response.data);
		hasNextPage = response.pagination.hasNextPage;
		page += 1;
	}
	return rows;
}

function mapAgencyRow(agency: Agency): LegacyRow {
	return {
		id: agency.id,
		role: "agency",
		name: agency.name,
		code: agency.agencyCode || agency.ssmNo || "—",
		contact: agency.contactName || "—",
		detail: [agency.contactEmail, agency.contactPhone]
			.filter(Boolean)
			.join(" · "),
		statusLabel: orgStatusLabels.suspended,
		statusClass: orgStatusBadgeColors.suspended,
		createdAt: agency.createdAt,
		updatedAt: agency.updatedAt,
	};
}

function mapOutletRow(outlet: Outlet): LegacyRow {
	const place = [outlet.state, outlet.country].filter(Boolean).join(", ");
	return {
		id: outlet.id,
		role: "outlet",
		name: outlet.name,
		code: outlet.ssmNo || outlet.businessLicense || "—",
		contact: place || "—",
		detail: [outlet.addressLine1, outlet.postcode].filter(Boolean).join(", "),
		statusLabel: orgStatusLabels.suspended,
		statusClass: orgStatusBadgeColors.suspended,
		createdAt: outlet.createdAt,
		updatedAt: outlet.updatedAt,
	};
}

function mapPrRow(user: PrUser): LegacyRow {
	return {
		id: user.id,
		role: "pr",
		name: user.legalName || user.displayName || "—",
		code: user.idNo || "—",
		contact: user.displayName || "—",
		detail: [user.email, user.phoneNum].filter(Boolean).join(" · "),
		statusLabel: "Inactive",
		statusClass: orgStatusBadgeColors.inactive,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

function LegacyMemberPage() {
	const type = getUserTypeByKey("legacy-member")!;
	const { logout } = useAuth();
	const queryClient = useQueryClient();

	const [nameFilter, setNameFilter] = useState("");
	const [codeFilter, setCodeFilter] = useState("");
	const [contactFilter, setContactFilter] = useState("");
	const [roleFilter, setRoleFilter] = useState<LegacyRoleFilter>("all");
	const [sortBy, setSortBy] = useState<SortBy>("updatedAt");
	const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
	const [page, setPage] = useState(1);
	const [actionId, setActionId] = useState<string | null>(null);
	const [selected, setSelected] = useState<{
		role: "agency" | "outlet" | "pr";
		id: string;
	} | null>(null);

	const [debouncedName, setDebouncedName] = useState("");
	const [debouncedCode, setDebouncedCode] = useState("");
	const [debouncedContact, setDebouncedContact] = useState("");

	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedName(nameFilter.trim());
			setDebouncedCode(codeFilter.trim());
			setDebouncedContact(contactFilter.trim());
			setPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [nameFilter, codeFilter, contactFilter]);

	useEffect(() => {
		setPage(1);
	}, [roleFilter, sortBy, sortOrder]);

	const needAgency = roleFilter === "all" || roleFilter === "agency";
	const needOutlet = roleFilter === "all" || roleFilter === "outlet";
	const needPr = roleFilter === "all" || roleFilter === "pr";

	const legacyQueries = useQueries({
		queries: [
			{
				queryKey: ["legacy-members", "agency", "suspended"],
				queryFn: () => fetchAllAgencies(logout),
				enabled: needAgency,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "outlet", "suspended"],
				queryFn: () => fetchAllOutlets(logout),
				enabled: needOutlet,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
			{
				queryKey: ["legacy-members", "pr", "inactive"],
				queryFn: () => fetchAllInactivePrs(logout),
				enabled: needPr,
				placeholderData: keepPreviousData,
				staleTime: 30_000,
			},
		],
	});

	const [agencyQuery, outletQuery, prQuery] = legacyQueries;
	const isLoading =
		(needAgency && agencyQuery.isLoading) ||
		(needOutlet && outletQuery.isLoading) ||
		(needPr && prQuery.isLoading);
	const isFetching =
		(needAgency && agencyQuery.isFetching) ||
		(needOutlet && outletQuery.isFetching) ||
		(needPr && prQuery.isFetching);
	const isError =
		(needAgency && agencyQuery.isError) ||
		(needOutlet && outletQuery.isError) ||
		(needPr && prQuery.isError);
	const error =
		(needAgency && agencyQuery.error) ||
		(needOutlet && outletQuery.error) ||
		(needPr && prQuery.error) ||
		null;

	const list: LegacyRow[] = [];
	if (needAgency) {
		for (const agency of agencyQuery.data ?? []) {
			list.push(mapAgencyRow(agency));
		}
	}
	if (needOutlet) {
		for (const outlet of outletQuery.data ?? []) {
			list.push(mapOutletRow(outlet));
		}
	}
	if (needPr) {
		for (const user of prQuery.data ?? []) {
			list.push(mapPrRow(user));
		}
	}

	const nameQ = debouncedName.toLowerCase();
	const codeQ = debouncedCode.toLowerCase();
	const contactQ = debouncedContact.toLowerCase();

	const filtered = list.filter((row) => {
		if (nameQ && !row.name.toLowerCase().includes(nameQ)) return false;
		if (
			codeQ &&
			!row.code.toLowerCase().includes(codeQ) &&
			!row.id.toLowerCase().includes(codeQ)
		) {
			return false;
		}
		if (
			contactQ &&
			!row.contact.toLowerCase().includes(contactQ) &&
			!row.detail.toLowerCase().includes(contactQ)
		) {
			return false;
		}
		return true;
	});

	const rows = [...filtered].sort((a, b) => {
		const left =
			sortBy === "name"
				? a.name.toLowerCase()
				: sortBy === "createdAt"
					? a.createdAt
					: a.updatedAt;
		const right =
			sortBy === "name"
				? b.name.toLowerCase()
				: sortBy === "createdAt"
					? b.createdAt
					: b.updatedAt;
		if (left < right) return sortOrder === "asc" ? -1 : 1;
		if (left > right) return sortOrder === "asc" ? 1 : -1;
		return 0;
	});

	const totalCount = rows.length;
	const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
	const currentPage = Math.min(page, totalPages);
	const pageRows = rows.slice(
		(currentPage - 1) * PAGE_SIZE,
		currentPage * PAGE_SIZE,
	);

	const selectedAgencyFromList =
		selected?.role === "agency"
			? (agencyQuery.data?.find((a) => a.id === selected.id) ?? null)
			: null;
	const selectedOutletFromList =
		selected?.role === "outlet"
			? (outletQuery.data?.find((o) => o.id === selected.id) ?? null)
			: null;
	const selectedPrFromList =
		selected?.role === "pr"
			? (prQuery.data?.find((u) => u.id === selected.id) ?? null)
			: null;

	const selectedAgencyQuery = useQuery({
		queryKey: ["agency-by-id", selected?.id],
		queryFn: () => fetchAgencyById(selected!.id, logout),
		enabled: selected?.role === "agency" && !selectedAgencyFromList,
		staleTime: 30_000,
	});
	const selectedOutletQuery = useQuery({
		queryKey: ["outlet-by-id", selected?.id],
		queryFn: () => fetchOutletById(selected!.id, logout),
		enabled: selected?.role === "outlet" && !selectedOutletFromList,
		staleTime: 30_000,
	});

	const selectedAgency =
		selectedAgencyFromList ?? selectedAgencyQuery.data?.data ?? null;
	const selectedOutlet =
		selectedOutletFromList ?? selectedOutletQuery.data?.data ?? null;

	const approveAgencyMutation = useMutation({
		mutationFn: (id: string) => approveAgency(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["agencies"] });
			toast.success(response.message || "Agency reactivated");
			setSelected(null);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, "Failed to reactivate agency")?.message ??
					"Failed to reactivate agency",
			);
		},
		onSettled: () => setActionId(null),
	});

	const approveOutletMutation = useMutation({
		mutationFn: (id: string) => approveOutlet(id, logout),
		onMutate: (id) => setActionId(id),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["legacy-members"] });
			queryClient.invalidateQueries({ queryKey: ["outlets"] });
			toast.success(response.message || "Outlet reactivated");
			setSelected(null);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, "Failed to reactivate outlet")?.message ??
					"Failed to reactivate outlet",
			);
		},
		onSettled: () => setActionId(null),
	});

	const showLoading = isLoading && rows.length === 0;

	function refetchAll() {
		for (const q of legacyQueries) void q.refetch();
	}

	return (
		<PageShell>
			<PageHeader
				icon={type.icon}
				title={type.title}
				description={type.description}
			/>

			<div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
				<div className="flex items-start gap-2">
					<Info className="mt-0.5 h-4 w-4 shrink-0" />
					<div>
						<p className="font-medium text-sky-50">About Legacy Member</p>
						<p className="mt-1 text-sky-100/85">
							This list shows suspended Agency and Outlet organizations, plus
							inactive PR accounts. Filter by Role (not Rank). Reactivate an
							agency or outlet to restore access; PRs are read-only here.
						</p>
					</div>
				</div>
			</div>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						Search Filters
						{isFetching && !showLoading && (
							<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
						)}
					</CardTitle>
					<CardDescription>
						Find suspended records by name, code, contact, and role.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
						<div className="space-y-1.5">
							<Label htmlFor="legacy-name">Name</Label>
							<div className="relative">
								<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
								<Input
									id="legacy-name"
									value={nameFilter}
									onChange={(e) => setNameFilter(e.target.value)}
									placeholder="Full name / org name"
									className="pl-8"
								/>
							</div>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-code">Code / ID</Label>
							<Input
								id="legacy-code"
								value={codeFilter}
								onChange={(e) => setCodeFilter(e.target.value)}
								placeholder="Agency code, SSM, ID no."
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-contact">Contact</Label>
							<Input
								id="legacy-contact"
								value={contactFilter}
								onChange={(e) => setContactFilter(e.target.value)}
								placeholder="Email, phone, place"
							/>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-role">Role</Label>
							<Select
								value={roleFilter}
								onValueChange={(value) =>
									setRoleFilter(value as LegacyRoleFilter)
								}
							>
								<SelectTrigger id="legacy-role" aria-label="Filter by role">
									<SelectValue placeholder="Role" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All Roles</SelectItem>
									<SelectItem value="agency">Agency</SelectItem>
									<SelectItem value="outlet">Outlet</SelectItem>
									<SelectItem value="pr">PR</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-sort-by">Sort By</Label>
							<Select
								value={sortBy}
								onValueChange={(value) => setSortBy(value as SortBy)}
							>
								<SelectTrigger id="legacy-sort-by" aria-label="Sort by">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="name">Name</SelectItem>
									<SelectItem value="createdAt">Created</SelectItem>
									<SelectItem value="updatedAt">Updated</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="legacy-sort-order">Sort Order</Label>
							<Select
								value={sortOrder}
								onValueChange={(value) => setSortOrder(value as SortOrder)}
							>
								<SelectTrigger id="legacy-sort-order" aria-label="Sort order">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="asc">Ascending</SelectItem>
									<SelectItem value="desc">Descending</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
				</CardContent>
			</Card>

			<Card className="border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								Suspended & inactive records
								{isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								Segmented by role. Click a row or View to open details.
							</CardDescription>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={refetchAll}
							disabled={isFetching}
						>
							<RefreshCw
								className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
							/>
							Refresh
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<div className="overflow-x-auto rounded-lg border border-(--lavender-soft)/30">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-10" />
									<TableHead>Name</TableHead>
									<TableHead>Code / ID</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Contact</TableHead>
									<TableHead className="w-[120px]">Status</TableHead>
									<TableHead className="w-[150px]">Updated</TableHead>
									<TableHead className="w-[220px]">Actions</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{showLoading && (
									<TableRow>
										<TableCell colSpan={8} className="h-40 text-center">
											<Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
										</TableCell>
									</TableRow>
								)}

								{!showLoading && isError && (
									<TableRow>
										<TableCell colSpan={8} className="h-40 text-center">
											<div className="flex flex-col items-center gap-2">
												<AlertCircle className="h-8 w-8 text-destructive" />
												<p className="text-sm text-muted-foreground">
													{getErrorMessage(error as Error | null) ||
											"Failed to load legacy members"}
												</p>
												<Button variant="outline" size="sm" onClick={refetchAll}>
													Retry
												</Button>
											</div>
										</TableCell>
									</TableRow>
								)}

								{!showLoading && !isError && pageRows.length === 0 && (
									<TableRow>
										<TableCell colSpan={8} className="h-40 text-center">
											<div className="flex flex-col items-center gap-2 text-muted-foreground">
												<Archive className="h-8 w-8 opacity-50" />
												<p className="text-sm">No suspended records found.</p>
											</div>
										</TableCell>
									</TableRow>
								)}

								{!showLoading &&
									!isError &&
									pageRows.map((row) => {
										const busy = actionId === row.id;
										return (
											<TableRow
												key={`${row.role}-${row.id}`}
												className="cursor-pointer"
												onClick={() =>
													setSelected({ role: row.role, id: row.id })
												}
											>
												<TableCell>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														onClick={(e) => {
															e.stopPropagation();
															setSelected({ role: row.role, id: row.id });
														}}
														aria-label={`View ${row.name}`}
													>
														<Eye className="h-4 w-4" />
													</Button>
												</TableCell>
												<TableCell>
													<div className="font-medium">{row.name}</div>
													{row.detail && (
														<div className="text-sm text-muted-foreground">
															{row.detail}
														</div>
													)}
												</TableCell>
												<TableCell className="font-mono text-sm">
													{row.code}
												</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={roleBadgeColors[row.role]}
													>
														{roleLabels[row.role]}
													</Badge>
												</TableCell>
												<TableCell>{row.contact}</TableCell>
												<TableCell>
													<Badge
														variant="outline"
														className={row.statusClass}
													>
														{row.statusLabel}
													</Badge>
												</TableCell>
												<TableCell className="text-base text-muted-foreground">
													{formatDate(row.updatedAt)}
												</TableCell>
												<TableCell>
													<div
														className="flex flex-wrap gap-2"
														onClick={(e) => e.stopPropagation()}
													>
														{(row.role === "agency" || row.role === "outlet") && (
															<Button
																size="sm"
																variant="outline"
																disabled={busy}
																onClick={() => {
																	if (row.role === "agency") {
																		approveAgencyMutation.mutate(row.id);
																	} else {
																		approveOutletMutation.mutate(row.id);
																	}
																}}
															>
																{busy ? (
																	<Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
																) : (
																	<CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
																)}
																Reactivate
															</Button>
														)}
														<Button
															size="sm"
															variant="ghost"
															onClick={() =>
																setSelected({ role: row.role, id: row.id })
															}
														>
															<Eye className="mr-1.5 h-3.5 w-3.5" />
															View
														</Button>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
							</TableBody>
						</Table>
					</div>

					{totalCount > 0 && (
						<div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
							<div>
								Showing{" "}
								<span className="font-medium">
									{formatNumber((currentPage - 1) * PAGE_SIZE + 1)}
								</span>{" "}
								-{" "}
								<span className="font-medium">
									{formatNumber(
										Math.min(currentPage * PAGE_SIZE, totalCount),
									)}
								</span>{" "}
								of <span className="font-medium">{formatNumber(totalCount)}</span>{" "}
								records
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage <= 1 || isFetching}
									onClick={() => setPage((value) => value - 1)}
								>
									Previous
								</Button>
								<span>
									Page {currentPage} of {totalPages}
								</span>
								<Button
									variant="outline"
									size="sm"
									disabled={currentPage >= totalPages || isFetching}
									onClick={() => setPage((value) => value + 1)}
								>
									Next
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			<AgencyDetailsSheet
				agency={selectedAgency}
				open={selected?.role === "agency"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
				onApprove={(id) => approveAgencyMutation.mutate(id)}
				onSuspend={() => {}}
				actionId={actionId}
			/>

			<OutletDetailsSheet
				outlet={selectedOutlet}
				open={selected?.role === "outlet"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
				onApprove={(id) => approveOutletMutation.mutate(id)}
				onSuspend={() => {}}
				actionId={actionId}
			/>

			<PrDetailsSheet
				user={selectedPrFromList}
				open={selected?.role === "pr"}
				onOpenChange={(open) => {
					if (!open) setSelected(null);
				}}
			/>
		</PageShell>
	);
}
