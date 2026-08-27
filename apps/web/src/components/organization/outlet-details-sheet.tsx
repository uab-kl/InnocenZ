import { useQuery } from "@tanstack/react-query";
import {
	Building2,
	CalendarDays,
	Compass,
	FileText,
	Globe,
	Hash,
	Loader2,
	Mail,
	MapPin,
	Phone,
	User,
	Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { recordStatusLabel } from "@/lib/portal-i18n/rbac-label";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";
import { formatDate, getErrorMessage } from "@/lib/utils";

import {
	type AgencyOutletApproveStatus,
	fetchOutletAgencyLinks,
} from "@/services/agency-outlet";
import type { Outlet, OutletMember } from "@/services/outlet";
import { fetchOutletMembers } from "@/services/outlet";
import {
	ApprovalStatusCard,
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "./details-sheet-parts";
import { formatSubRole } from "./org-status";

/**
 * `subRole` is the STORED code and is what every filter below compares on;
 * only `title` / `description` are rendered, so they are functions of the
 * dictionary rather than strings — a module-scope map cannot read `t`.
 */
const TEAM_GROUPS: {
	subRole: OutletMember["subRole"];
	title: (t: PortalTranslations) => string;
	description: (t: PortalTranslations) => string;
}[] = [
	{
		subRole: "owner",
		title: (t) => t.profile.roleOwner,
		description: (t) => t.adminOrg.teamOwnerHint,
	},
	{
		subRole: "finance",
		title: (t) => t.outletSettings.financeHead,
		description: (t) => t.adminOrg.teamFinanceHint,
	},
	{
		subRole: "operations_head",
		title: (t) => t.outletSettings.opsHead,
		description: (t) => t.outletSettings.opsHeadHint,
	},
	// A member whose lane is missing from this list is grouped nowhere and so
	// vanishes from the sheet — this is the admin's view of who is at the venue,
	// not a legend.
	{
		subRole: "guarantor",
		title: (t) => t.profile.roleGuarantor,
		description: (t) => t.adminOrg.teamGuarantorHint,
	},
	{
		subRole: "director",
		title: (t) => t.profile.roleDirector,
		description: (t) => t.adminOrg.teamDirectorHint,
	},
];

function MemberCard({ member }: { member: OutletMember }) {
	const { t } = usePortalLocale();
	return (
		<div className="rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-3 sm:col-span-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-base font-semibold">
					{member.username || `${member.userId.slice(0, 8)}…`}
				</span>
				<Badge variant="outline" className="capitalize text-muted-foreground">
					{recordStatusLabel(member.status, t)}
				</Badge>
				<span className="ml-auto text-sm text-muted-foreground">
					{fill(t.adminOrg.joinedOn, { date: formatDate(member.createdAt) })}
				</span>
			</div>
			<div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
				<span className="inline-flex items-center gap-1.5">
					<Mail className="h-4 w-4" />
					{member.email || "—"}
				</span>
				<span className="inline-flex items-center gap-1.5">
					<Phone className="h-4 w-4" />
					{member.phoneNum || "—"}
				</span>
			</div>
		</div>
	);
}

// Record KEYS are the stored `agency_outlet.approve_status` values and never
// move; the entries are functions because a module-scope map cannot read `t`.
const LINK_STATUS_LABEL: Record<
	AgencyOutletApproveStatus,
	(t: PortalTranslations) => string
> = {
	approved: (t) => t.adminOrg.linkWorkingWithVenue,
	pending: (t) => t.adminOrg.linkAwaitingAgency,
	rejected: (t) => t.adminOrg.linkDeclinedByAgency,
	// Past tense, and kept distinct from "declined": ended means the two DID
	// work together and the arrangement is over. An admin reading a support
	// ticket has to tell those apart — "they never accepted us" and "we stopped
	// working together" lead to completely different next questions.
	ended: (t) => t.adminOrg.linkPartnershipEnded,
};

const LINK_STATUS_CLASS: Record<AgencyOutletApproveStatus, string> = {
	approved: "text-emerald-600 dark:text-emerald-400",
	pending: "text-amber-600 dark:text-amber-400",
	rejected: "text-rose-600 dark:text-rose-400",
	// Grey, not red — nothing went wrong here.
	ended: "text-muted-foreground",
};

/**
 * Every agency this venue works with (`agency_outlet`, 0123).
 *
 * Replaces the old single "PR fulfilment agency" picker, which set
 * `onboarded_by_agency_id` — the column `POST /shift` used to route through.
 * That is no longer how routing works: a venue links as many agencies as it
 * likes in outlet Settings, each accepts or declines for itself, and a posted
 * job goes to whichever of them the outlet selected. One agency here could only
 * ever have shown one of several, and editing it granted nothing.
 *
 * READ-ONLY on purpose. An admin setting a link would be agreeing to a
 * partnership on the agency's behalf, which is precisely the consent this table
 * exists to record. The venue asks; the agency answers.
 */
function LinkedAgenciesCard({ outlet }: { outlet: Outlet }) {
	const { logout } = useAuth();
	const { t } = usePortalLocale();

	const linksQuery = useQuery({
		queryKey: ["agency-outlet", "outlet", outlet.id],
		queryFn: () => fetchOutletAgencyLinks(outlet.id, logout),
		staleTime: 30_000,
	});

	const links = linksQuery.data ?? [];
	const approved = links.filter((l) => l.approveStatus === "approved").length;

	return (
		<DetailSection
			title={t.adminOrg.linkedAgencies}
			description={t.adminOrg.linkedAgenciesHint}
		>
			<div className="space-y-2 sm:col-span-2">
				{linksQuery.isLoading ? (
					<p className="text-sm text-muted-foreground">
						{t.agencyLinks.loading}
					</p>
				) : linksQuery.isError ? (
					<p className="text-sm text-destructive">
						{getErrorMessage(linksQuery.error)}
					</p>
				) : links.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t.adminOrg.noAgenciesLinked}
					</p>
				) : (
					<>
						<ul className="divide-y rounded-md border">
							{links.map((link) => (
								<li
									key={link.id}
									className="flex items-center justify-between gap-3 px-3 py-2"
								>
									<div className="min-w-0">
										<div className="truncate text-sm font-medium">
											{link.agencyName}
										</div>
										<div className="truncate text-xs text-muted-foreground">
											{link.agencyCode}
										</div>
										{link.approveStatus === "rejected" && link.rejectReason && (
											<div className="text-xs text-rose-500">
												{link.rejectReason}
											</div>
										)}
									</div>
									<span
										className={`shrink-0 text-xs ${LINK_STATUS_CLASS[link.approveStatus]}`}
									>
										{LINK_STATUS_LABEL[link.approveStatus]?.(t) ??
											link.approveStatus}
									</span>
								</li>
							))}
						</ul>
						{approved === 0 && (
							<p className="text-sm text-amber-600 dark:text-amber-400">
								{t.adminOrg.noAgencyApprovedYet}
							</p>
						)}
					</>
				)}
			</div>
		</DetailSection>
	);
}

