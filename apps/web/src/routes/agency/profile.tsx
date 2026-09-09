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

export const Route = createFileRoute("/agency/profile")({
	component: AgencyProfile,
});

function AgencyProfile() {
	const { t } = usePortalLocale();
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
	 */
	useEffect(() => {
		const agencyId = profile.agencyId;
		if (!agencyId) return;
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
	}, [profile.agencyId, logout]);

	const avatarFileRef = useRef<HTMLInputElement>(null);
	const can = useAgencyCan();
	const canEdit = can("editSettings");
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
	const orgStatus = getAgencyIdentity()?.agencyStatus;

	return (
		<div className="iz-screen">
			<header>
				<IzPageTitle>{t.agencyMisc.settings}</IzPageTitle>
				{isFinanceReadOnly && !editing && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						{t.profile.financeReadOnly}
					</p>
				)}
			</header>
			<PendingReviewBanner orgStatus={orgStatus} kind="agency" />

			<div
				className={`iz-settings-profile flex flex-col items-center py-5${editing ? " iz-settings-profile--editing" : ""}`}
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
							owner.avatarPhoto ? undefined : { background: "var(--iz-grad)" }
						}
					>
						{owner.avatarPhoto ? (
							<img src={owner.avatarPhoto} alt="" />
						) : (
							avatarLetter
						)}
					</div>
				</div>
				<div className="mt-3 iz-heading text-lg font-bold">{owner.orgName}</div>
				<p className="iz-tiny iz-muted mt-0.5">{owner.ownerName}</p>
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
				) : (
					canEdit && <ProfileEditTrigger onClick={startEdit} />
				)}
			</div>

			<IzSectionLabel>{t.agencyMisc.ownerInformation}</IzSectionLabel>
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
				{profile.backed && (
					<ProfileAddressFields
						value={address}
						onChange={updateAddress}
						mode={fieldMode}
					/>
				)}
			</ProfileSectionCard>

			{canEdit && editing && (
				<ProfileEditDock
					onSave={saveEdit}
					onCancel={cancelEdit}
					saving={saving}
				/>
			)}

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
							<IzSectionLabel>{t.agencyMisc.inviteFinanceHead}</IzSectionLabel>
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

			{/* Real staff from `agency_user`. */}
			{!editing && (
				<OrgMembersPanel
					kind="agency"
					orgId={profile.agencyId}
					canManage={canEdit}
				/>
			)}

			{/* Sits with Login & security, not with the demo Finance Head card
			    above: this is the signed-in person's own signature, whoever they
			    are, and it is real. */}
			{!editing && <SignatureOnFileCard />}

			{!editing && (
				<>
					<IzSectionLabel>{t.agencyMisc.loginAndSecurity}</IzSectionLabel>
					<IzCard>
						<AccountAvatarCard />
						<p className="iz-tiny iz-muted mb-3">{t.profile.passwordOtpHint}</p>
						<button
							type="button"
							className="iz-btn iz-btn-primary w-full"
							onClick={() => setSecurityOpen(true)}
						>
							{t.profile.securitySettings}
						</button>
					</IzCard>
				</>
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
				email={currentUser?.email ?? owner.email}
				mobile={currentUser?.contactNo ?? owner.mobile}
				/*
				 * NOT `canEdit` — that is `settings:update` on the ORGANISATION, and
				 * this sheet is purely personal. Gating it on the org permission
				 * locked every read-only agency role out of its own password, which
				 * for a Director is the only thing it may change at all.
				 */
				canEdit
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
