import { AccountAvatarCard } from "@agency-portal/components/auth/AccountAvatarCard";
import { SecuritySettingsSheets } from "@agency-portal/components/auth/SecuritySettingsSheets";
import {
	IzCard,
	IzPageTitle,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OrgMembersPanel } from "@agency-portal/components/org/OrgMembersPanel";
import { SignatureOnFileCard } from "@agency-portal/components/org/SignatureOnFileCard";
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
import { useMemo, useRef, useState } from "react";
import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

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
	const avatarFileRef = useRef<HTMLInputElement>(null);
	const can = useAgencyCan();
	const canEdit = can("editSettings");

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
		[issuedWeeklyPv],
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
			update({ avatarPhoto: reader.result as string });
			setLogoMeta({
				fileName: file.name || "logo.png",
				contentType: file.type || "image/png",
			});
			setLogoCleared(false);
			toast(t.profile.logoSelected, "success");
		};
		reader.readAsDataURL(file);
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
				<div className="mt-3 font-sora text-lg font-bold">{owner.orgName}</div>
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
						onRemovePhoto={
							draft.avatarPhoto
								? () => {
										update({ avatarPhoto: null });
										setLogoMeta(null);
										setLogoCleared(true);
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
							label="IC"
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
				email={owner.email}
				mobile={owner.mobile}
				canEdit={canEdit}
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
