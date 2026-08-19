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

/** Mirrors the backend ResetPasswordSchema minimum. */
const MIN_PASSWORD_LENGTH = 6;

export const Route = createFileRoute("/reset-password")({
	validateSearch: (search: Record<string, unknown>): { token?: string } => {
		const token =
			typeof search.token === "string" ? search.token.trim() : undefined;
		return token ? { token } : {};
	},
	component: ResetPasswordPage,
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
						aria-label={show ? "Hide password" : "Show password"}
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

function ResetPasswordPage() {
	const { token } = Route.useSearch();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [error, setError] = useState("");
	const [saving, setSaving] = useState(false);
	const [done, setDone] = useState(false);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (saving || !token) return;

		if (password.length < MIN_PASSWORD_LENGTH) {
			setError(
				`New password must be at least ${MIN_PASSWORD_LENGTH} characters`,
			);
			return;
		}
		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		setError("");
		setSaving(true);
		try {
			await resetPasswordWithToken({ token, password });
			setDone(true);
		} catch (err) {
			// "Reset link is invalid or has expired." comes back here — the server
			// message is the useful one, so it is shown rather than replaced.
			setError(
				err instanceof Error && err.message
					? err.message
					: "Could not reset your password. Please try again.",
			);
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
				heading="This link is"
				accent="incomplete"
				subheading="The reset link is missing its token."
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10">
						<AlertCircle
							className="h-8 w-8 text-destructive"
							strokeWidth={1.75}
						/>
					</span>
					<p className="login-support text-muted-foreground">
						Open the link straight from the email, or request a new one.
					</p>
					<Link
						to="/forgot-password"
						className="login-btn inline-flex w-full items-center justify-center rounded-md bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					>
						Request a new link
					</Link>
				</div>
			</AuthCardShell>
		);
	}

	if (done) {
		return (
			<AuthCardShell
				heading="Password"
				accent="updated"
				subheading="You can now sign in with your new password."
			>
				<div className="flex flex-col items-center gap-5 text-center">
					<span className="flex h-16 w-16 items-center justify-center rounded-full border border-royal-gold/30 bg-royal-gold/10">
						<CheckCircle2
							className="h-8 w-8 text-royal-gold"
							strokeWidth={1.75}
						/>
					</span>
					<p className="login-support text-muted-foreground">
						The reset link has been used up and will not work again.
					</p>
					<Link
						to="/login"
						className="login-btn inline-flex w-full items-center justify-center rounded-md bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
					>
						Go to sign in
					</Link>
				</div>
			</AuthCardShell>
		);
	}

	return (
		<AuthCardShell
			heading="Choose a new"
			accent="password"
			subheading="Pick something you have not used on this account before."
		>
			<form onSubmit={submit} aria-label="Reset password form">
				<div className="flex flex-col gap-6">
					<PasswordInput
						id="new-password"
						label="New password"
						placeholder="Enter your new password"
						value={password}
						onChange={setPassword}
						disabled={saving}
					/>
					<PasswordInput
						id="confirm-password"
						label="Confirm new password"
						placeholder="Confirm your new password"
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
						<span>{error}</span>
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
							Saving…
						</>
					) : (
						"Save new password"
					)}
				</Button>
			</form>
		</AuthCardShell>
	);
}
