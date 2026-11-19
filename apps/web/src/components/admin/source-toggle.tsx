import { Check } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type SourceKey = "outlet" | "agency" | "pr";
export type SourceValue = "all" | SourceKey;

/*
 * `label` is a RESOLVER, not a string: a dictionary key is itself a `string`,
 * so storing one on this module-scope record type-checks and then ships the key
 * NAME to screen. `key` is the value this filter sends up to the caller and on
 * into the query.
 *
 * "PR" stays "PR" in both locales: it is the product's own term for the role
 * and what the database stores.
 */
const ALL_OPTIONS: {
	key: SourceKey;
	label: (t: PortalTranslations) => string;
}[] = [
	{ key: "outlet", label: (t) => t.table.outlet },
	{ key: "agency", label: (t) => t.adminService.agency },
	{ key: "pr", label: (t) => t.table.pr },
];

/**
 * Segmented source filter: All · Outlet · Agency (· PR).
 *
 * WHY IT LOOKS LIKE THIS (owner, 17 Nov 2026 — "user dont know this can
 * click"). It used to render only Outlet and Agency, stretched across the full
 * width, in muted text with NOTHING selected while the filter sat on "all" —
 * which is the default, so on every first visit it read as a table heading,
 * not a control. Now:
 *   - "All" is a real segment, selected by default, so a choice is always
 *     visibly made and visibly undoable;
 *   - every segment is drawn as a button (border, pointer, hover answer);
 *   - the selected one wears the portal accent AND a tick, so it does not rely
 *     on colour alone (`DESIGN.md` §3 — lavender means "selected"; the old
 *     amber "PR" highlight said "waiting", which it is not).
 *
 * Behaviour is unchanged: the same values reach `onChange`, and clicking the
 * selected source still clears back to "all".
 */
export function SourceToggle<T extends SourceValue>({
	value,
	onChange,
	className,
	sources = ["outlet", "agency"],
}: {
	value: T;
	onChange: (value: T) => void;
	className?: string;
	sources?: SourceKey[];
}) {
	const { t } = usePortalLocale();
	const options = [
		{
			key: "all" as const,
			label: (tt: PortalTranslations) => tt.admin.sourceAll,
		},
		...ALL_OPTIONS.filter((option) => sources.includes(option.key)),
	];
	return (
		<fieldset className={`iz-admin-source-tabs ${className ?? ""}`}>
			{/* Names the group for a screen reader; the segments say it on screen. */}
			<legend className="sr-only">{t.admin.sourceFilter}</legend>
			{options.map((option) => {
				const isActive = value === option.key;
				return (
					<button
						key={option.key}
						type="button"
						aria-pressed={isActive}
						data-active={isActive ? "true" : undefined}
						onClick={() =>
							onChange(
								(isActive && option.key !== "all" ? "all" : option.key) as T,
							)
						}
						className="iz-admin-source-tab"
					>
						{isActive && <Check aria-hidden className="size-4 shrink-0" />}
						{option.label(t)}
					</button>
				);
			})}
		</fieldset>
	);
}
