import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { SignupForm } from "@/components/auth/signup-form";
import { BrandLogo } from "@/components/landing/BrandLogo";
import { HandoffLanguageSwitcher } from "@/components/landing/handoff/HandoffLanguageSwitcher";
import { LoginAsideBackdrop } from "@/components/landing/LoginDecor";
import { LandingLocaleProvider, useLandingLocale } from "@/lib/landing-i18n";

export const Route = createFileRoute("/signup")({
	component: RouteComponent,
	head: () => ({
		meta: [
			{ title: "Sign up — InnocenZ" },
			{
				name: "description",
				content:
					"Create an InnocenZ account as an Outlet or PR Agency.",
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
		<div className="login-page flex min-h-svh w-full flex-col lg:flex-row">
			<aside className="relative hidden w-full shrink-0 lg:block lg:w-[40%]">
				<div className="sticky top-0 flex h-svh flex-col overflow-hidden border-r border-royal-gold/20 px-10 py-14 xl:px-16">
					<LoginAsideBackdrop />

					<div className="relative z-10 flex flex-1 flex-col items-center justify-center text-center">
						<BrandLogo variant="stacked" size="hero" showTagline showMotto />

						<div className="mt-12 max-w-lg">
							<p className="login-subheading text-foreground/80">
								{copy.aside.description}
							</p>
						</div>
					</div>

					<div className="relative z-10 mt-auto w-full pt-14">
						<p className="login-footer text-center text-foreground/55 sm:text-left">
							© {new Date().getFullYear()}{" "}
							<span className="brand-wordmark text-gradient-royal">InnocenZ</span>
							. {copy.aside.rightsReserved}
						</p>
					</div>
				</div>
			</aside>

			<main
				role="main"
				className="relative flex min-h-svh w-full min-w-0 flex-1 flex-col px-6 py-10 lg:px-10 lg:py-12 xl:px-12"
			>
				<div className="login-page-toolbar mb-8 flex flex-wrap items-center justify-end gap-4 lg:absolute lg:right-10 lg:top-10 lg:mb-0 xl:right-12 xl:top-12">
					<HandoffLanguageSwitcher />
					<Link
						to="/login"
						className="login-back inline-flex w-fit items-center gap-3 font-semibold uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-gold-bright"
					>
						<ArrowLeft className="h-6 w-6" />
						{copy.backToLogin}
					</Link>
				</div>

				<div className="w-full pb-10">
					<div className="mb-8 flex justify-center lg:hidden">
						<BrandLogo variant="stacked" size="hero" showTagline showMotto />
					</div>

					<div className="mb-8">
						<h1 className="login-heading text-foreground">
							<span className="login-heading-line">{copy.heading.line1}</span>
							<span className="login-heading-line mt-1">
								<span className="text-gradient-royal drop-shadow-[0_0_20px_color-mix(in_oklab,var(--royal-gold)_35%,transparent)]">
									{copy.heading.line2}
								</span>
							</span>
						</h1>
						<p className="login-subheading mt-4 text-muted-foreground">
							{copy.heading.sub}
						</p>
					</div>

					<div className="login-glass-card rounded-2xl border border-royal-gold/25 bg-card/80 p-8 shadow-glow-gold-lg backdrop-blur-md sm:p-10">
						<SignupForm key={locale} />
					</div>

					<p className="login-footer mt-10 text-center text-foreground/55 lg:hidden">
						© {new Date().getFullYear()}{" "}
						<span className="brand-wordmark text-gradient-royal">
							InnocenZ
						</span>
						. {copy.aside.rightsReserved}
					</p>
				</div>
			</main>
		</div>
	);
}
