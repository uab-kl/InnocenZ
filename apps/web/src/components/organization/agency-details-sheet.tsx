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
import { formatDate } from "@/lib/utils";
import type { Agency } from "@/services/agency";
import {
	ApprovalStatusCard,
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
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>PR Agency Details</SheetTitle>
					<SheetDescription>
						Agency profile and the PRs managed under it.
					</SheetDescription>
				</SheetHeader>

				{agency && (
					<div className="space-y-4 px-4 pb-6">
						<DetailsHero
							name={agency.name}
							subtitle={`Agency code ${agency.agencyCode}`}
							status={agency.status}
						/>

						<Tabs defaultValue="basic">
							<TabsList className="w-full">
								<TabsTrigger value="basic">
									<Building2 className="h-3.5 w-3.5" /> Basic Info
								</TabsTrigger>
								<TabsTrigger value="prs">
									<Users className="h-3.5 w-3.5" /> PRs
								</TabsTrigger>
							</TabsList>

							<TabsContent value="basic" className="space-y-3 pt-2">
								<DetailSection title="Owner information">
									<DetailField
										icon={User}
										label="Owner / contact"
										value={agency.contactName}
									/>
									<DetailField
										icon={Mail}
										label="Email"
										value={agency.contactEmail}
										href={
											agency.contactEmail
												? `mailto:${agency.contactEmail}`
												: undefined
										}
									/>
									<DetailField
										icon={Phone}
										label="Phone"
										value={agency.contactPhone}
										href={
											agency.contactPhone
												? `tel:${agency.contactPhone}`
												: undefined
										}
									/>
								</DetailSection>

								<DetailSection title="Organization">
									<DetailField
										icon={Building2}
										label="Agency name"
										value={agency.name}
									/>
									<DetailField
										icon={Hash}
										label="Agency code"
										value={agency.agencyCode}
									/>
									<DetailField
										icon={Hash}
										label="SSM / Org No."
										value={agency.ssmNo}
									/>
									<DetailField
										icon={CalendarDays}
										label="Created"
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
							entityLabel="agency"
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
