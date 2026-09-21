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
import { isDemoPortalSession } from "@/lib/auth/agency-demo-session";
import {
	describeCodeDelivery,
	localiseAuthMessage,
} from "@/lib/auth/auth-server-copy";
import { nameChangeErrorText } from "@/lib/auth/name-change-copy";
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
} from "@/lib/auth/password-api";
import { phoneNumberProblem, toWhatsAppNumber } from "@/lib/auth/phone-api";
import {
	type ChangedCredential,
	markSignInAgain,
	signInAgain,
} from "@/lib/auth/sign-in-again";
import {
	contactChangeProblemText,
	SIGNED_IN_ACCOUNT_QUERY_KEYS,
	useContactChange,
} from "@/lib/auth/use-contact-change";
import {
	passwordChangeProblemText,
	usePasswordChange,
} from "@/lib/auth/use-password-change";
import { useProfile } from "@/lib/auth/use-profile";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import { updateMyName } from "@/services/user/user";

type SecurityView = "menu" | "password" | "email" | "phone" | "name";
/** DEMO sessions only — a real session's pending change lives in the hook. */
type DemoOtpPending = { field: "email" | "phone"; value: string } | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * LOGIN & SECURITY for the signed-in person — agency Profile and outlet
 * Settings both mount this one component, so it is the whole web feature for
 * those two portals (admin has its own card over the same hook and api).
 *
 * Every lane here is PERSONAL. There is deliberately no `canEdit`: that was the
 * ORGANISATION's `settings:update`, and your own name, password, phone and
 * email are not the organisation's property. A Director or Finance head must
 * be able to secure their own account. The server agrees — each route takes
 * the account from the verified token and never from the body.
 */
