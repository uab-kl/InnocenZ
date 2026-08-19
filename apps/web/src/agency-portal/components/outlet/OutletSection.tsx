import { InnocenZBrandMark } from "@agency-portal/components/Brand";
import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { ChevronDown, iconForNav } from "@agency-portal/lib/lucide-label-icons";
import { cn } from "@agency-portal/lib/utils";
import { type ComponentType, type ReactNode, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export function OutletSection({
	id,
	title,
	iconKey,
	icon: Icon,
	brandMark = false,
	hint,
	collapsedPreview,
	collapsible = false,
	defaultOpen = true,
	open: openProp,
	onOpenChange,
	children,
	trailing,
	className,
}: {
	id?: string;
	title: string;
	/**
	 * The ENGLISH label to resolve the section icon from, when `title` is
	 * translated. Defaults to `title` for the many callers still passing English.
	 */
	iconKey?: string;
	icon?: ComponentType<{ className?: string }>;
	/** Use the InnocenZ circular mark instead of a Lucide section icon. */
	brandMark?: boolean;
	hint?: ReactNode;
	/** Rich preview shown when collapsible and closed — replaces hint. */
	collapsedPreview?: ReactNode;
	collapsible?: boolean;
	defaultOpen?: boolean;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children: ReactNode;
	trailing?: ReactNode;
	className?: string;
}) {
	const [internalOpen, setInternalOpen] = useState(defaultOpen);
	const isControlled = openProp !== undefined;
	const open = isControlled ? openProp : internalOpen;

	const setOpen = (next: boolean | ((value: boolean) => boolean)) => {
		const resolved = typeof next === "function" ? next(open) : next;
		if (!isControlled) setInternalOpen(resolved);
		onOpenChange?.(resolved);
	};

	const { t } = usePortalLocale();

	/**
	 * `iconKey` — NOT `title` — once a caller passes a translated title.
	 *
	 * `iconForNav` resolves its icon by the exact English word, so a caller that
	 * localises `title` would silently lose its section icon: the lookup misses
	 * and falls through to the default, with no error to say why. Callers that
	 * translate their title pass the original English through `iconKey` (or an
	 * explicit `icon`) to keep the glyph.
	 */
	const SectionIcon = Icon ?? iconForNav(iconKey ?? title);

	const sectionTitle = brandMark ? (
		<span className="iz-title-with-icon">
			<InnocenZBrandMark className="iz-brand-mark-icon--section" />
			<span className="iz-title-with-icon__text">{title}</span>
		</span>
	) : (
		<TitleWithIcon
			icon={SectionIcon}
			iconClassName="h-3.5 w-3.5 shrink-0 text-[var(--iz-gold-l)]"
		>
			{title}
		</TitleWithIcon>
	);

	if (!collapsible) {
		return (
			<section id={id} className={cn("mt-5", className)}>
				<div className="flex items-center gap-2 py-0.5">
					<div className="flex min-w-0 flex-1 items-center justify-between gap-2">
						<div className="min-w-0">
							<div className="iz-outlet-section-title flex items-center gap-1.5 font-sora text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--iz-muted)]">
								{sectionTitle}
							</div>
							{hint && (
								<p className="iz-tiny iz-muted2 mt-0.5 truncate">{hint}</p>
							)}
						</div>
						{trailing}
					</div>
				</div>
				<div className="mt-2.5 iz-outlet-section-card">{children}</div>
			</section>
		);
	}

	return (
		<section
			id={id}
			className={cn("iz-collapsible-section", open && "is-open", className)}
		>
			<button
				type="button"
				className="iz-collapsible-section__trigger"
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<span className="min-w-0 flex-1">
					<span className="iz-collapsible-section__title inline-flex items-center gap-1.5">
						{sectionTitle}
					</span>
					{collapsedPreview && !open ? (
						<div className="iz-collapsible-section__preview">
							{collapsedPreview}
						</div>
					) : hint ? (
						<span className="iz-collapsible-section__hint">{hint}</span>
					) : null}
					<span className="iz-collapsible-section__action">
						{open ? t.common.tapToCollapse : t.common.tapToExpand}
					</span>
				</span>
				{trailing && (
					<span
						className="shrink-0"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						{trailing}
					</span>
				)}
				<span className="iz-collapsible-section__chev" aria-hidden>
					<ChevronDown
						className={cn(
							"h-4 w-4 transition-transform duration-200",
							open && "rotate-180",
						)}
					/>
				</span>
			</button>
			{open && (
				<div className="iz-collapsible-section__body iz-outlet-section-card">
					{children}
				</div>
			)}
		</section>
	);
}
