import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

export type SourceKey = "outlet" | "agency" | "pr";
export type SourceValue = "all" | SourceKey;

/*
 * `label` is a RESOLVER, not a string: a dictionary key is itself a `string`,
 * so storing one on this module-scope record type-checks and then ships the key
 * NAME to screen. `key` and `activeClass` are untouched — `key` is the value
 * this filter sends up to the caller and on into the query.
 *
 * "PR" stays "PR" in both locales: it is the product's own term for the role
 * and what the database stores.
 */
const ALL_OPTIONS: {
	key: SourceKey;
	label: (t: PortalTranslations) => string;
	activeClass: string;
}[] = [
	{
		key: "outlet",
		label: (t) => t.table.outlet,
		activeClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
	},
	{
		key: "agency",
		label: (t) => t.adminService.agency,
		activeClass: "bg-(--lavender-soft)/25 text-lavender",
	},
	{
		key: "pr",
		label: (t) => t.table.pr,
		activeClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	},
];

// Segmented source filter. Clicking the active button clears back to "all", so
// the buttons cover every state without a separate "All" control. `sources`
// selects which buttons appear (default Outlet/Agency); pass ["outlet",
// "agency", "pr"] to include PR-initiated postings. Generic over the caller's
// own value union so pages that only allow outlet/agency stay type-safe.
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
	const options = ALL_OPTIONS.filter((option) => sources.includes(option.key));
	return (
		<div
			className={`inline-flex items-center gap-1 rounded-lg border border-(--lavender-soft)/30 bg-muted/30 p-1 ${className ?? ""}`}
		>
			{options.map((option) => {
				const isActive = value === option.key;
				return (
					<button
						key={option.key}
						type="button"
						aria-pressed={isActive}
						onClick={() => onChange((isActive ? "all" : option.key) as T)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							isActive
								? `${option.activeClass} shadow-sm`
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{option.label(t)}
					</button>
				);
			})}
		</div>
	);
}
