import {
	Building2,
	Cake,
	CalendarDays,
	Fingerprint,
	Flag,
	Hash,
	IdCard,
	Images,
	Mail,
	Megaphone,
	Phone,
	Ruler,
	User,
	UserRound,
	Users,
	Weight,
} from "lucide-react";
import {
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	SystemInfoCard,
} from "@/components/organization/details-sheet-parts";
import { Badge } from "@/components/ui/badge";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, statusColors } from "@/lib/utils";
import type { PrUser } from "@/services/pr";

interface PrDetailsSheetProps {
	user: PrUser | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

function ageFromDob(dob: string | null): string | null {
	if (!dob) return null;
	const birth = new Date(dob);
	if (Number.isNaN(birth.getTime())) return null;
	const now = new Date();
	let age = now.getFullYear() - birth.getFullYear();
	const monthDiff = now.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
		age--;
	}
	return age >= 0 ? `${age} years` : null;
}

export function PrDetailsSheet({
	user,
	open,
	onOpenChange,
}: PrDetailsSheetProps) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>PR Details</SheetTitle>
					<SheetDescription>
						PR account profile and the agencies this PR is tied to.
					</SheetDescription>
				</SheetHeader>

				{user && (
					<div className="space-y-4 px-4 pb-6">
						<DetailsHero
							name={user.displayName}
							subtitle={user.legalName || null}
							status={user.status}
							imageUrl={apiAssetUrl(user.profileImage)}
							meta={
								user.agencies.length > 0 ? (
									<p className="text-sm text-muted-foreground">
										Agency-Tied ·{" "}
										{user.agencies.map((agency) => agency.name).join(", ")}
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										Not tied to any agency
									</p>
								)
							}
						/>

						<Tabs defaultValue="personal">
							<TabsList className="w-full">
								<TabsTrigger value="personal">
									<User className="h-3.5 w-3.5" /> Personal Info
								</TabsTrigger>
								<TabsTrigger value="contact">
									<Mail className="h-3.5 w-3.5" /> Contact
								</TabsTrigger>
								<TabsTrigger value="showcase">
									<Images className="h-3.5 w-3.5" /> Showcase
								</TabsTrigger>
								<TabsTrigger value="agencies">
									<Building2 className="h-3.5 w-3.5" /> Agencies
								</TabsTrigger>
							</TabsList>

							<TabsContent value="personal" className="space-y-3 pt-2">
								<DetailSection title="Identity">
									<DetailField
										icon={Megaphone}
										label="Display name"
										value={user.displayName}
									/>
									<DetailField
										icon={User}
										label="Legal name"
										value={user.legalName}
									/>
									<DetailField
										icon={IdCard}
										label="ID type"
										value={user.idType}
									/>
									<DetailField
										icon={Fingerprint}
										label="ID number"
										value={user.idNo}
									/>
									<DetailField
										icon={UserRound}
										label="Gender"
										value={user.gender}
									/>
									<DetailField icon={Users} label="Race" value={user.race} />
									<DetailField
										icon={Cake}
										label="Date of birth"
										value={user.dob ? formatDate(user.dob) : null}
									/>
									<DetailField
										icon={Flag}
										label="Nationality"
										value={user.nationality}
									/>
									<DetailField
										icon={CalendarDays}
										label="Joined"
										value={formatDate(user.createdAt)}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="contact" className="space-y-3 pt-2">
								<DetailSection title="Contact information">
									<DetailField
										icon={Mail}
										label="Email"
										value={user.email}
										href={user.email ? `mailto:${user.email}` : undefined}
									/>
									<DetailField
										icon={Phone}
										label="Phone"
										value={user.phoneNum}
										href={user.phoneNum ? `tel:${user.phoneNum}` : undefined}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="showcase" className="space-y-3 pt-2">
								<DetailSection
									title="Comcard"
									description="Measurements shown on the PR's comcard"
								>
									<DetailField
										icon={Ruler}
										label="Height"
										value={
											user.comcardHeightCm != null
												? `${user.comcardHeightCm} cm`
												: null
										}
									/>
									<DetailField
										icon={Weight}
										label="Weight"
										value={
											user.comcardWeightKg != null
												? `${user.comcardWeightKg} kg`
												: null
										}
									/>
									<DetailField
										icon={Cake}
										label="Age"
										value={ageFromDob(user.dob)}
									/>
								</DetailSection>

								<div className="space-y-2">
									<p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
										Portfolio gallery ({user.portfolioPhotos.length})
									</p>
									{user.portfolioPhotos.length === 0 ? (
										<p className="rounded-md border border-dashed border-(--lavender-soft)/40 px-3 py-4 text-center text-base text-muted-foreground">
											No portfolio photos uploaded yet.
										</p>
									) : (
										<div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
											{user.portfolioPhotos.map((photo, index) => {
												const src = apiAssetUrl(photo);
												return (
													<a
														key={photo}
														href={src}
														target="_blank"
														rel="noreferrer"
														className="block overflow-hidden rounded-md border border-(--lavender-soft)/30 bg-black/40"
													>
														<img
															src={src}
															alt={`Portfolio ${index + 1}`}
															className="aspect-[3/4] w-full object-cover"
															loading="lazy"
															onError={(e) => {
																e.currentTarget.style.opacity = "0.25";
															}}
														/>
													</a>
												);
											})}
										</div>
									)}
								</div>
							</TabsContent>

							<TabsContent value="agencies" className="space-y-2 pt-2">
								<p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
									Agencies ({user.agencies.length})
								</p>
								{user.agencies.length === 0 ? (
									<p className="py-2 text-base text-muted-foreground">
										This PR is not linked to any agency.
									</p>
								) : (
									<ul className="space-y-1.5">
										{user.agencies.map((agency) => (
											<li
												key={agency.id}
												className="flex flex-wrap items-center gap-2 rounded-md border border-(--lavender-soft)/25 bg-muted/30 px-3 py-2.5"
											>
												<span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--lavender-soft)] text-base font-bold text-lavender">
													{agency.name.trim().charAt(0).toUpperCase() || "A"}
												</span>
												<div className="min-w-0 flex-1">
													<div className="text-base font-semibold">
														{agency.name}
													</div>
													<div className="flex items-center gap-1 text-sm text-muted-foreground">
														<Hash className="h-3.5 w-3.5" />
														{agency.code}
													</div>
												</div>
												<Badge
													variant="outline"
													className={statusColors.active}
												>
													Linked
												</Badge>
											</li>
										))}
									</ul>
								)}
							</TabsContent>
						</Tabs>

						<SystemInfoCard
							createdBy={user.createdBy}
							createdAt={user.createdAt}
							updatedBy={user.updatedBy}
							updatedAt={user.updatedAt}
						/>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
