import { Languages } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import {
	type PortalLocale,
	SUPPORTED_LOCALES,
} from "@/lib/portal-i18n/locale-prefs";

/**
 * EN / 简体中文 switcher for the signed-in portals.
 *
 * Deliberately INLINE PILLS rather than the dropdown the marketing site uses.
 * `HandoffLanguageSwitcher` renders its menu through `createPortal` into
 * `document.body` at `z-index: 9999` — fine on a static page, a liability
 * inside a portal that already stacks a collapsible sidebar, a notification
 * popover, a mobile bottom nav and full-screen sheets. Two pills open nothing,
 * so there is no overlay to land on top of the logo, the bell or the avatar,
 * and nothing to mis-position when the sidebar collapses.
 *
 * Both options stay visible, so the current language is legible at a glance
 * instead of hidden behind a trigger.
 */
export function PortalLanguageSwitcher({
	variant = "sidebar",
	className,
}: {
	/**
	 * `sidebar` — agency / outlet, sits in the sidebar foot above Sign out.
	 * `header` — admin, sits in the header strip beside the theme toggle.
	 */
	variant?: "sidebar" | "header";
	className?: string;
}) {
	const { locale, t, setLocale } = usePortalLocale();

	const labelFor = (id: PortalLocale) =>
		id === "en" ? t.lang.english : t.lang.chinese;

	// Short forms, not the full names: this sits in a fixed-width sidebar rail
	// and in a crowded header. "简体中文" would wrap the rail at its collapsed
	// width; the full name still reaches screen readers via `title`.
	const shortLabelFor = (id: PortalLocale) => (id === "en" ? "EN" : "中文");

	if (variant === "header") {
		return (
			<fieldset
				className={`inline-flex items-center gap-0.5 rounded-md border border-border/60 p-0.5${
					className ? ` ${className}` : ""
				}`}
				aria-label={t.lang.language}
			>
				{SUPPORTED_LOCALES.map((id) => {
					const active = locale === id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => setLocale(id)}
							aria-pressed={active}
							title={labelFor(id)}
							className={`rounded px-2 py-1 text-xs font-semibold transition-colors ${
								active
									? "bg-muted text-foreground"
									: "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
							}`}
						>
							{shortLabelFor(id)}
						</button>
					);
				})}
			</fieldset>
		);
	}

	// Styled with Tailwind against the existing `--iz-*` tokens rather than new
	// `.iz-portal-lang` rules: the portal's CSS is shared with the outlet and
	// agency themes, and adding selectors there risks colliding with rules this
	// component cannot see. Tokens keep it on-theme without touching that file.
	return (
		<fieldset
			className={`flex items-center gap-2 px-3 py-2${className ? ` ${className}` : ""}`}
			aria-label={t.lang.language}
		>
			<Languages
				className="h-[18px] w-[18px] shrink-0 text-[var(--iz-muted)]"
				strokeWidth={1.8}
				aria-hidden
			/>
			<div className="flex min-w-0 flex-1 gap-1">
				{SUPPORTED_LOCALES.map((id) => {
					const active = locale === id;
					return (
						<button
							key={id}
							type="button"
							onClick={() => setLocale(id)}
							aria-pressed={active}
							title={labelFor(id)}
							className={`flex-1 rounded-lg border px-2 py-1 text-xs font-semibold transition-colors ${
								active
									? "border-[var(--iz-gold-d)] bg-[var(--iz-gold-d)]/15 text-[var(--iz-gold-l)]"
									: "border-[var(--iz-line)] text-[var(--iz-muted)] hover:border-[var(--iz-gold-d)] hover:text-[var(--iz-txt)]"
							}`}
						>
							{shortLabelFor(id)}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}
