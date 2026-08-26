import type { MouseEvent, ReactNode } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

export function RosterAmountButton({
	label,
	onClick,
	className = "",
	children,
	stopRowNavigation = false,
}: {
	/**
	 * The bucket this amount belongs to, ALREADY TRANSLATED by the caller — it
	 * lands mid-sentence in the accessible name below, so it cannot be a key.
	 */
	label: string;
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	className?: string;
	children: ReactNode;
	/** Prevent parent table row navigation when the amount is inside a clickable row. */
	stopRowNavigation?: boolean;
}) {
	const { t } = usePortalLocale();
	return (
		<button
			type="button"
			className={`iz-roster-amount-btn ${className}`.trim()}
			onClick={(event) => {
				if (stopRowNavigation) {
					event.stopPropagation();
				}
				onClick(event);
			}}
			aria-label={fill(t.agencyRoster.viewBreakdownAria, { label })}
		>
			{children}
		</button>
	);
}
