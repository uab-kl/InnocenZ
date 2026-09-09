import { useOutletPriceSetup } from "@agency-portal/hooks/use-outlet-price-setup";
import { OUTLET_PRICES_SECTION_ID } from "@agency-portal/lib/outlet-demo";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * Outlet → Today: fill your prices before your first night.
 *
 * A venue that has just been approved lands here with a Workspace nobody has
 * filled, and nothing on the screen says so. It can be staffed in that state —
 * the shift posts, PRs arrive — and only when somebody tries to log the night's
 * sales does the missing price list become everyone's problem, by which point
 * the night is already being worked.
 *
 * Links to the `prices` anchor rather than the Workspace page alone: that hash
 * opens BOTH price lists (Drinks Price and Service Entitlement, which is where
 * the Tips row lives) and scrolls to the first, so the reminder lands the
 * operator on the fields it is talking about instead of the top of a long page.
 */
export function OutletPriceSetupBanner() {
	const { needsPrices, missing } = useOutletPriceSetup();
	const { t } = usePortalLocale();

	if (!needsPrices) return null;

	const label: Record<(typeof missing)[number], string> = {
		drinks: t.today.pricesDrinks,
		tips: t.today.pricesTips,
		services: t.today.pricesServices,
	};
	const names = missing.map((m) => label[m]).join(t.today.pricesListJoin);

	return (
		<div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3">
			<p className="text-sm font-semibold text-amber-300">
				{t.today.pricesNotSetTitle}
			</p>
			<p className="iz-tiny iz-muted mt-1">
				{fill(t.today.pricesNotSetBody, { items: names })}
			</p>
			<Link
				to="/outlet/workspace"
				hash={OUTLET_PRICES_SECTION_ID}
				className="iz-tiny mt-2 inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]"
			>
				{t.today.pricesGoToWorkspace}
				<ArrowUpRight className="h-3 w-3" aria-hidden />
			</Link>
		</div>
	);
}
