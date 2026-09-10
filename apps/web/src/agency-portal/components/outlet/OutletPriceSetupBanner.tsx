import { useOutletPriceSetup } from "@agency-portal/hooks/use-outlet-price-setup";
import { OUTLET_PRICES_SECTION_ID } from "@agency-portal/lib/outlet-demo";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Tag } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

/**
 * Outlet -> Today: fill your prices before your first night.
 *
 * A venue that has just been approved lands here with a Workspace nobody has
 * filled, and nothing on the screen says so. It can be staffed in that state --
 * the shift posts, PRs arrive -- and only when somebody tries to log the sales
 * for the night does the missing price list become everyone's problem, by which
 * point the night is already being worked.
 *
 * THE WHOLE STRIP IS THE LINK (owner, 10 Sep 2026: "make the workspace banner
 * similar to the subscription one where i can click anywhere"). It used to be a
 * plain div with one link at the end, so most of a full-width banner did
 * nothing when clicked -- and it sits directly under a sibling where the same
 * click works, which is the kind of inconsistency that reads as a broken page.
 *
 * THE MISSING LISTS ARE CHIPS, not words inside a sentence. "Drinks, Tips,
 * Services still have no prices. Every night is priced from these lists -- the
 * drink and service lines on a shift, and the receipts your PRs sign." said
 * three things at one weight, and the two that matter -- WHICH lists, and go
 * here -- were the hardest to pick out. Chips are counted at a glance, and
 * shrink honestly to one when only one list is empty.
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

	return (
		<Link
			to="/outlet/workspace"
			hash={OUTLET_PRICES_SECTION_ID}
			className="iz-alert iz-alert--amber"
		>
			<span className="iz-alert__head">
				<Tag className="iz-alert__icon" aria-hidden />
				<span className="iz-alert__title">{t.today.pricesNotSetTitle}</span>
			</span>
			<span className="iz-alert__chips">
				{missing.map((item) => (
					<span className="iz-alert__chip" key={item}>
						{label[item]}
					</span>
				))}
			</span>
			<span className="iz-alert__meta">{t.today.pricesNotSetBody}</span>
			<span className="iz-alert__cta">
				{t.today.pricesGoToWorkspace}
				<ArrowUpRight className="h-3 w-3" aria-hidden />
			</span>
		</Link>
	);
}
