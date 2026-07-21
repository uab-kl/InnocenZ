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
import { formatDate, getErrorMessage } from "@/lib/utils";
import { fetchAgencyById } from "@/services/agency";
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

const TEAM_GROUPS: {
	subRole: OutletMember["subRole"];
	title: string;
	description: string;
}[] = [
	{
		subRole: "owner",
		title: "Owner",
		description: "Venue owner · signs up the outlet and manages settings",
	},
	{
		subRole: "finance",
		title: "Finance Head",
		description: "Weekly reconciliation · billing sign-off",
	},
	{
		subRole: "operations_head",
		title: "Ops Head",
		description: "Floor operations · shift staffing · sales logging",
	},
];

function MemberCard({ member }: { member: OutletMember }) {
	return (
		<div className="rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-4 py-3 sm:col-span-2">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-base font-semibold">
					{member.username || `${member.userId.slice(0, 8)}…`}
				</span>
				<Badge variant="outline" className="capitalize text-muted-foreground">
					{member.status}
				</Badge>
				<span className="ml-auto text-sm text-muted-foreground">
					Joined {formatDate(member.createdAt)}
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

	const membersQuery = useQuery({
		queryKey: ["outlet-members", outlet?.id],
		queryFn: () => fetchOutletMembers(outlet!.id, logout),
		enabled: open && Boolean(outlet),
		staleTime: 30_000,
	});

	const agencyQuery = useQuery({
		queryKey: ["agency-by-id", outlet?.onboardedByAgencyId],
		queryFn: () => fetchAgencyById(outlet!.onboardedByAgencyId!, logout),
		enabled: open && Boolean(outlet?.onboardedByAgencyId),
		staleTime: 60_000,
	});

	const members = membersQuery.data?.data ?? [];

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>Outlet Details</SheetTitle>
					<SheetDescription>
						Venue profile, location, and team — as submitted by the outlet.
					</SheetDescription>
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
									<Building2 className="h-3.5 w-3.5" /> Business
								</TabsTrigger>
								<TabsTrigger value="location">
									<MapPin className="h-3.5 w-3.5" /> Location
								</TabsTrigger>
								<TabsTrigger value="team">
									<Users className="h-3.5 w-3.5" /> Team
								</TabsTrigger>
							</TabsList>

							<TabsContent value="business" className="space-y-3 pt-2">
								<DetailSection title="Business information">
									<DetailField
										icon={Building2}
										label="Venue"
										value={outlet.name}
									/>
									<DetailField
										icon={Hash}
										label="SSM No."
										value={outlet.ssmNo}
									/>
									<DetailField
										icon={FileText}
										label="Business license"
										value={outlet.businessLicense}
									/>
									<DetailField
										icon={Building2}
										label="Onboarded by agency"
										value={
											outlet.onboardedByAgencyId
												? (agencyQuery.data?.data?.name ??
													`${outlet.onboardedByAgencyId.slice(0, 8)}…`)
												: "Direct signup"
										}
									/>
									<DetailField
										icon={CalendarDays}
										label="Created"
										value={formatDate(outlet.createdAt)}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="location" className="space-y-3 pt-2">
								<DetailSection title="Venue location">
									<DetailField
										icon={MapPin}
										label="Address line 1"
										value={outlet.addressLine1}
									/>
									<DetailField
										icon={MapPin}
										label="Address line 2"
										value={outlet.addressLine2}
									/>
									<DetailField
										icon={Hash}
										label="Postcode"
										value={outlet.postcode}
									/>
									<DetailField
										icon={Globe}
										label="State"
										value={outlet.state}
									/>
									<DetailField
										icon={Globe}
										label="Country"
										value={outlet.country}
									/>
									<DetailField
										icon={Compass}
										label="Coordinates"
										value={
											outlet.lat && outlet.lng
												? `${outlet.lat}, ${outlet.lng}`
												: null
										}
									/>
									<DetailField
										icon={Compass}
										label="Geo-fence radius"
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
										Loading team…
									</div>
								) : membersQuery.isError ? (
									<p className="py-2 text-sm text-destructive">
										{getErrorMessage(membersQuery.error)}
									</p>
								) : members.length === 0 ? (
									<p className="py-2 text-sm text-muted-foreground">
										No team members yet.
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
												title={group.title}
												description={group.description}
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
										<DetailSection title="Other members">
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
							entityLabel="outlet"
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
