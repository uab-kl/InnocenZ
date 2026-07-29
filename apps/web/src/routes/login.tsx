import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import axios from "axios";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { LoginAsideBackdrop } from "@/components/landing/LoginDecor";
import { MaterialIcon } from "@/components/landing/MaterialIcon";
import { Button } from "@/components/ui/button";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/components/ui/field";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { fetchProfile } from "@/lib/auth/use-profile";
import { hardNavigate } from "@/lib/hard-navigate";

const ROLE_DASHBOARD: Record<string, string> = {
	admin: "/admin/dashboard",
	agency: "/agency/dashboard",
	outlet: "/outlet/dashboard",
};

export const Route = createFileRoute("/login")({
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Sign in — InnocenZ" },
			{
				name: "description",
				content: "Sign in to access the InnocenZ portal.",
			},
		],
	}),
});

const formSchema = z.object({
	email: z.string().email("Please enter a valid email address"),
	password: z.string().min(1, "Password is required"),
});

function RouteComponent() {
	const { login } = useAuthActions();
	const [error, setError] = useState("");
	const [showPassword, setShowPassword] = useState(false);

	const form = useForm({
		defaultValues: {
			email: "",
			password: "",
		},
		validators: {
			onChange: formSchema,
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			setError("");

			// Demo account for the ported agency portal (client-side demo data,
			// no backend). Recognized here and routed straight to /agency.
			const {
				isAgencyDemoLogin,
				startAgencyDemoSession,
				isOutletDemoLogin,
				startOutletDemoSession,
				startAgencyRealSession,
				startOutletRealSession,
			} = await import("@/lib/auth/agency-demo-session");
			if (isAgencyDemoLogin(value.email, value.password)) {
				await startAgencyDemoSession(value.email);
				hardNavigate("/agency");
				return;
			}
			if (isOutletDemoLogin(value.email, value.password)) {
				await startOutletDemoSession(value.email);
				hardNavigate("/outlet");
				return;
			}

			try {
				await login({
					email: value.email,
					password: value.password,
				});
				const profile = await fetchProfile();
				const role = profile.roles[0]?.toLowerCase();

				// Real backend accounts land on the same portal pages with no data.
				if (role === "agency") {
					await startAgencyRealSession({
						id: profile.id,
						email: profile.email || value.email,
						displayName: profile.displayName,
					});
					hardNavigate("/agency");
					return;
				}
				if (role === "outlet") {
					await startOutletRealSession({
						id: profile.id,
						email: profile.email || value.email,
						displayName: profile.displayName,
					});
					hardNavigate("/outlet");
					return;
				}

				hardNavigate((role && ROLE_DASHBOARD[role]) || "/no-access");
			} catch (err) {
				if (axios.isAxiosError(err)) {
					if (!err.response) {
						setError("Internal server error.");
						return;
					}

					const message =
						(err.response?.data as { message?: string })?.message ||
						"Invalid email or password. Please try again.";
					setError(message);
				} else if (err instanceof Error) {
					setError(err.message);
				} else {
					setError("An unexpected error occurred. Please try again.");
				}
			}
		},
	});

	return (
		<div className="login-page flex min-h-svh w-full flex-col lg:flex-row">
			<aside className="relative hidden min-h-svh w-full shrink-0 flex-col overflow-hidden border-r border-royal-gold/20 px-10 py-14 lg:flex lg:w-[46%] xl:px-16">
				<LoginAsideBackdrop />

				<div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
					<BrandLogo variant="stacked" size="hero" showTagline showMotto />

					<div className="mt-12 max-w-lg">
						<p className="login-subheading text-foreground/80">
							The workforce operating platform for nightlife industry. Manage
							rosters, track shifts, and run payroll from one secure portal.
						</p>
					</div>
				</div>

				<div className="relative z-10 mt-auto w-full pt-14">
					<p className="login-footer text-center text-foreground/55 sm:text-left">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
						. All rights reserved.
					</p>
				</div>
			</aside>

			<main
				role="main"
				className="relative flex min-h-svh w-full flex-1 flex-col justify-center px-6 py-14 lg:px-14 xl:px-20"
			>
				<a
					href="/"
					className="login-back mb-10 inline-flex w-fit items-center gap-3 font-semibold uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-gold-bright lg:absolute lg:right-12 lg:top-12 lg:mb-0"
				>
					<ArrowLeft className="h-6 w-6" />
					Back to home
				</a>

				<div className="mx-auto w-full max-w-145">
					<div className="mb-10 flex justify-center lg:hidden">
						<BrandLogo variant="stacked" size="hero" showTagline showMotto />
					</div>

					<div className="mb-8">
						<h1 className="login-heading text-foreground">
							<span className="login-heading-line">Sign in to your</span>
							<span className="login-heading-line mt-1">
								<span className="text-gradient-royal drop-shadow-[0_0_20px_color-mix(in_oklab,var(--royal-gold)_35%,transparent)]">
									portal
								</span>
							</span>
						</h1>
						<p className="login-subheading mt-4 text-muted-foreground">
							Enter your credentials to continue.
						</p>
					</div>

					<div className="login-glass-card rounded-2xl border border-royal-gold/25 bg-card/80 p-8 shadow-glow-gold-lg backdrop-blur-md sm:p-10">
						<form
							id="login-form"
							aria-label="Sign in form"
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<FieldGroup className="gap-6">
								<form.Field name="email">
									{(field) => {
										const isInvalid =
											field.state.meta.isDirty && !field.state.meta.isValid;
										const errorId = `${field.name}-error`;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel
													htmlFor={field.name}
													className="login-field-label"
												>
													Email address
												</FieldLabel>
												<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
													<InputGroupAddon align="inline-start">
														<MaterialIcon
															name="mail"
															className="!text-3xl text-royal-gold"
														/>
													</InputGroupAddon>
													<InputGroupInput
														id={field.name}
														name={field.name}
														type="email"
														placeholder="you@example.com"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														disabled={form.state.isSubmitting}
														aria-invalid={isInvalid}
														aria-describedby={isInvalid ? errorId : undefined}
														autoComplete="email"
														autoFocus
														className="login-input"
													/>
												</InputGroup>
												{isInvalid && (
													<FieldError
														id={errorId}
														errors={field.state.meta.errors}
														className="text-lg"
													/>
												)}
											</Field>
										);
									}}
								</form.Field>

								<form.Field name="password">
									{(field) => {
										const isInvalid =
											field.state.meta.isDirty && !field.state.meta.isValid;
										const errorId = `${field.name}-error`;
										return (
											<Field data-invalid={isInvalid}>
												<FieldLabel
													htmlFor={field.name}
													className="login-field-label"
												>
													Password
												</FieldLabel>
												<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
													<InputGroupAddon align="inline-start">
														<MaterialIcon
															name="lock"
															className="text-3xl! text-royal-gold"
														/>
													</InputGroupAddon>
													<InputGroupInput
														id={field.name}
														name={field.name}
														type={showPassword ? "text" : "password"}
														placeholder="Enter your password"
														value={field.state.value}
														onBlur={field.handleBlur}
														onChange={(e) => field.handleChange(e.target.value)}
														disabled={form.state.isSubmitting}
														aria-invalid={isInvalid}
														aria-describedby={isInvalid ? errorId : undefined}
														autoComplete="current-password"
														className="login-input"
													/>
													<InputGroupAddon align="inline-end">
														<InputGroupButton
															type="button"
															onClick={() => setShowPassword(!showPassword)}
															aria-label={
																showPassword ? "Hide password" : "Show password"
															}
															disabled={form.state.isSubmitting}
															variant="ghost"
															size="icon-sm"
														>
															<MaterialIcon
																name={
																	showPassword ? "visibility_off" : "visibility"
																}
																className="text-3xl! text-muted-foreground"
															/>
														</InputGroupButton>
													</InputGroupAddon>
												</InputGroup>
												{isInvalid && (
													<FieldError
														id={errorId}
														errors={field.state.meta.errors}
														className="text-lg"
													/>
												)}
											</Field>
										);
									}}
								</form.Field>
							</FieldGroup>

							{error && (
								<div
									role="alert"
									className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3.5 text-xl text-destructive"
								>
									<AlertCircle className="mt-0.5 h-6 w-6 shrink-0" />
									<span>{error}</span>
								</div>
							)}

							<form.Subscribe
								selector={(state) => [state.isSubmitting, state.canSubmit]}
							>
								{([isSubmitting, canSubmit]) => (
									<Button
										type="submit"
										form="login-form"
										className="login-btn mt-8 w-full bg-[image:var(--gradient-royal)] font-bold text-[#1a1726] shadow-glow-gold hover:opacity-95"
										disabled={isSubmitting || !canSubmit}
										aria-busy={isSubmitting}
									>
										{isSubmitting ? (
											<>
												<Loader2 className="h-6 w-6 animate-spin" />
												Signing in…
											</>
										) : (
											"Sign in"
										)}
									</Button>
								)}
							</form.Subscribe>
						</form>
					</div>

					<p className="login-support mt-8 text-center text-muted-foreground">
						Need an account?{" "}
						<Link
							to="/signup"
							className="text-gold-bright underline underline-offset-4 hover:text-gold"
						>
							Sign up as Outlet or PR Agency
						</Link>
					</p>

					<p className="login-support mt-3 text-center text-muted-foreground">
						Need help?{" "}
						<a
							href="mailto:support@innocenz.com"
							className="text-gold-bright underline underline-offset-4 hover:text-gold"
						>
							Contact support
						</a>
					</p>

					<p className="login-footer mt-10 text-center text-foreground/55 lg:hidden">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
						. All rights reserved.
					</p>
				</div>
			</main>
		</div>
	);
}
