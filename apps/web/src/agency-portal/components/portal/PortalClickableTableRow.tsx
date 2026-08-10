import type { PrPvStatus } from "@agency-portal/lib/pr-demo";
import { useNavigate } from "@tanstack/react-router";
import type { KeyboardEvent, ReactNode } from "react";

type RowTarget =
	| { to: "/agency/prs"; search?: { pr?: string } }
	| { to: "/agency/pv"; search?: { pv?: string; status?: PrPvStatus } }
	// Mirrors the Approvals route's own `Tab` union — a value missing here is a
	// row that cannot deep-link to its tab, which is how MC/leave stayed absent.
	| {
			to: "/agency/pending";
			search?: { tab?: "signups" | "cutlost" | "leaves" };
	  }
	| { to: "/agency/roster" };

export function PortalClickableTableRow({
	target,
	children,
}: {
	target?: RowTarget;
	children: ReactNode;
}) {
	const navigate = useNavigate();

	if (!target) return <tr>{children}</tr>;

	const go = () => navigate(target);

	const onKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			go();
		}
	};

	return (
		<tr
			className="iz-portal-table-row--clickable"
			onClick={go}
			onKeyDown={onKeyDown}
			tabIndex={0}
			role="link"
		>
			{children}
		</tr>
	);
}
