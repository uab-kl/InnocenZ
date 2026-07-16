export type SourceValue = "all" | "outlet" | "agency";

const OPTIONS: {
	key: "outlet" | "agency";
	label: string;
	activeClass: string;
}[] = [
	{
		key: "outlet",
		label: "Outlet",
		activeClass: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
	},
	{
		key: "agency",
		label: "Agency",
		activeClass: "bg-(--lavender-soft)/25 text-lavender",
	},
];

// Segmented Outlet/Agency filter. Clicking the active button clears back to
// "all", so the two buttons cover every state without a separate "All" control.
export function SourceToggle({
	value,
	onChange,
	className,
}: {
	value: SourceValue;
	onChange: (value: SourceValue) => void;
	className?: string;
}) {
	return (
		<div
			className={`inline-flex items-center gap-1 rounded-lg border border-(--lavender-soft)/30 bg-muted/30 p-1 ${className ?? ""}`}
		>
			{OPTIONS.map((option) => {
				const isActive = value === option.key;
				return (
					<button
						key={option.key}
						type="button"
						aria-pressed={isActive}
						onClick={() => onChange(isActive ? "all" : option.key)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
							isActive
								? `${option.activeClass} shadow-sm`
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
