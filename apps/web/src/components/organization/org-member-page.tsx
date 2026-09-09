import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	Building2,
	CalendarDays,
	Globe,
	Hash,
	Loader2,
	Mail,
	Phone,
	Shield,
	Store,
	User,
	UserCog,
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import { formatDate, getErrorMessage } from "@/lib/utils";
import {
	fetchAgencyMembers,
	fetchAgencyMembershipsForUser,
} from "@/services/agency";
import {
	fetchOutletMembers,
	fetchOutletMembershipsForUser,
} from "@/services/outlet";
import { fetchPortals } from "@/services/rbac";
import { fetchUserById, fetchUserRoles } from "@/services/user";
import {
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "./details-sheet-parts";
import { formatSubRole } from "./org-status";
import {
	AGENCY_TEAM_GROUPS,
	type OrgTeamMember,
	OUTLET_TEAM_GROUPS,
} from "./org-team-groups";

export type OrgKind = "agency" | "outlet";

/**
 * One team member, in full — the page behind every card in an org's Team tab.
 *
 * WHY A PAGE AND NOT A SECOND SHEET: the Team card can only show what the
 * org-scoped member list returns (name, lane, email, phone, joined). The three
 * facts an admin actually opens a member to check — the login account behind
 * them, the OTHER organisations they belong to, and the portal roles they were
 * really granted — each need their own call, keyed by userId rather than by the
 * membership.
 *
 * THE URL CARRIES BOTH IDS on purpose. There is no `GET /:org/:id/members/:memberId`
 * on either portal, and the joined date exists ONLY in the org-scoped list, so a
 * route holding just a membership id could fetch nothing at all.
 *
 * ADMIN ONLY. `/rbac/user-role` is mounted behind `requireAdmin`, so the grants
 * section 403s for any other portal — do not reuse this component inside the
 * agency or outlet portals without dropping that section first.
 */
export function OrgMemberPage({
	orgKind,
	orgId,
	userId,
}: {
	orgKind: OrgKind;
	orgId: string;
	userId: string;
}) {
	const { t } = usePortalLocale();
	const { logout } = useAuth();
	const isAgency = orgKind === "agency";

	/*
	 * The membership row. This list is the only source of the joined date and of
	 * the membership id — `/agency/memberships?userIds=` answers "which orgs" but
	 * carries no `createdAt`.
	 */
	const membersQuery = useQuery({
		/*
		 * NOT ["agency-members", orgId] — that is the details SHEET's key, and the
		 * sheet caches the whole `{success, message, data}` envelope while this
		 * query caches the rows. Sharing the key hands whichever ran first to the
		 * other, and the page died on `members.find is not a function`. One key,
		 * one shape.
		 */
		queryKey: ["org-member-page", orgKind, orgId, "members"],
		// Annotated: the two branches return AgencyMember[] / OutletMember[], and an
		// un-annotated ternary hands useQuery a union it cannot resolve to one row
		// type. Both satisfy OrgTeamMember, which is all this page reads.
		queryFn: async (): Promise<OrgTeamMember[]> =>
			isAgency
				? (await fetchAgencyMembers(orgId, {}, logout)).data
				: (await fetchOutletMembers(orgId, logout)).data,
		staleTime: 30_000,
	});

	const userQuery = useQuery({
		queryKey: ["user", userId],
		queryFn: () => fetchUserById(userId, logout),
		staleTime: 30_000,
	});

	const grantsQuery = useQuery({
		queryKey: ["user-roles", userId],
		queryFn: () => fetchUserRoles(userId, logout),
		staleTime: 30_000,
	});

	const portalsQuery = useQuery({
		queryKey: ["rbac-portals"],
		queryFn: () => fetchPortals(logout),
		staleTime: 5 * 60_000,
	});

	/*
	 * "all", not the default "active": a membership that was switched off is
	 * exactly what an admin opening this page is trying to see.
	 */
	const agencyOrgsQuery = useQuery({
		queryKey: ["agency-memberships", userId],
		queryFn: () =>
			fetchAgencyMembershipsForUser(userId, logout, { status: "all" }).then(
				(r) => r.data,
			),
		staleTime: 30_000,
	});

	const outletOrgsQuery = useQuery({
		queryKey: ["outlet-memberships", userId],
		queryFn: () =>
			fetchOutletMembershipsForUser(userId, logout, { status: "all" }).then(
				(r) => r.data,
			),
		staleTime: 30_000,
	});

	const members = membersQuery.data ?? [];
	const membership = members.find((m) => m.userId === userId) ?? null;
	const account = userQuery.data ?? null;
	const groups = isAgency ? AGENCY_TEAM_GROUPS : OUTLET_TEAM_GROUPS;
	const lane = membership
		? (groups.find((g) => g.subRole === membership.subRole)?.title(t) ??
			formatSubRole(membership.subRole))
		: null;

	/*
	 * `username` can be empty on an invited account that never finished sign-up;
	 * the card falls back to a truncated id and so must the page, or the header
	 * renders blank.
	 */
	const displayName =
		account?.username ||
		account?.profile?.fullName ||
		membership?.username ||
		`${userId.slice(0, 8)}…`;

	const backTo = isAgency
		? "/admin/user-management/agency"
		: "/admin/user-management/outlet";

	const portalName = (portalId: string | null) =>
		portalsQuery.data?.find((p) => p.id === portalId)?.name ?? null;

	const loading = membersQuery.isLoading || userQuery.isLoading;

	return (
		<PageShell>
			<PageHeader
				icon={UserCog}
				title={displayName}
				description={t.adminOrg.memberPageHint}
				actions={
					<Button variant="outline" size="sm" asChild>
						<Link to={backTo}>
							<ArrowLeft className="mr-2 h-4 w-4" />
							{t.common.back}
						</Link>
					</Button>
				}
			/>

			{loading ? (
				<div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					{t.adminOrg.memberLoading}
				</div>
			) : membersQuery.isError || userQuery.isError ? (
				<p className="py-4 text-sm text-destructive">
					{getErrorMessage(membersQuery.error ?? userQuery.error)}
				</p>
			) : (
				<div className="space-y-4">
					<DetailsHero
						name={displayName}
						subtitle={lane}
						status={account?.status ?? membership?.status ?? "active"}
						imageUrl={apiAssetUrl(account?.profileImage)}
					/>

					{/* The membership is what the admin clicked through; if it is gone,
					    say so rather than rendering an empty role card. */}
					{membership ? (
						<DetailSection
							title={t.adminOrg.memberRoleHere}
							description={t.adminOrg.memberRoleHereHint}
						>
							<DetailField
								icon={isAgency ? Building2 : Store}
								label={t.adminOrg.memberSubRole}
								value={lane}
							/>
							<DetailField
								icon={Shield}
								label={t.adminOrg.membershipStatus}
								value={recordStatusLabel(membership.status, t)}
							/>
							<DetailField
								icon={CalendarDays}
								label={t.admin.colCreated}
								value={formatDate(membership.createdAt)}
							/>
							{/*
							 * The member code is the ONLY id shown. The raw membership uuid used
							 * to sit beside it "for support tickets", which is a reason to keep it
							 * reachable, not a reason to print it: two id fields under one heading
							 * make a reader stop and work out which one they are being asked for,
							 * and the answer was always the readable one. The uuid is still in the
							 * URL and in the API response for anyone who genuinely needs it.
							 */}
							<DetailField
								icon={Hash}
								label={t.adminOrg.memberCodeLabel}
								value={membership.memberCode ?? null}
							/>
						</DetailSection>
					) : (
						<p className="text-sm text-amber-600 dark:text-amber-400">
							{t.adminOrg.memberNotInTeam}
						</p>
					)}

					<DetailSection
						title={t.adminOrg.memberAccount}
						description={t.adminOrg.memberAccountHint}
					>
						<DetailField
							icon={User}
							label={t.admin.colName}
							value={account?.username}
						/>
						<DetailField
							icon={Mail}
							label={t.adminOrg.memberLoginEmail}
							value={account?.email}
							href={account?.email ? `mailto:${account.email}` : undefined}
						/>
						<DetailField
							icon={Phone}
							label={t.adminOrg.phone}
							value={account?.phoneNum}
							href={account?.phoneNum ? `tel:${account.phoneNum}` : undefined}
						/>
						<DetailField
							icon={Shield}
							label={t.adminOrg.memberAccountStatus}
							value={account ? recordStatusLabel(account.status, t) : undefined}
						/>
						<DetailField
							icon={Globe}
							label={t.adminOrg.memberLanguage}
							value={account?.preferredLocale}
						/>
						<DetailField
							icon={Hash}
							label={t.adminOrg.memberUserId}
							value={userId}
						/>
					</DetailSection>

					{/* Rendered only when a profile row exists: an org operator invited by
					    email has none, and a section of six em-dashes reads as data loss. */}
					{account?.profile && (
						<DetailSection
							title={t.adminOrg.memberPersonal}
							description={t.adminOrg.memberPersonalHint}
						>
							<DetailField
								icon={User}
								label={t.adminOrg.memberFullName}
								value={account.profile.fullName}
							/>
							<DetailField
								icon={Globe}
								label={t.adminOrg.memberNationality}
								value={account.profile.nationality}
							/>
							<DetailField
								icon={User}
								label={t.adminOrg.memberGender}
								value={account.profile.gender}
							/>
							<DetailField
								icon={CalendarDays}
								label={t.adminOrg.memberDob}
								value={
									account.profile.dob ? formatDate(account.profile.dob) : null
								}
							/>
							{/* Age is DERIVED by the API from the IC, never stored — the same
							    value and the same rule the PR screens have always shown.
							    Rendering the number the server sent is what stops this page
							    disagreeing with them. */}
							<DetailField
								icon={CalendarDays}
								label={t.adminOrg.memberAge}
								value={
									account.profile.age == null
										? null
										: String(account.profile.age)
								}
							/>
							<DetailField
								icon={Hash}
								label={t.adminOrg.memberIdType}
								value={account.profile.idType}
							/>
							<DetailField
								icon={Hash}
								label={t.adminOrg.memberIdNo}
								value={account.profile.idNo}
							/>
						</DetailSection>
					)}

					<OrganisationsSection
						currentOrgId={orgId}
						agencies={agencyOrgsQuery.data ?? []}
						outlets={outletOrgsQuery.data ?? []}
						loading={agencyOrgsQuery.isLoading || outletOrgsQuery.isLoading}
					/>

					<DetailSection
						title={t.adminOrg.memberGrants}
						description={t.adminOrg.memberGrantsHint}
					>
						<div className="space-y-2 sm:col-span-2">
							{grantsQuery.isLoading ? (
								<p className="text-sm text-muted-foreground">
									{t.adminOrg.memberLoading}
								</p>
							) : grantsQuery.isError ? (
								<p className="text-sm text-destructive">
									{getErrorMessage(grantsQuery.error)}
								</p>
							) : (grantsQuery.data ?? []).length === 0 ? (
								<p className="text-sm text-amber-600 dark:text-amber-400">
									{t.adminOrg.memberGrantsNone}
								</p>
							) : (
								<ul className="divide-y rounded-md border">
									{(grantsQuery.data ?? []).map((grant) => (
										<li
											key={grant.id}
											className="flex items-center justify-between gap-3 px-3 py-2"
										>
											<div className="min-w-0">
												<div className="truncate text-sm font-medium">
													{grant.roleName}
												</div>
												<div className="truncate text-xs text-muted-foreground">
													{portalName(grant.portalId) ?? grant.portalId ?? "—"}
												</div>
											</div>
											<Badge
												variant="outline"
												className="shrink-0 capitalize text-muted-foreground"
											>
												{recordStatusLabel(grant.status, t)}
											</Badge>
										</li>
									))}
								</ul>
							)}
						</div>
					</DetailSection>

					{membership && (
						<SystemInfoCard
							createdBy={membership.createdBy ?? ""}
							createdAt={membership.createdAt}
							updatedBy={membership.updatedBy ?? ""}
							updatedAt={membership.updatedAt ?? membership.createdAt}
						/>
					)}
				</div>
			)}
		</PageShell>
	);
}

/**
 * Every organisation this person belongs to — the question the Team tab cannot
 * answer, because it only ever knows the org you opened it from.
 *
 * Agencies and venues are listed together and labelled, rather than split into
 * two cards: one person can hold both, and an admin checking "where else is this
 * account used" wants one list, not two half-answers.
 */
function OrganisationsSection({
	currentOrgId,
	agencies,
	outlets,
	loading,
}: {
	currentOrgId: string;
	agencies: Array<{
		membershipId: string;
		agencyId: string;
		agencyName: string;
		/** The person’s id AT that agency — what identifies them there. */
		memberCode?: string | null;
		agencyStatus: string;
		status: string;
		subRole: string;
	}>;
	outlets: Array<{
		membershipId: string;
		outletId: string;
		outletName: string;
		outletStatus: string;
		memberCode?: string | null;
		status: string;
		subRole?: string;
	}>;
	loading: boolean;
}) {
	const { t } = usePortalLocale();

	const rows = [
		...agencies.map((a) => ({
			key: a.membershipId,
			orgId: a.agencyId,
			icon: Building2,
			name: a.agencyName,
			sub: a.memberCode ?? null,
			lane: a.subRole,
			status: a.status,
			orgStatus: a.agencyStatus,
		})),
		...outlets.map((o) => ({
			key: o.membershipId,
			orgId: o.outletId,
			icon: Store,
			name: o.outletName,
			sub: o.memberCode ?? null,
			lane: o.subRole ?? "",
			status: o.status,
			orgStatus: o.outletStatus,
		})),
	];

	return (
		<DetailSection
			title={t.adminOrg.memberOrgs}
			description={t.adminOrg.memberOrgsHint}
		>
			<div className="space-y-2 sm:col-span-2">
				{loading ? (
					<p className="text-sm text-muted-foreground">
						{t.adminOrg.memberLoading}
					</p>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t.adminOrg.memberOrgsNone}
					</p>
				) : (
					<ul className="divide-y rounded-md border">
						{rows.map((row) => {
							const Icon = row.icon;
							return (
								<li
									key={row.key}
									className="flex items-center justify-between gap-3 px-3 py-2"
								>
									<div className="flex min-w-0 items-center gap-2.5">
										<Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
										<div className="min-w-0">
											<div className="flex flex-wrap items-center gap-2">
												<span className="truncate text-sm font-medium">
													{row.name}
												</span>
												{row.orgId === currentOrgId && (
													<Badge variant="outline" className="text-xs">
														{t.adminOrg.memberOrgThis}
													</Badge>
												)}
											</div>
											<div className="truncate text-xs text-muted-foreground">
												{[row.sub, row.lane ? formatSubRole(row.lane) : null]
													.filter(Boolean)
													.join(" · ")}
											</div>
										</div>
									</div>
									<span className="shrink-0 text-xs text-muted-foreground">
										{recordStatusLabel(row.status, t)}
									</span>
								</li>
							);
						})}
					</ul>
				)}
			</div>
		</DetailSection>
	);
}
