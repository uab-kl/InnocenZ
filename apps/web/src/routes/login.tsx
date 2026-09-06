import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link } from "@tanstack/react-router";
import axios from "axios";
import {
	AlertCircle,
	ArrowLeft,
	Eye,
	EyeOff,
	Loader2,
	Lock,
	Mail,
} from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { LoginAmbience } from "@/components/landing/LoginDecor";
import { PortalLanguageSwitcher } from "@/components/portal-language-switcher";
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
import { pickHomePortal } from "@/lib/auth/pick-home-portal";
import { useAuthActions } from "@/lib/auth/use-auth-actions";
import { fetchProfile } from "@/lib/auth/use-profile";
import { hardNavigate } from "@/lib/hard-navigate";
import {
	PortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

const ROLE_DASHBOARD: Record<string, string> = {
	admin: "/admin/dashboard",
	agency: "/agency",
	outlet: "/outlet",
};

/**
 * An address SHAPE, not a sentence — deliberately NOT in the dictionary. It
 * reads identically in either language, and a translated example address would
 * be a second answer to "what does an email look like".
 */
const EMAIL_PLACEHOLDER = "you@example.com";

/**
 * Auth failures, held as a CAUSE rather than a sentence.
 *
 * The old code called `setError("Invalid email or password…")` inside the
 * submit handler — a place that cannot read the dictionary safely and, more to
 * the point, freezes the language at the moment of the failure. Storing the
 * cause and resolving it in `loginErrorText` during render means the banner
 * follows the switcher like everything else on the page.
 */
type LoginError =
	| { kind: "network" }
	| { kind: "credentials" }
	| { kind: "unexpected" }
	| { kind: "server"; message: string };

/**
 * Backend auth messages mapped to dictionary keys at the RENDER site.
 *
 * The record KEY is the English sentence the server actually sends. It is wire
 * data, matched verbatim, and must never be translated — translating it here
 * would mean this map stopped matching the day the backend stayed the same.
 *
 * Only the STATIC messages are listed. The lockout countdown ("Try again in 3
 * minutes") and a suspended-organisation reason are composed server-side and
 * fall through to the server's own text, because a half-guessed translation of
 * a sentence carrying a number is worse than an English one that is correct.
 */
const SERVER_MESSAGE_LABELS: Record<string, (t: PortalTranslations) => string> =
	{
		"This account is not registered yet.": (t) =>
			t.authPages.errorAccountNotRegistered,
		"This account is inactive.": (t) => t.authPages.errorAccountInactive,
		"Wrong password": (t) => t.authPages.errorWrongPassword,
	};

function loginErrorText(error: LoginError, t: PortalTranslations): string {
	switch (error.kind) {
		case "network":
			return t.authPages.errorNetwork;
		case "credentials":
			return t.authPages.errorInvalidCredentials;
		case "unexpected":
			return t.authPages.errorUnexpected;
		default:
			return SERVER_MESSAGE_LABELS[error.message]?.(t) ?? error.message;
	}
}

export const Route = createFileRoute("/login")({
	validateSearch: (
		search: Record<string, unknown>,
	): {
		email?: string;
		next?: string;
	} => {
		const email =
			typeof search.email === "string" ? search.email.trim() : undefined;
		const nextRaw =
			typeof search.next === "string" ? search.next.trim() : undefined;
		/**
		 * ANY same-origin app path, not just the two portal roots.
		 *
		 * This used to accept literally "/agency" or "/outlet" and discard
		 * everything else, so a deep link — `/admin/dashboard` above all — was
		 * thrown away and the visitor landed on their default portal home. Copying
		 * an admin URL into another browser therefore opened the AGENCY console,
		 * which reads as the account's role changing by itself.
		 *
		 * Still refused: anything not starting with a single "/". A "//evil.com" or
		 * a full URL here would be an open redirect carrying a fresh session.
		 */
		const next =
			nextRaw?.startsWith("/") &&
			!nextRaw.startsWith("//") &&
			!nextRaw.startsWith("/login")
				? nextRaw
				: undefined;
		return {
			...(email ? { email } : {}),
			...(next ? { next } : {}),
		};
	},
	component: RouteComponent,
	/**
	 * ⚠️ English in every locale, deliberately. `head()` runs OUTSIDE React —
	 * there is no component around it and therefore no hook to read the locale
	 * from. The document title is the one string on this page the switcher
	 * cannot reach.
	 */
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

/**
 * `/login` is a PUBLIC route with no portal shell above it, so it carries the
 * locale provider itself.
 *
 * ⚠️ The provider MUST sit in a component of its own. `usePortalLocale` reads
 * from ABOVE via context, so a component that mounts the provider cannot also
 * consume it — it would silently get the English fallback and never switch.
 * Same wrapper/inner split as `components/legal/PrivacyPolicyPage`.
 *
 * No `accountLocale` is passed: nobody is signed in yet, so there is no profile
 * to read a preference from. The provider falls back to the stored pick, then
 * the browser's language.
 */
function RouteComponent() {
	return (
		<PortalLocaleProvider>
			<LoginPage />
		</PortalLocaleProvider>
	);
}

function LoginPage() {
	const { t } = usePortalLocale();
	const { login } = useAuthActions();
	const { email: prefillEmail, next: requestedNext } = Route.useSearch();
	const [error, setError] = useState<LoginError | null>(null);
	const [showPassword, setShowPassword] = useState(false);

	// Built inside the component so the validation messages come from the
	// dictionary. A module-scope schema cannot read `t` at all, and the two
	// sentences below are rendered under the fields like any other copy.
	const formSchema = useMemo(
		() =>
			z.object({
				email: z.string().email(t.authPages.emailInvalid),
				password: z.string().min(1, t.authPages.passwordRequired),
			}),
		[t],
	);

	const form = useForm({
		defaultValues: {
			email: prefillEmail ?? "",
			password: "",
		},
		validators: {
			onChange: formSchema,
			onSubmit: formSchema,
		},
		onSubmit: async ({ value }) => {
			setError(null);

			const { startAgencyRealSession, startOutletRealSession } = await import(
				"@/lib/auth/agency-demo-session"
			);

			// Demo accounts for the ported portals (client-side demo data, no
			// backend). DEV-ONLY: `import.meta.env.DEV` is replaced with the literal
			// `false` at build time, so this whole branch — and the dynamic import
			// of the demo starters with it — is dropped from a production bundle.
			//
			// ⚠️ The recorded gate said the credential was `owner@atlas-agency.my` +
			// `password`. It is NOT: `isAgencyDemoLogin` requires
			// `demo@atlas-agency.invalid` exactly, and `.invalid` is a reserved TLD
			// that can never be a real address. The real owner email falls straight
			// through to the backend, which rejects the wrong password.
			//
			// It plants a placeholder JWT (`alg: "none"`, signature literally
			// "demo") purely so the route guard passes. The backend verifies
			// signatures, so that token can never read real data — the blast radius
			// was always a demo shell, not real records. Gated anyway, because a
			// login that accepts a known password for a known address should not
			// exist in a build a client can reach.
			if (import.meta.env.DEV) {
				const {
					isAgencyDemoLogin,
					startAgencyDemoSession,
					isOutletDemoLogin,
					startOutletDemoSession,
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
			}

			try {
				await login({
					email: value.email,
					password: value.password,
				});
				const profile = await fetchProfile();
				const home = pickHomePortal(profile.portals, profile.roles);

				/**
				 * Where the visitor was actually heading before being asked to sign
				 * in, honoured only when this account holds that portal.
				 *
				 * The portal test is what keeps this from being a privilege change:
				 * an agency user who opens an `/admin` link still lands on `/agency`,
				 * exactly as before. What changes is that an ADMIN opening that same
				 * link now arrives at the admin page they asked for, instead of being
				 * dropped on a portal home that looks like the wrong role.
				 */
				const portalOfNext = requestedNext?.startsWith("/admin")
					? "admin"
					: requestedNext?.startsWith("/agency")
						? "agency"
						: requestedNext?.startsWith("/outlet")
							? "outlet"
							: null;
				const nextAllowed =
					requestedNext && portalOfNext !== null && home === portalOfNext
						? requestedNext
						: null;

				if (home === "agency") {
					await startAgencyRealSession({
						id: profile.id,
						email: profile.email || value.email,
						displayName: profile.displayName,
						username: profile.username,
					});
					const { getAgencyIdentity } = await import(
						"@agency-portal/lib/agency-identity"
					);
					const { AGENCY_PENDING_PROFILE_PATH } = await import(
						"@agency-portal/lib/agency-rbac"
					);
					const { isOrgProfileOnly } = await import(
						"@/components/organization/org-status"
					);
					const identity = getAgencyIdentity();
					hardNavigate(
						isOrgProfileOnly(identity?.agencyStatus)
							? AGENCY_PENDING_PROFILE_PATH
							: (nextAllowed ?? "/agency"),
					);
					return;
				}
				if (home === "outlet") {
					await startOutletRealSession({
						id: profile.id,
						email: profile.email || value.email,
						displayName: profile.displayName,
						username: profile.username,
					});
					const { getOutletIdentity } = await import(
						"@agency-portal/lib/outlet-identity"
					);
					const { OUTLET_PENDING_PROFILE_PATH } = await import(
						"@agency-portal/lib/outlet-rbac"
					);
					const { isOrgProfileOnly } = await import(
						"@/components/organization/org-status"
					);
					const identity = getOutletIdentity();
					hardNavigate(
						isOrgProfileOnly(identity?.outletStatus)
							? OUTLET_PENDING_PROFILE_PATH
							: (nextAllowed ?? "/outlet"),
					);
					return;
				}
				if (home === "admin") {
					// The admin deep link the visitor opened, when they hold admin.
					hardNavigate(nextAllowed ?? "/admin/dashboard");
					return;
				}

				const role = profile.roles[0]?.toLowerCase() ?? "";
				hardNavigate((role && ROLE_DASHBOARD[role]) || "/no-access");
			} catch (err) {
				if (axios.isAxiosError(err)) {
					if (!err.response) {
						setError({ kind: "network" });
						return;
					}

					const message = (err.response?.data as { message?: string })?.message;
					setError(
						message ? { kind: "server", message } : { kind: "credentials" },
					);
				} else if (err instanceof Error && err.message) {
					setError({ kind: "server", message: err.message });
				} else {
					setError({ kind: "unexpected" });
				}
			}
		},
	});

	return (
		<div className="login-page relative flex min-h-svh w-full flex-col overflow-hidden lg:flex-row">
			{/*
			 * Page-wide moving backdrop. `relative` on this wrapper is what gives
			 * it a containing block; `overflow-hidden` stops the drifting pools
			 * widening the document. Both are layout-neutral on a flex container.
			 */}
			<LoginAmbience />

			{/*
			 * LoginAsideBackdrop is deliberately NOT rendered here any more.
			 * Its three static gradient layers sat on top of the page-wide
			 * animated field — two lighting rigs pointed at one wall, which is
			 * what made this column read as mud. The ambience's champagne pool
			 * now lights the lower band on its own.
			 * ⚠️ The component itself stays exported: routes/signup.tsx:56
			 * still renders it.
			 */}
			<aside className="relative z-10 hidden min-h-svh w-full shrink-0 flex-col overflow-hidden border-r border-royal-gold/20 px-10 pb-10 pt-[9vh] lg:flex lg:w-[46%] xl:px-16">
				{/*
				 * Anchored to the top, not centred.
				 *
				 * `flex-1 justify-center` split the column's slack into TWO
				 * gaps — one above the crest, one below the paragraph — which
				 * is the "void" on this half. Starting the stack at a fixed
				 * datum and keeping the footer on `mt-auto` collects all of
				 * that air into ONE band at the bottom, where the champagne
				 * pool actually falls, so it reads as a lit wall rather than
				 * as two holes.
				 */}
				<div className="relative z-10 flex flex-col items-center text-center">
					<BrandLogo variant="stacked" size="auth" showTagline showMotto />

					<div className="mt-8 max-w-xl">
						<p className="login-aside-lede text-foreground/80">
							{t.authPages.loginAsideDescription}
						</p>
					</div>
				</div>

				{/* The band's bottom edge — gives the air a boundary to end on. */}
				<div className="relative z-10 mt-auto w-full border-t border-royal-gold/10 pt-8">
					<p className="login-footer text-center text-foreground/55 sm:text-left">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
						. {t.authPages.rightsReserved}
						{" · "}
						<a
							href="/policy"
							className="text-foreground/70 underline-offset-4 hover:text-gold-bright hover:underline"
						>
							{t.webShell.privacyPolicyTitle}
						</a>
					</p>
				</div>
			</aside>

			<main className="relative z-10 flex min-h-svh w-full flex-1 flex-col justify-center px-6 py-14 lg:px-14 xl:px-20">
				{/*
				 * The switcher rides WITH the back link instead of claiming its own
				 * corner. This page sits outside every portal shell, so it is the only
				 * place a first-time visitor can choose a language — before they have
				 * an account for the preference to be remembered on.
				 */}
				<div className="mb-8 flex w-fit flex-wrap items-center gap-3 lg:absolute lg:right-12 lg:top-12 lg:mb-0">
					<PortalLanguageSwitcher variant="header" />
					<a
						href="/"
						className="login-back inline-flex w-fit items-center gap-2 font-semibold uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-gold-bright"
					>
						<ArrowLeft className="h-4 w-4" />
						{t.webShell.backToHome}
					</a>
				</div>

				<div className="mx-auto w-full max-w-120">
					<div className="mb-6 flex justify-center lg:hidden">
						<BrandLogo variant="stacked" size="md" showTagline showMotto />
					</div>

					<div className="mb-6">
						<h1 className="login-heading text-foreground">
							<span className="login-heading-line">
								{t.authPages.loginHeadingLine1}
							</span>
							<span className="login-heading-line mt-1">
								<span className="text-gradient-royal drop-shadow-[0_0_20px_color-mix(in_oklab,var(--royal-gold)_35%,transparent)]">
									{t.authPages.loginHeadingAccent}
								</span>
							</span>
						</h1>
						<p className="login-subheading mt-2 text-muted-foreground">
							{t.authPages.loginSubheading}
						</p>
					</div>

					<div className="login-glass-card rounded-2xl border border-royal-gold/25 bg-card/80 p-7 shadow-glow-gold-lg backdrop-blur-md sm:p-9">
						<form
							id="login-form"
							aria-label={t.authPages.loginFormLabel}
							onSubmit={(e) => {
								e.preventDefault();
								form.handleSubmit();
							}}
						>
							<FieldGroup className="gap-5">
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
														id={field.name}
														name={field.name}
														type="email"
														placeholder={EMAIL_PLACEHOLDER}
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
												<div className="flex flex-wrap items-baseline justify-between gap-x-4">
													<FieldLabel
														htmlFor={field.name}
														className="login-field-label"
													>
														{t.authPages.passwordLabel}
													</FieldLabel>
													{/* Carries whatever is already typed in the email
													    field so the reset page starts prefilled. */}
													<Link
														to="/forgot-password"
														search={() => {
															const typed = form.state.values.email.trim();
															return typed ? { email: typed } : {};
														}}
														className="login-support text-gold-bright underline underline-offset-4 hover:text-gold"
													>
														{t.authPages.forgotPasswordLink}
													</Link>
												</div>
												<InputGroup className="login-input-group h-auto border-royal-gold/20 bg-background/60">
													<InputGroupAddon align="inline-start">
														<Lock
															className="size-5 text-royal-gold"
															strokeWidth={1.75}
															aria-hidden
														/>
													</InputGroupAddon>
													<InputGroupInput
														id={field.name}
														name={field.name}
														type={showPassword ? "text" : "password"}
														placeholder={t.authPages.passwordPlaceholder}
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
																showPassword
																	? t.webUi.hidePassword
																	: t.webUi.showPassword
															}
															disabled={form.state.isSubmitting}
															variant="ghost"
															size="icon-sm"
														>
															{showPassword ? (
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
									<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
									<span>{loginErrorText(error, t)}</span>
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
												<Loader2 className="h-4 w-4 animate-spin" />
												{t.authPages.signingIn}
											</>
										) : (
											t.authPages.signIn
										)}
									</Button>
								)}
							</form.Subscribe>
						</form>
					</div>

					<p className="login-support mt-8 text-center text-muted-foreground">
						{t.authPages.needAccount}{" "}
						<Link
							to="/signup"
							className="text-gold-bright underline underline-offset-4 hover:text-gold"
						>
							{t.authPages.signUpCta}
						</Link>
					</p>

					<p className="login-support mt-3 text-center text-muted-foreground">
						{t.authPages.needHelp}{" "}
						<a
							href="mailto:support@innocenz.com"
							className="text-gold-bright underline underline-offset-4 hover:text-gold"
						>
							{t.authPages.contactSupport}
						</a>
					</p>

					<p className="login-footer mt-10 text-center text-foreground/55 lg:hidden">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
						. {t.authPages.rightsReserved}
						{" · "}
						<a
							href="/policy"
							className="text-foreground/70 underline-offset-4 hover:text-gold-bright hover:underline"
						>
							{t.webShell.privacyPolicyTitle}
						</a>
					</p>
				</div>
			</main>
		</div>
	);
}
