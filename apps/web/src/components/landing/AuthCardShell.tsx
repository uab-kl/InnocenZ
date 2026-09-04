import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";

/**
 * Centred card for the signed-OUT pages that hang off /login
 * (forgot password, reset password).
 *
 * Reuses the login page's global `login-*` classes rather than restyling, so
 * these screens keep matching /login when its look changes.
 */
export function AuthCardShell({
	heading,
	accent,
	subheading,
	children,
	footer,
}: {
	heading: string;
	/** Second heading line, rendered in the royal gradient. */
	accent: string;
	subheading: string;
	children: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<div className="login-page flex min-h-svh w-full flex-col">
			<main className="relative flex min-h-svh w-full flex-1 flex-col justify-center px-6 py-14 lg:px-14">
				<Link
					to="/login"
					className="login-back mb-8 inline-flex w-fit items-center gap-2 font-semibold uppercase tracking-[0.12em] text-foreground/70 transition-colors hover:text-gold-bright lg:absolute lg:left-12 lg:top-12 lg:mb-0"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to sign in
				</Link>

				<div className="mx-auto w-full max-w-120">
					<div className="mb-6 flex justify-center">
						<BrandLogo variant="stacked" size="md" showTagline />
					</div>

					<div className="mb-6">
						<h1 className="login-heading text-foreground">
							<span className="login-heading-line">{heading}</span>
							<span className="login-heading-line mt-1">
								<span className="text-gradient-royal drop-shadow-[0_0_20px_color-mix(in_oklab,var(--royal-gold)_35%,transparent)]">
									{accent}
								</span>
							</span>
						</h1>
						<p className="login-subheading mt-2 text-muted-foreground">
							{subheading}
						</p>
					</div>

					<div className="login-glass-card rounded-2xl border border-royal-gold/25 bg-card/80 p-6 shadow-glow-gold-lg backdrop-blur-md sm:p-7">
						{children}
					</div>

					{footer}
				</div>
			</main>
		</div>
	);
}
