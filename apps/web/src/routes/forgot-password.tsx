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

export const Route = createFileRoute("/forgot-password")({
	validateSearch: (search: Record<string, unknown>): { email?: string } => {
		const email =
			typeof search.email === "string" ? search.email.trim() : undefined;
		return email ? { email } : {};
	},
	component: ForgotPasswordPage,
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

function ForgotPasswordPage() {
	const { email: prefillEmail } = Route.useSearch();
	const [email, setEmail] = useState(prefillEmail ?? "");
	const [error, setError] = useState("");
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
			setError("Please enter a valid email address");
			return;
		}

		setError("");
		setSending(true);
		try {
			await requestPasswordReset(value);
			setSentTo(value);
		} catch (err) {
			setError(
				err instanceof Error && err.message
					? err.message
					: "Could not send the reset link. Please try again.",
			);
		} finally {
			setSending(false);
		}
	};

	if (sentTo) {
		return (
			<AuthCardShell
				heading="Check your"
				accent="inbox"
				subheading="If that email is registered, a reset link is on its way."
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-royal-gold/30 bg-royal-gold/10">
						<MailCheck className="h-8 w-8 text-royal-gold" strokeWidth={1.75} />
					</span>
					<p className="login-subheading text-foreground/85">
						We sent a password reset link to{" "}
						<span className="font-semibold text-gold-bright">{sentTo}</span>.
					</p>
					<p className="login-support text-muted-foreground">
						The link expires in 1 hour. If it does not arrive, check your spam
						folder — or make sure that address has an InnocenZ account.
					</p>
					<Button
						type="button"
						variant="ghost"
						className="login-support text-gold-bright hover:text-gold"
						onClick={() => setSentTo(null)}
					>
						Use a different email
					</Button>
				</div>
			</AuthCardShell>
		);
	}

	return (
		<AuthCardShell
			heading="Forgot your"
			accent="password?"
			subheading="Enter the email on your account and we'll send you a reset link."
			footer={
				<p className="login-support mt-8 text-center text-muted-foreground">
					Remembered it?{" "}
					<Link
						to="/login"
						className="text-gold-bright underline underline-offset-4 hover:text-gold"
					>
						Back to sign in
					</Link>
				</p>
			}
		>
			<form onSubmit={submit} aria-label="Forgot password form">
				<Field>
					<FieldLabel htmlFor="forgot-email" className="login-field-label">
						Email address
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
							placeholder="you@example.com"
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
						<span>{error}</span>
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
							Sending…
						</>
					) : (
						"Send reset link"
					)}
				</Button>
			</form>
		</AuthCardShell>
	);
}
