import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SignupForm } from "@/components/auth/signup-form";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { HandoffLanguageSwitcher } from "@/components/landing/handoff/HandoffLanguageSwitcher";
import { LoginAmbience } from "@/components/landing/LoginDecor";
import { LandingLocaleProvider, useLandingLocale } from "@/lib/landing-i18n";

/**
 * ⚠️ This page is ALREADY localised — through `@/lib/landing-i18n`, not the
 * portal dictionary. Every visible string below comes from `t.signup`, and
 * `SignupForm` reads the same provider, so it must NOT be ported to
 * `portal-i18n`: that would strip a complete, reviewed translation of the whole
 * sign-up wizard and split one form across two dictionaries.
 *
 * The two systems keep separate stored picks (`innocenz-landing-locale` vs
 * `innocenz-portal-locale`), so a language chosen here does not follow the
 * visitor to /login. Reconciling that is a change to the locale modules, not to
 * this route.
 */
export const Route = createFileRoute("/signup")({
	component: RouteComponent,
	/**
	 * English in every locale: `head()` runs OUTSIDE React, with no provider
	 * above it and no hook to read a locale from. `LandingLocaleProvider` already
	 * sets the live document title via `documentTitle` below — this is only the
	 * pre-hydration fallback and the crawler's copy.
	 */
	head: () => ({
		meta: [
			{ title: "Sign up — InnocenZ" },
			{
				name: "description",
				content: "Create an InnocenZ account as an Outlet or PR Agency.",
			},
		],
	}),
});

function RouteComponent() {
	return (
		<LandingLocaleProvider documentTitle={(t) => t.signup.meta.title}>
			<SignupPageContent />
		</LandingLocaleProvider>
	);
}

function SignupPageContent() {
	const { locale, t } = useLandingLocale();
	const copy = t.signup;

	return (
		<div className="login-page signup-page relative flex min-h-svh w-full flex-col lg:flex-row">
			{/*
			 * The same moving field as /login — sweep, drifting pools, rays,
			 * grain, vignette. CSS pins it with `position: fixed` (see
			 * `.signup-page .login-ambience`) because this page SCROLLS: rooted
			 * as `absolute inset-0` its gradients would stretch over the whole
			 * scroll height and drift away down the form.
			 *
			 * ⚠️ It must be a SIBLING of the columns, not a child of the aside.
			 * Inside the aside it painted over that column's own `border-r`, so
			 * the divider between the two halves vanished — a child paints above
			 * its parent's border. Here the aside comes later in the DOM and its
			 * border paints above the field, exactly as on /login.
			 */}
			<LoginAmbience />

			<aside className="relative hidden w-full shrink-0 lg:block lg:w-[38%] xl:w-[36%]">
				<div className="sticky top-0 flex h-svh flex-col overflow-hidden border-r border-royal-gold/20 px-10 py-14 xl:px-14">
					{/* Vertically centred, matching /login — the owner's call. */}
					<div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
						{/* Tagline off + short rule, matching /login's brand block. */}
						<BrandLogo variant="stacked" size="auth" showMotto />

						<span
							aria-hidden
							className="mt-9 block h-px w-16 bg-gradient-to-r from-transparent via-royal-gold/50 to-transparent"
						/>

						<div className="mt-9 max-w-[34ch]">
							<p className="login-aside-lede text-foreground/75">
								{copy.aside.description}
							</p>
						</div>
					</div>

					<div className="relative z-10 mt-auto w-full pt-10">
						<p className="login-footer text-center text-foreground/50 sm:text-left">
							© {new Date().getFullYear()}{" "}
							<span className="brand-wordmark text-gradient-royal">
								InnocenZ
							</span>
							. {copy.aside.rightsReserved}
							{" · "}
							<Link
								to="/policy"
								className="text-foreground/65 underline-offset-4 hover:text-gold-bright hover:underline"
							>
								{copy.privacyPolicy}
							</Link>
						</p>
					</div>
				</div>
			</aside>

			<main className="relative flex min-h-svh w-full min-w-0 flex-1 flex-col px-5 py-8 sm:px-8 lg:px-10 lg:py-10 xl:px-14">
				<div className="login-page-toolbar mb-6 flex flex-wrap items-center justify-between gap-3 lg:mb-8">
					<div className="lg:hidden">
						<BrandLogo variant="horizontal" size="sm" />
					</div>
					<div className="ml-auto flex flex-wrap items-center gap-4">
						<HandoffLanguageSwitcher />
						<Link
							to="/login"
							className="login-back inline-flex w-fit items-center gap-2 font-semibold uppercase tracking-[0.12em] text-foreground/65 transition-colors hover:text-gold-bright"
						>
							<ArrowLeft className="h-5 w-5" />
							{copy.backToLogin}
						</Link>
					</div>
				</div>

				<div className="mx-auto w-full max-w-2xl pb-12">
					<header className="mb-8 sm:mb-10">
						<h1 className="signup-heading text-foreground">
							<span className="block">{copy.heading.line1}</span>
							<span className="mt-1 block text-gradient-royal">
								{copy.heading.line2}
							</span>
						</h1>
						<p className="signup-lede mt-3 max-w-xl text-muted-foreground">
							{copy.heading.sub}
						</p>
					</header>

					<SignupForm key={locale} />

					<p className="login-footer mt-10 text-center text-foreground/50 lg:hidden">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
						. {copy.aside.rightsReserved}
						{" · "}
						<Link
							to="/policy"
							className="text-foreground/65 underline-offset-4 hover:text-gold-bright hover:underline"
						>
							{copy.privacyPolicy}
						</Link>
					</p>
				</div>
			</main>
		</div>
	);
}