export function SecuritySettingsSheets({
	open,
	onClose,
	email,
	mobile,
	sheetVariant = "dialog",
	onUpdateEmail,
	onUpdateMobile,
}: {
	open: boolean;
	onClose: () => void;
	email: string;
	mobile: string;
	sheetVariant?: SheetVariant;
	/** DEMO sessions only — a real change is refetched from `/auth/me`. */
	onUpdateEmail: (email: string) => void;
	/** DEMO sessions only — a real change is refetched from `/auth/me`. */
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
	/**
	 * The phone / email change (owner, 21 Sep 2026): the CURRENT PASSWORD, then
	 * ONE code to the NEW contact. Nothing — no code, no notice — is ever sent
	 * to the email or number already on the account. See `contact-change-api.ts`.
	 */
	const contact = useContactChange();
	const resetContact = contact.reset;
	/**
	 * The password change (owner, 21 Sep 2026, asked what it should become:
	 * "Current password + a code"): the CURRENT PASSWORD, then ONE code to the
	 * phone AND the email already on the account — nothing here is changing
	 * those, so there is no new contact to prove. See `use-password-change.ts`.
	 */
	const password = usePasswordChange();
	const resetPassword = password.reset;

	const [view, setView] = useState<SecurityView>("menu");
	/**
	 * Set when a change SAVED but its answer carried no new tokens. This tab's
	 * token was retired by the change itself, so every other sheet closes and
	 * the only way on is Sign in again — parity with the PR app's
	 * `requireSignInAgain`. Deliberately not tied to `open`: the parent closing
	 * the sheet must not leave the person on a page whose next request 401s.
	 */
	const [signInAfter, setSignInAfter] = useState<ChangedCredential | null>(
		null,
	);
	/** Sheets other than "sign in again" are shown only while the session lives. */
	const live = open && signInAfter === null;
	// Same `useId` pairing `PasswordField` uses, so the "New email" / "New mobile"
	// captions are real labels: clicking one focuses its input and a screen reader
	// announces it with the field.
	const newEmailId = useId();
	const newPhoneId = useId();
	const newNameId = useId();

	const [newName, setNewName] = useState("");
	const [savingName, setSavingName] = useState(false);
	/**
	 * A refusal kept ON the pane, beside the field it is about.
	 *
	 * Owner, 11 Sep 2026: "need show error message that this phone num had in
	 * use in exist account." A toast is gone in three seconds, and this is the
	 * reason the whole action failed — the person has to change what they
	 * typed before anything else can happen. So it stays until they do.
	 */
	const [phoneError, setPhoneError] = useState<string | null>(null);
	const [emailError, setEmailError] = useState<string | null>(null);
	/**
	 * A demo session has no account behind it, so the code endpoints would
	 * refuse it — and a 401 on the demo token would sign the demo out. The
	 * prototype keeps its local-only behaviour; only a REAL session talks to
	 * WhatsApp, SMS and email.
	 *
	 * ⚠️ `isDemoPortalSession`, never `getPortalSessionKind() !== "real"`: that
	 * counted an UNSET marker as demo, so a real token in an unmarked tab was
	 * told "Password updated" while nothing reached the server.
	 */
	const isDemoSession = isDemoPortalSession();

	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	const [newEmail, setNewEmail] = useState("");
	const [newPhone, setNewPhone] = useState("");
	/**
	 * THE CURRENT PASSWORD, which replaced the code to the old contacts (owner,
	 * 21 Sep 2026). Held only until `start` has been sent and cleared with every
	 * other field on the way out — `contact.start` takes it as an argument and
	 * the hook deliberately never keeps it.
	 */
	const [contactPassword, setContactPassword] = useState("");
	const [showContactPassword, setShowContactPassword] = useState(false);
	const [demoOtp, setDemoOtp] = useState("");
	const [demoOtpOpen, setDemoOtpOpen] = useState(false);
	const [demoPending, setDemoPending] = useState<DemoOtpPending>(null);

	useEffect(() => {
		if (open) {
			setView("menu");
			setDemoOtpOpen(false);
			setDemoPending(null);
			setDemoOtp("");
			setContactPassword("");
			setShowContactPassword(false);
			resetContact();
			resetPassword();
		}
	}, [open, resetContact, resetPassword]);

	const backToMenu = () => {
		setView("menu");
		setDemoOtpOpen(false);
		setDemoPending(null);
		setDemoOtp("");
		setPhoneError(null);
		setEmailError(null);
		// Never left behind a closed sheet — the NEW password included. It is
		// held in this component from step 1 until confirm spends it, so
		// abandoning the code sheet has to drop it rather than leave it typed
		// behind a menu somebody else may walk up to.
		setContactPassword("");
		setShowContactPassword(false);
		setCurrentPassword("");
		setNewPassword("");
		setConfirmPassword("");
		resetContact();
		resetPassword();
	};

	const closeAll = () => {
		backToMenu();
		onClose();
	};

	/**
	 * Saved, but no tokens came back. Written to the login page's notice FIRST,
	 * so a background request that collects the 401 before the person taps
	 * still lands on a sign-in page that says why.
	 */
	const requireSignInAgain = (changed: ChangedCredential) => {
		markSignInAgain(changed);
		backToMenu();
		setSignInAfter(changed);
	};

	/** Clears the dead tokens and goes to /login, which shows the same notice. */
	const leaveToSignIn = () => {
		if (signInAfter) signInAgain(signInAfter);
	};

	/**
	 * STEP 1 OF THE PASSWORD CHANGE, shared by BOTH portals — so this one call
	 * site is the whole web change-password feature for agency and outlet.
	 *
	 * Everything about the new password is checked HERE, before a code is sent:
	 * length, the confirmation field, and that it differs from the current one.
	 * Both passwords are in hand on this step and never will be again — confirm
	 * carries no current password, so the server has to compare the new one
	 * against the stored hash and answers the same sentence late. Catching it
	 * here means the common mistake costs no code and no wait.
	 *
	 * The new password then stays in this component until `confirmPassword`
	 * spends it. It is never put in a URL, a query string or the code request.
	 */
	const changePassword = async (e: React.FormEvent) => {
		e.preventDefault();
		if (password.busy) return;
		if (!currentPassword.trim()) {
			toast(t.profile.enterCurrentPassword, "warn");
			return;
		}
		if (!newPassword.trim()) {
			toast(t.profile.enterANewPassword, "warn");
			return;
		}
		if (newPassword.length < PASSWORD_MIN_LENGTH) {
			toast(t.profile.PasswordMinLength, "warn");
			return;
		}
		if (newPassword.length > PASSWORD_MAX_LENGTH) {
			toast(
				fill(t.authCodes.passwordMaxLength, { max: PASSWORD_MAX_LENGTH }),
				"warn",
			);
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
		// A demo token is not a real session: the server would answer 401 and
		// the client would sign the demo out for trying. No code, no request —
		// and deliberately no "sent to" sentence either, which would leave
		// somebody waiting on a handset for a message with no sender.
		if (isDemoSession) {
			toast(t.profile.passwordUpdated, "success");
			backToMenu();
			return;
		}
		/*
		 * A wrong current password is a 400 and a lockout a 429 — never a 401,
		 * which this client would answer by signing the person out. Either lands
		 * in `password.problem` and renders under the fields, where it is still
		 * there when they look back at the box they have to correct.
		 */
		await password.start(currentPassword);
	};

	/**
	 * STEP 2 — spend the code and write the password that has been held here
	 * since step 1. The api call stores the re-issued token pair before this
	 * resolves; the change retires every earlier token, this tab's included, so
	 * without that the next request would sign the person out.
	 */
	const verifyPasswordCode = async () => {
		const confirmed = await password.submitCode(newPassword);
		if (!confirmed) return; // refused — the code sheet stays open
		if (!confirmed.tokensStored) {
			// Written — and the change retired this tab's token.
			requireSignInAgain("password");
			return;
		}
		toast(localiseAuthMessage(confirmed.message, t), "success");
		backToMenu();
	};

	const resendPasswordCode = async () => {
		if (await password.resend()) toast(t.authCodes.codeResent, "info");
	};

	/** What the portals currently call this person. */
	const currentName = me?.displayName || me?.username || "";

	/**
	 * CHANGE YOUR OWN NAME.
	 *
	 * No code, unlike email and mobile. Those two are how you SIGN IN and how
	 * the platform reaches you, so they are proved before they change; a
	 * display name unlocks nothing and a spelling correction should not need a
	 * code. The server takes the id from the verified token and 403s any
	 * other, so nobody can rename a colleague through here.
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
			 * the two drift the first time the server normalises anything. The
			 * owner-name field on Profile / Settings reads the MEMBERS list
			 * before `/auth/me`, so that is refetched too.
			 */
			await Promise.all(
				SIGNED_IN_ACCOUNT_QUERY_KEYS.map((queryKey) =>
					queryClient.invalidateQueries({ queryKey }),
				),
			);
			toast(t.profile.nameUpdated, "success");
			backToMenu();
		} catch (error) {
			// The server's reason in the reader's language — this used to show
			// axios's own "Request failed with status code 400", in English.
			toast(nameChangeErrorText(error, t), "warn");
		} finally {
			setSavingName(false);
		}
	};

	/** Demo only: the prototype's local sheet, where 123456 is the code. */
	const openDemoOtp = (field: "email" | "phone", value: string) => {
		setDemoPending({ field, value });
		setDemoOtp("");
		// Not "sent to" — nothing is sent on a demo session, and saying so left
		// somebody waiting on a handset for a message with no sender.
		toast(t.profile.otpDemoNoMessage, "info");
		setDemoOtpOpen(true);
	};

	const requestEmailCode = async () => {
		const next = newEmail.trim().toLowerCase();
		setEmailError(null);
		contact.clearProblem();
		if (!next || !EMAIL_RE.test(next)) {
			setEmailError(t.profile.enterValidEmail);
			return;
		}
		if (next === email.trim().toLowerCase()) {
			setEmailError(t.profile.emailMustDiffer);
			return;
		}
		/*
		 * ⚠️ THE DEMO CHECK COMES FIRST, and the password guard after it. A demo
		 * session has no account and no password behind it, so asking for one
		 * would make the prototype's own email change impossible to finish.
		 */
		if (isDemoSession) {
			openDemoOtp("email", next);
			return;
		}
		if (!contactPassword.trim()) {
			setEmailError(t.profile.enterCurrentPassword);
			return;
		}
		// Refusals (wrong password, already yours, used by another account,
		// cooldown) land in `contact.problem` and render under the fields below.
		await contact.start("email", next, contactPassword);
	};

	const requestPhoneCode = async () => {
		const next = newPhone.trim();
		setPhoneError(null);
		contact.clearProblem();
		/*
		 * Checked BEFORE the request. Without this, "123" becomes `60123`, the
		 * request goes out, and the second code is addressed to nothing — the
		 * same silent failure a leading zero used to cause. The server still
		 * has the last word on whether the number exists.
		 */
		const problem = phoneNumberProblem(next, {
			empty: t.profile.enterMobileNumber,
			tooShort: t.profile.mobileTooShort,
			tooLong: t.profile.mobileTooLong,
		});
		if (problem) {
			setPhoneError(problem);
			return;
		}
		if (toWhatsAppNumber(next) === toWhatsAppNumber(mobile)) {
			// Compared NORMALISED, so "0123456789" and "+60 12-345 6789" are
			// recognised as the number they already have.
			setPhoneError(t.profile.mobileMustDiffer);
			return;
		}
		// Demo first, password guard second — see requestEmailCode.
		if (isDemoSession) {
			openDemoOtp("phone", next);
			return;
		}
		if (!contactPassword.trim()) {
			setPhoneError(t.profile.enterCurrentPassword);
			return;
		}
		await contact.start("phone", next, contactPassword);
	};

	const verifyDemo = () => {
		if (!demoPending) return;
		if (!verifyDemoOtp(demoOtp)) {
			// The DEMO wording — a demo sends no message, and 123456 is the code.
			toast(t.profile.invalidOtpDemo, "warn");
			return;
		}
		if (demoPending.field === "email") {
			onUpdateEmail(demoPending.value);
			setNewEmail("");
		} else {
			onUpdateMobile(demoPending.value);
			setNewPhone("");
		}
		backToMenu();
	};

	const verifyReal = async () => {
		const kind = contact.kind;
		const confirmed = await contact.submitCode();
		if (!confirmed) return; // refused, or sent back to the field
		if (kind === "email") setNewEmail("");
		else setNewPhone("");
		if (!confirmed.tokensStored) {
			// Written — and the change retired this tab's token.
			requireSignInAgain(kind);
			return;
		}
		toast(localiseAuthMessage(confirmed.message, t), "success");
		backToMenu();
	};

	const resendReal = async () => {
		if (await contact.resend()) toast(t.authCodes.codeResent, "info");
	};

	/** A refusal from `start`, shown on the pane it came from. */
	const paneProblem =
		!contact.codeOpen && contact.problem
			? contactChangeProblemText(contact.problem, t, t.authCodes.codeSendFailed)
			: null;

	/** The same, for the password lane's step 1. */
	const passwordPaneProblem =
		!password.codeOpen && password.problem
			? passwordChangeProblemText(
					password.problem,
					t,
					t.authCodes.codeSendFailed,
				)
			: null;

	const passwordDelivery = describeCodeDelivery(password.sentTo, t);

	const delivery = describeCodeDelivery(contact.sentTo, t);
	const realTitle =
		contact.kind === "email"
			? t.authCodes.newEmailTitle
			: t.authCodes.newPhoneTitle;
	const realHint =
		contact.kind === "email"
			? t.authCodes.newEmailHint
			: t.authCodes.newPhoneHint;
	const realDescription = (
		<>
			<span className="block">{realHint}</span>
			{delivery.sent ? (
				<b className="mt-1.5 block text-[var(--iz-txt)]">{delivery.sent}</b>
			) : null}
			{delivery.none ? (
				<span className="mt-1.5 block">{delivery.none}</span>
			) : null}
			{delivery.failed ? (
				<span className="mt-1.5 block">{delivery.failed}</span>
			) : null}
			{delivery.logged ? (
				<span className="mt-1.5 block">{delivery.logged}</span>
			) : null}
			{/*
			 * ⚠️ THE PENDING-INVITES WARNING, shown while the code is being read
			 * — the last moment BEFORE the change is written, and the first at
			 * which the count exists (only `start` answers it). It used to be
			 * gated on the identity step, which no longer exists; left that way
			 * it would have rendered nowhere at all.
			 */}
			{contact.kind === "email" && contact.pendingInvitesToCurrentEmail > 0 ? (
				<span className="mt-1.5 block text-[var(--iz-amber)]">
					{fill(t.authCodes.pendingInvitesWarning, {
						n: contact.pendingInvitesToCurrentEmail,
					})}
				</span>
			) : null}
		</>
	);

	return (
		<>
			<IzSheet
				open={live && view === "menu"}
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
				open={live && view === "password"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changePassword}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				{/* A real session sends a code from here — say so before the
				    button, not after it. A demo session sends nothing. */}
				{isDemoSession ? null : (
					<p className="iz-tiny iz-muted mb-3">
						{t.authCodes.passwordStepsHint}
					</p>
				)}
				<form onSubmit={changePassword} className="iz-security-form">
					<PasswordField
						label={t.profile.currentPassword}
						placeholder={t.profile.enterCurrentPassword}
						value={currentPassword}
						onChange={(value) => {
							setCurrentPassword(value);
							password.clearProblem();
						}}
						show={showCurrent}
						onToggleShow={() => setShowCurrent((v) => !v)}
						autoComplete="current-password"
					/>
					<PasswordField
						label={t.profile.newPassword}
						placeholder={t.profile.enterNewPassword}
						value={newPassword}
						onChange={(value) => {
							setNewPassword(value);
							password.clearProblem();
						}}
						show={showNew}
						onToggleShow={() => setShowNew((v) => !v)}
						autoComplete="new-password"
					/>
					<PasswordField
						label={t.profile.confirmNewPassword}
						placeholder={t.profile.confirmYourNewPassword}
						value={confirmPassword}
						onChange={(value) => {
							setConfirmPassword(value);
							password.clearProblem();
						}}
						show={showConfirm}
						onToggleShow={() => setShowConfirm((v) => !v)}
						autoComplete="new-password"
					/>
					{/*
					 * A refusal from step 1 — a wrong current password (400), a
					 * lockout (429), or an account with nowhere to send a code
					 * (422) — kept ON the pane beside the field it is about,
					 * never in a toast that is gone in three seconds.
					 */}
					{passwordPaneProblem ? (
						<p role="alert" className="iz-tiny mt-1.5 text-[var(--iz-red)]">
							{passwordPaneProblem}
						</p>
					) : null}
					{/*
					 * Step 1 SENDS A CODE — it no longer saves anything, so it
					 * may not say "Save password". A demo session sends nothing
					 * and finishes here, so it keeps the old label.
					 */}
					<button
						type="submit"
						className="iz-btn iz-btn-primary iz-security-form__submit"
						disabled={password.busy}
					>
						{password.busy
							? t.common.loading
							: isDemoSession
								? t.profile.savePassword
								: t.profile.sendOtpAndUpdate}
					</button>
				</form>
			</IzSheet>

			<IzSheet
				open={live && view === "name"}
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
				open={live && view === "email"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changeEmail}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				<p className="iz-tiny iz-muted mb-2">{t.profile.currentEmail}</p>
				<p className="iz-account-security__current mb-2">{email || "—"}</p>
				<p className="iz-tiny iz-muted mb-4">{t.authCodes.emailStepsHint}</p>
				<label className="iz-tiny iz-muted" htmlFor={newEmailId}>
					{t.profile.newEmailAddress}
				</label>
				<input
					id={newEmailId}
					type="email"
					className="iz-account-security__input mt-1"
					placeholder="you@example.com"
					value={newEmail}
					onChange={(e) => {
						setNewEmail(e.target.value);
						setEmailError(null);
						contact.clearProblem();
					}}
					autoComplete="email"
				/>
				{/*
				 * The CURRENT PASSWORD — what proves it is you now that nothing
				 * is sent to the address already on the account.
				 */}
				<div className="mt-3">
					<PasswordField
						label={t.profile.currentPassword}
						placeholder={t.profile.enterCurrentPassword}
						value={contactPassword}
						onChange={(value) => {
							setContactPassword(value);
							setEmailError(null);
							contact.clearProblem();
						}}
						show={showContactPassword}
						onToggleShow={() => setShowContactPassword((v) => !v)}
						autoComplete="current-password"
					/>
				</div>
				{emailError || paneProblem ? (
					<p role="alert" className="iz-tiny mt-1.5 text-[var(--iz-red)]">
						{emailError ?? paneProblem}
					</p>
				) : null}
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-4 w-full"
					disabled={contact.busy}
					onClick={requestEmailCode}
				>
					{contact.busy ? t.common.loading : t.profile.sendOtpAndUpdate}
				</button>
			</IzSheet>

			<IzSheet
				open={live && view === "phone"}
				onClose={backToMenu}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.profile.changePhone}
					onBack={backToMenu}
					onClose={closeAll}
				/>
				<p className="iz-tiny iz-muted mb-2">{t.profile.currentMobile}</p>
				<p className="iz-account-security__current mb-2">{mobile || "—"}</p>
				<p className="iz-tiny iz-muted mb-4">{t.authCodes.phoneStepsHint}</p>
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
						contact.clearProblem();
					}}
					autoComplete="tel"
				/>
				{/*
				 * THE NUMBER THAT WILL ACTUALLY BE MESSAGED, shown before anything
				 * is sent. Typing `0123456789` is how the number is written in
				 * Malaysia and is NOT deliverable as-is — `toWhatsAppNumber`
				 * resolves it, and this line makes that visible so a wrong
				 * country code is caught by eye.
				 */}
				{newPhone.trim() ? (
					<p className="iz-tiny iz-muted mt-1.5">
						{fill(t.profile.otpWillSendTo, {
							target: `+${toWhatsAppNumber(newPhone)}`,
						})}
					</p>
				) : (
					<p className="iz-tiny iz-muted mt-1.5">{t.profile.phoneFormatHint}</p>
				)}
				{/* The CURRENT PASSWORD — see the email pane. */}
				<div className="mt-3">
					<PasswordField
						label={t.profile.currentPassword}
						placeholder={t.profile.enterCurrentPassword}
						value={contactPassword}
						onChange={(value) => {
							setContactPassword(value);
							setPhoneError(null);
							contact.clearProblem();
						}}
						show={showContactPassword}
						onToggleShow={() => setShowContactPassword((v) => !v)}
						autoComplete="current-password"
					/>
				</div>
				{phoneError || paneProblem ? (
					<p role="alert" className="iz-tiny mt-1.5 text-[var(--iz-red)]">
						{phoneError ?? paneProblem}
					</p>
				) : null}
				<button
					type="button"
					className="iz-btn iz-btn-primary mt-4 w-full"
					disabled={contact.busy}
					onClick={requestPhoneCode}
				>
					{contact.busy ? t.common.loading : t.profile.sendOtpAndUpdate}
				</button>
			</IzSheet>

			{isDemoSession ? (
				<OtpVerifySheet
					open={demoOtpOpen}
					variant={sheetVariant}
					onClose={() => {
						setDemoOtpOpen(false);
						setDemoPending(null);
						setDemoOtp("");
					}}
					title={
						demoPending?.field === "email"
							? t.profile.verifyNewEmail
							: t.profile.verifyNewMobile
					}
					description={
						demoPending ? (
							<>
								{t.profile.enterSixDigitCode}{" "}
								<b className="text-[var(--iz-txt)]">{demoPending.value}</b>
							</>
						) : (
							""
						)
					}
					otp={demoOtp}
					onOtpChange={setDemoOtp}
					onVerify={verifyDemo}
					onResend={() => toast(t.profile.otpDemoNoMessage, "info")}
					verifyLabel={t.profile.verifyAndSave}
				/>
			) : (
				<OtpVerifySheet
					open={live && contact.codeOpen}
					variant={sheetVariant}
					onClose={resetContact}
					title={realTitle}
					description={realDescription}
					otp={contact.code}
					onOtpChange={contact.setCode}
					onVerify={verifyReal}
					onResend={resendReal}
					resendIn={contact.resendIn}
					busy={contact.busy}
					error={
						contact.problem
							? contactChangeProblemText(
									contact.problem,
									t,
									t.authCodes.codeCheckFailed,
								)
							: null
					}
					verifyLabel={
						contact.busy ? t.authCodes.verifying : t.profile.verifyAndSave
					}
				/>
			)}

			{/*
			 * THE PASSWORD CODE — step 2, and a REAL session only. A demo has no
			 * account behind it, so nothing was sent and this never opens; the
			 * demo password change finishes on step 1 exactly as it always did.
			 */}
			{isDemoSession ? null : (
				<OtpVerifySheet
					open={live && password.codeOpen}
					variant={sheetVariant}
					onClose={resetPassword}
					title={t.authCodes.passwordCodeTitle}
					description={
						<>
							<span className="block">{t.authCodes.passwordCodeHint}</span>
							{passwordDelivery.sent ? (
								<b className="mt-1.5 block text-[var(--iz-txt)]">
									{passwordDelivery.sent}
								</b>
							) : null}
							{passwordDelivery.none ? (
								<span className="mt-1.5 block">{passwordDelivery.none}</span>
							) : null}
							{passwordDelivery.failed ? (
								<span className="mt-1.5 block">{passwordDelivery.failed}</span>
							) : null}
							{passwordDelivery.logged ? (
								<span className="mt-1.5 block">{passwordDelivery.logged}</span>
							) : null}
						</>
					}
					otp={password.code}
					onOtpChange={password.setCode}
					onVerify={verifyPasswordCode}
					onResend={resendPasswordCode}
					resendIn={password.resendIn}
					busy={password.busy}
					error={
						password.problem
							? passwordChangeProblemText(
									password.problem,
									t,
									t.authCodes.codeCheckFailed,
								)
							: null
					}
					verifyLabel={
						password.busy ? t.authCodes.verifying : t.profile.savePassword
					}
				/>
			)}

			{/*
			 * SAVED — SIGN IN AGAIN. Every way out of this sheet leaves through
			 * sign-in: there is no session left to go back to.
			 */}
			<IzSheet
				open={signInAfter !== null}
				onClose={leaveToSignIn}
				variant={sheetVariant}
			>
				<SheetHead
					title={t.authCodes.signInAgainTitle}
					onClose={leaveToSignIn}
				/>
				{signInAfter ? (
					<p className="iz-account-security__current mb-2">
						{signInAfter === "password"
							? t.authCodes.changedPassword
							: signInAfter === "email"
								? t.authCodes.changedEmail
								: t.authCodes.changedPhone}
					</p>
				) : null}
				<p className="iz-tiny iz-muted mb-4">{t.authCodes.signInAgainBody}</p>
				<button
					type="button"
					className="iz-btn iz-btn-primary w-full"
					onClick={leaveToSignIn}
				>
					{t.authCodes.signInAgainAction}
				</button>
			</IzSheet>
		</>
	);
}
