import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/landing/BrandLogo";
import {
	DELETE_ACCOUNT_EFFECTIVE_DATE,
	DELETE_ACCOUNT_LAST_UPDATED,
	deleteAccountIntro,
	deleteAccountSections,
} from "@/lib/legal/delete-account";
import {
	PRIVACY_CONTACT_LABEL,
	PRIVACY_CONTACT_WHATSAPP,
} from "@/lib/legal/privacy-policy";

export function DeleteAccountPage() {
	return (
		<div className="relative min-h-svh w-full overflow-x-hidden bg-background text-foreground">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(212,175,55,0.12),transparent_55%)]"
			/>
			<div className="relative mx-auto flex w-full max-w-3xl flex-col px-6 py-10 sm:px-8 sm:py-14">
				<Link
					to="/"
					className="mb-8 inline-flex w-fit items-center gap-2 text-sm font-semibold uppercase tracking-[0.12em] text-foreground/65 transition-colors hover:text-gold-bright"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to home
				</Link>

				<div className="mb-10 flex flex-col items-start gap-4">
					<BrandLogo variant="stacked" size="md" showTagline />
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-royal-gold">
							Legal
						</p>
						<h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
							Delete your account
						</h1>
						<p className="mt-3 text-sm text-muted-foreground">
							Effective {DELETE_ACCOUNT_EFFECTIVE_DATE} · Last updated{" "}
							{DELETE_ACCOUNT_LAST_UPDATED}
						</p>
					</div>
				</div>

				<p className="text-base leading-relaxed text-foreground/85">
					{deleteAccountIntro}
				</p>

				<div className="mt-10 flex flex-col gap-9">
					{deleteAccountSections.map((section) => (
						<section key={section.id} id={section.id} className="scroll-mt-24">
							<h2 className="text-lg font-semibold tracking-tight text-foreground">
								{section.title}
							</h2>
							{section.paragraphs.map((p) => (
								<p
									key={p.slice(0, 48)}
									className="mt-3 text-[15px] leading-relaxed text-foreground/80"
								>
									{p}
								</p>
							))}
							{section.bullets ? (
								<ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/80">
									{section.bullets.map((b) => (
										<li key={b.slice(0, 48)}>{b}</li>
									))}
								</ul>
							) : null}
						</section>
					))}
				</div>

				<div className="mt-12 border-t border-border pt-8 text-sm text-muted-foreground">
					<p>
						Support:{" "}
						<a
							href={PRIVACY_CONTACT_WHATSAPP}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-royal-gold underline-offset-4 hover:underline"
						>
							{PRIVACY_CONTACT_LABEL}
						</a>
					</p>
					<p className="mt-3">
						<Link
							to="/policy"
							className="font-medium text-royal-gold underline-offset-4 hover:underline"
						>
							Privacy Policy
						</Link>
					</p>
				</div>
			</div>
		</div>
	);
}