interface OutletDetailsSheetProps {
	outlet: Outlet | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApprove: (id: string) => void;
	onSuspend: (id: string) => void;
	actionId: string | null;
}

export function OutletDetailsSheet({
	outlet,
	open,
	onOpenChange,
	onApprove,
	onSuspend,
	actionId,
}: OutletDetailsSheetProps) {
	const { logout } = useAuth();
	const { t } = usePortalLocale();

	const membersQuery = useQuery({
		queryKey: ["outlet-members", outlet?.id],
		queryFn: () => fetchOutletMembers(outlet!.id, logout),
		enabled: open && Boolean(outlet),
		staleTime: 30_000,
	});

	const members = membersQuery.data?.data ?? [];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>{t.adminOrg.outletDetailsTitle}</SheetTitle>
					<SheetDescription>{t.adminOrg.outletDetailsHint}</SheetDescription>
				</SheetHeader>

				{outlet && (
					<div className="space-y-4 px-4 pb-6">
						<DetailsHero
							name={outlet.name}
							subtitle={[outlet.state, outlet.country]
								.filter(Boolean)
								.join(", ")}
							status={outlet.status}
							imageUrl={apiAssetUrl(outlet.logoImage)}
						/>

						<Tabs defaultValue="business">
							<TabsList className="w-full">
								<TabsTrigger value="business">
									<Building2 className="h-3.5 w-3.5" /> {t.adminOrg.tabBusiness}
								</TabsTrigger>
								<TabsTrigger value="location">
									<MapPin className="h-3.5 w-3.5" /> {t.adminOrg.tabLocation}
								</TabsTrigger>
								<TabsTrigger value="team">
									<Users className="h-3.5 w-3.5" /> {t.adminOrg.tabTeam}
								</TabsTrigger>
							</TabsList>

							<TabsContent value="business" className="space-y-3 pt-2">
								<DetailSection title={t.adminOrg.businessInformation}>
									<DetailField
										icon={Building2}
										label={t.adminOrg.venue}
										value={outlet.name}
									/>
									<DetailField
										icon={Hash}
										label={t.adminOrg.ssmNo}
										value={outlet.ssmNo}
									/>
									<DetailField
										icon={FileText}
										label={t.adminOrg.businessLicense}
										value={outlet.businessLicense}
									/>
									<DetailField
										icon={CalendarDays}
										label={t.admin.colCreated}
										value={formatDate(outlet.createdAt)}
									/>
								</DetailSection>

								<LinkedAgenciesCard outlet={outlet} />
							</TabsContent>

							<TabsContent value="location" className="space-y-3 pt-2">
								<DetailSection title={t.adminOrg.venueLocation}>
									<DetailField
										icon={MapPin}
										label={t.profile.addressLine1}
										value={outlet.addressLine1}
									/>
									<DetailField
										icon={MapPin}
										label={t.profile.addressLine2}
										value={outlet.addressLine2}
									/>
									<DetailField
										icon={Hash}
										label={t.profile.postcode}
										value={outlet.postcode}
									/>
									<DetailField
										icon={Globe}
										label={t.profile.state}
										value={outlet.state}
									/>
									<DetailField
										icon={Globe}
										label={t.profile.country}
										value={outlet.country}
									/>
									<DetailField
										icon={Compass}
										label={t.adminOrg.coordinates}
										value={
											outlet.lat && outlet.lng
												? `${outlet.lat}, ${outlet.lng}`
												: null
										}
									/>
									<DetailField
										icon={Compass}
										label={t.adminOrg.geoFenceRadius}
										value={
											outlet.geoFenceRadius != null
												? `${outlet.geoFenceRadius} m`
												: null
										}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="team" className="space-y-3 pt-2">
								{membersQuery.isLoading ? (
									<div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										{t.profile.loadingTeam}
									</div>
								) : membersQuery.isError ? (
									<p className="py-2 text-sm text-destructive">
										{getErrorMessage(membersQuery.error)}
									</p>
								) : members.length === 0 ? (
									<p className="py-2 text-sm text-muted-foreground">
										{t.profile.noTeamMembers}
									</p>
								) : (
									TEAM_GROUPS.map((group) => {
										const groupMembers = members.filter(
											(member) => member.subRole === group.subRole,
										);
										if (groupMembers.length === 0) return null;
										return (
											<DetailSection
												key={group.subRole}
												title={group.title(t)}
												description={group.description(t)}
											>
												{groupMembers.map((member) => (
													<MemberCard key={member.id} member={member} />
												))}
											</DetailSection>
										);
									})
								)}
								{!membersQuery.isLoading &&
									!membersQuery.isError &&
									members.some(
										(member) =>
											!TEAM_GROUPS.some((g) => g.subRole === member.subRole),
									) && (
										<DetailSection title={t.adminOrg.otherMembers}>
											{members
												.filter(
													(member) =>
														!TEAM_GROUPS.some(
															(g) => g.subRole === member.subRole,
														),
												)
												.map((member) => (
													<div key={member.id} className="sm:col-span-2">
														<DetailField
															icon={User}
															label={formatSubRole(member.subRole)}
															value={member.username || member.userId}
														/>
													</div>
												))}
										</DetailSection>
									)}
							</TabsContent>
						</Tabs>

						<ApprovalStatusCard
							status={outlet.status}
							entityLabel={t.adminOrg.entityOutlet}
							busy={actionId === outlet.id}
							onApprove={() => onApprove(outlet.id)}
							onSuspend={() => onSuspend(outlet.id)}
						/>

						<SystemInfoCard
							createdBy={outlet.createdBy}
							createdAt={outlet.createdAt}
							updatedBy={outlet.updatedBy}
							updatedAt={outlet.updatedAt}
						/>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
