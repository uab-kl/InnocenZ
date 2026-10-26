import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/** Keep the filter controls mounted so closing the mobile disclosure preserves drafts. */
export function AdminFilters({
	children,
	title,
	className = "",
}: {
	children: ReactNode;
	title?: ReactNode;
	className?: string;
}) {
	const mobile = useIsMobile();
	const [open, setOpen] = useState(false);
	const id = useId();
	const { t } = usePortalLocale();
	return (
		<div className={`iz-admin-filters ${className}`}>
			{mobile && (
				<button
					type="button"
					className="iz-admin-filter-toggle"
					aria-expanded={open}
					aria-controls={id}
					onClick={() => setOpen(!open)}
				>
					<SlidersHorizontal aria-hidden className="size-4" />
					<span>{title ?? t.history.filterBy}</span>
					<ChevronDown
						aria-hidden
						className={open ? "size-4 rotate-180" : "size-4"}
					/>
				</button>
			)}
			<div id={id} hidden={mobile && !open} className="iz-admin-filter-fields">
				{children}
			</div>
		</div>
	);
}
