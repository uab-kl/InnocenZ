import { AccountAvatarCard } from "@agency-portal/components/auth/AccountAvatarCard";
import { SecuritySettingsSheets } from "@agency-portal/components/auth/SecuritySettingsSheets";
import { IzCard, IzSectionLabel } from "@agency-portal/components/iz/ui";
import { OrgMembersPanel } from "@agency-portal/components/org/OrgMembersPanel";
import { SignatureOnFileCard } from "@agency-portal/components/org/SignatureOnFileCard";
import { AgencyLinksPanel } from "@agency-portal/components/outlet/AgencyLinksPanel";
import { GeoFenceCard } from "@agency-portal/components/outlet/GeoFenceCard";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { PendingReviewBanner } from "@agency-portal/components/portal/PendingReviewBanner";
import { ProfileAddressFields } from "@agency-portal/components/portal/profile-address-fields";
import {
	ProfileEditDock,
	ProfileEditTrigger,
	ProfilePhotoActions,
	ProfileSectionCard,
	ProfileSettingsField,
} from "@agency-portal/components/portal/profile-settings-ui";
import { useOutletProfile } from "@agency-portal/hooks/use-outlet-profile";
import {
	EMPTY_ORG_ADDRESS,
	joinOrgAddress,
	type OrgAddress,
	orgAddressFromRow,
	resolveOrgAddressForSave,
} from "@agency-portal/lib/org-address";
import {
	BLANK_OUTLET_FINANCE_HEAD,
	BLANK_OUTLET_OPS_HEAD,
	BLANK_OUTLET_OWNER,
	type OutletFinanceHead,
	type OutletOpsHead,
	type OutletOwnerSettings,
} from "@agency-portal/lib/outlet-demo";
import {
	getOutletIdentity,
	saveOutletIdentity,
} from "@agency-portal/lib/outlet-identity";
import { publicAssetPath } from "@agency-portal/lib/public-asset";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { Building2, Mail, Phone, Shield, User, Wrench } from "lucide-react";
import { useRef, useState } from "react";
import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/settings")({
	component: OutletSettingsPage,
});

