import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Building2,
	CalendarDays,
	Compass,
	FileText,
	Globe,
	Hash,
	Mail,
	MapPin,
	Phone,
	User,
	Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { orgMemberIdStem, ssmDisplay } from "@/lib/member-code";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatDate, getErrorMessage } from "@/lib/utils";
import type { Agency } from "@/services/agency";
import { fetchAgencyOutletLinksById } from "@/services/agency-outlet";
import {
	ApprovalStatusCard,
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "./details-sheet-parts";
import { OrgMembersPanel } from "./org-members-panel";
import { LINK_STATUS_CLASS, LINK_STATUS_LABEL } from "./org-status";

/**
 * Every venue this agency is linked to (`agency_outlet`, 0123) — the mirror of
 * `LinkedAgenciesCard` on the venue sheet, and the answer to the question this
 * sheet could not previously answer: which venues does this agency staff?
 *
 * READ-ONLY for the same reason as the venue side: an admin setting a link
 * would be agreeing to a partnership on the agency's behalf, which is exactly
 * the consent this table exists to record. The venue asks; the agency answers.
 */
function LinkedOutletsCard({ agency }: { agency: Agency }) {
	const { logout } = useAuth();
	const { t } = usePortalLocale();

	const linksQuery = useQuery({
		queryKey: ["agency-outlet", "agency", agency.id],
		queryFn: () => fetchAgencyOutletLinksById(agency.id, logout),
		staleTime: 30_000,
	});

	const links = linksQuery.data ?? [];
	const approved = links.filter((l) => l.approveStatus === "approved").length;

	return (
		<DetailSection
			title={t.adminOrg.linkedOutlets}
			description={t.adminOrg.linkedOutletsHint}
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
						{t.adminOrg.noOutletsLinked}
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
											{link.outletName}
										</div>
										<div className="truncate text-xs text-muted-foreground">
											{[link.city, link.state].filter(Boolean).join(", ")}
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
						<p className="text-sm text-muted-foreground">
							{fill(t.adminOrg.outletsApprovedCount, { n: String(approved) })}
						</p>
					</>
				)}
			</div>
		</DetailSection>
	);
}

interface AgencyDetailsSheetProps {
	agency: Agency | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApprove: (id: string) => void;
	onDeactivate: (id: string) => void;
	actionId: string | null;
}

