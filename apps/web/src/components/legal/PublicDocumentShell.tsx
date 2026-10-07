import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";
import {
	PRIVACY_CONTACT_LABEL,
	PRIVACY_CONTACT_WHATSAPP,
} from "@/lib/legal/privacy-policy";
import { resolvePublicPageLocale } from "@/lib/legal/public-page-locale";
import {
	FixedPortalLocaleProvider,
	usePortalLocale,
} from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";
import {
	DEFAULT_LOCALE,
	type PortalLocale,
} from "@/lib/portal-i18n/locale-prefs";

/**
 * The locale provider for /about and /legal: the visitor's landing pick when
 * they made one (see resolvePublicPageLocale). It starts at the SSR-safe
 * default and switches after mount, exactly as the portal provider does —
 * reading storage during render would hand the client a different tree than
 * the server sent.
 */
export function PublicPageLocaleProvider({
	children,
}: {
	children: ReactNode;
}) {
	const [locale, setLocale] = useState<PortalLocale>(DEFAULT_LOCALE);

	useEffect(() => {
		setLocale(resolvePublicPageLocale());
	}, []);

	return (
		<FixedPortalLocaleProvider locale={locale}>
			{children}
		</FixedPortalLocaleProvider>
	);
}

/**
 * The chrome /about and /legal share — the same back link, centred mark,
 * eyebrow + title, and contact + rights footer as /policy, so the footer's
 * pages read as one set. Render it inside a PublicPageLocaleProvider: these
 * are public routes with no portal shell above them.
 *
 * Always dark: the app theme follows the device (`defaultTheme="system"`), so
 * on a light-mode phone the tokens went light. `public-doc-page` pins the dark
 * values in styles.css — the same pin the sign-in pages use.
 */
export function PublicDocumentShell({
	eyebrow,
	title,
	contactLabel,
	children,
}: {
	eyebrow: string;
	title: string;
	/** Colon baked in; the WhatsApp link follows it. */
	contactLabel: string;
	children: ReactNode;
}) {
	const { t } = usePortalLocale();

	return (
		<div className="public-doc-page relative min-h-svh w-full overflow-x-hidden bg-background text-foreground">
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
					{t.webShell.backToHome}
				</Link>

				<div className="mb-10 flex flex-col items-start gap-4">
					{/* Centred mark over flush-left text — same as /policy. */}
					<div className="flex w-full justify-center">
						<BrandLogo variant="stacked" size="md" showTagline />
					</div>
					<div>
						<p className="text-xs font-semibold uppercase tracking-[0.2em] text-royal-gold">
							{eyebrow}
						</p>
						<h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
							{title}
						</h1>
					</div>
				</div>

				{children}

				<div className="mt-12 border-t border-border pt-8 text-sm text-muted-foreground">
					<p>
						{contactLabel}{" "}
						<a
							href={PRIVACY_CONTACT_WHATSAPP}
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-royal-gold underline-offset-4 hover:underline"
						>
							{PRIVACY_CONTACT_LABEL}
						</a>
					</p>
					<p className="mt-4">
						{fill(t.webShell.rightsReserved, {
							year: new Date().getFullYear(),
						})}
					</p>
				</div>
			</div>
		</div>
	);
}

/** A gold group heading over the sections below it (e.g. "PR accounts"). */
export function DocumentGroup({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			id={id}
			className="mt-12 scroll-mt-24 border-t border-border pt-8 first:mt-0"
		>
			<h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-royal-gold">
				{title}
			</h2>
			<div className="mt-6 flex flex-col gap-9">{children}</div>
		</section>
	);
}

/**
 * One titled block. `body` keeps its `\n\n` paragraph breaks and its line
 * breaks inside a paragraph (the PR app's `  • ` bullet lines).
 */
export function DocumentSection({
	id,
	title,
	body,
	bullets,
	heading = "h2",
	children,
}: {
	id: string;
	title: string;
	body?: string;
	bullets?: readonly string[];
	/** h3 when the section sits under a DocumentGroup's h2. */
	heading?: "h2" | "h3";
	children?: ReactNode;
}) {
	const Heading = heading;
	return (
		<section id={id} className="scroll-mt-24">
			<Heading className="text-lg font-semibold tracking-tight text-foreground">
				{title}
			</Heading>
			{body?.split("\n\n").map((paragraph) => (
				<p
					key={paragraph.slice(0, 48)}
					className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-foreground/80"
				>
					{paragraph}
				</p>
			))}
			{bullets ? (
				<ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-foreground/80">
					{bullets.map((b) => (
						<li key={b.slice(0, 48)}>{b}</li>
					))}
				</ul>
			) : null}
			{children}
		</section>
	);
}
