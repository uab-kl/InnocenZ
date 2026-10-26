import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	Building2,
	Loader2,
	MoreHorizontal,
	RefreshCw,
	Search,
	Users2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminFilters } from "@/components/admin/admin-filters";
import { PageHeader, PageShell } from "@/components/admin/page-header";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/auth-context";
import { toMutationError } from "@/lib/mutation-error";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { AgencyPagination, AgencyTeamMember } from "@/services/agency";
import { fetchAgencyTeamMembers, updateAgencyMember } from "@/services/agency";
import type { OutletTeamMember } from "@/services/outlet";
import { fetchOutletTeamMembers, updateOutletMember } from "@/services/outlet";
import { formatSubRole, memberStatusLabel } from "./org-status";
import {
	AGENCY_TEAM_GROUPS,
	type OrgKind,
	OUTLET_TEAM_GROUPS,
	OWNER_LEVEL_SUB_ROLES,
} from "./org-team-groups";

const PAGE_SIZE = 10;

/*
 * One annotated page shape for both endpoints. Without it the ternary hands
 * useQuery a union of two response types and it cannot resolve one row type;
 * the two pagination envelopes are field-for-field identical, so the agency
 * one stands for both.
 */
type TeamMembersPage = {
	data: Array<AgencyTeamMember | OutletTeamMember>;
	pagination: AgencyPagination;
};

/**
 * Free varchar on both membership tables, not an enum — these are the values the
 * product actually writes, offered as a fixed choice so a typo cannot silently
 * return an empty page with a total of 0 and read as "nobody works here".
 */
const STATUS_OPTIONS = ["active", "inactive"] as const;

/**
 * One row, normalised across the two endpoints. The organisation’s own code is
 * NOT among the fields: `memberCode` below identifies the person, and repeating
 * an org code beside it was the confusion the owner asked to end — *"no this
 * agency code , all use the member id"* (9 Sep 2026).
 */
type Row = {
	membershipId: string;
	/** INNATAGY0001 — the id support and the owner actually quote. */
	memberCode: string | null;
	userId: string;
	orgId: string;
	orgName: string;
	username: string;
	email: string | null;
	phoneNum: string | null;
	subRole: string;
	status: string;
	createdAt: string;
};

/**
 * Every operator of every organisation of one kind — the admin's "Team members"
 * screen, one per portal.
 *
 * WHY IT IS SERVER-PAGINATED: the obvious client-side build (page every agency,
 * then one member call per agency, slice in memory) is a 1+N fan-out whose page
 * numbers stop meaning anything the moment an organisation is added.
 * `GET /agency/team-members` and `GET /outlet/team-members` exist for this
 * screen and page in SQL.
 *
 * THE SUB-ROLE COLUMN IS PER-MEMBERSHIP, since migration 0160. Each row shows
 * the title held AT THAT ORGANISATION, so one person listed twice can correctly
 * show Finance on one row and Owner on the other.
 *
 * ⚠️ This block used to say the exact opposite, and it was true when written:
 * the lane was derived from `user_role → role → portal` with no organisation
 * term, every membership of a person showed the same value, and anyone holding
 * no portal role read as Owner. If you are reading a comment elsewhere that
 * still claims that, it is stale — the column is the authority now.
 */
