import type { PrPvStatus } from "@agency-portal/lib/pr-demo";
import { useNavigate } from "@tanstack/react-router";
import type { KeyboardEvent, ReactNode } from "react";

type RowTarget =
	| { to: "/agency/prs"; search?: { pr?: string } }
	// Mirrors the Payroll route's own search schema. `tab` is here because three of
	// its four sub-tabs hold things that are NOT voucher statuses — a dispute, a
	// receipt, an overtime claim — so a row pointing at one of those with `status`
	// alone lands on the voucher list and reports that nothing matches.
	| {
			to: "/agency/pv";
			search?: {
				pv?: string;
				status?: PrPvStatus;
				tab?: "vouchers" | "receipts" | "disputes" | "overtime";
				// A specific receipt to land on. Absent here, a row could not carry
				// one and the link fell back to the whole week's list — the same way
				// a missing value in this union kept MC/leave from deep-linking.
				receipt?: string;
			};
	  }
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
