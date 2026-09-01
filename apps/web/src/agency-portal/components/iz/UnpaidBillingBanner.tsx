import { formatRM } from "@agency-portal/components/iz/ui";
import { useUnpaidBilling } from "@agency-portal/hooks/use-unpaid-billing";
import { Link } from "@tanstack/react-router";
import { CreditCard } from "lucide-react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { fill } from "@/lib/portal-i18n/fill";

/**
 * What this organisation owes InnocenZ, on the screen it actually lands on.
 *
 * Both portals mount this, because the gap it closes is the same on both: the
 * nightly job opens a billing period in silence and nothing tells the payer, so
 * the only way to learn a charge existed was to remember to open Subscription
 * and look. The notification raised alongside it reaches the bell; this reaches
 * the eye of anyone who signs in.
 *
 * AMBER, not red. The owner's colour code reads amber as WAITING and red as
 * disputed or deducted — an unpaid period is money waiting to be settled, not a
 * dispute, and painting it red would put it in the same visual class as a PR
 * contesting their wages.
 *
 * NO "PAY NOW" BUTTON, deliberately. No payment gateway is registered, so a pay
 * control here could not charge anything; offering one would be the screen
 * promising what the server cannot do. It states the debt and links to the page
 * that itemises it.
 *
 * HIDDEN AT ZERO and on demo sessions. A banner that is almost always present
 * teaches people to stop seeing it, and the whole point is to be noticed on the
 * day it appears.
 */
export function UnpaidBillingBanner({
	portal,
}: {
	portal: "outlet" | "agency";
}) {
	const { t } = usePortalLocale();
	const billing = useUnpaidBilling(portal);

	if (!billing.backed || billing.isLoading || billing.periods === 0) return null;

	return (
		<Link
			to={portal === "agency" ? "/agency/subscription" : "/outlet/subscription"}
			className="mb-3 block rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3 no-underline transition-colors hover:bg-amber-300/10"
		>
			<div className="flex items-center gap-2">
				<CreditCard className="h-4 w-4 shrink-0 text-amber-300" />
				<p className="text-sm font-semibold text-amber-300">
					{t.subscription.billingDueTitle}
				</p>
			</div>
			<p className="iz-tiny iz-muted mt-1">
				{billing.periods === 1
					? fill(t.subscription.billingDueOne, {
							amount: formatRM(billing.total),
						})
					: fill(t.subscription.billingDueMany, {
							amount: formatRM(billing.total),
							n: billing.periods,
						})}
				{billing.oldestPeriodStart
					? ` ${fill(t.subscription.billingDueSince, {
							date: billing.oldestPeriodStart,
						})}`
					: ""}
			</p>
			<span className="iz-tiny mt-2 inline-block underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]">
				{t.subscription.billingDueCta}
			</span>
		</Link>
	);
}
