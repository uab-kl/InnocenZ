import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, Loader2, Mail, MailCheck } from "lucide-react";
import { useState } from "react";
import { AuthCardShell } from "@/components/landing/AuthCardShell";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { requestPasswordReset } from "@/lib/auth/password-api";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
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
				content: "Request a link to reset your InnocenZ portal password.",
			},
		],
	}),
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * An address SHAPE, not a sentence — deliberately NOT in the dictionary. It
 * reads identically in either language.
 */
const EMAIL_PLACEHOLDER = "you@example.com";

/**
 * Held as a CAUSE, not a sentence.
 *
 * `message` carries what the SERVER said — `password-api` already resolves its
 * own fallbacks through `apiErrorCopy()`, so anything arriving here is either
 * localised upstream or is the backend's own wording. Either way it is passed
 * through untouched: re-translating a message this page did not write would be
 * guessing at its meaning.
 */
type ForgotError = { kind: "invalidEmail" } | { kind: "message"; text: string };

function forgotErrorText(error: ForgotError, t: PortalTranslations): string {
	return error.kind === "invalidEmail" ? t.authPages.emailInvalid : error.text;
}

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

function ForgotPasswordBody() {
	const { t } = usePortalLocale();
	const { email: prefillEmail } = Route.useSearch();
	const [email, setEmail] = useState(prefillEmail ?? "");
	const [error, setError] = useState<ForgotError | null>(null);
	const [sending, setSending] = useState(false);
	/**
	 * Set once the server has accepted the request. It says nothing about
	 * whether an account exists — the endpoint answers the same either way, on
	 * purpose — so the copy below must not promise an email will arrive.
	 */
	const [sentTo, setSentTo] = useState<string | null>(null);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (sending) return;

		const value = email.trim();
		if (!EMAIL_RE.test(value)) {
			setError({ kind: "invalidEmail" });
			return;
		}

		setError(null);
		setSending(true);
		try {
			await requestPasswordReset(value);
			setSentTo(value);
		} catch (err) {
			setError({
				kind: "message",
				text:
					err instanceof Error && err.message
						? err.message
						: t.authPages.resetLinkSendFailed,
			});
		} finally {
			setSending(false);
		}
	};

	if (sentTo) {
		/**
		 * One WHOLE sentence in the dictionary, split at its `{email}` hole so the
		 * address keeps its gold highlight. A pair of prefix/suffix keys would
		 * force English word order on every language; Chinese puts the address
		 * earlier in the sentence, and only a full template can say that.
		 */
		const [beforeEmail, afterEmail] =
			t.authPages.resetLinkSentTo.split("{email}");

		return (
			<AuthCardShell
				heading={t.authPages.checkInboxHeading}
				accent={t.authPages.checkInboxAccent}
				subheading={t.authPages.checkInboxSubheading}
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-royal-gold/30 bg-royal-gold/10">
						<MailCheck className="h-8 w-8 text-royal-gold" strokeWidth={1.75} />
					</span>
					<p className="login-subheading text-foreground/85">
						{beforeEmail}
						<span className="font-semibold text-gold-bright">{sentTo}</span>
						{afterEmail}
					</p>
					<p className="login-support text-muted-foreground">
						{t.authPages.resetLinkExpiryHint}
					</p>
					<Button
						type="button"
						variant="ghost"
						className="login-support text-gold-bright hover:text-gold"
						onClick={() => setSentTo(null)}
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
			footer={
				<p className="login-support mt-8 text-center text-muted-foreground">
					{t.authPages.rememberedIt}{" "}
					<Link
						to="/login"
						className="text-gold-bright underline underline-offset-4 hover:text-gold"
					>
						{t.authPages.backToSignIn}
					</Link>
				</p>
			}
		>
			<form onSubmit={submit} aria-label={t.authPages.forgotFormLabel}>
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
							disabled={sending}
							autoComplete="email"
							className="login-input"
						/>
					</InputGroup>
				</Field>

				{error && (
					<div
						role="alert"
						className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-xl text-destructive"
					>
						<AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
						<span>{forgotErrorText(error, t)}</span>
					</div>
				)}

				<Button
					type="submit"
					className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					disabled={sending}
					aria-busy={sending}
				>
					{sending ? (
						<>
							<Loader2 className="h-6 w-6 animate-spin" />
							{t.authPages.sending}
						</>
					) : (
						t.authPages.sendResetLink
					)}
				</Button>
			</form>
		</AuthCardShell>
	);
}
