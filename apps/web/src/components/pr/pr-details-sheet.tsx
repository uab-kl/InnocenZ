import {
	Banknote,
	Building2,
	Cake,
	CalendarDays,
	CreditCard,
	Fingerprint,
	Flag,
	Globe,
	Hash,
	Home,
	IdCard,
	Images,
	Languages,
	Mail,
	MapPin,
	Megaphone,
	PenLine,
	Phone,
	Ruler,
	ShieldCheck,
	User,
	UserRound,
	Users,
	Weight,
} from "lucide-react";
import { useState } from "react";
import {
	AccountStatusCard,
	apiAssetUrl,
	DetailField,
	DetailSection,
	DetailsHero,
	ScanLightbox,
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
import { languageListLabel, raceLabel } from "@/lib/portal-i18n/language-label";
import { formatDate, statusColors } from "@/lib/utils";
import type { PrUser } from "@/services/pr";

interface PrDetailsSheetProps {
	user: PrUser | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Approval Status card: asks the page to confirm and set the account's status. */
	onSetStatus?: (next: "active" | "inactive") => void;
	busy?: boolean;
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

/**
 * One side of the ID exactly as sign-up Step 4 captured it.
 *
 * The value on `PrUser` is an R2 object key, so it goes through `apiAssetUrl`
 * before it reaches a `src` — a raw key renders as a broken image.
 *
 * Opens a zooming viewer, not a new tab. The first cut linked out on the theory
 * that one gesture for every image on the page beat two viewers — but a new tab
 * shows the scan fit-to-window, which for a MyKad is still too small to read the
 * number off, and it takes the admin out of the record they were checking. The
 * whole reason to look at an IC is to read it, so zoom is the feature.
 *
 * A missing slot reads as "not uploaded" rather than an empty frame, because it
 * usually is not a fault: a passport is captured as a single page, so the back
 * is legitimately absent for every PR who signed up with one.
 */
function IdDocTile({
	label,
	src,
	emptyLabel,
	openLabel,
	onOpen,
}: {
	label: string;
	src: string | undefined;
	emptyLabel: string;
	openLabel: string;
	onOpen: () => void;
}) {
	return (
		<div className="space-y-1.5">
			<div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
				{label}
			</div>
			{src ? (
				<button
					type="button"
					onClick={onOpen}
					aria-label={openLabel}
					className="block w-full cursor-zoom-in overflow-hidden rounded-md border border-(--lavender-soft)/30 bg-black/40"
				>
					<img
						src={src}
						alt={label}
						className="aspect-[16/10] w-full object-contain"
						loading="lazy"
						onError={(e) => {
							e.currentTarget.style.opacity = "0.25";
						}}
					/>
				</button>
			) : (
				<p className="rounded-md border border-dashed border-(--lavender-soft)/40 px-3 py-6 text-center text-base text-muted-foreground">
					{emptyLabel}
				</p>
			)}
		</div>
	);
}

/**
 * The profile's own review state — a small stored enum, so it is translated
 * rather than printed raw. Anything unrecognised falls through to the stored
 * value: the column is free-form varchar on the API side, and inventing a
 * label for a state we do not know about would be worse than showing it.
 */
function verificationLabel(
	raw: string | null,
	t: ReturnType<typeof usePortalLocale>["t"],
): string | null {
	if (!raw) return null;
	const map: Record<string, string> = {
		draft: t.adminPr.verifyDraft,
		pending: t.adminPr.verifyPending,
		verified: t.adminPr.verifyVerified,
		rejected: t.adminPr.verifyRejected,
	};
	return map[raw.trim().toLowerCase()] ?? raw;
}

export function PrDetailsSheet({
	user,
	open,
	onOpenChange,
	onSetStatus,
	busy = false,
}: PrDetailsSheetProps) {
	const { t } = usePortalLocale();
	// Which scan the zooming viewer is showing, or null when it is closed. Held
	// here rather than inside IdDocTile so only one can ever be open.
	const [scan, setScan] = useState<{ src: string; alt: string } | null>(null);
	// The API derives age from the IC before falling back to `dob` (ic-dob.ts),
	// which is the owner's rule that age follows the IC. Prefer the served value
	// and keep the local computation only for a response that predates it —
	// recomputing from `dob` alone would disagree with every other surface.
	const age = user ? (user.age ?? ageFromDob(user.dob)) : null;

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

						{onSetStatus && (
							<AccountStatusCard
								status={user.status}
								busy={busy}
								onSetStatus={onSetStatus}
							/>
						)}
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
									{/* A PR carries ONE id for the whole platform — it does not change
									    when they join a second agency, so it leads the section. */}
									<DetailField
										icon={Hash}
										label={t.adminOrg.memberCodeLabel}
										value={user.memberCode}
									/>
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
										icon={Languages}
										label={t.adminPr.languages}
										value={
											user.languages.length > 0
												? languageListLabel(user.languages, t)
												: null
										}
									/>
									<DetailField
										icon={CalendarDays}
										label={t.adminPr.joined}
										value={formatDate(user.createdAt)}
									/>
								</DetailSection>

								<DetailSection
									title={t.adminPr.sectionIdDocuments}
									description={t.adminPr.idDocumentsHint}
								>
									<IdDocTile
										label={t.adminPr.idFront}
										src={apiAssetUrl(user.idPhotoFront)}
										emptyLabel={t.adminPr.idPhotoMissing}
										openLabel={t.adminPr.openScan}
										onOpen={() => {
											const src = apiAssetUrl(user.idPhotoFront);
											if (src) setScan({ src, alt: t.adminPr.idFront });
										}}
									/>
									<IdDocTile
										label={t.adminPr.idBack}
										src={apiAssetUrl(user.idPhotoBack)}
										emptyLabel={t.adminPr.idPhotoMissing}
										openLabel={t.adminPr.openScan}
										onOpen={() => {
											const src = apiAssetUrl(user.idPhotoBack);
											if (src) setScan({ src, alt: t.adminPr.idBack });
										}}
									/>
								</DetailSection>

								<DetailSection title={t.adminPr.sectionVerification}>
									<DetailField
										icon={ShieldCheck}
										label={t.adminPr.verificationStatus}
										value={verificationLabel(user.verificationStatus, t)}
									/>
									<DetailField
										icon={PenLine}
										label={t.adminPr.signatureOnFile}
										value={user.hasSignature ? t.common.yes : t.common.no}
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

								<DetailSection
									title={t.adminPr.sectionAddress}
									description={t.adminPr.addressHint}
								>
									<DetailField
										icon={Home}
										label={t.adminPr.addressLine1}
										value={user.addressLine1}
									/>
									<DetailField
										icon={Home}
										label={t.adminPr.addressLine2}
										value={user.addressLine2}
									/>
									<DetailField
										icon={MapPin}
										label={t.adminPr.city}
										value={user.city}
									/>
									<DetailField
										icon={Hash}
										label={t.adminPr.postcode}
										value={user.postcode}
									/>
									<DetailField
										icon={MapPin}
										label={t.adminPr.state}
										value={user.state}
									/>
									<DetailField
										icon={Globe}
										label={t.adminPr.country}
										value={user.country}
									/>
								</DetailSection>

								<DetailSection
									title={t.adminPr.sectionPayout}
									description={t.adminPr.payoutHint}
								>
									<DetailField
										icon={Banknote}
										label={t.adminPr.bankName}
										value={user.bankName}
									/>
									<DetailField
										icon={CreditCard}
										label={t.adminPr.bankAccountNo}
										value={user.bankAccountNo}
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
										icon={Ruler}
										label={t.adminPr.bust}
										value={
											user.comcardBustCm != null
												? `${user.comcardBustCm} cm`
												: null
										}
									/>
									<DetailField
										icon={Ruler}
										label={t.adminPr.waist}
										value={
											user.comcardWaistCm != null
												? `${user.comcardWaistCm} cm`
												: null
										}
									/>
									<DetailField
										icon={Ruler}
										label={t.adminPr.hip}
										value={
											user.comcardHipCm != null
												? `${user.comcardHipCm} cm`
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
														{agency.code ?? "—"}
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

			{/* Sibling of SheetContent, and portalled to <body> from inside — see
			    ScanLightbox on why a fixed layer cannot escape a Sheet otherwise. */}
			{scan && (
				<ScanLightbox
					src={scan.src}
					alt={scan.alt}
					onClose={() => setScan(null)}
				/>
			)}
		</Sheet>
	);
}
