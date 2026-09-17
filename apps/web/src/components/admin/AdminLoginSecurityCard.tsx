import { KeyRound, Loader2, Mail, Phone } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
	describeCodeDelivery,
	localiseAuthError,
	localiseAuthMessage,
} from "@/lib/auth/auth-server-copy";
import type { ContactKind } from "@/lib/auth/contact-change-api";
import {
	changeMyPassword,
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
	useContactChange,
} from "@/lib/auth/use-contact-change";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = "password" | ContactKind | null;

/**
 * LOGIN & SECURITY for a signed-in ADMIN — the admin portal's counterpart of
 * the agency/outlet `SecuritySettingsSheets`.
 *
 * A separate component, not that sheet mounted here: the sheet is styled with
 * `iz-*` classes from `agency-portal/prototype-theme.css`, which the agency
 * shell imports and the admin shell does not, so it would render unstyled on
 * this page. What is shared is everything that matters — the api modules, the
 * two-code state machine (`useContactChange`), the server-sentence localiser
 * and the "where the code went" sentence — so the three portals cannot
 * disagree about the flow, only about the chrome around it.
 */
export function AdminLoginSecurityCard({
	email,
	phone,
}: {
	email: string;
	phone: string;
}) {
	const { t } = usePortalLocale();
	const [mode, setMode] = useState<Mode>(null);
	/**
	 * A change that SAVED but returned no tokens — this tab's session is over.
	 * Same rule as the agency/outlet sheet: say so, and leave through sign-in.
	 */
	const [signInAfter, setSignInAfter] = useState<ChangedCredential | null>(
		null,
	);
	const requireSignInAgain = (changed: ChangedCredential) => {
		// Written first, so a background 401 still reaches a login page that
		// knows why.
		markSignInAgain(changed);
		setMode(null);
		setSignInAfter(changed);
	};
	const leaveToSignIn = () => {
		if (signInAfter) signInAgain(signInAfter);
	};

	return (
		<Card className="border-(--lavender-soft)/40 bg-card">
			<CardHeader>
				<CardTitle>{t.adminProfile.loginSecurity}</CardTitle>
				<CardDescription>{t.adminProfile.loginSecurityHint}</CardDescription>
			</CardHeader>
			<CardContent>
				<ul className="divide-y divide-(--lavender-soft)/25">
					<SecurityRow
						icon={<KeyRound className="h-4 w-4" />}
						label={t.profile.changePassword}
						value="••••••••"
						actionLabel={t.adminProfile.change}
						onAction={() => setMode("password")}
					/>
					<SecurityRow
						icon={<Phone className="h-4 w-4" />}
						label={t.adminProfile.phone}
						value={phone || t.adminProfile.notSet}
						actionLabel={t.adminProfile.change}
						onAction={() => setMode("phone")}
					/>
					<SecurityRow
						icon={<Mail className="h-4 w-4" />}
						label={t.admin.colEmail}
						value={email || t.adminProfile.notSet}
						actionLabel={t.adminProfile.change}
						onAction={() => setMode("email")}
					/>
				</ul>
			</CardContent>

			<PasswordDialog
				open={mode === "password"}
				onClose={() => setMode(null)}
				onSignInAgain={requireSignInAgain}
			/>
			{/* Keyed by lane so switching lanes never carries one lane's ids or
			    typed value into the other. */}
			{mode === "phone" || mode === "email" ? (
				<ContactDialog
					key={mode}
					kind={mode}
					current={mode === "email" ? email : phone}
					onClose={() => setMode(null)}
					onSignInAgain={requireSignInAgain}
				/>
			) : null}

			<Dialog
				open={signInAfter !== null}
				onOpenChange={(value) => (value ? null : leaveToSignIn())}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{t.authCodes.signInAgainTitle}</DialogTitle>
						<DialogDescription>
							{signInAfter === "password"
								? t.authCodes.changedPassword
								: signInAfter === "email"
									? t.authCodes.changedEmail
									: t.authCodes.changedPhone}{" "}
							{t.authCodes.signInAgainBody}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" onClick={leaveToSignIn}>
							{t.authCodes.signInAgainAction}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

function SecurityRow({
	icon,
	label,
	value,
	actionLabel,
	onAction,
}: {
	icon: ReactNode;
	label: string;
	value: string;
	actionLabel: string;
	onAction: () => void;
}) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-3 py-3">
			<div className="flex min-w-0 items-center gap-3">
				<span
					className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--lavender-soft)/15 text-muted-foreground"
					aria-hidden
				>
					{icon}
				</span>
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">{label}</p>
					<p className="truncate text-base font-medium">{value}</p>
				</div>
			</div>
			<Button type="button" variant="outline" size="sm" onClick={onAction}>
				{actionLabel}
			</Button>
		</li>
	);
}

