import { TitleWithIcon } from "@agency-portal/components/iz/TitleWithIcon";
import { iconForNav } from "@agency-portal/lib/lucide-label-icons";
import type { ReactNode } from "react";

export function PrPageHeader({
	label,
	labelIconKey,
	title,
	iconKey,
	meta,
	trailing,
}: {
	label: string;
	/**
	 * The ENGLISH label to resolve the eyebrow icon from, when `label` is
	 * translated. `iconForNav` matches on the TEXT, so a localised label misses
	 * every lookup and degrades to a "?" glyph — no error, no warning. Mirrors
	 * `eyebrowIconKey` on `OutletPageHeader`.
	 */
	labelIconKey?: string;
	title: ReactNode;
	/**
	 * The ENGLISH title to resolve the page icon from, when `title` is
	 * translated. Same text-matching caveat as `labelIconKey`. Mirrors `iconKey`
	 * on `OutletPageHeader` / `OutletSection`.
	 */
	iconKey?: string;
	meta?: string;
	trailing?: React.ReactNode;
}) {
	// Resolve icons from the ENGLISH keys when given, never from the rendered
	// (possibly translated) copy. `title` may be a node rather than a string, in
	// which case the label's key stands in for it — the same fallback as before,
	// but honouring `labelIconKey` so a translated label keeps both glyphs.
	const labelKey = labelIconKey ?? label;
	const titleKey = iconKey ?? (typeof title === "string" ? title : labelKey);

	return (
		<header className="iz-pr-page-header">
			<div className="iz-between items-start gap-3">
				<div className="min-w-0">
					<p className="iz-pr-page-header__label">
						<TitleWithIcon
							icon={iconForNav(labelKey)}
							iconClassName="iz-title-icon--eyebrow"
						>
							{label}
						</TitleWithIcon>
					</p>
					<h2 className="iz-pr-page-header__title">
						<TitleWithIcon icon={iconForNav(titleKey)}>{title}</TitleWithIcon>
					</h2>
					{meta && <p className="iz-pr-page-header__meta">{meta}</p>}
				</div>
				{trailing && <div className="shrink-0 text-right">{trailing}</div>}
			</div>
		</header>
	);
}
