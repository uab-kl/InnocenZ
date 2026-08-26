import {
	Building2,
	CalendarDays,
	Hash,
	Mail,
	Phone,
	User,
	Users,
} from "lucide-react";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { formatDate } from "@/lib/utils";
import type { Agency } from "@/services/agency";
import {
	ApprovalStatusCard,
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "./details-sheet-parts";
import { OrgMembersPanel } from "./org-members-panel";

interface AgencyDetailsSheetProps {
	agency: Agency | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onApprove: (id: string) => void;
	onSuspend: (id: string) => void;
	actionId: string | null;
}

export function AgencyDetailsSheet({
	agency,
	open,
	onOpenChange,
	onApprove,
	onSuspend,
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
							subtitle={fill(t.adminOrg.agencyCodeValue, {
								code: agency.agencyCode,
							})}
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
									<DetailField
										icon={Hash}
										label={t.adminOrg.agencyCode}
										value={agency.agencyCode}
									/>
									<DetailField
										icon={Hash}
										label={t.adminOrg.ssmOrgNo}
										value={agency.ssmNo}
									/>
									<DetailField
										icon={CalendarDays}
										label={t.admin.colCreated}
										value={formatDate(agency.createdAt)}
									/>
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
							onSuspend={() => onSuspend(agency.id)}
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
