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

export function TitleWithIcon({
	children,
	icon,
	className,
	iconClassName,
	hideIcon,
	title,
}: {
	children: ReactNode;
	icon?: LucideIcon | null;
	className?: string;
	iconClassName?: string;
	hideIcon?: boolean;
	/** Accessible name when the visible label is abbreviated or icon-heavy. */
	title?: string;
}) {
	const labelText = title ?? textFromChildren(children) ?? undefined;
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

/** Compact label + icon for KPI tiles, metric rows, and filter chips. */
export function LabelWithIcon({
	label,
	className,
	iconClassName,
	icon,
	as: Tag = "span",
}: {
	label: ReactNode;
	className?: string;
	iconClassName?: string;
	icon?: LucideIcon | null;
	as?: "span" | "div" | "label";
}) {
	return (
		<Tag className={className}>
			<TitleWithIcon
				icon={icon}
				iconClassName={cn("iz-title-icon--kpi", iconClassName)}
			>
				{label}
			</TitleWithIcon>
		</Tag>
	);
}
