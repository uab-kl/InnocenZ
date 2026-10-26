import { AccountAvatarCard } from "@agency-portal/components/auth/AccountAvatarCard";
import { SecuritySettingsSheets } from "@agency-portal/components/auth/SecuritySettingsSheets";
import {
	IzCard,
	IzPageTitle,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OrgMembersPanel } from "@agency-portal/components/org/OrgMembersPanel";
import { SignatureOnFileCard } from "@agency-portal/components/org/SignatureOnFileCard";
import {
	type AvatarCropResult,
	AvatarCropSheet,
	type PendingAvatarPick,
} from "@agency-portal/components/portal/AvatarCropSheet";
import { PendingReviewBanner } from "@agency-portal/components/portal/PendingReviewBanner";
import { ProfileAddressFields } from "@agency-portal/components/portal/profile-address-fields";
import {
	ProfileEditDock,
	ProfileEditTrigger,
	ProfilePhotoActions,
	ProfileSectionCard,
	ProfileSettingsField,
} from "@agency-portal/components/portal/profile-settings-ui";
import { useAgencyProfile } from "@agency-portal/hooks/use-agency-profile";
import {
	type AgencyFinanceHead,
	type AgencyOwnerSettings,
	agencySubscriptionBillingForWeeklyPv,
	agencyWeeklyPvCount,
	BLANK_AGENCY_FINANCE_HEAD,
	BLANK_AGENCY_OWNER,
	ownedByAgency,
} from "@agency-portal/lib/agency-demo";
import {
	getAgencyIdentity,
	saveAgencyIdentity,
} from "@agency-portal/lib/agency-identity";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import { getPreviousWeekSundayIso } from "@agency-portal/lib/demo-clock";
import {
	EMPTY_ORG_ADDRESS,
	type OrgAddress,
	resolveOrgAddressForSave,
} from "@agency-portal/lib/org-address";
import { useStore } from "@agency-portal/lib/store";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, Phone, Shield, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { fetchAgencyLogoSource } from "@/services/agency/agency";
import "./agency-management-design.css";

type SettingsSection = "organization" | "team" | "personal";

export const Route = createFileRoute("/agency/profile")({
	component: AgencyProfile,
});

