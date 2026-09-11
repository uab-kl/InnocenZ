import { OtpVerifySheet } from "@agency-portal/components/auth/OtpVerifySheet";
import { PasswordField } from "@agency-portal/components/auth/PasswordField";
import { IzSheet, type SheetVariant } from "@agency-portal/components/iz/Sheet";
import { useStore } from "@agency-portal/lib/store";
import { verifyDemoOtp } from "@agency-portal/lib/verify-demo-otp";
import { useQueryClient } from "@tanstack/react-query";
import {
	ChevronLeft,
	ChevronRight,
	KeyRound,
	Mail,
	Phone,
	UserRound,
	X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { getPortalSessionKind } from "@/lib/auth/agency-demo-session";
import { changeMyPassword } from "@/lib/auth/password-api";
import {
	changeMyPhone,
	phoneNumberProblem,
	sendPhoneChangeOtp,
	toWhatsAppNumber,
	verifyPhoneChangeOtp,
} from "@/lib/auth/phone-api";
import { profileQueryKey, useProfile } from "@/lib/auth/use-profile";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { updateMyName } from "@/services/user/user";

type SecurityView = "menu" | "password" | "email" | "phone" | "name";
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
	/*
	 * The SIGNED-IN account, read here rather than passed in. `email` and
	 * `mobile` arrive as props because both portals already had them on screen;
	 * the name does not, and threading a fourth prop through two pages to reach
	 * the same `/auth/me` this component can read itself is a second place for
	 * the two to disagree.
	 */
	const { data: me } = useProfile();
	const queryClient = useQueryClient();
	const { logout } = useAuth();

	const [view, setView] = useState<SecurityView>("menu");
	// Same `useId` pairing `PasswordField` uses, so the "New email" / "New mobile"
	// captions are real labels: clicking one focuses its input and a screen reader
	// announces it with the field.
	const newEmailId = useId();
	const newPhoneId = useId();
	const newNameId = useId();

	const [newName, setNewName] = useState("");
	const [savingName, setSavingName] = useState(false);
	/** In flight for send / verify / resend, so nothing can be double-sent. */
	const [otpBusy, setOtpBusy] = useState(false);
	/**
	 * The last refusal from the server, kept ON the pane.
	 *
	 * Owner, 11 Sep 2026: "need show error message that this phone num had in
	 * use in exist account." A toast was already firing, but a toast is gone in
	 * three seconds and this one is not a passing remark — it is the reason the
	 * whole action failed, and the person has to change what they typed before
	 * anything else can happen. So it stays next to the field until they do.
	 */
	const [phoneError, setPhoneError] = useState<string | null>(null);
	/**
	 * Seconds until Resend is offered again — the server's own `resendAfterSec`.
	 *
	 * ⚠️ Five sends per hour per NUMBER, and the refused ones count. Without a
	 * cooldown a person could spend that budget in seconds on a button that
	 * looked free, and then be locked out of their own number for the hour.
	 */
	const [resendIn, setResendIn] = useState(0);
	/**
	 * A demo session has no account behind it, so the OTP endpoints would refuse
	 * it. The prototype keeps its local-only behaviour; only a REAL session
	 * talks to WhatsApp.
	 */
	const isDemoSession = getPortalSessionKind() !== "real";

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
		if (resendIn <= 0) return;
		const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
		return () => clearTimeout(id);
	}, [resendIn]);

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

	/** What the portals currently call this person. */
	const currentName = me?.displayName || me?.username || "";

	/**
	 * CHANGE YOUR OWN NAME.
	 *
	 * ⚠️ Deliberately NOT gated on `canEdit`, for the same reason the password
	 * lane is not: that prop is the ORGANISATION's `editSettings` permission,
	 * which governs the venue's record. Your own name is not the organisation's
	 * property — a Finance or Ops member has no say over outlet settings and
	 * must still be able to correct their own name. The server agrees: it takes
	 * the id from the verified token and 403s any other, so nobody can rename a
	 * colleague through here.
	 *
	 * No OTP, unlike email and mobile. Those two are how you SIGN IN and how the
	 * platform reaches you, so they are proved before they change; a display
	 * name unlocks nothing and a spelling correction should not need a code.
	 */
	const changeName = async (e: React.FormEvent) => {
		e.preventDefault();
		if (savingName) return;
		const trimmed = newName.trim();
		if (!me?.id) {
			toast(t.profile.nameUpdateFailed, "warn");
			return;
		}
		if (trimmed.length < 2) {
			toast(t.profile.enterYourName, "warn");
			return;
		}
		if (trimmed === currentName) {
			backToMenu();
			return;
		}
		setSavingName(true);
		try {
			await updateMyName(me.id, trimmed, logout);
			/*
			 * The name is rendered from `/auth/me` by the greeting, the sidebar
			 * and both Team lists, so the cache is refetched rather than patched
			 * — a hand-written cache entry is a second copy of the answer, and
			 * the two drift the first time the server normalises anything.
			 */
			await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			toast(t.profile.nameUpdated, "success");
			backToMenu();
		} catch (error) {
			toast(
				error instanceof Error && error.message
					? error.message
					: t.profile.nameUpdateFailed,
				"warn",
			);
		} finally {
			setSavingName(false);
		}
	};

	const requestEmailOtp = () => {
		if (!canEdit) return;
		/*
		 * Refused up front on a real session rather than after a code that was
		 * never sent. `requestEmailOtp` makes no API call — it only toasts "OTP
		 * sent to <address>" — so an operator used to wait for a message nobody
		 * dispatched and then collect a phone-number error.
		 */
		if (!isDemoSession) {
			toast(t.profile.emailChangeUnavailable, "warn");
			return;
		}
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

	/**
	 * ⚠️ NOT gated on `canEdit`, for the same reason as the password and name
	 * lanes: that prop is the ORGANISATION's `editSettings`, and the number
	 * being changed here is the SIGNED-IN person's own (`currentUser?.contactNo`
	 * at both call sites), not the venue's. A Finance head must be able to move
	 * their own handset.
	 */
	const requestPhoneOtp = async () => {
		const next = newPhone.trim();
		setPhoneError(null);
		/*
		 * Checked BEFORE the request. Without this, "123" becomes `60123`, the
		 * send succeeds as far as the browser can tell, and the person waits for
		 * a code addressed to nothing — the same silent failure the leading zero
		 * used to cause. The server still has the last word on whether the number
		 * exists; this only catches what is obviously not a number.
		 */
		const problem = phoneNumberProblem(next, {
			empty: t.profile.enterMobileNumber,
			tooShort: t.profile.mobileTooShort,
			tooLong: t.profile.mobileTooLong,
		});
		if (problem) {
			setPhoneError(problem);
			toast(problem, "warn");
			return;
		}
		if (toWhatsAppNumber(next) === toWhatsAppNumber(mobile)) {
			// Compared NORMALISED, so "0123456789" and "+60 12-345 6789" are
			// recognised as the number they already have rather than sent again.
			setPhoneError(t.profile.mobileMustDiffer);
			toast(t.profile.mobileMustDiffer, "warn");
			return;
		}
		/*
		 * A demo session has no account to change, so it keeps the prototype's
		 * local-only behaviour rather than calling an API that would refuse it.
		 * A REAL session gets a real WhatsApp code — see `phone-api.ts` for what
		 * used to happen here instead of a request.
		 */
		if (isDemoSession) {
			setOtpPending({ field: "phone", value: next });
			setOtp("");
			// Not `otpSentTo` — nothing is sent on a demo session, and saying so
			// left somebody waiting on a handset for a message with no sender.
			toast(t.profile.otpDemoNoMessage, "info");
			setOtpOpen(true);
			return;
		}
		setOtpBusy(true);
		try {
			const sent = await sendPhoneChangeOtp(next);
			setResendIn(sent.resendAfterSec ?? 60);
			setOtpPending({ field: "phone", value: next });
			setOtp("");
			toast(fill(t.profile.otpSentTo, { target: next }), "info");
			setOtpOpen(true);
		} catch (error) {
			// Server sentences here are already user-facing, and include BOTH
			// "That phone number is already in use" and the rate limiter's "too
			// many requests" — which a generic failure would hide.
			const message =
				error instanceof Error && error.message
					? error.message
					: t.profile.otpSendFailed;
			setPhoneError(message);
			toast(message, "warn");
		} finally {
			setOtpBusy(false);
		}
	};

	const verifyContactOtp = async () => {
		if (!otpPending || otpBusy) return;

		if (isDemoSession) {
			if (!verifyDemoOtp(otp)) {
				// The DEMO wording. `invalidOtp` now says "check WhatsApp", which is
				// true on a real session and a lie here — a demo sends no message,
				// and 123456 is the code.
				toast(t.profile.invalidOtpDemo, "warn");
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
			return;
		}

		/*
		 * ⚠️ PHONE ONLY on a real session.
		 *
		 * The demo branch above switches on `otpPending.field`; this one used not
		 * to, so a Change-EMAIL verify ran `verifyPhoneChangeOtp(<an email
		 * address>)` — `toWhatsAppNumber` strips every non-digit, leaving "", and
		 * the server answered "Phone number is required" on an email screen. The
		 * email lane cannot succeed on a real session by any route: there is no
		 * email-OTP endpoint, and changing an email with no proof is an account
		 * takeover (deferred by the owner, 11 Sep 2026).
		 */
		if (otpPending.field === "email") {
			toast(t.profile.emailChangeUnavailable, "warn");
			setOtpPending(null);
			setOtp("");
			setOtpOpen(false);
			return;
		}

		setOtpBusy(true);
		try {
			/*
			 * TWO calls, in this order. `verify` mints a single-use receipt;
			 * `change` spends it. The receipt is the only proof the server takes,
			 * and it reads WHOSE number to change from the token rather than the
			 * body — so this cannot rewrite a colleague's.
			 */
			const verificationId = await verifyPhoneChangeOtp(otpPending.value, otp);
			await changeMyPhone(otpPending.value, verificationId);
			// The number is rendered from `/auth/me`, so refetch rather than patch:
			// a hand-written cache entry is a second copy of the answer.
			await queryClient.invalidateQueries({ queryKey: profileQueryKey });
			toast(t.profile.mobileUpdated, "success");
			setNewPhone("");
			setOtpPending(null);
			setOtp("");
			setOtpOpen(false);
			backToMenu();
		} catch (error) {
			// Stays OPEN on failure — a wrong code should be retypeable, and the
			// server allows five attempts before the code dies.
			toast(
				error instanceof Error && error.message
					? error.message
					: t.profile.invalidOtp,
				"warn",
			);
		} finally {
			setOtpBusy(false);
		}
	};

	const resendOtp = async () => {
		if (!otpPending || otpBusy) return;
		if (isDemoSession) {
			toast(fill(t.profile.otpResentTo, { target: otpPending.value }), "info");
			return;
		}
		setOtpBusy(true);
		try {
			const sent = await sendPhoneChangeOtp(otpPending.value);
			setResendIn(sent.resendAfterSec ?? 60);
			toast(fill(t.profile.otpResentTo, { target: otpPending.value }), "info");
		} catch (error) {
			toast(
				error instanceof Error && error.message
					? error.message
					: t.profile.otpSendFailed,
				"warn",
			);
		} finally {
			setOtpBusy(false);
		}
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
					{/*
					 * FIRST, above the password. It is the only row here that is
					 * not a credential — it is what every other person in the
					 * organisation sees you called — and it is the one a new
					 * member goes looking for, having just been added under
					 * whatever the person who invited them typed.
					 */}
					<SecurityMenuRow
						icon={UserRound}
						label={t.profile.changeName}
						meta={currentName || undefined}
						onClick={() => {
							// Seeded on entry, not on open: `/auth/me` may still be in
							// flight when the sheet appears, and an input seeded from a
							// name that had not arrived yet would silently clear it.
							setNewName(currentName);
							setView("name");
						}}
					/>
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
				open={open && view === "name"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changeName}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				<p className="iz-tiny iz-muted mb-2">{t.profile.currentName}</p>
				<p className="iz-account-security__current mb-4">
					{currentName || "—"}
				</p>
				<form onSubmit={changeName} className="iz-security-form">
					<label className="iz-tiny iz-muted" htmlFor={newNameId}>
						{t.profile.yourName}
					</label>
					<input
						id={newNameId}
						type="text"
						className="iz-account-security__input mt-1"
						placeholder={t.profile.enterYourName}
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						autoComplete="name"
						maxLength={80}
					/>
					<p className="iz-tiny iz-muted mt-2">{t.profile.nameShownHint}</p>
					<button
						type="submit"
						className="iz-btn iz-btn-primary iz-security-form__submit"
						disabled={savingName}
					>
						{savingName ? t.profile.savingName : t.profile.saveName}
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
							placeholder="0123456789"
							value={newPhone}
							onChange={(e) => {
								setNewPhone(e.target.value);
								// The refusal was about the number they just replaced.
								setPhoneError(null);
							}}
							autoComplete="tel"
						/>
						{/*
						 * THE NUMBER THAT WILL ACTUALLY BE MESSAGED, shown before the
						 * code is sent rather than after it fails to arrive.
						 *
						 * Typing `0123456789` is how the number is written in Malaysia
						 * and is NOT deliverable — WhatsApp needs the country code. The
						 * field accepts either and `toWhatsAppNumber` resolves it; this
						 * line is what makes that visible instead of magic, so a wrong
						 * country code is caught by eye before a code goes nowhere.
						 */}
						{newPhone.trim() ? (
							<p className="iz-tiny iz-muted mt-1.5">
								{fill(t.profile.otpWillSendTo, {
									target: `+${toWhatsAppNumber(newPhone)}`,
								})}
							</p>
						) : (
							// Only while the box is empty — once they type, the line above
							// answers the same question with their actual number.
							<p className="iz-tiny iz-muted mt-1.5">
								{t.profile.phoneFormatHint}
							</p>
						)}
						{/*
						 * STAYS until the number is edited. "That phone number is already
						 * in use" is the reason the action failed, not a passing remark,
						 * and a toast is gone in three seconds.
						 */}
						{phoneError ? (
							<p className="iz-tiny mt-1.5 text-[var(--iz-red)]">
								{phoneError}
							</p>
						) : null}
						<button
							type="button"
							className="iz-btn iz-btn-primary mt-4 w-full"
							disabled={otpBusy}
							onClick={requestPhoneOtp}
						>
							{otpBusy ? t.common.loading : t.profile.sendOtpAndUpdate}
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
				resendIn={resendIn}
				busy={otpBusy}
				verifyLabel={t.profile.verifyAndSave}
			/>
		</>
	);
}
