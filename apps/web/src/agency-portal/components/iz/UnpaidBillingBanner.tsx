import { formatRM } from "@agency-portal/components/iz/ui";
import { useUnpaidBilling } from "@agency-portal/hooks/use-unpaid-billing";
import { formatDueDate } from "@agency-portal/lib/subscription-due";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowUpRight, CreditCard } from "lucide-react";
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
 * ONE ROW: LABEL, AMOUNT, DETAIL, WAY OUT (owner, 10 Sep 2026 -- simplify the
 * wording, then "the right side is very empty ... use the space efficiently"
 * and "try not to use so many font sizes"). It began as a number inside a
 * sentence -- "RM 250.00 is overdue across 2 billing periods. The oldest was
 * due 29 Aug 2026, 12 days overdue." -- set at the size of the words around it,
 * which in the outlet portal was also the size of the title: three facts at one
 * weight, and no way in. Stacking those facts fixed the reading order but left
 * two thirds of a full-bleed strip blank, so they now run across it in the
 * order you would say them, and the strip is a line tall instead of four.
 *
 * AMBER WHILE MERELY UNPAID; RED ONCE GENUINELY OVERDUE (owner, 8 Sep 2026:
 * "make it seem more serious").
 *
 * The original rule was amber-only, reasoning that amber means WAITING and red
 * is for disputes. That holds right up to the due date and no further: money
 * past its date is not waiting for anything, and the escalation is what keeps
 * the amber state meaningful. A banner that looks identical on day one and day
 * fifty-two is one nobody reads by day ten.
 *
 * It escalates on OVERDUE, never on the total -- the total includes the period
 * being used right now, which nobody is late with.
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

	if (!billing.backed || billing.isLoading || billing.periods === 0)
		return null;

	const late = billing.overdue;
	const isOverdue = late.count > 0;
	/* The lateness fragment, reusing the pair that already handles "1 day". */
	const lateness =
		late.oldestDaysOverdue === 1
			? t.subscription.overdueByOneDay
			: fill(t.subscription.overdueByDays, { n: late.oldestDaysOverdue });

	/*
	 * Overdue states the LATE amount, not the total: the total includes the
	 * period in use right now, which nobody is late with. Unchanged from the
	 * sentence version -- only where the figure is printed has moved.
	 */
	const amount = formatRM(isOverdue ? late.amountRm : billing.total);

	/*
	 * The single line under the figure. Calm variant names the period start when
	 * there is one; once something is overdue the DUE date is the actionable one
	 * and a period start says nothing about when payment was expected. Formatted
	 * either way -- this printed a raw `2026-08-16` before.
	 */
	const meta = isOverdue
		? late.count === 1
			? fill(t.subscription.billingOverdueOne, {
					date: formatDueDate(late.oldestDueIso),
					late: lateness,
				})
			: fill(t.subscription.billingOverdueMany, {
					n: late.count,
					date: formatDueDate(late.oldestDueIso),
					late: lateness,
				})
		: billing.oldestPeriodStart
			? billing.periods === 1
				? fill(t.subscription.billingDueOneSince, {
						date: formatDueDate(billing.oldestPeriodStart),
					})
				: fill(t.subscription.billingDueManySince, {
						n: billing.periods,
						date: formatDueDate(billing.oldestPeriodStart),
					})
			: billing.periods === 1
				? t.subscription.billingDueOne
				: fill(t.subscription.billingDueMany, { n: billing.periods });

	return (
		<Link
			to={portal === "agency" ? "/agency/subscription" : "/outlet/subscription"}
			className={`iz-alert ${isOverdue ? "iz-alert--red" : "iz-alert--amber"}`}
		>
			<span className="iz-alert__head">
				{isOverdue ? (
					<AlertTriangle className="iz-alert__icon" aria-hidden />
				) : (
					<CreditCard className="iz-alert__icon" aria-hidden />
				)}
				<span className="iz-alert__title">
					{isOverdue
						? t.subscription.billingOverdueTitle
						: t.subscription.billingDueTitle}
				</span>
			</span>
			<span className="iz-alert__figure iz-nums">{amount}</span>
			<span className="iz-alert__meta">{meta}</span>
			<span className="iz-alert__cta">
				{t.subscription.billingDueCta}
				<ArrowUpRight className="h-3 w-3" aria-hidden />
			</span>
		</Link>
	);
}