function AgencyProfile() {
	const { t, locale } = usePortalLocale();
	const [section, setSection] = useState<SettingsSection>("organization");
	const sections: { id: SettingsSection; label: string }[] = [
		{
			id: "organization",
			label: locale === "zh" ? "机构资料" : "Organization",
		},
		{ id: "team", label: locale === "zh" ? "团队" : "Team" },
		{ id: "personal", label: locale === "zh" ? "个人" : "Personal" },
	];
	const agencyOwner = useStore((s) => s.agencyOwner);
	const activeAgencyId = useStore((s) => s.activeAgencyId);
	const allAgencyPRs = useStore((s) => s.agencyPRs);
	const agencyPRs = useMemo(
		() => ownedByAgency(allAgencyPRs, activeAgencyId),
		[allAgencyPRs, activeAgencyId],
	);
	const prPaymentVouchers = useStore((s) => s.prPaymentVouchers ?? []);
	const agencyFinanceHead = useStore((s) => s.agencyFinanceHead);
	const outletCommissionRules = useStore((s) => s.outletCommissionRules);
	const scalingTierMultipliers = useStore((s) => s.scalingTierMultipliers);
	const saveAgencyProfileSettings = useStore(
		(s) => s.saveAgencyProfileSettings,
	);
	const saveAgencyOwner = useStore((s) => s.saveAgencyOwner);
	const agencySubRole = useStore((s) => s.agencySubRole);
	const toast = useStore((s) => s.toast);
	// Real login → overlay the real agency identity in read mode (see the hook).
	const profile = useAgencyProfile();
	/** Same refresh-failure handler every service call in this portal uses. */
	const { logout } = useAuth();
	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [securityOpen, setSecurityOpen] = useState(false);
	const [draft, setDraft] = useState(agencyOwner);
	const [financeDraft, setFinanceDraft] = useState(agencyFinanceHead);
	const [inviteEmail, setInviteEmail] = useState(agencyFinanceHead.email);
	const [addressDraft, setAddressDraft] = useState<OrgAddress>({
		...EMPTY_ORG_ADDRESS,
	});
	const [logoMeta, setLogoMeta] = useState<{
		fileName: string;
		contentType: string;
	} | null>(null);
	const [logoCleared, setLogoCleared] = useState(false);
	/** Picked but not yet framed — the crop sheet owns it until it is confirmed. */
	const [pendingPhoto, setPendingPhoto] = useState<PendingAvatarPick | null>(
		null,
	);
	/**
	 * The ORIGINAL image behind the current draft photo, plus where it was
	 * framed. Kept so Adjust re-crops the full-resolution source at the previous
	 * framing instead of re-cropping the already-cropped output, which would
	 * discard everything outside the old square and soften the rest each pass.
	 */
	const [photoSource, setPhotoSource] = useState<PendingAvatarPick | null>(
		null,
	);
	/**
	 * The source as the SERVER last described it — what the saved logo was made
	 * from. Held in a ref so entering or cancelling an edit can restore it, rather
	 * than resetting to null and losing Adjust for the rest of the visit. Whether
	 * that reset bit depended on the fetch landing before the click, so the
	 * button came and went by luck. Outlet Settings carries the same fix.
	 */
	const storedSource = useRef<PendingAvatarPick | null>(null);

	/**
	 * Load the stored ORIGINAL so "Adjust crop" works on a logo saved in an
	 * earlier session — the outlet Settings twin, and for the same reason: until
	 * this existed the button vanished on every reload.
	 *
	 * Fetched from the API, never the public R2 URL, which sends no CORS header:
	 * the browser cannot read those bytes and cannot export a canvas drawn from
	 * them. A null answer is ordinary and simply leaves Adjust hidden.
	 *
	 * ⚠️ Stored with the FUNCTIONAL updater — `prev ?? fetched` — so a response
	 * that lands after the owner has picked a new file cannot replace the image
	 * they are framing, without making `photoSource` a dependency that would
	 * re-run this effect the moment a pick set it.
	 *
	 * ⚠️ Asked ONLY by a lane that may edit. The route is `agencyOwnerOfParam`
	 * (owner, or a guarantor standing in) — exactly the lanes holding
	 * `settings:update`, which is what `editSettings` reads. Everyone else got a
	 * 403 on every visit, for a source only the edit mode's Adjust button uses.
	 */
	const can = useAgencyCan();
	const canEdit = can("editSettings");
	useEffect(() => {
		const agencyId = profile.agencyId;
		if (!agencyId || !canEdit) return;
		let cancelled = false;
		void fetchAgencyLogoSource(agencyId, logout).then((source) => {
			if (cancelled || !source) return;
			const fetched: PendingAvatarPick = {
				dataUrl: source.dataUrl,
				fileName: source.fileName,
				contentType: source.contentType,
				state: source.state ?? undefined,
				// No original was kept: this is the saved crop, and the sheet says so
				// rather than pretending a re-crop is free.
				fallback: source.fallback,
			};
			// Remembered even if a pick already won the race below, so entering or
			// cancelling an edit can come back to it.
			storedSource.current = fetched;
			setPhotoSource((prev) => prev ?? fetched);
		});
		return () => {
			cancelled = true;
		};
	}, [profile.agencyId, logout, canEdit]);

	const avatarFileRef = useRef<HTMLInputElement>(null);
	/** Whoever is signed in — used for Login & security, which is personal. */
	const { user: currentUser } = useCurrentUser();

	// Real login → never merge onto Atlas demo defaults. Demo sessions keep the
	// store seed. Editing uses the local draft.
	const owner =
		!editing && profile.backed
			? { ...BLANK_AGENCY_OWNER, ...(profile.owner ?? {}) }
			: editing
				? draft
				: agencyOwner;
	const finance =
		!editing && profile.backed
			? { ...BLANK_AGENCY_FINANCE_HEAD, ...(profile.finance ?? {}) }
			: editing
				? financeDraft
				: agencyFinanceHead;
	const payrollWeekStartIso = getPreviousWeekSundayIso();
	const issuedWeeklyPv = useMemo(
		() =>
			agencyWeeklyPvCount(
				getAgencyManagedPvs(prPaymentVouchers, agencyPRs),
				payrollWeekStartIso,
			),
		[prPaymentVouchers, agencyPRs, payrollWeekStartIso],
	);
	const subscriptionBilling = useMemo(
		() => agencySubscriptionBillingForWeeklyPv(issuedWeeklyPv, t),
		[issuedWeeklyPv, t],
	);
	const avatarLetter =
		owner.ownerName.trim()[0]?.toUpperCase() ??
		owner.orgName.trim()[0]?.toUpperCase() ??
		"?";
	const fieldMode = editing && canEdit ? "edit" : "view";
	const address =
		!editing && profile.backed
			? profile.address
			: editing
				? addressDraft
				: { ...EMPTY_ORG_ADDRESS };

	const update = (patch: Partial<AgencyOwnerSettings>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const updateFinance = (patch: Partial<AgencyFinanceHead>) =>
		setFinanceDraft((d) => ({ ...d, ...patch }));
	const updateAddress = (patch: Partial<OrgAddress>) =>
		setAddressDraft((d) => ({ ...d, ...patch }));

	const startEdit = () => {
		if (profile.backed) {
			setDraft({ ...BLANK_AGENCY_OWNER, ...(profile.owner ?? {}) });
			setFinanceDraft({
				...BLANK_AGENCY_FINANCE_HEAD,
				...(profile.finance ?? {}),
			});
			setInviteEmail(profile.finance?.email ?? "");
			setAddressDraft({ ...profile.address });
		} else {
			setDraft({ ...agencyOwner, ...(profile.owner ?? {}) });
			setFinanceDraft({ ...agencyFinanceHead, ...(profile.finance ?? {}) });
			setInviteEmail(profile.finance?.email ?? agencyFinanceHead.email);
			setAddressDraft({ ...EMPTY_ORG_ADDRESS });
		}
		setLogoMeta(null);
		setLogoCleared(false);
		setPendingPhoto(null);
		// Back to the SAVED logo's source, not to nothing: the stored original
		// still describes the logo on the row, so Adjust stays available. Setting
		// null here is what made the button appear or vanish depending on whether
		// the fetch had landed before Edit was clicked.
		setPhotoSource(storedSource.current);
		setEditing(true);
	};

	const cancelEdit = () => {
		if (profile.backed) {
			setDraft({ ...BLANK_AGENCY_OWNER, ...(profile.owner ?? {}) });
			setFinanceDraft({
				...BLANK_AGENCY_FINANCE_HEAD,
				...(profile.finance ?? {}),
			});
			setInviteEmail(profile.finance?.email ?? "");
			setAddressDraft({ ...profile.address });
		} else {
			setDraft({ ...agencyOwner });
			setFinanceDraft({ ...agencyFinanceHead });
			setInviteEmail(agencyFinanceHead.email);
			setAddressDraft({ ...EMPTY_ORG_ADDRESS });
		}
		setLogoMeta(null);
		setLogoCleared(false);
		setPendingPhoto(null);
		// Back to the SAVED logo's source, not to nothing: the stored original
		// still describes the logo on the row, so Adjust stays available. Setting
		// null here is what made the button appear or vanish depending on whether
		// the fetch had landed before Edit was clicked.
		setPhotoSource(storedSource.current);
		setEditing(false);
	};

	const openAvatarUpload = () => {
		if (!editing) return;
		avatarFileRef.current?.click();
	};

	const onAvatarFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file || !editing) return;
		if (!file.type.startsWith("image/")) {
			toast(t.profile.chooseImageFile, "warn");
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			toast(t.profile.imageUnder5Mb, "warn");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			// Straight into the crop sheet — the draft only takes the FRAMED
			// image, so nothing can be saved that the owner never looked at.
			const picked: PendingAvatarPick = {
				dataUrl: reader.result as string,
				fileName: file.name || "logo.png",
				contentType: file.type || "image/png",
			};
			setPhotoSource(picked);
			setPendingPhoto(picked);
		};
		reader.readAsDataURL(file);
	};

	/** Reopen the sheet on the ORIGINAL image, framed where it was left. */
	const adjustCrop = () => {
		if (!editing || !photoSource) return;
		setPendingPhoto(photoSource);
	};

	const applyCroppedPhoto = (result: AvatarCropResult) => {
		update({ avatarPhoto: result.dataUrl });
		setLogoMeta({
			fileName: result.fileName,
			contentType: result.contentType,
		});
		setLogoCleared(false);
		// Remember the framing, not just the bytes, so the next Adjust opens
		// where this one ended rather than back at centred-and-1×.
		setPhotoSource((s) => (s ? { ...s, state: result.state } : s));
		setPendingPhoto(null);
		toast(t.profile.logoSelected, "success");
	};

	const saveEdit = async () => {
		if (!draft.orgName.trim()) {
			toast(t.profile.enterOrgName, "warn");
			return;
		}
		if (!draft.ownerName.trim() || draft.ownerName.trim().length < 2) {
			toast(t.profile.enterOwnerName, "warn");
			return;
		}
		if (profile.backed && !addressDraft.addressLine1.trim()) {
			toast(t.profile.enterAddressLine1, "warn");
			return;
		}
		if (profile.backed) {
			if (!canEdit) {
				toast(t.profile.onlyOwnerCanEdit, "warn");
				return;
			}
			setSaving(true);
			try {
				const nextLogo = draft.avatarPhoto;
				const logoIsNew =
					typeof nextLogo === "string" && nextLogo.startsWith("data:");
				await profile.save({
					orgName: draft.orgName.trim(),
					ownerName: draft.ownerName.trim(),
					address: {
						...addressDraft,
						...resolveOrgAddressForSave(addressDraft),
						stateCode: addressDraft.stateCode,
					},
					...(logoIsNew
						? {
								logoDataUrl: nextLogo,
								// The un-cropped ORIGINAL and its framing travel WITH the
								// logo, so a later session re-opens the crop sheet on the real
								// source instead of re-cropping the cropped square.
								// ⚠️ A FALLBACK IS NEVER STORED AS AN ORIGINAL — it is the
								// already-cropped image, and saving it as the source would
								// let the loss compound on every later adjust.
								logoSourceDataUrl: photoSource?.fallback
									? null
									: (photoSource?.dataUrl ?? null),
								logoCropState: photoSource?.fallback
									? null
									: (photoSource?.state ?? null),
								logoFileName: logoMeta?.fileName,
								logoContentType: logoMeta?.contentType,
							}
						: {}),
					...(logoCleared && !logoIsNew ? { clearLogo: true } : {}),
				});
				const identity = getAgencyIdentity();
				if (identity) {
					saveAgencyIdentity({
						...identity,
						orgName: draft.orgName.trim(),
					});
				}
			} catch (err) {
				const msg =
					err && typeof err === "object" && "response" in err
						? String(
								(err as { response?: { data?: { message?: string } } }).response
									?.data?.message ?? "",
							)
						: err instanceof Error
							? err.message
							: "";
				toast(msg.trim() || t.profile.couldNotSave, "warn");
				setSaving(false);
				return;
			}
			setSaving(false);
			setLogoMeta(null);
			setLogoCleared(false);
			setEditing(false);
			toast(t.profile.profileSaved, "success");
			return;
		}
		if (!draft.mobile.trim()) {
			toast(t.profile.enterMobile, "warn");
			return;
		}
		const nextFinance = { ...financeDraft };
		const inviteChanged = inviteEmail.trim() !== agencyFinanceHead.email;
		if (inviteChanged && inviteEmail.trim()) {
			nextFinance.email = inviteEmail.trim();
			nextFinance.eSignatureStored = false;
		}
		saveAgencyProfileSettings({
			owner: {
				...draft,
				ownerName: draft.ownerName.trim(),
				orgName: draft.orgName.trim(),
				email: agencyOwner.email,
				mobile: agencyOwner.mobile,
			},
			financeHead: nextFinance,
			scalingTierMultipliers,
			outletCommissionRules: outletCommissionRules.map((r) => ({ ...r })),
		});
		if (inviteChanged && inviteEmail.trim()) {
			toast(
				fill(t.profile.financeInviteNotSent, { email: inviteEmail.trim() }),
				"warn",
			);
		}
		setEditing(false);
		toast(t.profile.settingsSaved, "success");
	};

	if (!can("viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>{t.managePr.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">{t.profile.noAccess}</p>
				</IzCard>
			</div>
		);
	}

	const isFinanceReadOnly = agencySubRole === "agency_finance";
	/** The agency's OWN owner — see the twin in routes/outlet/settings.tsx. */
	const isOrgOwner = agencySubRole === "agency_owner";
	const orgStatus = getAgencyIdentity()?.agencyStatus;

	return (
		<div className="iz-screen iz-agency-settings">
			<header className="iz-agency-settings-header">
				<div>
					<IzPageTitle>{t.agencyMisc.settings}</IzPageTitle>
					<p className="iz-muted mt-2">
						{locale === "zh"
							? "机构资料、团队权限和您的个人账户。"
							: "Organization, team access, and your personal account."}
					</p>
				</div>
				{section === "organization" && canEdit && !editing && (
					<ProfileEditTrigger
						onClick={startEdit}
						label={
							locale === "zh" ? "编辑机构资料" : "Edit organization profile"
						}
					/>
				)}
				{/* `!canEdit`, not one named lane — see routes/outlet/settings.tsx. */}
				{!canEdit && !editing && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						{isFinanceReadOnly
							? t.profile.financeReadOnly
							: t.profile.memberReadOnly}
					</p>
				)}
			</header>
			<PendingReviewBanner orgStatus={orgStatus} kind="agency" />
			<div
				className="iz-agency-settings-tabs"
				role="tablist"
				aria-label={t.agencyMisc.settings}
			>
				{sections.map((item, index) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						id={`agency-settings-tab-${item.id}`}
						aria-controls={`agency-settings-panel-${item.id}`}
						aria-selected={section === item.id}
						tabIndex={section === item.id ? 0 : -1}
						onClick={() => setSection(item.id)}
						onKeyDown={(event) => {
							const nextIndex =
								event.key === "ArrowRight"
									? (index + 1) % sections.length
									: event.key === "ArrowLeft"
										? (index + sections.length - 1) % sections.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? sections.length - 1
												: -1;
							const next = sections[nextIndex];
							if (!next) return;
							event.preventDefault();
							setSection(next.id);
							event.currentTarget.parentElement
								?.querySelectorAll<HTMLButtonElement>("[role=tab]")
								[nextIndex]?.focus();
						}}
					>
						{item.label}
					</button>
				))}
			</div>

			{/* Mounted panels preserve organization drafts and personal uploads across tabs. */}
			<section
				className="iz-agency-settings-panel"
				role="tabpanel"
				id="agency-settings-panel-organization"
				aria-labelledby="agency-settings-tab-organization"
				hidden={section !== "organization"}
			>
				<section className="iz-approved-org-profile">
					<h2>{t.approvedDesign.organizationProfile}</h2>
					<p className="iz-muted">{t.approvedDesign.identityContact}</p>
					<div
						className={`iz-settings-profile iz-agency-settings-identity${editing ? " iz-settings-profile--editing" : ""}`}
					>
						<input
							ref={avatarFileRef}
							type="file"
							accept="image/*"
							className="sr-only"
							onChange={onAvatarFilePick}
						/>
						<AvatarCropSheet
							open={Boolean(pendingPhoto)}
							pick={pendingPhoto}
							onCancel={() => setPendingPhoto(null)}
							onConfirm={applyCroppedPhoto}
						/>
						<div className="relative">
							<div
								className={`iz-avatar iz-avatar--xl${owner.avatarPhoto ? " iz-avatar-photo" : ""}`}
								style={
									owner.avatarPhoto
										? undefined
										: { background: "var(--iz-grad)" }
								}
							>
								{owner.avatarPhoto ? (
									<img src={owner.avatarPhoto} alt="" />
								) : (
									avatarLetter
								)}
							</div>
						</div>
						<div className="iz-agency-settings-identity-copy">
							<div className="iz-heading text-lg font-bold">
								{owner.orgName}
							</div>
							{/* Owner only — see the twin in routes/outlet/settings.tsx. */}
							{isOrgOwner ? (
								<p className="iz-tiny iz-muted mt-0.5">{owner.ownerName}</p>
							) : null}
							<div
								className={`mt-1 flex items-center gap-1 iz-tiny ${
									isOrgSuspended(orgStatus)
										? "text-[var(--iz-red)]"
										: owner.accountActivated
											? "text-[var(--iz-green)]"
											: "text-[var(--iz-amber)]"
								}`}
							>
								<Shield className="h-3 w-3" />
								{isOrgSuspended(orgStatus)
									? t.profile.suspendedProfileOnly
									: owner.accountActivated
										? fill(t.profile.verifiedUsageBased, {
												price: subscriptionBilling.priceLabel,
											})
										: profile.backed || isOrgPendingReview(orgStatus)
											? t.profile.pendingAdminApproval
											: t.profile.pendingOtpActivation}
							</div>
						</div>
						{editing && canEdit ? (
							<ProfilePhotoActions
								hasPhoto={Boolean(draft.avatarPhoto)}
								onChangePhoto={openAvatarUpload}
								// Both, deliberately: a source can outlive the photo it came
								// from — remove the logo, save, then edit again, and the
								// restored source would otherwise offer Adjust on nothing.
								onAdjustPhoto={
									draft.avatarPhoto && photoSource ? adjustCrop : undefined
								}
								onRemovePhoto={
									draft.avatarPhoto
										? () => {
												update({ avatarPhoto: null });
												setLogoMeta(null);
												setLogoCleared(true);
												setPhotoSource(null);
											}
										: undefined
								}
							/>
						) : null}
					</div>

					<div className="iz-agency-settings-organization-fields">
						<ProfileSectionCard editing={editing && canEdit}>
							<ProfileSettingsField
								icon={Building2}
								label={t.agencyMisc.organization}
								value={owner.orgName}
								onChange={(v) => update({ orgName: v })}
								mode={fieldMode}
								placeholder={t.agencyMisc.agencyNamePlaceholder}
							/>
							<ProfileSettingsField
								icon={User}
								label={t.agencyMisc.ownerName}
								value={owner.ownerName}
								onChange={(v) => update({ ownerName: v })}
								mode={fieldMode}
								placeholder={t.agencyMisc.fullNamePlaceholder}
							/>
							<ProfileSettingsField
								icon={Phone}
								label={t.agencyMisc.mobile}
								value={owner.mobile}
								mode="locked"
								hint={t.agencyMisc.changeInLoginSecurity}
							/>
							<ProfileSettingsField
								icon={Mail}
								label={t.agencyMisc.email}
								value={owner.email}
								mode="locked"
								hint={t.agencyMisc.changeInLoginSecurity}
							/>
							{!profile.backed && (
								<ProfileSettingsField
									icon={Shield}
									label={t.agencyMisc.icForPv}
									value={owner.ic}
									onChange={(v) => update({ ic: v })}
									mode={fieldMode}
								/>
							)}
						</ProfileSectionCard>
					</div>
					{profile.backed && (
						<section className="iz-approved-org-address">
							<h2>{t.approvedDesign.address}</h2>
							<ProfileAddressFields
								value={address}
								onChange={updateAddress}
								mode={fieldMode}
							/>
						</section>
					)}
				</section>

				{/* Demo-only Finance Head form — real staff live in OrgMembersPanel. */}
				{!profile.backed && (
					<>
						<IzSectionLabel>{t.agencyMisc.financeHeadDualSign}</IzSectionLabel>
						<ProfileSectionCard editing={editing && canEdit}>
							<p className="iz-tiny iz-muted mb-1 pt-2">
								{t.profile.icAutoStamps}
							</p>
							<ProfileSettingsField
								icon={User}
								label={t.agencyMisc.name}
								value={finance.name}
								onChange={(v) => updateFinance({ name: v })}
								mode={fieldMode}
							/>
							<ProfileSettingsField
								icon={Shield}
								label={t.agencyMisc.ic}
								value={finance.ic}
								onChange={(v) => updateFinance({ ic: v })}
								mode={fieldMode}
							/>
							<ProfileSettingsField
								icon={Mail}
								label={t.agencyMisc.email}
								value={finance.email}
								onChange={(v) => updateFinance({ email: v })}
								mode={fieldMode}
							/>
							{finance.eSignatureStored && (
								<p className="iz-tiny text-[var(--iz-green)] mt-2 mb-2">
									{t.profile.eSignatureOnFile}
								</p>
							)}
						</ProfileSectionCard>

						{editing && canEdit && (
							<>
								<IzSectionLabel>
									{t.agencyMisc.inviteFinanceHead}
								</IzSectionLabel>
								<ProfileSectionCard editing>
									<p className="iz-tiny iz-muted mb-2 pt-2">
										{t.profile.subRoleInviteHint}
									</p>
									<input
										className="iz-profile-field__input mb-3"
										placeholder="finance@agency.my"
										value={inviteEmail}
										onChange={(e) => setInviteEmail(e.target.value)}
									/>
								</ProfileSectionCard>
							</>
						)}
					</>
				)}
			</section>
			{/* Real staff from `agency_user`. */}
			<section
				className="iz-agency-settings-panel iz-agency-settings-team"
				role="tabpanel"
				id="agency-settings-panel-team"
				aria-labelledby="agency-settings-tab-team"
				hidden={section !== "team"}
			>
				{!editing && !profile.agencyId && (
					<IzCard>
						<p className="iz-muted">{t.profile.noTeamMembers}</p>
					</IzCard>
				)}
				{!editing && (
					<OrgMembersPanel
						kind="agency"
						orgId={profile.agencyId}
						canManage={canEdit}
					/>
				)}
				{editing && (
					<IzCard>
						<p className="iz-muted">
							{locale === "zh"
								? "请先保存或取消机构资料的更改，再管理团队。"
								: "Save or cancel your organization changes before managing the team."}
						</p>
						<button
							type="button"
							className="iz-btn iz-btn-soft !w-auto mt-3"
							onClick={() => setSection("organization")}
						>
							{locale === "zh" ? "返回机构资料" : "Back to organization"}
						</button>
					</IzCard>
				)}
			</section>
			<section
				className="iz-agency-settings-panel"
				role="tabpanel"
				id="agency-settings-panel-personal"
				aria-labelledby="agency-settings-tab-personal"
				hidden={section !== "personal"}
			>
				{/* Sits with Login & security, not with the demo Finance Head card
			    above: this is the signed-in person's own signature, whoever they
			    are, and it is real. */}
				<SignatureOnFileCard />

				<IzSectionLabel>{t.agencyMisc.loginAndSecurity}</IzSectionLabel>
				<IzCard>
					<AccountAvatarCard />
					<div className="iz-agency-settings-account">
						<ProfileSettingsField
							icon={Mail}
							label={t.agencyMisc.email}
							value={currentUser?.email ?? (profile.backed ? "" : owner.email)}
							mode="view"
						/>
						<ProfileSettingsField
							icon={Phone}
							label={t.agencyMisc.mobile}
							value={
								currentUser?.contactNo ?? (profile.backed ? "" : owner.mobile)
							}
							mode="view"
						/>
					</div>
					<p className="iz-tiny iz-muted mb-3">{t.profile.passwordOtpHint}</p>
					<button
						type="button"
						className="iz-btn iz-btn-primary w-full"
						onClick={() => setSecurityOpen(true)}
					>
						{t.profile.securitySettings}
					</button>
				</IzCard>
			</section>
			{canEdit && editing && (
				<ProfileEditDock
					onSave={saveEdit}
					onCancel={cancelEdit}
					saving={saving}
				/>
			)}

			<SecuritySettingsSheets
				open={securityOpen}
				onClose={() => setSecurityOpen(false)}
				sheetVariant="side"
				/*
				 * The SIGNED-IN person's own address and number, not `owner.*` —
				 * that is the organisation's owner record, identical for everyone at
				 * the agency. A Director opening Login & security saw the OWNER's
				 * email as the one it was about to change, while the OTP flow acted
				 * on its own account: the screen named one address and would have
				 * changed another.
				 */
				email={currentUser?.email ?? (profile.backed ? "" : owner.email)}
				mobile={currentUser?.contactNo ?? (profile.backed ? "" : owner.mobile)}
				/*
				 * No `canEdit` — that is `settings:update` on the ORGANISATION, and
				 * this sheet is purely personal. Gating it on the org permission
				 * locked every read-only agency role out of its own password, which
				 * for a Director is the only thing it may change at all. The sheet
				 * no longer takes the prop, so it cannot be re-gated by accident.
				 *
				 * The two callbacks below only run on a DEMO session; a real change
				 * goes through the password + one-code flow and is refetched from
				 * `/auth/me`.
				 */
				onUpdateEmail={(email) => {
					if (!profile.backed) saveAgencyOwner({ email });
				}}
				onUpdateMobile={(mobile) => {
					if (!profile.backed) saveAgencyOwner({ mobile });
				}}
			/>
		</div>
	);
}
