import { SecuritySettingsSheets } from "@agency-portal/components/auth/SecuritySettingsSheets";
import {
	IzCard,
	IzPageTitle,
	IzSectionLabel,
} from "@agency-portal/components/iz/ui";
import { AppTopbar } from "@agency-portal/components/Nav";
import { OrgMembersPanel } from "@agency-portal/components/org/OrgMembersPanel";
import { useAgencyProfile } from "@agency-portal/hooks/use-agency-profile";
import type {
	AgencyFinanceHead,
	AgencyOwnerSettings,
} from "@agency-portal/lib/agency-demo";
import {
	agencySubscriptionBillingForWeeklyPv,
	agencyWeeklyPvCount,
	ownedByAgency,
} from "@agency-portal/lib/agency-demo";
import { getAgencyManagedPvs } from "@agency-portal/lib/agency-payroll";
import { agencyCan } from "@agency-portal/lib/agency-rbac";
import { getPreviousWeekSundayIso } from "@agency-portal/lib/demo-clock";
import { useStore } from "@agency-portal/lib/store";
import { createFileRoute } from "@tanstack/react-router";
import {
	Building2,
	Camera,
	Mail,
	Pencil,
	Phone,
	Shield,
	User,
	X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/agency/profile")({
	component: AgencyProfile,
});

