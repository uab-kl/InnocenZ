import type { PortalTranslations } from "@/lib/portal-i18n/translations";

/**
 * The line that says why a lane has no Pay on the outlet Subscription page —
 * or null for the one lane that pays.
 *
 * ⚠️ Keyed on `canPay`, not `canEdit`. The note used to render on `!canEdit`
 * alone, which covers Finance, Ops Head and Director; the GUARANTOR holds
 * `settings:update` (so it may change the plan) but not the money — "guarantor
 * no payment made like other member just see paid and unpaid" (owner, 12 Sep
 * 2026) — and saw no Pay and no reason for it. Every lane that cannot pay now
 * gets one.
 */
export function subscriptionReadOnlyNote(
	input: { canEdit: boolean; canPay: boolean; isFinance: boolean },
	t: PortalTranslations,
): string | null {
	if (input.canPay) return null;
	if (input.canEdit) return t.outletSubscription.guarantorReadOnly;
	return input.isFinance
		? t.outletSubscription.financeReadOnly
		: t.outletSubscription.memberReadOnly;
}
