import { useIsMobile } from "@agency-portal/hooks/use-mobile";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/** Disclosure changes presentation only; filter state and inputs stay mounted. */
export function OutletMobileFilters({
	children,
	enabled = true,
}: {
	children: ReactNode;
	enabled?: boolean;
}) {
	const mobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const id = useId();
	const { t } = usePortalLocale();
	return (
		<div className={enabled ? "iz-outlet-mobile-filters" : undefined}>
			{enabled && mobile && (
				<button
					type="button"
					className="iz-outlet-filter-toggle"
					aria-expanded={open}
					aria-controls={id}
					onClick={() => setOpen(!open)}
				>
					<SlidersHorizontal className="h-4 w-4" aria-hidden />
					<span>{t.history.filterBy}</span>
					<ChevronDown className="h-4 w-4" aria-hidden />
				</button>
			)}
			<div id={id} hidden={enabled && mobile && !open}>
				{children}
			</div>
		</div>
	);
}