export function OrgMembersListPage({
	orgKind,
	orgId,
}: {
	orgKind: OrgKind;
	/** Deep link from one organisation's Team tab — narrows the list to it. */
	orgId?: string;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const isAgency = orgKind === "agency";

	const [searchInput, setSearchInput] = useState("");
	const [debouncedSearch, setDebouncedSearch] = useState("");
	const [statusFilter, setStatusFilter] = useState<string>("all");
	const [currentPage, setCurrentPage] = useState(1);

	/*
	 * 300ms, and it resets the page — the house pattern. Without the reset a
	 * search typed from page 3 lands on page 3 of a shorter result set, which
	 * reads as "no matches" for a term that has plenty.
	 */
	useEffect(() => {
		const timer = window.setTimeout(() => {
			setDebouncedSearch(searchInput.trim());
			setCurrentPage(1);
		}, 300);
		return () => window.clearTimeout(timer);
	}, [searchInput]);

	const navigate = useNavigate();
	const queryClient = useQueryClient();
	/** Which row is mid-flight — one at a time, so the busy state is per row. */
	const [actionId, setActionId] = useState<string | null>(null);
	/*
	 * The row awaiting confirmation, and — when switching back on — the lane to
	 * restore them with.
	 *
	 * ⚠️ DEACTIVATING IS REMOVING on this endpoint: the server revokes the
	 * person's portal role when a membership stops being active, and then
	 * REFUSES (409) to switch it back on unless the caller names a sub-role,
	 * because the old lane went with the role. Two clicks that look symmetric
	 * are not, so neither happens without a sentence saying what it does.
	 */
	const [pending, setPending] = useState<{
		row: Row;
		next: "active" | "inactive";
	} | null>(null);
	const [restoreLane, setRestoreLane] = useState<string>("");

	/*
	 * Switch ONE membership on or off. This is the membership, not the login:
	 * the account stays exactly as it was, and the person keeps every other
	 * organisation they belong to.
	 *
	 * The server refuses (409) anything that would leave an organisation with no
	 * active owner, so the toast prints ITS sentence rather than a guess made
	 * here — silence after a click reads as failure and invites a second one.
	 */
	const statusMutation = useMutation({
		// Annotated: the two updaters return their own portal's response type, and
		// an un-annotated ternary hands useMutation a union it cannot resolve. Only
		// the server's sentence is read here, which both shapes carry.
		mutationFn: async ({
			membershipId,
			orgId: rowOrgId,
			nextStatus,
			subRole,
		}: {
			membershipId: string;
			orgId: string;
			nextStatus: string;
			subRole?: string;
		}): Promise<{ success: boolean; message: string }> =>
			isAgency
				? await updateAgencyMember(
						rowOrgId,
						membershipId,
						{ status: nextStatus, subRole },
						logout,
					)
				: await updateOutletMember(
						rowOrgId,
						membershipId,
						{ status: nextStatus, subRole },
						logout,
					),
		onMutate: ({ membershipId }) => setActionId(membershipId),
		onSuccess: (response) => {
			queryClient.invalidateQueries({ queryKey: ["org-team-members"] });
			toast.success(response.message);
			setPending(null);
		},
		onError: (err) => {
			toast.error(
				toMutationError(err, getErrorMessage(err))?.message ??
					getErrorMessage(err),
			);
		},
		onSettled: () => setActionId(null),
	});

	/* The whole row opens the person — the chevron is a hint, not the only target. */
	const openMember = (row: Row) => {
		if (isAgency) {
			navigate({
				to: "/admin/user-management/agency/$agencyId/member/$userId",
				params: { agencyId: row.orgId, userId: row.userId },
			});
			return;
		}
		navigate({
			to: "/admin/user-management/outlet/$outletId/member/$userId",
			params: { outletId: row.orgId, userId: row.userId },
		});
	};

	const params = {
		page: currentPage,
		pageSize: PAGE_SIZE,
		search: debouncedSearch || undefined,
		status: statusFilter === "all" ? undefined : statusFilter,
		orgId,
	};

	const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
		queryKey: ["org-team-members", orgKind, params],
		queryFn: async (): Promise<TeamMembersPage> =>
			isAgency
				? await fetchAgencyTeamMembers(params, logout)
				: await fetchOutletTeamMembers(params, logout),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
		retry: 2,
	});

	const rows: Row[] = (data?.data ?? []).map((m) =>
		"agencyId" in m
			? {
					membershipId: m.id,
					memberCode: m.memberCode ?? null,
					userId: m.userId,
					orgId: m.agencyId,
					orgName: m.agencyName,
					username: m.username ?? "",
					email: m.email ?? null,
					phoneNum: m.phoneNum ?? null,
					subRole: m.subRole,
					status: m.status,
					createdAt: m.createdAt,
				}
			: {
					membershipId: m.id,
					memberCode: m.memberCode ?? null,
					userId: m.userId,
					orgId: m.outletId,
					orgName: m.outletName,
					username: m.username ?? "",
					email: m.email ?? null,
					phoneNum: m.phoneNum ?? null,
					subRole: m.subRole,
					status: m.status,
					createdAt: m.createdAt,
				},
	);

	const pagination = data?.pagination;
	const groups = isAgency ? AGENCY_TEAM_GROUPS : OUTLET_TEAM_GROUPS;
	const laneLabel = (subRole: string) =>
		groups.find((g) => g.subRole === subRole)?.title(t) ??
		formatSubRole(subRole);
	const showLoading = isLoading && rows.length === 0;

	return (
		<PageShell className="iz-admin-management">
			<PageHeader
				icon={Users2}
				title={isAgency ? t.admin.navAgencyTeam : t.admin.navOutletTeam}
				description={
					isAgency
						? t.adminOrg.teamMembersAgencyHint
						: t.adminOrg.teamMembersOutletHint
				}
			/>

			{/* Says what the list is narrowed to, and how to leave. A filter applied
			    by a URL nobody typed has to be visible, or an empty result reads as
			    "there are no operators" rather than "none at this organisation". */}
			{orgId && (
				<div className="flex flex-wrap items-center gap-2 text-sm">
					<Badge variant="outline" className="gap-1.5">
						<Building2 className="h-3.5 w-3.5" />
						{rows[0]?.orgName ?? t.adminOrg.teamMembersOneOrg}
					</Badge>
					{/* An outline button, not a ghost link: it is the only way out of a
					    filter the reader did not apply, so it has to look pressable. */}
					<Button variant="outline" size="sm" asChild>
						{isAgency ? (
							<Link to="/admin/user-management/agency-team" search={{}}>
								{t.adminOrg.teamMembersShowAll}
							</Link>
						) : (
							<Link to="/admin/user-management/outlet-team" search={{}}>
								{t.adminOrg.teamMembersShowAll}
							</Link>
						)}
					</Button>
				</div>
			)}

			<Card className="iz-admin-management-card border-(--lavender-soft)/40 bg-card">
				<CardHeader>
					<div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div>
							<CardTitle className="flex items-center gap-2">
								{t.adminOrg.teamMembersTitle}
								{isFetching && !showLoading && (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								)}
							</CardTitle>
							<CardDescription>
								{t.adminOrg.teamMembersLaneNote}
							</CardDescription>
						</div>

						<AdminFilters>
							<div className="iz-admin-management-filters flex flex-col gap-2 sm:flex-row sm:items-center">
								<div className="relative sm:w-64">
									<Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
									<Input
										value={searchInput}
										onChange={(e) => setSearchInput(e.target.value)}
										placeholder={t.adminOrg.teamMembersSearchPlaceholder}
										className="pl-8"
										aria-label={t.adminOrg.teamMembersSearchAria}
									/>
								</div>
								<Select
									value={statusFilter}
									onValueChange={(value) => {
										setStatusFilter(value);
										setCurrentPage(1);
									}}
								>
									<SelectTrigger
										className="sm:w-44"
										aria-label={t.admin.filterByStatus}
									>
										<SelectValue placeholder={t.admin.filterByStatus} />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="all">{t.admin.allStatus}</SelectItem>
										{STATUS_OPTIONS.map((status) => (
											<SelectItem key={status} value={status}>
												{recordStatusLabel(status, t)}
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
									<TableHead>
										{t.admin.colName} / {t.adminOrg.memberCodeLabel}
									</TableHead>
									<TableHead>
										{isAgency ? t.adminOrg.agencyName : t.adminOrg.venue} /{" "}
										{t.adminOrg.memberSubRole}
									</TableHead>
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
										<TableCell colSpan={5} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Loader2 className="h-6 w-6 animate-spin" />
												<span>{t.adminOrg.memberLoading}</span>
											</div>
										</TableCell>
									</TableRow>
								) : isError ? (
									<TableRow>
										<TableCell colSpan={5} className="h-32">
											<div className="flex flex-col items-center justify-center gap-3">
												<AlertCircle className="h-8 w-8 text-destructive" />
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
								) : rows.length === 0 ? (
									<TableRow>
										<TableCell colSpan={5} className="h-32">
											<div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
												<Users2 className="h-6 w-6" />
												<span>{t.adminOrg.teamMembersNone}</span>
											</div>
										</TableCell>
									</TableRow>
								) : (
									rows.map((row) => (
										<TableRow
											key={row.membershipId}
											className="cursor-pointer"
											onClick={() => openMember(row)}
										>
											<TableCell>
												<button
													type="button"
													className="iz-admin-record-name"
													onClick={(event) => {
														event.stopPropagation();
														openMember(row);
													}}
												>
													{row.username ||
														row.email ||
														row.phoneNum ||
														t.adminUsers.actorUnknown}
												</button>
												<div className="iz-admin-record-secondary">
													{row.memberCode ?? "—"}
												</div>
											</TableCell>
											<TableCell
												data-label={
													isAgency ? t.adminOrg.agencyName : t.adminOrg.venue
												}
											>
												<div className="font-medium">{row.orgName}</div>
												<div className="iz-admin-record-secondary">
													{laneLabel(row.subRole)}
												</div>
											</TableCell>
											<TableCell data-label={t.adminUsers.colContact}>
												<div className="text-sm">{row.email || "—"}</div>
												<div className="text-xs text-muted-foreground">
													{row.phoneNum || "—"}
												</div>
											</TableCell>
											<TableCell data-label={t.admin.colStatus}>
												<Badge
													variant="outline"
													className="capitalize text-muted-foreground"
												>
													{memberStatusLabel(row.status, t)}
												</Badge>
												<div className="iz-admin-record-secondary">
													{formatDate(row.createdAt)}
												</div>
											</TableCell>
											<TableCell onClick={(event) => event.stopPropagation()}>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button
															variant="outline"
															size="icon"
															disabled={actionId === row.membershipId}
															aria-label={
																t.admin.colActions +
																" · " +
																(row.username || row.memberCode || row.userId)
															}
														>
															<MoreHorizontal aria-hidden className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem onSelect={() => openMember(row)}>
															{t.adminOrg.memberPageTitle}
														</DropdownMenuItem>
														<DropdownMenuItem
															disabled={actionId === row.membershipId}
															onSelect={() => {
																if (row.status !== "active") setRestoreLane("");
																setPending({
																	row,
																	next:
																		row.status === "active"
																			? "inactive"
																			: "active",
																});
															}}
														>
															{row.status === "active"
																? t.adminOrg.setInactive
																: t.adminOrg.activate}
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</div>

					{pagination && pagination.totalCount > 0 && (
						<div className="iz-admin-management-pagination text-muted-foreground">
							<div>
								{fill(t.adminOrg.teamMembersShowing, {
									from: (pagination.page - 1) * PAGE_SIZE + 1,
									to: Math.min(
										pagination.page * PAGE_SIZE,
										pagination.totalCount,
									),
									total: pagination.totalCount,
								})}
							</div>
							<div className="flex items-center gap-2">
								<Button
									variant="outline"
									size="sm"
									disabled={!pagination.hasPrevPage || isFetching}
									onClick={() => setCurrentPage((p) => p - 1)}
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
									onClick={() => setCurrentPage((p) => p + 1)}
								>
									{t.admin.next}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* One dialog for both directions, because the two are not symmetric:
			    switching OFF revokes the portal role, and switching back ON therefore
			    has to be told which lane to restore — the server refuses without it. */}
			<Dialog open={pending !== null} onOpenChange={() => setPending(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{pending?.next === "inactive"
								? t.adminOrg.memberDeactivateTitle
								: t.adminOrg.memberActivateTitle}
						</DialogTitle>
						<DialogDescription>
							{pending?.next === "inactive"
								? t.adminOrg.memberDeactivateBody
								: t.adminOrg.memberActivateBody}
						</DialogDescription>
					</DialogHeader>

					{/*
					 * Owner and Guarantor stay on this list DELIBERATELY (owner's
					 * decision, 14 Sep 2026): an outlet or agency can ask an admin to
					 * set one, and the admin is the only lane that can recover an
					 * organisation whose own owner-level member is gone.
					 *
					 * What they did not carry was any sign of what they grant.
					 * `guarantor` in particular reads like a junior lane while the
					 * model defines it at owner level, "including paying PRs" — so
					 * both are tagged, and choosing one says so in a sentence. The
					 * write itself is unchanged and already audited: every mutating
					 * REST call goes through `platformAuditMiddleware` (v1.ts), which
					 * records the actor, the portal and old/new data.
					 */}
					{pending?.next === "active" && (
						<div className="space-y-2">
							<Select value={restoreLane} onValueChange={setRestoreLane}>
								<SelectTrigger aria-label={t.adminOrg.memberSubRole}>
									<SelectValue placeholder={t.adminOrg.memberSubRole} />
								</SelectTrigger>
								<SelectContent>
									{groups.map((group) => (
										<SelectItem key={group.subRole} value={group.subRole}>
											{group.title(t)}
											{OWNER_LEVEL_SUB_ROLES.has(group.subRole)
												? ` · ${t.adminOrg.memberOwnerLevelTag}`
												: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{OWNER_LEVEL_SUB_ROLES.has(restoreLane) && (
								<p className="text-sm text-amber-600 dark:text-amber-400">
									{t.adminOrg.memberOwnerLevelWarning}
								</p>
							)}
						</div>
					)}

					<DialogFooter>
						<Button variant="outline" onClick={() => setPending(null)}>
							{t.admin.cancel}
						</Button>
						<Button
							variant={pending?.next === "inactive" ? "destructive" : "default"}
							disabled={
								!pending ||
								actionId === pending.row.membershipId ||
								(pending.next === "active" && !restoreLane)
							}
							onClick={() =>
								pending &&
								statusMutation.mutate({
									membershipId: pending.row.membershipId,
									orgId: pending.row.orgId,
									nextStatus: pending.next,
									subRole: pending.next === "active" ? restoreLane : undefined,
								})
							}
						>
							{pending?.next === "inactive"
								? t.adminOrg.setInactive
								: t.adminOrg.activate}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</PageShell>
	);
}
