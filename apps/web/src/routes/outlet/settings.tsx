import { AccountAvatarCard } from "@agency-portal/components/auth/AccountAvatarCard";
import { SecuritySettingsSheets } from "@agency-portal/components/auth/SecuritySettingsSheets";
import {
	IzCard,
	IzPageTitle,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { OrgMembersPanel } from "@agency-portal/components/org/OrgMembersPanel";
import { AgencyLinksPanel } from "@agency-portal/components/outlet/AgencyLinksPanel";
import { GeoFenceCard } from "@agency-portal/components/outlet/GeoFenceCard";
import {
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
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
import { useEffect, useRef, useState } from "react";
import {
	isOrgPendingReview,
	isOrgSuspended,
} from "@/components/organization/org-status";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fetchOutletLogoSource } from "@/services/outlet/outlet";

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
	/** Same refresh-failure handler every service call in this portal uses. */
	const { logout } = useAuth();

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
	 * from. Held in a ref so entering or cancelling an edit can restore it.
	 *
	 * ⚠️ This exists because `startEdit`/`cancelEdit` used to set `photoSource`
	 * to null, which was right when the only way to have one was to have just
	 * picked a file. Once the original arrives from the server on mount, that
	 * reset threw away a perfectly good source and Adjust disappeared for the
	 * rest of the visit — and whether it did so depended on whether the fetch
	 * had landed before the click, so the button came and went by luck.
	 */
	const storedSource = useRef<PendingAvatarPick | null>(null);

	/**
	 * Load the stored ORIGINAL so "Adjust crop" works on a photo saved in an
	 * earlier session — until this existed the button vanished on every reload.
	 *
	 * Fetched from the API, never from the public R2 URL: that host sends no CORS
	 * header, so the browser cannot read the bytes and a canvas drawn from them
	 * cannot be exported. A null answer is ordinary — every logo uploaded before
	 * this shipped has no stored source — and simply leaves Adjust hidden.
	 *
	 * ⚠️ Stored with the FUNCTIONAL updater — `prev ?? fetched` — rather than
	 * guarding on `photoSource`. A response that lands after the owner has
	 * already picked a new file must not replace the image they are framing, and
	 * reading `photoSource` here to check that would make it a dependency, so the
	 * effect would re-run the moment a pick set it. Keeping whatever is already
	 * there answers both, and needs no lint suppression to do it.
	 */
	useEffect(() => {
		const outletId = profile.outletId;
		if (!outletId) return;
		let cancelled = false;
		void fetchOutletLogoSource(outletId, logout).then((source) => {
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
	}, [profile.outletId, logout]);
	const avatarFileRef = useRef<HTMLInputElement>(null);
	const can = useOutletCan();
	const canEdit = can("editSettings");
	/** Whoever is signed in — used for Login & security, which is personal. */
	const { user: currentUser } = useCurrentUser();

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
		setPendingPhoto(null);
		// Back to the SAVED photo's source, not to nothing: the stored original
		// still describes the logo on the row, so Adjust stays available. Setting
		// null here is what made the button appear or vanish depending on whether
		// the fetch had landed before Edit was clicked.
		setPhotoSource(storedSource.current);
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
		setPendingPhoto(null);
		// Back to the SAVED photo's source, not to nothing: the stored original
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
								// The un-cropped ORIGINAL and its framing travel WITH the
								// logo, so a later session re-opens the crop sheet on the real
								// source instead of re-cropping the cropped square.
								// ⚠️ A FALLBACK IS NEVER STORED AS AN ORIGINAL. It is the
								// already-cropped image; saving it as the source would
								// enshrine a degraded picture and let every later adjust
								// compound the loss. Staying sourceless keeps the venue
								// honestly in fallback mode until a real photo is uploaded.
								logoSourceDataUrl: photoSource?.fallback
									? null
									: (photoSource?.dataUrl ?? null),
								logoCropState: photoSource?.fallback
									? null
									: (photoSource?.state ?? null),
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
					<IzPageTitle>{t.outletSettings.accessRestricted}</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">{t.outletSettings.noAccess}</p>
				</IzCard>
			</div>
		);
	}

	/**
	 * The venue's OWN owner, and nobody else — not the Guarantor either.
	 *
	 * Deliberately the sub-role rather than `canEdit`: a Guarantor stands in
	 * for the owner and may edit this record, but the name in the header is
	 * still the OWNER'S, so "this is you" is false for them too.
	 */
	const isOrgOwner = outletSubRole === "outlet_owner";
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
			{/*
			 * `!canEdit`, NOT a list of two sub-roles.
			 *
			 * The note named Finance and Ops only, so a DIRECTOR — the other
			 * read-only lane — got a Settings page with no edit control and no
			 * word of explanation, which reads as a broken page rather than as
			 * a rule. Asking the same permission the edit control asks means a
			 * lane added later cannot be forgotten here: whoever cannot edit is
			 * told why (owner's rule, 11 Sep 2026 — "other member cannot change
			 * it, only owner themself can change it").
			 */}
			{!canEdit && !editing && (
				<p className="iz-tiny iz-muted rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
					{outletSubRole === "outlet_finance"
						? t.outletSettings.financeReadOnly
						: outletSubRole === "outlet_ops"
							? t.outletSettings.opsReadOnly
							: t.outletSettings.memberReadOnly}
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
				<AvatarCropSheet
					open={Boolean(pendingPhoto)}
					pick={pendingPhoto}
					onCancel={() => setPendingPhoto(null)}
					onConfirm={applyCroppedPhoto}
				/>
				<div className="relative">
					{/*
					 * No `iz-avatar-photo--logo` here on purpose. That modifier adds
					 * `scale(1.28) translateY(-4%)` — a blanket zoom that existed to
					 * rescue logos with whitespace around them, and it would now crop
					 * the crop, showing the owner something other than what they
					 * framed and other than what every OTHER surface renders (they
					 * all use plain `iz-avatar-photo`).
					 */}
					<div
						className={`iz-avatar iz-avatar--xl${owner.avatarPhoto ? " iz-avatar-photo" : ""}`}
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
				<div className="mt-3 iz-heading text-lg font-bold">{owner.orgName}</div>
				{/*
				 * The owner's name directly under the venue's own name reads as
				 * "this is you" — true for the owner, and for everybody else it
				 * put ANOTHER person's name beneath the signed-in operator's
				 * logo (owner's call, 11 Sep 2026).
				 *
				 * NOT a privacy gate. A member still reads the owner's name and
				 * mobile in OWNER INFORMATION below, which is the one place that
				 * fact belongs; this line was only ever a duplicate of it.
				 */}
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
							? t.outletSettings.verifiedOutletActive
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

			{/*
			 * ⚠️ THE JOIN QUEUE IS NO LONGER HERE — it is `/outlet/approvals`, a
			 * page of its own with the agency layout, carrying a rail badge.
			 *
			 * It lived here, below the profile and the notification toggles, and the
			 * owner went looking for it twice without finding it. What stays behind
			 * is a POINTER, not a second copy: two places to approve the same person
			 * is two places for the role grant to be got right or wrong.
			 */}

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

			{/* No signature-on-file card here on purpose. It exists so an agency
			    owner/finance head can sign a stack of vouchers with one tap, and a
			    voucher carries exactly two signatures — the agency's and the PR
			    payee's. An outlet signs nothing: the payment-voucher router refuses
			    outlet callers outright, so ink stored here is a forgeable scribble
			    that nothing in this portal can ever use. */}

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
				/*
				 * The SIGNED-IN person's own address and number, not `owner.*` —
				 * that is the organisation's owner record, which is the same for
				 * everyone at the venue. A Director opening Login & security was
				 * shown the OWNER's email as the one it was about to change.
				 * Harmless only by luck: the code flow acts on the session's own
				 * account, so the screen named one address and would have changed
				 * another.
				 */
				email={currentUser?.email ?? owner.email}
				mobile={currentUser?.contactNo ?? owner.mobile}
				/*
				 * No `canEdit` — that is `settings:update` on the ORGANISATION, and
				 * this sheet is the signed-in person's own account: change password,
				 * and change email or mobile with the current password plus one code
				 * to the NEW address or number. Nothing in it touches the venue.
				 *
				 * Gating it on the org permission locked every read-only outlet role
				 * out of its own password. That is the entire editable surface a
				 * Director is meant to have (owner's rule, 17 Aug 2026), so the role
				 * would have had none — and Finance was already quietly in the same
				 * position. The sheet no longer takes the prop at all.
				 *
				 * The two callbacks below only run on a DEMO session; a real change
				 * is refetched from `/auth/me`.
				 */
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