function InlineError({ text }: { text: string | null }) {
	if (!text) return null;
	return (
		<p role="alert" className="text-sm text-destructive">
			{text}
		</p>
	);
}

/**
 * Change password. `changeMyPassword` stores the RE-ISSUED token pair before it
 * resolves — the change retires every earlier token, this tab's included.
 */
function PasswordDialog({
	open,
	onClose,
	onSignInAgain,
}: {
	open: boolean;
	onClose: () => void;
	/** The password changed but no tokens came back. */
	onSignInAgain: (changed: ChangedCredential) => void;
}) {
	const { t } = usePortalLocale();
	const currentId = useId();
	const newId = useId();
	const confirmId = useId();
	const [current, setCurrent] = useState("");
	const [next, setNext] = useState("");
	const [confirm, setConfirm] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	const close = () => {
		if (saving) return;
		setCurrent("");
		setNext("");
		setConfirm("");
		setError(null);
		onClose();
	};

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (saving) return;
		let problem: string | null = null;
		if (!current) problem = t.profile.enterCurrentPassword;
		else if (!next) problem = t.profile.enterANewPassword;
		else if (next.length < PASSWORD_MIN_LENGTH)
			problem = t.profile.PasswordMinLength;
		else if (next.length > PASSWORD_MAX_LENGTH)
			problem = fill(t.authCodes.passwordMaxLength, {
				max: PASSWORD_MAX_LENGTH,
			});
		else if (next !== confirm) problem = t.profile.passwordsDoNotMatch;
		else if (next === current) problem = t.profile.passwordMustDiffer;
		setError(problem);
		if (problem) return;

		setSaving(true);
		try {
			const changed = await changeMyPassword({
				currentPassword: current,
				newPassword: next,
			});
			setSaving(false);
			setCurrent("");
			setNext("");
			setConfirm("");
			if (!changed.tokensStored) {
				onSignInAgain("password");
				return;
			}
			toast.success(t.profile.passwordUpdated);
			onClose();
		} catch (err) {
			// A wrong current password is a 400 — the dialog stays open.
			setError(localiseAuthError(err, t, t.profile.passwordUpdateFailed));
			setSaving(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(value) => (value ? null : close())}>
			<DialogContent>
				<form onSubmit={submit} className="grid gap-4">
					<DialogHeader>
						<DialogTitle>{t.profile.changePassword}</DialogTitle>
						<DialogDescription>{t.profile.passwordOtpHint}</DialogDescription>
					</DialogHeader>
					<div className="grid gap-2">
						<Label htmlFor={currentId}>{t.profile.currentPassword}</Label>
						<PasswordInput
							id={currentId}
							value={current}
							onChange={(e) => setCurrent(e.target.value)}
							placeholder={t.profile.enterCurrentPassword}
							autoComplete="current-password"
							disabled={saving}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={newId}>{t.profile.newPassword}</Label>
						<PasswordInput
							id={newId}
							value={next}
							onChange={(e) => setNext(e.target.value)}
							placeholder={t.profile.enterNewPassword}
							autoComplete="new-password"
							disabled={saving}
						/>
					</div>
					<div className="grid gap-2">
						<Label htmlFor={confirmId}>{t.profile.confirmNewPassword}</Label>
						<PasswordInput
							id={confirmId}
							value={confirm}
							onChange={(e) => setConfirm(e.target.value)}
							placeholder={t.profile.confirmYourNewPassword}
							autoComplete="new-password"
							disabled={saving}
						/>
					</div>
					<InlineError text={error} />
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={close}
							disabled={saving}
						>
							{t.common.cancel}
						</Button>
						<Button type="submit" disabled={saving}>
							{saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
							{saving ? t.profile.savingPassword : t.profile.savePassword}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/**
 * Change phone or email — the two-code flow. Step 1 sends a code to the
 * CURRENT phone and email; step 2 sends one to the NEW contact; confirm writes
 * the change and stores the re-issued tokens (inside the api call, before the
 * profile refetch goes out).
 */
function ContactDialog({
	kind,
	current,
	onClose,
	onSignInAgain,
}: {
	kind: ContactKind;
	current: string;
	onClose: () => void;
	/** The contact changed but no tokens came back. */
	onSignInAgain: (changed: ChangedCredential) => void;
}) {
	const { t } = usePortalLocale();
	const valueId = useId();
	const codeId = useId();
	const contact = useContactChange();
	const [value, setValue] = useState("");
	const [localError, setLocalError] = useState<string | null>(null);

	const close = () => {
		contact.reset();
		onClose();
	};

	const sendFirstCode = async (e: React.FormEvent) => {
		e.preventDefault();
		if (contact.busy) return;
		setLocalError(null);
		contact.clearProblem();
		if (kind === "email") {
			const next = value.trim().toLowerCase();
			if (!EMAIL_RE.test(next)) {
				setLocalError(t.profile.enterValidEmail);
				return;
			}
			if (next === current.trim().toLowerCase()) {
				setLocalError(t.profile.emailMustDiffer);
				return;
			}
		} else {
			const problem = phoneNumberProblem(value, {
				empty: t.profile.enterMobileNumber,
				tooShort: t.profile.mobileTooShort,
				tooLong: t.profile.mobileTooLong,
			});
			if (problem) {
				setLocalError(problem);
				return;
			}
			if (toWhatsAppNumber(value) === toWhatsAppNumber(current)) {
				setLocalError(t.profile.mobileMustDiffer);
				return;
			}
		}
		await contact.start(kind, value);
	};

	const submitCode = async (e: React.FormEvent) => {
		e.preventDefault();
		const confirmed = await contact.submitCode();
		// Moved on to code #2, back to the field, or refused — stays open.
		if (!confirmed) return;
		if (!confirmed.tokensStored) {
			contact.reset();
			onSignInAgain(kind);
			return;
		}
		toast.success(localiseAuthMessage(confirmed.message, t));
		close();
	};

	const resend = async () => {
		if (await contact.resend()) toast.info(t.authCodes.codeResent);
	};

	const problemText = contact.problem
		? contactChangeProblemText(
				contact.problem,
				t,
				contact.codeOpen
					? t.authCodes.codeCheckFailed
					: t.authCodes.codeSendFailed,
			)
		: null;
	const delivery = describeCodeDelivery(contact.sentTo, t);
	const title = !contact.codeOpen
		? kind === "email"
			? t.profile.changeEmail
			: t.profile.changePhone
		: contact.stage === "identity"
			? t.authCodes.identityTitle
			: kind === "email"
				? t.authCodes.newEmailTitle
				: t.authCodes.newPhoneTitle;

	return (
		<Dialog open onOpenChange={(open) => (open ? null : close())}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{!contact.codeOpen
							? kind === "email"
								? t.authCodes.emailStepsHint
								: t.authCodes.phoneStepsHint
							: contact.stage === "identity"
								? t.authCodes.identityHint
								: kind === "email"
									? t.authCodes.newEmailHint
									: t.authCodes.newPhoneHint}
					</DialogDescription>
				</DialogHeader>

				{!contact.codeOpen ? (
					<form onSubmit={sendFirstCode} className="grid gap-4">
						<div className="grid gap-1">
							<p className="text-sm text-muted-foreground">
								{kind === "email"
									? t.profile.currentEmail
									: t.profile.currentMobile}
							</p>
							<p className="text-base font-medium">
								{current || t.adminProfile.notSet}
							</p>
						</div>
						<div className="grid gap-2">
							<Label htmlFor={valueId}>
								{kind === "email"
									? t.profile.newEmailAddress
									: t.profile.newMobileNumber}
							</Label>
							<Input
								id={valueId}
								type={kind === "email" ? "email" : "tel"}
								autoComplete={kind === "email" ? "email" : "tel"}
								placeholder={
									kind === "email" ? "you@example.com" : "0123456789"
								}
								value={value}
								onChange={(e) => {
									setValue(e.target.value);
									setLocalError(null);
									contact.clearProblem();
								}}
								disabled={contact.busy}
								aria-invalid={localError || problemText ? true : undefined}
							/>
							{kind === "phone" ? (
								<p className="text-sm text-muted-foreground">
									{value.trim()
										? fill(t.profile.otpWillSendTo, {
												target: `+${toWhatsAppNumber(value)}`,
											})
										: t.profile.phoneFormatHint}
								</p>
							) : null}
						</div>
						<InlineError text={localError ?? problemText} />
						<DialogFooter>
							<Button type="button" variant="outline" onClick={close}>
								{t.common.cancel}
							</Button>
							<Button type="submit" disabled={contact.busy}>
								{contact.busy && (
									<Loader2 className="mr-1 h-4 w-4 animate-spin" />
								)}
								{t.profile.sendOtpAndUpdate}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<form onSubmit={submitCode} className="grid gap-4">
						<div className="grid gap-1 text-sm text-muted-foreground">
							{delivery.sent ? (
								<p className="font-medium text-foreground">{delivery.sent}</p>
							) : null}
							{delivery.none ? <p>{delivery.none}</p> : null}
							{delivery.failed ? <p>{delivery.failed}</p> : null}
							{delivery.logged ? <p>{delivery.logged}</p> : null}
							{contact.stage === "identity" &&
							kind === "email" &&
							contact.pendingInvitesToCurrentEmail > 0 ? (
								<p className="text-amber-600 dark:text-amber-400">
									{fill(t.authCodes.pendingInvitesWarning, {
										n: contact.pendingInvitesToCurrentEmail,
									})}
								</p>
							) : null}
						</div>
						<div className="grid gap-2">
							<Label htmlFor={codeId}>{t.portalUi.oneTimePassword}</Label>
							<Input
								id={codeId}
								inputMode="numeric"
								autoComplete="one-time-code"
								placeholder="123456"
								value={contact.code}
								onChange={(e) => contact.setCode(e.target.value)}
								className="text-center tabular-nums tracking-[0.35em]"
								aria-invalid={problemText ? true : undefined}
							/>
						</div>
						<InlineError text={problemText} />
						<DialogFooter className="sm:justify-between">
							<Button
								type="button"
								variant="ghost"
								onClick={resend}
								disabled={contact.busy || contact.resendIn > 0}
							>
								{contact.resendIn > 0
									? fill(t.portalUi.resendOtpIn, { seconds: contact.resendIn })
									: t.portalUi.resendOtp}
							</Button>
							{/* No code #2 yet (it failed to go out after code #1 was
							    accepted): nothing to verify — Resend is the way on. */}
							<Button
								type="submit"
								disabled={contact.busy || !contact.canVerify}
							>
								{contact.busy && (
									<Loader2 className="mr-1 h-4 w-4 animate-spin" />
								)}
								{contact.busy
									? t.authCodes.verifying
									: contact.stage === "identity"
										? t.authCodes.continueLabel
										: t.profile.verifyAndSave}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
