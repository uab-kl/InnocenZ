import { OutletSalesDashboard } from "@agency-portal/components/outlet/OutletSalesDashboard";
import {
	OutletEmptyState,
	OutletPage,
	OutletPageHeader,
} from "@agency-portal/components/outlet/outlet-portal-ui";
import { useStore } from "@agency-portal/lib/store";
import { useOutletCan } from "@agency-portal/lib/use-portal-can";
import { createFileRoute } from "@tanstack/react-router";
import { usePortalLocale } from "@/lib/portal-i18n/context";

export const Route = createFileRoute("/outlet/billing")({
	component: BillingPage,
});

function BillingPage() {
	const { t } = usePortalLocale();
	const outletName = useStore((s) => s.outletWorkspace.outletName);
	const showSales = useOutletCan()("viewSalesDashboard");

	return (
		<OutletPage>
			<OutletPageHeader
				eyebrow={outletName}
				title={t.reports.title}
				iconKey="Reports"
				hint={t.reports.subtitle}
			/>
			{showSales ? (
				<OutletSalesDashboard />
			) : (
				<OutletEmptyState>{t.reports.noAccess}</OutletEmptyState>
			)}
		</OutletPage>
	);
}
