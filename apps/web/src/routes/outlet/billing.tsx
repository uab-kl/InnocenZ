import { OutletSalesDashboard } from "@agency-portal/components/outlet/OutletSalesDashboard";
import {
	OutletEmptyState,
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/outlet/billing")({
	component: BillingPage,
});

function BillingPage() {
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	const showSales = useOutletCan()("viewSalesDashboard");

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title="Reports"
				hint="Weekly earnings, P&L split & top PRs"
			/>
			{showSales ? (
				<OutletSalesDashboard />
			) : (
				<OutletEmptyState>
					You do not have access to outlet reports.
				</OutletEmptyState>
			)}
		</OutletPage>
	);
}