export function AgencyDetailsSheet({
	agency,
	open,
	onOpenChange,
	onApprove,
	onDeactivate,
	actionId,
}: AgencyDetailsSheetProps) {
	const { t } = usePortalLocale();

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>{t.adminOrg.agencyDetailsTitle}</SheetTitle>
					<SheetDescription>{t.adminOrg.agencyDetailsHint}</SheetDescription>
				</SheetHeader>

				{agency && (
					<div className="space-y-4 px-4 pb-6">
						<DetailsHero
							name={agency.name}
							subtitle={orgMemberIdStem("agency", agency.memberCodePrefix)}
							status={agency.status}
							// R2 object key -> public bucket URL, the same path the
							// agency portal's own Settings header uses. NOT `logoUrl`:
							// that proxies through the backend's R2 API token, which is
							// the fragile half.
							imageUrl={apiAssetUrl(agency.logoImage)}
						/>

						<Tabs defaultValue="basic">
							<TabsList className="w-full">
								<TabsTrigger value="basic">
									<Building2 className="h-3.5 w-3.5" />{" "}
									{t.adminOrg.tabBasicInfo}
								</TabsTrigger>
								<TabsTrigger value="location">
									<MapPin className="h-3.5 w-3.5" /> {t.adminOrg.tabLocation}
								</TabsTrigger>
								<TabsTrigger value="team">
									<User className="h-3.5 w-3.5" /> {t.adminOrg.tabTeam}
								</TabsTrigger>
								<TabsTrigger value="prs">
									<Users className="h-3.5 w-3.5" /> {t.adminOrg.tabPrs}
								</TabsTrigger>
							</TabsList>

							<TabsContent value="basic" className="space-y-3 pt-2">
								<DetailSection title={t.agencyMisc.ownerInformation}>
									<DetailField
										icon={User}
										label={t.adminOrg.ownerContact}
										value={agency.contactName}
									/>
									<DetailField
										icon={Mail}
										label={t.admin.colEmail}
										value={agency.contactEmail}
										href={
											agency.contactEmail
												? `mailto:${agency.contactEmail}`
												: undefined
										}
									/>
									<DetailField
										icon={Phone}
										label={t.adminOrg.phone}
										value={agency.contactPhone}
										href={
											agency.contactPhone
												? `tel:${agency.contactPhone}`
												: undefined
										}
									/>
								</DetailSection>

								<DetailSection title={t.adminOrg.organization}>
									<DetailField
										icon={Building2}
										label={t.adminOrg.agencyName}
										value={agency.name}
									/>
									{/* Two different codes, deliberately shown together: the one above
									    numbers the AGENCY, this one is the stem every one of its
									    members’ ids grows from. */}
									<DetailField
										icon={Hash}
										label={t.adminOrg.memberCodePrefix}
										value={orgMemberIdStem("agency", agency.memberCodePrefix)}
									/>
									<DetailField
										icon={Hash}
										label={t.adminOrg.ssmNo}
										value={ssmDisplay(agency.ssmNo, agency.registrationNoOld)}
									/>
									{/* The venue sheet has always shown this; the agency sheet had
									    no field because the agency TABLE had no column (0155). */}
									<DetailField
										icon={FileText}
										label={t.adminOrg.businessLicense}
										value={agency.businessLicense ?? null}
									/>
									<DetailField
										icon={CalendarDays}
										label={t.admin.colCreated}
										value={formatDate(agency.createdAt)}
									/>
								</DetailSection>

								<LinkedOutletsCard agency={agency} />
							</TabsContent>

							{/* The address the agency typed at sign-up. It was stored from
							    day one and rendered nowhere, so support could not check the
							    company against its SSM record without querying the database. */}
							<TabsContent value="location" className="space-y-3 pt-2">
								<DetailSection title={t.adminOrg.agencyAddress}>
									<DetailField
										icon={MapPin}
										label={t.profile.addressLine1}
										value={agency.addressLine1}
									/>
									<DetailField
										icon={MapPin}
										label={t.profile.addressLine2}
										value={agency.addressLine2}
									/>
									<DetailField
										icon={MapPin}
										label={t.profile.city}
										value={agency.city}
									/>
									<DetailField
										icon={Hash}
										label={t.profile.postcode}
										value={agency.postcode}
									/>
									<DetailField
										icon={Globe}
										label={t.profile.state}
										value={agency.state}
									/>
									<DetailField
										icon={Compass}
										label={t.profile.country}
										value={agency.country}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="team" className="space-y-3 pt-2">
								{/* A doorway, not a second list. The full Team members page carries the
								    search, the status filter and the paging; keeping a slice of it in a
								    sheet tab is how two views of one fact drift apart. */}
								<DetailSection
									title={t.adminOrg.tabTeam}
									description={t.adminOrg.teamTabDoorwayHint}
								>
									<div className="sm:col-span-2">
										<Button asChild>
											<Link
												to="/admin/user-management/agency-team"
												search={{ org: agency.id }}
											>
												<Users className="mr-2 h-4 w-4" />
												{t.adminOrg.teamTabOpenList}
											</Link>
										</Button>
									</div>
								</DetailSection>
							</TabsContent>

							<TabsContent value="prs" className="pt-2">
								<div className="rounded-md border border-(--lavender-soft)/25 px-3 py-2">
									<OrgMembersPanel orgId={agency.id} />
								</div>
							</TabsContent>
						</Tabs>

						<ApprovalStatusCard
							status={agency.status}
							entityLabel={t.adminOrg.entityAgency}
							busy={actionId === agency.id}
							onApprove={() => onApprove(agency.id)}
							onDeactivate={() => onDeactivate(agency.id)}
						/>

						<SystemInfoCard
							createdBy={agency.createdBy}
							createdAt={agency.createdAt}
							updatedBy={agency.updatedBy}
							updatedAt={agency.updatedAt}
						/>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
