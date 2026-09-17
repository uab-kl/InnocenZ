import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	Eye,
	EyeOff,
	KeyRound,
	Loader2,
	Lock,
	Mail,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AuthCardShell } from "@/components/landing/AuthCardShell";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { AuthFlowError } from "@/lib/auth/auth-flow-client";
import {
	isForgotCodeRefusal,
	localiseAuthMessage,
} from "@/lib/auth/auth-server-copy";
import {
	completeForgotPassword,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	startForgotPassword,
} from "@/lib/auth/password-api";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export const Route = createFileRoute("/forgot-password")({
	validateSearch: (search: Record<string, unknown>): { email?: string } => {
		const email =
			typeof search.email === "string" ? search.email.trim() : undefined;
		return email ? { email } : {};
	},
	component: ForgotPasswordPage,
	/**
	 * ⚠️ English in every locale. `head()` is evaluated OUTSIDE React, so there
	 * is no provider above it and no hook to read the locale from.
	 */
	head: () => ({
		meta: [
			{ title: "Forgot password — InnocenZ" },
			{
				name: "description",
				content:
					"Reset your InnocenZ portal password with a code sent by WhatsApp, SMS and email.",
			},
		],
	}),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_RE = /^\d{6}$/;

/**
 * An address SHAPE, not a sentence — deliberately NOT in the dictionary. It
 * reads identically in either language.
 */
const EMAIL_PLACEHOLDER = "you@example.com";

/**
 * Held as a CAUSE, not a sentence, so the banner re-renders in whatever
 * language is active rather than the one that was active when it failed.
 *
 * `message` carries what the SERVER said. It is passed through the auth
 * localiser at render: every sentence the contract names has a translation,
 * and anything else (a limiter's own wording) is shown as the server wrote it.
 */
type ForgotError =
	| { kind: "invalidEmail" }
	| { kind: "codeRequired" }
	| { kind: "minLength" }
	| { kind: "maxLength" }
	| { kind: "mismatch" }
	/** A wrong, expired or used-up code — deliberately one sentence. */
	| { kind: "codeRejected" }
	| { kind: "message"; text: string };

function forgotErrorText(error: ForgotError, t: PortalTranslations): string {
	switch (error.kind) {
		case "invalidEmail":
			return t.authPages.emailInvalid;
		case "codeRequired":
			return t.authCodes.codeRequired;
		case "minLength":
			return fill(t.authPages.passwordMinLength, { min: PASSWORD_MIN_LENGTH });
		case "maxLength":
			return fill(t.authCodes.passwordMaxLength, { max: PASSWORD_MAX_LENGTH });
		case "mismatch":
			return t.authPages.passwordsDoNotMatch;
		case "codeRejected":
			return t.authCodes.forgotCodeRejected;
		default:
			return localiseAuthMessage(error.text, t);
	}
}

/**
 * WHERE THE PAGE IS.
 *
 * `code` says nothing about whether an account exists. The server answers the
 * start request identically either way — for an unknown address it hands back
 * a random `requestId` that no code will ever match — so the copy on that step
 * must say IF, and nothing on this page may branch on the answer.
 */
type Step =
	| { kind: "email" }
	| { kind: "code"; email: string; requestId: string; expiresInSec: number }
	| { kind: "done"; message: string };

/**
 * `/forgot-password` is a PUBLIC route with no portal shell above it, so it
 * mounts the locale provider itself.
 *
 * ⚠️ Wrapper and body MUST stay separate components: `usePortalLocale` reads
 * context from ABOVE, so the component that mounts the provider cannot consume
 * it. It would quietly get the English fallback instead of throwing. Same split
 * as `components/legal/PrivacyPolicyPage`.
 */
function ForgotPasswordPage() {
	return (
		<PortalLocaleProvider>
			<ForgotPasswordBody />
		</PortalLocaleProvider>
	);
}

function ErrorBanner({ text }: { text: string }) {
	return (
		<div
			role="alert"
			className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-xl text-destructive"
		>
			<AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
			<span>{text}</span>
		</div>
	);
}

/**
 * `label` and `placeholder` arrive ALREADY TRANSLATED. Same control as
 * `/reset-password`'s, so the two ways of choosing a new password look alike.
 */
function NewPasswordInput({
	id,
	label,
	placeholder,
	value,
	onChange,
	disabled,
}: {
	id: string;
	label: string;
	placeholder: string;
	value: string;
	onChange: (next: string) => void;
	disabled: boolean;
}) {
	const { t } = usePortalLocale();
	const [show, setShow] = useState(false);
	return (
		<Field>
			<FieldLabel htmlFor={id} className="login-field-label">
				{label}
			</FieldLabel>
			<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
				<InputGroupAddon align="inline-start">
					<Lock
						className="size-5 text-royal-gold"
						strokeWidth={1.75}
						aria-hidden
					/>
				</InputGroupAddon>
				<InputGroupInput
					id={id}
					name={id}
					type={show ? "text" : "password"}
					placeholder={placeholder}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					disabled={disabled}
					autoComplete="new-password"
					className="login-input"
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						type="button"
						onClick={() => setShow((v) => !v)}
						aria-label={show ? t.webUi.hidePassword : t.webUi.showPassword}
						disabled={disabled}
						variant="ghost"
						size="icon-sm"
					>
						{show ? (
							<EyeOff
								className="size-5 text-muted-foreground"
								strokeWidth={1.75}
								aria-hidden
							/>
						) : (
							<Eye
								className="size-5 text-muted-foreground"
								strokeWidth={1.75}
								aria-hidden
							/>
						)}
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</Field>
	);
}

function ForgotPasswordBody() {
	const { t } = usePortalLocale();
	const { email: prefillEmail } = Route.useSearch();
	const [email, setEmail] = useState(prefillEmail ?? "");
	const [step, setStep] = useState<Step>({ kind: "email" });
	const [error, setError] = useState<ForgotError | null>(null);
	const [busy, setBusy] = useState(false);
	const [code, setCode] = useState("");
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	/** Seconds until Resend is offered — the server's own `resendAfterSec`. */
	const [resendIn, setResendIn] = useState(0);
	/** A quiet receipt after Resend, so the button does not look like it did nothing. */
	const [resent, setResent] = useState(false);

	useEffect(() => {
		if (resendIn <= 0) return;
		const id = setTimeout(() => setResendIn((n) => n - 1), 1000);
		return () => clearTimeout(id);
	}, [resendIn]);

	/** One reading of any failure: the server's sentence, and its cooldown. */
	const fail = (err: unknown) => {
		if (err instanceof AuthFlowError && err.retryAfterSec) {
			setResendIn(err.retryAfterSec);
		}
		setError({
			kind: "message",
			text:
				err instanceof Error && err.message
					? err.message
					: t.authCodes.codeSendFailed,
		});
	};

	const requestCode = async (value: string): Promise<boolean> => {
		setBusy(true);
		setError(null);
		try {
			const started = await startForgotPassword(value);
			setStep({
				kind: "code",
				email: value,
				requestId: started.requestId,
				expiresInSec: started.expiresInSec,
			});
			setResendIn(started.resendAfterSec);
			setCode("");
			return true;
		} catch (err) {
			fail(err);
			return false;
		} finally {
			setBusy(false);
		}
	};

	const submitEmail = async (e: React.FormEvent) => {
		e.preventDefault();
		if (busy) return;
		const value = email.trim();
		if (!EMAIL_RE.test(value)) {
			setError({ kind: "invalidEmail" });
			return;
		}
		setResent(false);
		await requestCode(value);
	};

	const resend = async () => {
		if (busy || resendIn > 0 || step.kind !== "code") return;
		setResent(false);
		if (await requestCode(step.email)) setResent(true);
	};

	const submitCode = async (e: React.FormEvent) => {
		e.preventDefault();
		if (busy || step.kind !== "code") return;
		if (!CODE_RE.test(code)) {
			setError({ kind: "codeRequired" });
			return;
		}
		if (password.length < PASSWORD_MIN_LENGTH) {
			setError({ kind: "minLength" });
			return;
		}
		if (password.length > PASSWORD_MAX_LENGTH) {
			setError({ kind: "maxLength" });
			return;
		}
		if (password !== confirmPassword) {
			setError({ kind: "mismatch" });
			return;
		}
		setBusy(true);
		setError(null);
		try {
			const message = await completeForgotPassword({
				requestId: step.requestId,
				code,
				password,
			});
			setPassword("");
			setConfirmPassword("");
			setCode("");
			setStep({ kind: "done", message });
		} catch (err) {
			// "Invalid code" stays on this step so the code can be retyped; the
			// server allows five tries before the code dies.
			fail(err);
			/*
			 * ⚠️ ONE SENTENCE for a wrong, an expired and a used-up code. The
			 * server answers an address with no account with a random requestId
			 * that "has expired", and a real account's wrong code with "Invalid
			 * code" — shown apart, this page told anyone which addresses have
			 * accounts. See `isForgotCodeRefusal`.
			 */
			if (err instanceof Error && isForgotCodeRefusal(err.message)) {
				setError({ kind: "codeRejected" });
			}
		} finally {
			setBusy(false);
		}
	};

	if (step.kind === "done") {
		return (
			<AuthCardShell
				heading={t.authPages.passwordUpdatedHeading}
				accent={t.authPages.passwordUpdatedAccent}
				subheading={t.authPages.passwordUpdatedSubheading}
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-royal-gold/30 bg-royal-gold/10">
						<CheckCircle2
							className="h-8 w-8 text-royal-gold"
							strokeWidth={1.75}
						/>
					</span>
					<p className="login-subheading text-foreground/85">
						{localiseAuthMessage(step.message, t)}
					</p>
					<p className="login-support text-muted-foreground">
						{t.authPages.codeUsedUp}
					</p>
					<Link
						to="/login"
						className="login-btn inline-flex w-full items-center justify-center rounded-md bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					>
						{t.authPages.goToSignIn}
					</Link>
				</div>
			</AuthCardShell>
		);
	}

	const footer = (
		<p className="login-support mt-8 text-center text-muted-foreground">
			{t.authPages.rememberedIt}{" "}
			<Link
				to="/login"
				className="text-gold-bright underline underline-offset-4 hover:text-gold"
			>
				{t.authPages.backToSignIn}
			</Link>
		</p>
	);

	if (step.kind === "code") {
		/**
		 * One WHOLE sentence in the dictionary, split at its `{email}` hole so the
		 * address keeps its gold highlight. It only repeats what the person typed,
		 * so it tells them nothing about whether that address has an account.
		 */
		const [beforeEmail, afterEmail] =
			t.authPages.codeRequestedFor.split("{email}");
		const minutes = Math.max(1, Math.round(step.expiresInSec / 60));

		return (
			<AuthCardShell
				heading={t.authPages.codeStepHeading}
				accent={t.authPages.codeStepAccent}
				subheading={t.authPages.codeStepSubheading}
				footer={footer}
			>
				<p className="login-support mb-6 text-center text-foreground/85">
					{beforeEmail}
					<span className="font-semibold text-gold-bright">{step.email}</span>
					{afterEmail}
				</p>
				<form onSubmit={submitCode} aria-label={t.authPages.codeFormLabel}>
					<div className="flex flex-col gap-6">
						<Field>
							<FieldLabel htmlFor="forgot-code" className="login-field-label">
								{t.authPages.codeLabel}
							</FieldLabel>
							<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
								<InputGroupAddon align="inline-start">
									<KeyRound
										className="size-5 text-royal-gold"
										strokeWidth={1.75}
										aria-hidden
									/>
								</InputGroupAddon>
								<InputGroupInput
									id="forgot-code"
									name="code"
									inputMode="numeric"
									autoComplete="one-time-code"
									placeholder="123456"
									value={code}
									onChange={(e) =>
										setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
									}
									disabled={busy}
									className="login-input tabular-nums tracking-[0.3em]"
								/>
							</InputGroup>
						</Field>
						<NewPasswordInput
							id="new-password"
							label={t.profile.newPassword}
							placeholder={t.profile.enterNewPassword}
							value={password}
							onChange={setPassword}
							disabled={busy}
						/>
						<NewPasswordInput
							id="confirm-password"
							label={t.profile.confirmNewPassword}
							placeholder={t.profile.confirmYourNewPassword}
							value={confirmPassword}
							onChange={setConfirmPassword}
							disabled={busy}
						/>
					</div>

					{error && <ErrorBanner text={forgotErrorText(error, t)} />}
					{resent && !error ? (
						<output className="login-support mt-5 block text-center text-muted-foreground">
							{t.authCodes.codeResent}
						</output>
					) : null}

					<Button
						type="submit"
						className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
						disabled={busy}
						aria-busy={busy}
					>
						{busy ? (
							<>
								<Loader2 className="h-6 w-6 animate-spin" />
								{t.common.saving}
							</>
						) : (
							t.authPages.updatePassword
						)}
					</Button>
				</form>

				<div className="mt-6 flex flex-col items-center gap-3 text-center">
					<p className="login-support text-muted-foreground">
						{fill(t.authPages.codeExpiryHint, { minutes })}
					</p>
					<Button
						type="button"
						variant="ghost"
						className="login-support text-gold-bright hover:text-gold"
						disabled={busy || resendIn > 0}
						onClick={resend}
					>
						{resendIn > 0
							? fill(t.portalUi.resendOtpIn, { seconds: resendIn })
							: t.authPages.resendCode}
					</Button>
					<Button
						type="button"
						variant="ghost"
						className="login-support text-muted-foreground hover:text-gold"
						disabled={busy}
						onClick={() => {
							setStep({ kind: "email" });
							setError(null);
							setResent(false);
							setCode("");
						}}
					>
						{t.authPages.useDifferentEmail}
					</Button>
				</div>
			</AuthCardShell>
		);
	}

	return (
		<AuthCardShell
			heading={t.authPages.forgotHeading}
			accent={t.authPages.forgotHeadingAccent}
			subheading={t.authPages.forgotSubheading}
			footer={footer}
		>
			<form onSubmit={submitEmail} aria-label={t.authPages.forgotFormLabel}>
				<Field>
					<FieldLabel htmlFor="forgot-email" className="login-field-label">
						{t.authPages.emailLabel}
					</FieldLabel>
					<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
						<InputGroupAddon align="inline-start">
							<Mail
								className="size-5 text-royal-gold"
								strokeWidth={1.75}
								aria-hidden
							/>
						</InputGroupAddon>
						<InputGroupInput
							id="forgot-email"
							name="email"
							type="email"
							placeholder={EMAIL_PLACEHOLDER}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={busy}
							autoComplete="email"
							className="login-input"
						/>
					</InputGroup>
				</Field>

				{error && <ErrorBanner text={forgotErrorText(error, t)} />}

				<Button
					type="submit"
					className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					disabled={busy}
					aria-busy={busy}
				>
					{busy ? (
						<>
							<Loader2 className="h-6 w-6 animate-spin" />
							{t.authPages.sending}
						</>
					) : (
						t.authPages.sendCode
					)}
				</Button>
			</form>
		</AuthCardShell>
	);
}