function ToggleRow({
	label,
	desc,
	on,
	onChange,
}: {
	label: string;
	desc: string;
	on: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!on)}
			className="flex w-full items-center justify-between gap-3 border-b border-[var(--iz-line)] py-3 last:border-0 text-left"
		>
			<div>
				<div className="text-sm font-semibold">{label}</div>
				<div className="iz-tiny iz-muted mt-0.5">{desc}</div>
			</div>
			<span
				className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${on ? "bg-[var(--iz-green)]" : "bg-[var(--iz-line)]"}`}
			>
				<span
					className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
				/>
			</span>
		</button>
	);
}

function OutletSettingsPage() {
	const { t } = usePortalLocale();
	const outletOwner = useStore((s) => s.outletOwner);
	const outletFinanceHead = useStore((s) => s.outletFinanceHead);
	const outletOpsHead = useStore((s) => s.outletOpsHead);
	const outletSettings = useStore((s) => s.outletSettings);
	const saveOutletProfileSettings = useStore(
		(s) => s.saveOutletProfileSettings,
	);
	const saveOutletOwner = useStore((s) => s.saveOutletOwner);
	const saveOutletSettings = useStore((s) => s.saveOutletSettings);
	const outletSubRole = useStore((s) => s.outletSubRole);
	const toast = useStore((s) => s.toast);
	// Real login → overlay the real outlet identity in read mode (see the hook).
	const profile = useOutletProfile();

	const [editing, setEditing] = useState(false);
	const [saving, setSaving] = useState(false);
	const [securityOpen, setSecurityOpen] = useState(false);
	const [draft, setDraft] = useState(outletOwner);
	const [financeDraft, setFinanceDraft] = useState(outletFinanceHead);
	const [opsDraft, setOpsDraft] = useState(outletOpsHead);
	const [addressDraft, setAddressDraft] = useState<OrgAddress>({
		...EMPTY_ORG_ADDRESS,
		addressLine1: outletSettings.location,
	});
	const [logoMeta, setLogoMeta] = useState<{
		fileName: string;
		contentType: string;
	} | null>(null);
	const [logoCleared, setLogoCleared] = useState(false);
	const avatarFileRef = useRef<HTMLInputElement>(null);
	const can = useOutletCan();
	const canEdit = can("editSettings");

	// Real login → never merge onto Velvet demo defaults (empty API fields used
	// to leave Chen Wei Jie / Michelle Lim / Bukit Bintang on screen). Demo
	// sessions keep the store seed. Editing uses the local draft.
	const owner =
		!editing && profile.backed
			? { ...BLANK_OUTLET_OWNER, ...(profile.owner ?? {}) }
			: editing
				? draft
				: outletOwner;
	const finance =
		!editing && profile.backed
			? { ...BLANK_OUTLET_FINANCE_HEAD, ...(profile.finance ?? {}) }
			: editing
				? financeDraft
				: outletFinanceHead;
	const ops =
		!editing && profile.backed
			? { ...BLANK_OUTLET_OPS_HEAD, ...(profile.ops ?? {}) }
			: editing
				? opsDraft
				: outletOpsHead;
	const address: OrgAddress =
		!editing && profile.backed
			? orgAddressFromRow(profile.settings)
			: editing
				? addressDraft
				: { ...EMPTY_ORG_ADDRESS, addressLine1: outletSettings.location };
	const avatarLetter =
		owner.ownerName.trim()[0]?.toUpperCase() ??
		owner.orgName.trim()[0]?.toUpperCase() ??
		"?";
	const fieldMode = editing && canEdit ? "edit" : "view";

	const update = (patch: Partial<OutletOwnerSettings>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const updateFinance = (patch: Partial<OutletFinanceHead>) =>
		setFinanceDraft((d) => ({ ...d, ...patch }));
	const updateOps = (patch: Partial<OutletOpsHead>) =>
		setOpsDraft((d) => ({ ...d, ...patch }));
	const updateAddress = (patch: Partial<OrgAddress>) =>
		setAddressDraft((d) => ({ ...d, ...patch }));

	const startEdit = () => {
		// Seed from real overlays on a blank base — never from Velvet demo.
		if (profile.backed) {
			setDraft({ ...BLANK_OUTLET_OWNER, ...(profile.owner ?? {}) });
			setFinanceDraft({
				...BLANK_OUTLET_FINANCE_HEAD,
				...(profile.finance ?? {}),
			});
			setOpsDraft({ ...BLANK_OUTLET_OPS_HEAD, ...(profile.ops ?? {}) });
			setAddressDraft(orgAddressFromRow(profile.settings));
		} else {
			setDraft({ ...outletOwner });
			setFinanceDraft({ ...outletFinanceHead });
			setOpsDraft({ ...outletOpsHead });
			setAddressDraft({
				...EMPTY_ORG_ADDRESS,
				addressLine1: outletSettings.location,
			});
		}
		setLogoMeta(null);
		setLogoCleared(false);
		setEditing(true);
	};

	const cancelEdit = () => {
		if (profile.backed) {
			setDraft({ ...BLANK_OUTLET_OWNER, ...(profile.owner ?? {}) });
			setFinanceDraft({
				...BLANK_OUTLET_FINANCE_HEAD,
				...(profile.finance ?? {}),
			});
			setOpsDraft({ ...BLANK_OUTLET_OPS_HEAD, ...(profile.ops ?? {}) });
			setAddressDraft(orgAddressFromRow(profile.settings));
		} else {
			setDraft({ ...outletOwner });
			setFinanceDraft({ ...outletFinanceHead });
			setOpsDraft({ ...outletOpsHead });
			setAddressDraft({
				...EMPTY_ORG_ADDRESS,
				addressLine1: outletSettings.location,
			});
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
			toast(t.outletSettings.enterOutletName, "warn");
			return;
		}
		if (!draft.ownerName.trim() || draft.ownerName.trim().length < 2) {
			toast(t.profile.enterOwnerName, "warn");
			return;
		}
		if (!addressDraft.addressLine1.trim()) {
			toast(t.profile.enterAddressLine1, "warn");
			return;
		}
		// Real session: outlet owner may change outlet name, owner display name
		// (`user.username`), and address columns. Mobile/email stay in
		// Login & security.
		if (profile.backed) {
			if (!canEdit) {
				toast(t.outletSettings.onlyOwnerCanEdit, "warn");
				return;
			}
			setSaving(true);
			try {
				const nextLogo = draft.avatarPhoto;
				const logoIsNew =
					typeof nextLogo === "string" && nextLogo.startsWith("data:");
				await profile.save({
					venueName: draft.orgName.trim(),
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
				const identity = getOutletIdentity();
				if (identity) {
					saveOutletIdentity({
						...identity,
						outletName: draft.orgName.trim(),
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
			toast(t.outletSettings.ownerInfoSaved, "success");
			return;
		}
		if (!draft.mobile.trim()) {
			toast(t.profile.enterMobile, "warn");
			return;
		}
		saveOutletProfileSettings({
			owner: {
				...draft,
				ownerName: draft.ownerName.trim(),
				orgName: draft.orgName.trim(),
				email: outletOwner.email,
				mobile: outletOwner.mobile,
			},
			financeHead: { ...financeDraft },
			opsHead: { ...opsDraft },
			location: joinOrgAddress(addressDraft),
		});
		setEditing(false);
		toast(t.profile.settingsSaved, "success");
	};

	if (!can("viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<h2 className="font-sora text-lg font-extrabold text-[var(--iz-txt)]">
						{t.outletSettings.accessRestricted}
					</h2>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">{t.outletSettings.noAccess}</p>
				</IzCard>
			</div>
		);
	}

	const isSubRoleReadOnly =
		outletSubRole === "outlet_finance" || outletSubRole === "outlet_ops";
	const orgStatus = getOutletIdentity()?.outletStatus;

	return (
		<OutletPage>
			<OutletPageHeader
				title={t.nav.settings}
				iconKey="Settings"
				hint={owner.orgName}
			/>
			<PendingReviewBanner orgStatus={orgStatus} kind="outlet" />
			{profile.backed && profile.isLoading && (
				<p className="iz-tiny iz-muted mb-3">
					{t.outletSettings.loadingProfile}
				</p>
			)}
			{isSubRoleReadOnly && !editing && (
				<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
					{outletSubRole === "outlet_finance"
						? t.outletSettings.financeReadOnly
						: t.outletSettings.opsReadOnly}
				</p>
			)}

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
						className={`iz-avatar iz-avatar--xl${owner.avatarPhoto ? " iz-avatar-photo iz-avatar-photo--logo" : ""}`}
						style={
							owner.avatarPhoto
								? undefined
								: { background: "var(--iz-grad-outlet, var(--iz-grad))" }
						}
					>
						{owner.avatarPhoto ? (
							<img src={publicAssetPath(owner.avatarPhoto)} alt="" />
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
							? t.outletSettings.verifiedOutletActive
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

			<IzSectionLabel>{t.outletSettings.ownerInformation}</IzSectionLabel>
			<ProfileSectionCard editing={editing && canEdit}>
				<ProfileSettingsField
					icon={Building2}
					label={t.outletSettings.outletName}
					value={owner.orgName}
					onChange={(v) => update({ orgName: v })}
					mode={fieldMode}
					placeholder={t.outletSettings.venueOutletName}
				/>
				<ProfileSettingsField
					icon={User}
					label={t.outletSettings.ownerName}
					value={owner.ownerName}
					onChange={(v) => update({ ownerName: v })}
					mode={fieldMode}
					placeholder={t.outletSettings.displayName}
				/>
				<ProfileSettingsField
					icon={Phone}
					label={t.outletSettings.mobile}
					value={owner.mobile}
					mode="locked"
					hint={t.outletSettings.changeInLoginSecurity}
				/>
				<ProfileSettingsField
					icon={Mail}
					label={t.outletSettings.email}
					value={owner.email}
					mode="locked"
					hint={t.outletSettings.changeInLoginSecurity}
				/>
				{!profile.backed && (
					<ProfileSettingsField
						icon={Shield}
						label={t.outletSettings.icForPv}
						value={owner.ic}
						onChange={(v) => update({ ic: v })}
						mode={fieldMode}
					/>
				)}
				<ProfileAddressFields
					value={address}
					onChange={updateAddress}
					mode={fieldMode}
				/>
			</ProfileSectionCard>

			{canEdit && editing && (
				<ProfileEditDock
					onSave={saveEdit}
					onCancel={cancelEdit}
					saving={saving}
				/>
			)}

			{/* Renders its own section label, and nothing at all on a demo session. */}
			<GeoFenceCard canEdit={canEdit} />

			{/* Demo-only Finance/Ops cards — real staff live in OrgMembersPanel. */}
			{!profile.backed && (
				<>
					<IzSectionLabel>{t.outletSettings.financeHead}</IzSectionLabel>
					<ProfileSectionCard editing={editing && canEdit}>
						<p className="iz-tiny iz-muted mb-1 pt-2">
							{t.outletSettings.financeHeadHint}
						</p>
						<ProfileSettingsField
							icon={User}
							label={t.outletSettings.name}
							value={finance.name}
							onChange={(v) => updateFinance({ name: v })}
							mode={fieldMode}
						/>
						<ProfileSettingsField
							icon={Shield}
							label={t.outletSettings.ic}
							value={finance.ic}
							onChange={(v) => updateFinance({ ic: v })}
							mode={fieldMode}
						/>
						<ProfileSettingsField
							icon={Mail}
							label={t.outletSettings.email}
							value={finance.email}
							onChange={(v) => updateFinance({ email: v })}
							mode={fieldMode}
						/>
					</ProfileSectionCard>

					<IzSectionLabel>{t.outletSettings.opsHead}</IzSectionLabel>
					<ProfileSectionCard editing={editing && canEdit}>
						<p className="iz-tiny iz-muted mb-1 pt-2">
							{t.outletSettings.opsHeadHint}
						</p>
						<ProfileSettingsField
							icon={Wrench}
							label={t.outletSettings.name}
							value={ops.name}
							onChange={(v) => updateOps({ name: v })}
							mode={fieldMode}
						/>
						<ProfileSettingsField
							icon={Shield}
							label={t.outletSettings.ic}
							value={ops.ic}
							onChange={(v) => updateOps({ ic: v })}
							mode={fieldMode}
						/>
						<ProfileSettingsField
							icon={Mail}
							label={t.outletSettings.email}
							value={ops.email}
							onChange={(v) => updateOps({ email: v })}
							mode={fieldMode}
						/>
					</ProfileSectionCard>

					<IzSectionLabel>{t.outletSettings.notifications}</IzSectionLabel>
					<IzCard className="mt-2 !py-0 px-4">
						<ToggleRow
							label={t.outletSettings.shiftUpdates}
							desc={t.outletSettings.shiftUpdatesHint}
							on={outletSettings.notifyShiftUpdates}
							onChange={(v) => saveOutletSettings({ notifyShiftUpdates: v })}
						/>
					</IzCard>
				</>
			)}

			{/* Real staff from `outlet_user` (owner / finance / ops). */}
			{!editing && (
				<OrgMembersPanel
					kind="outlet"
					orgId={profile.outletId}
					canManage={canEdit}
				/>
			)}

			{/* Which agencies may staff this venue (0123). Sits after the team
			    panel because it is the other half of "who works here": staff
			    inside, agencies outside. */}
			{!editing && (
				<AgencyLinksPanel outletId={profile.outletId} canManage={canEdit} />
			)}

			{/* Sits with Login & security, not with the demo Finance/Ops cards
			    above: this is the signed-in person's own signature, whoever they
			    are, and it is real. */}
			{!editing && <SignatureOnFileCard />}

			{!editing && (
				<>
					<IzSectionLabel>{t.outletSettings.loginSecurity}</IzSectionLabel>
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
					if (!profile.backed) saveOutletOwner({ email });
				}}
				onUpdateMobile={(mobile) => {
					if (!profile.backed) saveOutletOwner({ mobile });
				}}
			/>
		</OutletPage>
	);
}
