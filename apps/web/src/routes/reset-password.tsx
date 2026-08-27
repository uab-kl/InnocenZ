import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	Eye,
	EyeOff,
	Loader2,
	Lock,
} from "lucide-react";
import { useState } from "react";
import { AuthCardShell } from "@/components/landing/AuthCardShell";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { resetPasswordWithToken } from "@/lib/auth/password-api";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/** Mirrors the backend ResetPasswordSchema minimum. */
const MIN_PASSWORD_LENGTH = 6;

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>): { token?: string } => {
		const token =
			typeof search.token === "string" ? search.token.trim() : undefined;
		return token ? { token } : {};
	},
	component: ResetPasswordPage,
	/**
	 * ⚠️ English in every locale. `head()` is evaluated OUTSIDE React, so there
	 * is no provider above it and no hook to read the locale from.
	 */
	head: () => ({
		meta: [
			{ title: "Reset password — InnocenZ" },
			{
				name: "description",
				content: "Choose a new password for your InnocenZ portal account.",
			},
		],
	}),
});

/**
 * Held as a CAUSE, not a sentence, so the banner re-renders in whatever
 * language is active rather than in the one that was active when it failed.
 *
 * `message` carries the SERVER's own wording — "Reset link is invalid or has
 * expired." is the useful half of that response and is shown untouched.
 * `password-api` already resolves its English fallbacks through
 * `apiErrorCopy()`, so nothing untranslated leaks through this branch.
 */
type ResetError =
	| { kind: "minLength" }
	| { kind: "mismatch" }
	| { kind: "message"; text: string };

function resetErrorText(error: ResetError, t: PortalTranslations): string {
	switch (error.kind) {
		case "minLength":
			return fill(t.authPages.passwordMinLength, { min: MIN_PASSWORD_LENGTH });
		case "mismatch":
			return t.authPages.passwordsDoNotMatch;
		default:
			return error.text;
	}
}

/**
 * `label` and `placeholder` arrive ALREADY TRANSLATED from the caller — they
 * are this component's copy, not its concern. The eye toggle's aria-label is
 * read straight from the dictionary here because it belongs to the control
 * itself and no caller should have to supply it.
 */
function PasswordInput({
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

/**
 * `/reset-password` is a PUBLIC route opened straight from an email, with no
 * portal shell above it, so it mounts the locale provider itself.
 *
 * ⚠️ Wrapper and body MUST stay separate components: `usePortalLocale` reads
 * context from ABOVE, so the component that mounts the provider cannot consume
 * it — it would silently get the English fallback rather than throwing. Same
 * split as `components/legal/PrivacyPolicyPage`.
 */
function ResetPasswordPage() {
	return (
		<PortalLocaleProvider>
			<ResetPasswordBody />
		</PortalLocaleProvider>
	);
}

function ResetPasswordBody() {
	const { t } = usePortalLocale();
	const { token } = Route.useSearch();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState<ResetError | null>(null);
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (saving || !token) return;

		if (password.length < MIN_PASSWORD_LENGTH) {
			setError({ kind: "minLength" });
			return;
		}
		if (password !== confirmPassword) {
			setError({ kind: "mismatch" });
			return;
		}

		setError(null);
		setSaving(true);
		try {
			await resetPasswordWithToken({ token, password });
			setDone(true);
		} catch (err) {
			// "Reset link is invalid or has expired." comes back here — the server
			// message is the useful one, so it is shown rather than replaced.
			setError({
				kind: "message",
				text:
					err instanceof Error && err.message
						? err.message
						: t.authPages.resetFailed,
			});
		} finally {
			setSaving(false);
		}
	};

	// A link that arrived without its token cannot be recovered by retrying —
	// send the person back to ask for a fresh one instead of showing a form
	// whose submit could never succeed.
	if (!token) {
		return (
			<AuthCardShell
				heading={t.authPages.linkIncompleteHeading}
				accent={t.authPages.linkIncompleteAccent}
				subheading={t.authPages.linkIncompleteSubheading}
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
						<AlertCircle
							className="h-8 w-8 text-destructive"
							strokeWidth={1.75}
						/>
					</span>
					<p className="login-support text-muted-foreground">
						{t.authPages.linkIncompleteHint}
					</p>
					<Link
						to="/forgot-password"
						className="login-btn inline-flex w-full items-center justify-center rounded-md bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					>
						{t.authPages.requestNewLink}
					</Link>
				</div>
			</AuthCardShell>
		);
	}

	if (done) {
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
					<p className="login-support text-muted-foreground">
						{t.authPages.resetLinkUsedUp}
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

	return (
		<AuthCardShell
			heading={t.authPages.resetHeading}
			accent={t.authPages.resetHeadingAccent}
			subheading={t.authPages.resetSubheading}
		>
			<form onSubmit={submit} aria-label={t.authPages.resetFormLabel}>
				<div className="flex flex-col gap-6">
					<PasswordInput
						id="new-password"
						label={t.profile.newPassword}
						placeholder={t.profile.enterNewPassword}
						value={password}
						onChange={setPassword}
						disabled={saving}
					/>
					<PasswordInput
						id="confirm-password"
						label={t.profile.confirmNewPassword}
						placeholder={t.profile.confirmYourNewPassword}
						value={confirmPassword}
						onChange={setConfirmPassword}
						disabled={saving}
					/>
				</div>

				{error && (
					<div
						role="alert"
						className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-xl text-destructive"
					>
						<AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
						<span>{resetErrorText(error, t)}</span>
					</div>
				)}

				<Button
					type="submit"
					className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					disabled={saving}
					aria-busy={saving}
				>
					{saving ? (
						<>
							<Loader2 className="h-6 w-6 animate-spin" />
							{t.common.saving}
						</>
					) : (
						t.authPages.saveNewPassword
					)}
				</Button>
			</form>
		</AuthCardShell>
	);
}
