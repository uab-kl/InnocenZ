import { OtpVerifySheet } from "@agency-portal/components/auth/OtpVerifySheet";
import { PasswordField } from "@agency-portal/components/auth/PasswordField";
import { IzSheet, type SheetVariant } from "@agency-portal/components/iz/Sheet";
import { useStore } from "@agency-portal/lib/store";
import { verifyDemoOtp } from "@agency-portal/lib/verify-demo-otp";
import {
	ChevronLeft,
	ChevronRight,
	KeyRound,
	Mail,
	Phone,
	X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { changeMyPassword } from "@/lib/auth/password-api";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

type SecurityView = "menu" | "password" | "email" | "phone";
type OtpPending = { field: "email" | "phone"; value: string } | null;

function SheetHead({
	title,
	onBack,
	onClose,
}: {
	title: string;
	onBack?: () => void;
	onClose: () => void;
}) {
	const { t } = usePortalLocale();
	return (
		<div className="iz-sheet-head">
			{onBack ? (
				<button
					type="button"
					className="iz-sheet-back"
					onClick={onBack}
					aria-label={t.profile.back}
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
			) : (
				<span className="iz-sheet-back-spacer" aria-hidden />
			)}
			<h3>{title}</h3>
			<button
				type="button"
				className="iz-sheet-close"
				onClick={onClose}
				aria-label={t.profile.close}
			>
				<X className="h-4 w-4" />
			</button>
		</div>
	);
}

function SecurityMenuRow({
	icon: Icon,
	label,
	meta,
	onClick,
}: {
	icon: typeof KeyRound;
	label: string;
	meta?: string;
	onClick: () => void;
}) {
	return (
		<button type="button" className="iz-security-menu-row" onClick={onClick}>
			<span className="iz-security-menu-row__icon" aria-hidden>
				<Icon className="h-4 w-4" />
			</span>
			<span className="iz-security-menu-row__body">
				<span className="iz-security-menu-row__label">{label}</span>
				{meta && <span className="iz-security-menu-row__meta">{meta}</span>}
			</span>
			<ChevronRight className="iz-security-menu-row__chevron" aria-hidden />
		</button>
	);
}

export function SecuritySettingsSheets({
	open,
	onClose,
	email,
	mobile,
	canEdit = true,
	sheetVariant = "dialog",
	onUpdateEmail,
	onUpdateMobile,
}: {
	open: boolean;
	onClose: () => void;
	email: string;
	mobile: string;
	canEdit?: boolean;
	sheetVariant?: SheetVariant;
	onUpdateEmail: (email: string) => void;
	onUpdateMobile: (mobile: string) => void;
}) {
	const { t } = usePortalLocale();
	const toast = useStore((s) => s.toast);

	const [view, setView] = useState<SecurityView>("menu");
	// Same `useId` pairing `PasswordField` uses, so the "New email" / "New mobile"
	// captions are real labels: clicking one focuses its input and a screen reader
	// announces it with the field.
	const newEmailId = useId();
	const newPhoneId = useId();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [savingPassword, setSavingPassword] = useState(false);

	const [newEmail, setNewEmail] = useState("");
	const [newPhone, setNewPhone] = useState("");
	const [otp, setOtp] = useState("");
	const [otpOpen, setOtpOpen] = useState(false);
	const [otpPending, setOtpPending] = useState<OtpPending>(null);

	useEffect(() => {
		if (open) {
			setView("menu");
			setOtpOpen(false);
			setOtpPending(null);
			setOtp("");
		}
	}, [open]);

	const closeAll = () => {
		setView("menu");
		setOtpOpen(false);
		setOtpPending(null);
		setOtp("");
		onClose();
	};

	const backToMenu = () => {
		setView("menu");
		setOtpOpen(false);
		setOtpPending(null);
		setOtp("");
	};

	/**
	 * Shared by BOTH portals (outlet Settings and agency Profile mount this
	 * same component), so this one call site is the whole web change-password
	 * feature. It used to validate, toast "Password updated" and stop — the
	 * server never heard about it.
	 */
	const changePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (savingPassword) return;
		if (!currentPassword.trim()) {
			toast(t.profile.enterCurrentPassword, "warn");
			return;
		}
		if (!newPassword.trim()) {
			toast(t.profile.enterANewPassword, "warn");
			return;
		}
		if (newPassword.length < 6) {
			toast(t.profile.PasswordMinLength, "warn");
			return;
		}
		if (newPassword !== confirmPassword) {
			toast(t.profile.passwordsDoNotMatch, "warn");
			return;
		}
		if (newPassword === currentPassword) {
			toast(t.profile.passwordMustDiffer, "warn");
			return;
		}
		setSavingPassword(true);
		try {
			await changeMyPassword({ currentPassword, newPassword });
			toast(t.profile.passwordUpdated, "success");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
			backToMenu();
		} catch (error) {
			// Server messages here are already user-facing ("Current password is
			// incorrect"), so show them rather than a generic failure.
			toast(
				error instanceof Error && error.message
					? error.message
					: t.profile.passwordUpdateFailed,
				"warn",
			);
		} finally {
			setSavingPassword(false);
		}
	};

	const requestEmailOtp = () => {
		if (!canEdit) return;
		const next = newEmail.trim();
		if (!next || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) {
			toast(t.profile.enterValidEmail, "warn");
			return;
		}
		if (next === email.trim()) {
			toast(t.profile.emailMustDiffer, "warn");
			return;
		}
		setOtpPending({ field: "email", value: next });
		setOtp("");
		toast(fill(t.profile.otpSentTo, { target: next }), "info");
		setOtpOpen(true);
	};

	const requestPhoneOtp = () => {
		if (!canEdit) return;
		const next = newPhone.trim();
		if (!next) {
			toast(t.profile.enterMobileNumber, "warn");
			return;
		}
		if (next === mobile.trim()) {
			toast(t.profile.mobileMustDiffer, "warn");
			return;
		}
		setOtpPending({ field: "phone", value: next });
		setOtp("");
		toast(fill(t.profile.otpSentTo, { target: next }), "info");
		setOtpOpen(true);
	};

	const verifyContactOtp = () => {
		if (!otpPending) return;
		if (!verifyDemoOtp(otp)) {
			toast(t.profile.invalidOtp, "warn");
			return;
		}
		if (otpPending.field === "email") {
			onUpdateEmail(otpPending.value);
			setNewEmail("");
		} else {
			onUpdateMobile(otpPending.value);
			setNewPhone("");
		}
		setOtpPending(null);
		setOtp("");
		setOtpOpen(false);
		backToMenu();
	};

	const resendOtp = () => {
		if (!otpPending) return;
		toast(fill(t.profile.otpResentTo, { target: otpPending.value }), "info");
	};

	const otpTitle =
		otpPending?.field === "email"
			? t.profile.verifyNewEmail
			: t.profile.verifyNewMobile;

	return (
		<>
			<IzSheet
				open={open && view === "menu"}
				onClose={closeAll}
				variant={sheetVariant}
			>
				<SheetHead title={t.profile.securitySettingsTitle} onClose={closeAll} />
				<p className="iz-tiny iz-muted mb-3">{t.profile.chooseWhatToUpdate}</p>
				<div className="iz-security-menu">
					<SecurityMenuRow
						icon={KeyRound}
						label={t.profile.changePassword}
						onClick={() => setView("password")}
					/>
					<SecurityMenuRow
						icon={Phone}
						label={t.profile.changePhone}
						meta={mobile || undefined}
						onClick={() => setView("phone")}
					/>
					<SecurityMenuRow
						icon={Mail}
						label={t.profile.changeEmail}
						meta={email || undefined}
						onClick={() => setView("email")}
					/>
				</div>
			</IzSheet>

			<IzSheet
				open={open && view === "password"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changePassword}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				{/*
				 * Deliberately NOT gated on `canEdit`. That prop is the org's
				 * `editSettings` permission — it governs the venue's own record
				 * (name, address, owner contact), which is what the email and
				 * phone lanes below write. Your OWN password is not the
				 * organisation's property: a Finance or Ops member has no say
				 * over outlet settings and still must be able to rotate their
				 * own credentials. The server agrees — `POST /auth/password/change`
				 * carries no role guard and takes the user id from the verified
				 * token, so it was only ever the UI refusing.
				 */}
				<form onSubmit={changePassword} className="iz-security-form">
					<PasswordField
						label={t.profile.currentPassword}
						placeholder={t.profile.enterCurrentPassword}
						value={currentPassword}
						onChange={setCurrentPassword}
						show={showCurrent}
						onToggleShow={() => setShowCurrent((v) => !v)}
						autoComplete="current-password"
					/>
					<PasswordField
						label={t.profile.newPassword}
						placeholder={t.profile.enterNewPassword}
						value={newPassword}
						onChange={setNewPassword}
						show={showNew}
						onToggleShow={() => setShowNew((v) => !v)}
						autoComplete="new-password"
					/>
					<PasswordField
						label={t.profile.confirmNewPassword}
						placeholder={t.profile.confirmYourNewPassword}
						value={confirmPassword}
						onChange={setConfirmPassword}
						show={showConfirm}
						onToggleShow={() => setShowConfirm((v) => !v)}
						autoComplete="new-password"
					/>
					<button
						type="submit"
						className="iz-btn iz-btn-primary iz-security-form__submit"
						disabled={savingPassword}
					>
						{savingPassword ? t.profile.savingPassword : t.profile.savePassword}
					</button>
				</form>
			</IzSheet>

			<IzSheet
				open={open && view === "email"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changeEmail}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				<p className="iz-tiny iz-muted mb-2">{t.profile.currentEmail}</p>
				<p className="iz-account-security__current mb-4">{email || "—"}</p>
				{canEdit ? (
					<>
						<label className="iz-tiny iz-muted" htmlFor={newEmailId}>
							{t.profile.newEmailAddress}
						</label>
						<input
							id={newEmailId}
							type="email"
							className="iz-account-security__input mt-1"
							placeholder="you@example.com"
							value={newEmail}
							onChange={(e) => setNewEmail(e.target.value)}
							autoComplete="email"
						/>
						<button
							type="button"
							className="iz-btn iz-btn-primary mt-4 w-full"
							onClick={requestEmailOtp}
						>
							{t.profile.sendOtpAndUpdate}
						</button>
					</>
				) : (
					<p className="iz-tiny iz-muted">{t.profile.readOnlyForRole}</p>
				)}
			</IzSheet>

			<IzSheet
				open={open && view === "phone"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changePhone}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				<p className="iz-tiny iz-muted mb-2">{t.profile.currentMobile}</p>
				<p className="iz-account-security__current mb-4">{mobile || "—"}</p>
				{canEdit ? (
					<>
						<label className="iz-tiny iz-muted" htmlFor={newPhoneId}>
							{t.profile.newMobileNumber}
						</label>
						<input
							id={newPhoneId}
							type="tel"
							className="iz-account-security__input mt-1"
							placeholder="+60 12-345 6789"
							value={newPhone}
							onChange={(e) => setNewPhone(e.target.value)}
							autoComplete="tel"
						/>
						<button
							type="button"
							className="iz-btn iz-btn-primary mt-4 w-full"
							onClick={requestPhoneOtp}
						>
							{t.profile.sendOtpAndUpdate}
						</button>
					</>
				) : (
					<p className="iz-tiny iz-muted">{t.profile.readOnlyForRole}</p>
				)}
			</IzSheet>

			<OtpVerifySheet
				open={otpOpen}
				variant={sheetVariant}
				onClose={() => {
					setOtpOpen(false);
					setOtpPending(null);
					setOtp("");
				}}
				title={otpTitle}
				description={
					otpPending ? (
						<>
							{t.profile.enterSixDigitCode}{" "}
							<b className="text-[var(--iz-txt)]">{otpPending.value}</b>
						</>
					) : (
						""
					)
				}
				otp={otp}
				onOtpChange={setOtp}
				onVerify={verifyContactOtp}
				onResend={resendOtp}
				verifyLabel={t.profile.verifyAndSave}
			/>
		</>
	);
}
