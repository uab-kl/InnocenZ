import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

/** The same controls stay mounted when the phone filter drawer is closed. */
export function RosterFilterDisclosure({
	label,
	activeCount,
	children,
}: {
	label: string;
	activeCount: number;
	children: ReactNode;
}) {
	const contentId = useId();
	const [open, setOpen] = useState(false);
	return (
		<div className="agency-roster-filter-disclosure" data-open={open}>
			<button
				type="button"
				className="agency-roster-filter-toggle"
				aria-expanded={open}
				aria-controls={contentId}
				onClick={() => setOpen((value) => !value)}
			>
				<span>{label}</span>
				{activeCount > 0 && (
					<span className="iz-roster-filterbar__badge">{activeCount}</span>
				)}
				<ChevronDown aria-hidden="true" />
			</button>
			<div id={contentId} className="agency-roster-filter-content">
				{children}
			</div>
		</div>
	);
}
