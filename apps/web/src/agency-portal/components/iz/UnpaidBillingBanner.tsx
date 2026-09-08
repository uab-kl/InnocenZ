import { formatRM } from "@agency-portal/components/iz/ui";
import { useUnpaidBilling } from "@agency-portal/hooks/use-unpaid-billing";
import { formatDueDate } from "@agency-portal/lib/subscription-due";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CreditCard } from "lucide-react";
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
 * AMBER WHILE MERELY UNPAID; RED ONCE GENUINELY OVERDUE (owner, 8 Sep 2026:
 * "make it seem more serious").
 *
 * The original rule was amber-only, reasoning that amber means WAITING and red
 * is for disputes. That holds right up to the due date and no further: money
 * past its date is not waiting for anything, and the escalation is what keeps
 * the amber state meaningful. A banner that looks identical on day one and day
 * fifty-two is one nobody reads by day ten.
 *
 * It escalates on OVERDUE, never on the total — the total includes the period
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

	return (
		<Link
			to={portal === "agency" ? "/agency/subscription" : "/outlet/subscription"}
			className={
				isOverdue
					? "mb-3 block rounded-xl border border-[rgba(240,138,138,.5)] bg-[rgba(240,138,138,.1)] px-4 py-3 no-underline transition-colors hover:bg-[rgba(240,138,138,.16)]"
					: "mb-3 block rounded-xl border border-amber-300/40 bg-amber-300/5 px-4 py-3 no-underline transition-colors hover:bg-amber-300/10"
			}
		>
			<div className="flex items-center gap-2">
				{isOverdue ? (
					<AlertTriangle className="h-4 w-4 shrink-0 text-[var(--iz-red)]" />
				) : (
					<CreditCard className="h-4 w-4 shrink-0 text-amber-300" />
				)}
				<p
					className={`text-sm font-bold ${
						isOverdue ? "text-[var(--iz-red)]" : "text-amber-300"
					}`}
				>
					{isOverdue
						? t.subscription.billingOverdueTitle
						: t.subscription.billingDueTitle}
				</p>
			</div>
			<p className="iz-tiny iz-muted mt-1">
				{isOverdue
					? late.count === 1
						? fill(t.subscription.billingOverdueOne, {
								amount: formatRM(late.amountRm),
								date: formatDueDate(late.oldestDueIso),
								late: lateness,
							})
						: fill(t.subscription.billingOverdueMany, {
								amount: formatRM(late.amountRm),
								n: late.count,
								date: formatDueDate(late.oldestDueIso),
								late: lateness,
							})
					: billing.periods === 1
						? fill(t.subscription.billingDueOne, {
								amount: formatRM(billing.total),
							})
						: fill(t.subscription.billingDueMany, {
								amount: formatRM(billing.total),
								n: billing.periods,
							})}
				{/* Only on the calm variant. Once something is overdue the sentence
				    above already names the DUE date, which is the actionable one; a
				    period START date says nothing about when payment was expected.
				    Formatted either way — this printed a raw `2026-08-16` before. */}
				{!isOverdue && billing.oldestPeriodStart
					? ` ${fill(t.subscription.billingDueSince, {
							date: formatDueDate(billing.oldestPeriodStart),
						})}`
					: ""}
			</p>
			<span className="iz-tiny mt-2 inline-block underline decoration-dotted underline-offset-2 hover:text-[var(--iz-gold)]">
				{t.subscription.billingDueCta}
			</span>
		</Link>
	);
}
