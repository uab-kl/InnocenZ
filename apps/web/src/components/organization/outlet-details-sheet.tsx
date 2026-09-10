import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Building2,
	CalendarDays,
	Compass,
	FileText,
	Globe,
	Hash,
	MapPin,
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
import { formatDate, getErrorMessage } from "@/lib/utils";

import { fetchOutletAgencyLinks } from "@/services/agency-outlet";
import type { Outlet } from "@/services/outlet";
import {
	ApprovalStatusCard,
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "./details-sheet-parts";
import { LINK_STATUS_CLASS, LINK_STATUS_LABEL } from "./org-status";

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
										<div className="truncate font-mono text-xs text-muted-foreground">
											{orgMemberIdStem("agency", link.memberCodePrefix) ?? "—"}
										</div>
										{link.approveStatus === "rejected" && link.rejectReason && (
											<div className="text-xs text-rose-500">
												{link.rejectReason}
											</div>
										)}
										{/* The AGENCY's own status, beside the LINK's. The
										    partnership can be approved and the other side still
										    switched off — two different facts, and the venue is
										    owed both. */}
										{link.agencyStatus && link.agencyStatus !== "active" && (
											<div className="text-xs text-amber-500">
												{t.adminOrg.orgDeactivatedBadge}
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
	onDeactivate: (id: string) => void;
	actionId: string | null;
}

export function OutletDetailsSheet({
	outlet,
	open,
	onOpenChange,
	onApprove,
	onDeactivate,
	actionId,
}: OutletDetailsSheetProps) {
	const { t } = usePortalLocale();

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
										value={ssmDisplay(outlet.ssmNo, outlet.registrationNoOld)}
									/>
									{/* The stem every member id at this venue grows from. */}
									<DetailField
										icon={Hash}
										label={t.adminOrg.memberCodePrefix}
										value={orgMemberIdStem("outlet", outlet.memberCodePrefix)}
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
										icon={MapPin}
										label={t.profile.city}
										value={outlet.city}
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
												to="/admin/user-management/outlet-team"
												search={{ org: outlet.id }}
											>
												<Users className="mr-2 h-4 w-4" />
												{t.adminOrg.teamTabOpenList}
											</Link>
										</Button>
									</div>
								</DetailSection>
							</TabsContent>
						</Tabs>

						<ApprovalStatusCard
							status={outlet.status}
							entityLabel={t.adminOrg.entityOutlet}
							busy={actionId === outlet.id}
							onApprove={() => onApprove(outlet.id)}
							onDeactivate={() => onDeactivate(outlet.id)}
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
