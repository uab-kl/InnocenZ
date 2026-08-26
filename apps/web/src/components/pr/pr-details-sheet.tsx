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
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { raceLabel } from "@/lib/portal-i18n/language-label";
import { formatDate, statusColors } from "@/lib/utils";
import type { PrUser } from "@/services/pr";

interface PrDetailsSheetProps {
	user: PrUser | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Whole years since `dob`, or null when there is no usable date.
 *
 * Returns the NUMBER, not "23 years": the unit is a translated word and this
 * runs outside React, where the dictionary cannot be read. The caller formats
 * it with `adminPr.ageYears`.
 */
function ageFromDob(dob: string | null): number | null {
	if (!dob) return null;
	const birth = new Date(dob);
	if (Number.isNaN(birth.getTime())) return null;
	const now = new Date();
	let age = now.getFullYear() - birth.getFullYear();
	const monthDiff = now.getMonth() - birth.getMonth();
	if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
		age--;
	}
	return age >= 0 ? age : null;
}

export function PrDetailsSheet({
	user,
	open,
	onOpenChange,
}: PrDetailsSheetProps) {
	const { t } = usePortalLocale();
	const age = user ? ageFromDob(user.dob) : null;

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="w-full overflow-y-auto sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
			>
				<SheetHeader className="pb-0">
					<SheetTitle>{t.adminPr.detailsTitle}</SheetTitle>
					<SheetDescription>{t.adminPr.detailsSubtitle}</SheetDescription>
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
										{fill(t.adminPr.agencyTiedNames, {
											names: user.agencies
												.map((agency) => agency.name)
												.join(", "),
										})}
									</p>
								) : (
									<p className="text-sm text-muted-foreground">
										{t.adminPr.notTiedToAnyAgency}
									</p>
								)
							}
						/>

						<Tabs defaultValue="personal">
							<TabsList className="w-full">
								<TabsTrigger value="personal">
									<User className="h-3.5 w-3.5" /> {t.adminPr.tabPersonal}
								</TabsTrigger>
								<TabsTrigger value="contact">
									<Mail className="h-3.5 w-3.5" /> {t.adminPr.tabContact}
								</TabsTrigger>
								<TabsTrigger value="showcase">
									<Images className="h-3.5 w-3.5" /> {t.adminPr.tabShowcase}
								</TabsTrigger>
								<TabsTrigger value="agencies">
									<Building2 className="h-3.5 w-3.5" /> {t.adminPr.agencies}
								</TabsTrigger>
							</TabsList>

							<TabsContent value="personal" className="space-y-3 pt-2">
								<DetailSection title={t.adminPr.sectionIdentity}>
									<DetailField
										icon={Megaphone}
										label={t.adminPr.fieldDisplayName}
										value={user.displayName}
									/>
									<DetailField
										icon={User}
										label={t.adminPr.legalName}
										value={user.legalName}
									/>
									{/* idType, gender and nationality are STORED values with no
									    resolver behind them, so they render exactly as saved. */}
									<DetailField
										icon={IdCard}
										label={t.adminPr.idType}
										value={user.idType}
									/>
									<DetailField
										icon={Fingerprint}
										label={t.adminPr.idNumber}
										value={user.idNo}
									/>
									<DetailField
										icon={UserRound}
										label={t.adminPr.gender}
										value={user.gender}
									/>
									<DetailField
										icon={Users}
										label={t.adminPr.race}
										value={user.race ? raceLabel(user.race, t) : null}
									/>
									<DetailField
										icon={Cake}
										label={t.adminPr.dateOfBirth}
										value={user.dob ? formatDate(user.dob) : null}
									/>
									<DetailField
										icon={Flag}
										label={t.adminPr.nationality}
										value={user.nationality}
									/>
									<DetailField
										icon={CalendarDays}
										label={t.adminPr.joined}
										value={formatDate(user.createdAt)}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="contact" className="space-y-3 pt-2">
								<DetailSection title={t.adminPr.sectionContact}>
									<DetailField
										icon={Mail}
										label={t.admin.colEmail}
										value={user.email}
										href={user.email ? `mailto:${user.email}` : undefined}
									/>
									<DetailField
										icon={Phone}
										label={t.adminPr.phone}
										value={user.phoneNum}
										href={user.phoneNum ? `tel:${user.phoneNum}` : undefined}
									/>
								</DetailSection>
							</TabsContent>

							<TabsContent value="showcase" className="space-y-3 pt-2">
								{/* Chrome ABOUT the comcard, not the card itself — the card is
								    not rendered here, so this follows the viewer's language.
								    See lib/portal-i18n/comcard-locale.ts. */}
								<DetailSection
									title={t.adminPr.sectionComcard}
									description={t.adminPr.comcardHint}
								>
									<DetailField
										icon={Ruler}
										label={t.adminPr.height}
										value={
											user.comcardHeightCm != null
												? `${user.comcardHeightCm} cm`
												: null
										}
									/>
									<DetailField
										icon={Weight}
										label={t.adminPr.weight}
										value={
											user.comcardWeightKg != null
												? `${user.comcardWeightKg} kg`
												: null
										}
									/>
									<DetailField
										icon={Cake}
										label={t.adminPr.age}
										value={
											age != null ? fill(t.adminPr.ageYears, { n: age }) : null
										}
									/>
								</DetailSection>

								<div className="space-y-2">
									<p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
										{fill(t.adminPr.portfolioGalleryCount, {
											n: user.portfolioPhotos.length,
										})}
									</p>
									{user.portfolioPhotos.length === 0 ? (
										<p className="rounded-md border border-dashed border-(--lavender-soft)/40 px-3 py-4 text-center text-base text-muted-foreground">
											{t.adminPr.noPortfolioPhotos}
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
															alt={fill(t.adminPr.portfolioPhotoAlt, {
																n: index + 1,
															})}
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
									{fill(t.adminPr.agenciesCount, {
										n: user.agencies.length,
									})}
								</p>
								{user.agencies.length === 0 ? (
									<p className="py-2 text-base text-muted-foreground">
										{t.adminPr.notLinkedToAnyAgency}
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
													{t.adminPr.linked}
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