function AgencyProfile() {
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
	const [securityOpen, setSecurityOpen] = useState(false);
	const [draft, setDraft] = useState(agencyOwner);
	const [financeDraft, setFinanceDraft] = useState(agencyFinanceHead);
	const [inviteEmail, setInviteEmail] = useState(agencyFinanceHead.email);
	const avatarFileRef = useRef<HTMLInputElement>(null);
	const canEdit = agencyCan(agencySubRole, "editSettings");

	// Read mode overlays the real backend identity (overlay carries only defined
	// fields, so demo values fill any gaps); editing uses the local draft. The
	// backend has no agency-update endpoint, so edits do not persist there.
	const owner =
		!editing && profile.backed && profile.owner
			? { ...agencyOwner, ...profile.owner }
			: editing
				? draft
				: agencyOwner;
	const finance =
		!editing && profile.backed && profile.finance
			? { ...agencyFinanceHead, ...profile.finance }
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
		() => agencySubscriptionBillingForWeeklyPv(issuedWeeklyPv),
		[issuedWeeklyPv],
	);
	const avatarLetter =
		owner.ownerName.trim()[0]?.toUpperCase() ??
		owner.orgName.trim()[0]?.toUpperCase() ??
		"A";
	const editCardClass = editing ? " border-[rgba(217,185,122,.25)]" : "";

	const update = (patch: Partial<AgencyOwnerSettings>) =>
		setDraft((d) => ({ ...d, ...patch }));
	const updateFinance = (patch: Partial<AgencyFinanceHead>) =>
		setFinanceDraft((d) => ({ ...d, ...patch }));

	const startEdit = () => {
		// Seed the edit form from the real identity when available.
		setDraft({ ...agencyOwner, ...(profile.owner ?? {}) });
		setFinanceDraft({ ...agencyFinanceHead, ...(profile.finance ?? {}) });
		setInviteEmail(profile.finance?.email ?? agencyFinanceHead.email);
		setEditing(true);
	};

	const cancelEdit = () => {
		setDraft({ ...agencyOwner });
		setFinanceDraft({ ...agencyFinanceHead });
		setInviteEmail(agencyFinanceHead.email);
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
			toast("Please choose an image file", "warn");
			return;
		}
		if (file.size > 2_500_000) {
			toast("Image must be under 2.5 MB", "warn");
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			update({ avatarPhoto: reader.result as string });
			toast("Profile photo updated", "success");
		};
		reader.readAsDataURL(file);
	};

	const saveEdit = async () => {
		if (!draft.ownerName.trim()) {
			toast("Enter owner name", "warn");
			return;
		}
		if (!draft.mobile.trim()) {
			toast("Enter mobile number", "warn");
			return;
		}
		// Real session: persist the backed fields FIRST and bail out if the server
		// refuses, so the screen never shows a saved state the database did not
		// accept. A demo session has no agency id and keeps the store-only path.
		if (profile.backed) {
			try {
				await profile.save({
					orgName: draft.orgName.trim(),
					ownerName: draft.ownerName.trim(),
				});
			} catch {
				toast("Could not save — the server refused the change", "warn");
				return;
			}
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
		if (profile.backed) {
			toast("Settings saved", "success");
		}
		if (inviteChanged && inviteEmail.trim()) {
			// The member-write endpoints are now open to the agency OWNER, not just
			// admin — but there is still no screen that calls them, and sending an
			// invite email needs a mailer that does not exist. So this stays worded
			// as intent, never as a completed action: the previous version said an
			// ADMIN had to add the member, which stopped being true the moment the
			// routes were widened. A message about a capability has to be revisited
			// when the capability moves.
			toast(
				`Finance Head invite for ${inviteEmail.trim()} is not sent — no invite is delivered yet`,
				"warn",
			);
		}
		setEditing(false);
	};

	if (!agencyCan(agencySubRole, "viewSettings")) {
		return (
			<div className="iz-screen">
				<header>
					<IzPageTitle>Access restricted</IzPageTitle>
				</header>
				<IzCard className="text-center">
					<p className="iz-sm iz-muted">
						You do not have access to agency settings.
					</p>
				</IzCard>
			</div>
		);
	}

	const isFinanceReadOnly = agencySubRole === "agency_finance";
	const fieldsLocked = !editing || !canEdit;

	return (
		<div className="iz-screen">
			{editing && <AppTopbar onBack={cancelEdit} backLabel="Cancel edit" />}
			<header>
				<IzPageTitle>Settings</IzPageTitle>
				<p className="iz-tiny iz-muted mt-0.5">{owner.orgName}</p>
				{editing && (
					<span className="iz-pill iz-pill-amber mt-2 !text-[10px]">
						Editing
					</span>
				)}
				{isFinanceReadOnly && !editing && (
					<p className="iz-tiny iz-muted mt-2 rounded-lg border border-dashed border-[var(--iz-line)] px-2.5 py-1.5">
						Finance view — read-only · cannot edit owner settings
					</p>
				)}
			</header>

			<div className="iz-settings-profile flex flex-col items-center py-5">
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
					{editing && canEdit && (
						<>
							<button
								type="button"
								className="iz-avatar-edit"
								aria-label="Upload profile photo"
								onClick={openAvatarUpload}
							>
								<Camera className="h-3.5 w-3.5" />
							</button>
							{draft.avatarPhoto && (
								<button
									type="button"
									className="iz-avatar-remove"
									aria-label="Remove profile photo"
									onClick={() => update({ avatarPhoto: null })}
								>
									<X className="h-3 w-3" />
								</button>
							)}
						</>
					)}
				</div>
				<div className="mt-3 font-sora text-lg font-bold">{owner.orgName}</div>
				<p className="iz-tiny iz-muted mt-0.5">{owner.ownerName}</p>
				<div className="mt-1 flex items-center gap-1 iz-tiny text-[var(--iz-green)]">
					<Shield className="h-3 w-3" />
					{owner.accountActivated
						? `Verified · ${subscriptionBilling.priceLabel} · usage-based weekly`
						: "Pending OTP activation"}
				</div>
				{editing && canEdit && (
					<p className="iz-tiny iz-muted2 mt-2 text-center">
						Tap the camera to upload your agency profile photo.
					</p>
				)}
			</div>

			<IzSectionLabel>Owner information</IzSectionLabel>
			<IzCard className={editCardClass}>
				<Field
					icon={User}
					label="Owner name"
					value={owner.ownerName}
					onChange={(v) => update({ ownerName: v })}
					readOnly={fieldsLocked}
				/>
				<Field
					icon={Phone}
					label="Mobile"
					value={owner.mobile}
					onChange={() => {}}
					readOnly
					hint="Change in Login & security"
				/>
				<Field
					icon={Mail}
					label="Email"
					value={owner.email}
					onChange={() => {}}
					readOnly
					hint="Change in Login & security"
				/>
				<Field
					icon={Shield}
					label="IC (for PV)"
					value={owner.ic}
					onChange={(v) => update({ ic: v })}
					readOnly={fieldsLocked}
				/>
				<Field
					icon={Building2}
					label="Organization"
					value={owner.orgName}
					onChange={(v) => update({ orgName: v })}
					readOnly={fieldsLocked}
				/>
			</IzCard>

			<IzSectionLabel>Finance Head · dual-sign PV</IzSectionLabel>
			<IzCard className={editCardClass}>
				<p className="iz-tiny iz-muted mb-2">
					IC + e-signature auto-stamps every PV (1st of 2 sigs)
				</p>
				<Field
					icon={User}
					label="Name"
					value={finance.name}
					onChange={(v) => updateFinance({ name: v })}
					readOnly={fieldsLocked}
				/>
				<Field
					icon={Shield}
					label="IC"
					value={finance.ic}
					onChange={(v) => updateFinance({ ic: v })}
					readOnly={fieldsLocked}
				/>
				<Field
					icon={Mail}
					label="Email"
					value={finance.email}
					onChange={(v) => updateFinance({ email: v })}
					readOnly={fieldsLocked}
				/>
				{finance.eSignatureStored && (
					<p className="iz-tiny text-[var(--iz-green)] mt-2">
						E-signature on file ✓
					</p>
				)}
			</IzCard>

			{editing && canEdit && (
				<>
					<IzSectionLabel>Invite Finance Head</IzSectionLabel>
					<IzCard className={editCardClass}>
						<p className="iz-tiny iz-muted mb-2">
							Sub-role invite · requires IC + e-signature for dual-sign PV
						</p>
						<input
							className="iz-field-input !text-sm"
							placeholder="finance@agency.my"
							value={inviteEmail}
							onChange={(e) => setInviteEmail(e.target.value)}
						/>
					</IzCard>
				</>
			)}

			{/* Real staff of this agency, from `agency_user`. Distinct from the
			    Finance Head card above, which is the demo profile form. */}
			<OrgMembersPanel
				kind="agency"
				orgId={profile.agencyId}
				canManage={canEdit}
			/>

			<IzSectionLabel>Login &amp; security</IzSectionLabel>
			<IzCard>
				<p className="iz-tiny iz-muted mb-3">
					Update password anytime. Email and mobile changes require OTP
					verification.
				</p>
				<button
					type="button"
					className="iz-btn iz-btn-primary w-full"
					onClick={() => setSecurityOpen(true)}
				>
					Security settings
				</button>
			</IzCard>

			<SecuritySettingsSheets
				open={securityOpen}
				onClose={() => setSecurityOpen(false)}
				sheetVariant="side"
				email={agencyOwner.email}
				mobile={agencyOwner.mobile}
				canEdit={canEdit}
				onUpdateEmail={(email) => saveAgencyOwner({ email })}
				onUpdateMobile={(mobile) => saveAgencyOwner({ mobile })}
			/>

			{canEdit && (
				<div className="iz-profile-actions mt-4">
					{editing ? (
						<>
							<button
								type="button"
								className="iz-btn iz-btn-primary"
								onClick={saveEdit}
							>
								Save settings
							</button>
							<button
								type="button"
								className="iz-btn iz-btn-soft mt-2.5"
								onClick={cancelEdit}
							>
								Cancel
							</button>
						</>
					) : (
						<button
							type="button"
							className="iz-btn iz-btn-primary"
							onClick={startEdit}
						>
							<Pencil className="h-4 w-4" /> Edit settings
						</button>
					)}
				</div>
			)}
		</div>
	);
}

function Field({
	icon: Icon,
	label,
	value,
	onChange,
	readOnly,
	hint,
}: {
	icon: typeof User;
	label: string;
	value: string;
	onChange: (v: string) => void;
	readOnly?: boolean;
	hint?: string;
}) {
	return (
		<div className="border-b border-[var(--iz-line)] py-2.5 last:border-0">
			<div className="flex items-center gap-2 iz-tiny iz-muted">
				<Icon className="h-3 w-3" /> {label}
			</div>
			{readOnly ? (
				<>
					<p className="mt-1 font-medium text-[var(--iz-txt)]">
						{value || "—"}
					</p>
					{hint && <p className="iz-tiny iz-muted2 mt-0.5">{hint}</p>}
				</>
			) : (
				<input
					className="mt-1 w-full bg-transparent font-medium text-[var(--iz-txt)] outline-none"
					value={value}
					onChange={(e) => onChange(e.target.value)}
				/>
			)}
		</div>
	);
}
