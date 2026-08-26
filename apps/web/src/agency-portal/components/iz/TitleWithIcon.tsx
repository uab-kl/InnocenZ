import { iconForTitle } from "@agency-portal/lib/title-icons";
import { cn } from "@agency-portal/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

function textFromChildren(children: ReactNode): string | null {
	if (typeof children === "string") return children;
	if (typeof children === "number") return String(children);
	if (Array.isArray(children)) {
		const parts = children
			.map((child) =>
				typeof child === "string" || typeof child === "number"
					? String(child)
					: "",
			)
			.join("");
		return parts.trim() || null;
	}
	return null;
}

/**
 * Title (or section label) rendered with its Lucide icon.
 *
 * ⚠️ DERIVING THE ICON FROM `children` IS UNSAFE ONCE THE TITLE IS TRANSLATED.
 * When neither `icon` nor `iconKey` is given, the lookup key is scraped out of
 * the rendered children (`textFromChildren` below) and handed to `iconForTitle`.
 * That table is keyed on ENGLISH — see `lucide-label-icons.ts`. Feed it "筛选条件"
 * instead of "Filter by" and nothing throws and nothing warns: `iconForTitle`
 * simply returns null and the icon DISAPPEARS. The English build keeps looking
 * right, so the regression is invisible until someone switches locale.
 *
 * So: any caller whose children are read out of the dictionary MUST pin the
 * lookup, either with `icon={iconForNav("Filter by")}` or with
 * `iconKey="Filter by"` — the ORIGINAL English, recovered from that key's `en`
 * value, never a guess and never the translated string. `title` is no safer: it
 * is an accessible name and gets translated too, which is why `iconKey` is
 * consulted ahead of it.
 *
 * Precedence: explicit `icon` (including an explicit `null` to suppress) →
 * `iconKey` → `title` → text scraped from `children`.
 */
export function TitleWithIcon({
	children,
	icon,
	iconKey,
	className,
	iconClassName,
	hideIcon,
	title,
}: {
	children: ReactNode;
	icon?: LucideIcon | null;
	/**
	 * ENGLISH lookup key for the icon table. Pass this (or `icon`) whenever
	 * `children` come from the dictionary — a translated title resolves to no
	 * icon at all. Not rendered; leave it in English in every locale.
	 */
	iconKey?: string;
	className?: string;
	iconClassName?: string;
	hideIcon?: boolean;
	/** Accessible name when the visible label is abbreviated or icon-heavy. */
	title?: string;
}) {
	const labelText = iconKey ?? title ?? textFromChildren(children) ?? undefined;
	const Icon =
		icon === undefined ? (labelText ? iconForTitle(labelText) : null) : icon;

	if (hideIcon || !Icon) {
		return (
			<span className={className} title={title}>
				{children}
			</span>
		);
	}

	return (
		<span className={cn("iz-title-with-icon", className)} title={title}>
			<Icon
				className={cn("iz-title-icon", iconClassName)}
				strokeWidth={2}
				aria-hidden
			/>
			<span className="iz-title-with-icon__text">{children}</span>
		</span>
	);
}

/**
 * Compact label + icon for KPI tiles, metric rows, and filter chips.
 *
 * Same caveat as `TitleWithIcon`: with no `icon` and no `iconKey`, the icon is
 * looked up from `label` itself, so a translated `label` loses its icon.
 */
export function LabelWithIcon({
	label,
	className,
	iconClassName,
	icon,
	iconKey,
	as: Tag = "span",
}: {
	label: ReactNode;
	className?: string;
	iconClassName?: string;
	icon?: LucideIcon | null;
	/** ENGLISH lookup key — pass it when `label` is read from the dictionary. */
	iconKey?: string;
	as?: "span" | "div" | "label";
}) {
	return (
		<Tag className={className}>
			<TitleWithIcon
				icon={icon}
				iconKey={iconKey}
				iconClassName={cn("iz-title-icon--kpi", iconClassName)}
			>
				{label}
			</TitleWithIcon>
		</Tag>
	);
}
