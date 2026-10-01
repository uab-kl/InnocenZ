import { agencyPathPermission } from "@agency-portal/lib/agency-rbac";
import type {
	OpsNotificationKind,
	OpsPortal,
} from "@agency-portal/lib/ops-notifications";
import type {
	NotificationKind,
	NotificationRecord,
} from "@/services/notification";

/**
 * What a stored notification LOOKS like in a bell, and where tapping it goes.
 *
 * Pure — no hooks, no router — so the rules are unit-tested. `use-notifications`
 * applies them to the rows the server returns.
 */

/** Which bell is asking. Only decides where a tap navigates to. */
export type NotificationAudience = OpsPortal | "admin" | "pr";

/**
 * A place in the portal: the page, and — when the page can take one — the ITEM
 * to open on it. A bare path opened the page and left the reader to find the
 * thing the notice was about (28 Sep 2026 audit: "notifications open a page,
 * not the item"). The `search` keys are the destination route's own
 * `validateSearch` keys; a value it does not know is dropped there, harmlessly.
 */
export interface NotificationTarget {
	href: string;
	search?: Record<string, string>;
}

/**
 * Backend kind → the kind the bells render. TOTAL over the backend enum
 * (`notification.model.ts`), which the compiler checks through
 * `NotificationKind`.
 *
 * The three billing notices share the "Subscription" chip and its bill icon:
 * the row's own title says which it is. `subscription_invoice_opened` used to
 * be missing from the union altogether, so a new bill fell through to `unknown`
 * — the generic bell icon and no link, which is how "bill notices have no icon
 * or link" reached the audit.
 */
const KIND_MAP: Record<NotificationKind, OpsNotificationKind> = {
	payment_voucher_issued: "pv_ready",
	payment_voucher_paid: "pv_paid",
	payment_voucher_dispute_resolved: "dispute_resolved",
	overtime_pending_approval: "overtime_pending",
	// Decided and pending share the "Overtime" chip; the body says which way.
	overtime_decided: "overtime_pending",
	shift_assigned: "shift_assigned",
	shift_cancelled: "shift_edit",
	// Shortened, not cancelled — still a change to the roster.
	shift_released_early: "shift_edit",
	agency_join_resolved: "agency_join_resolved",
	pr_rating_low: "pr_rating_low",
	cutlost_requested: "cutlost",
	cutlost_decided: "cutlost",
	shift_cover_needed: "shift_cover_needed",
	pv_day_review_pending: "pv_day_review_pending",
	leave_requested: "leave_requested",
	leave_decided: "leave_decided",
	// An agency's own free-text message: there is nothing to open.
	agency_broadcast: "unknown",
	subscription_tier_weekly: "subscription_tier_weekly",
	subscription_invoice_opened: "subscription_tier_weekly",
	subscription_autopay_failed: "subscription_tier_weekly",
};

/**
 * The map above is total over the kinds this build knows, and the compiler keeps
 * it that way. It is NOT total over what the server can send: `notification_kind`
 * is a DB enum that migrations extend, so an API paired with an older bundle
 * returns kinds absent from the union entirely. That is not theoretical — it is
 * what blanked the agency portal: an unmapped kind produced `undefined`, and
 * rendering it called `.startsWith` on that. Unknown kinds degrade to a
 * readable neutral row instead of taking the whole page down.
 */
export function opsKindFor(kind: NotificationKind): OpsNotificationKind {
	return KIND_MAP[kind] ?? "unknown";
}

/** A non-empty string off the payload, or null. */
function payloadText(record: NotificationRecord, key: string): string | null {
	const value = record.payload?.[key];
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The vouchers a day-review notice holds back. ONE opens that voucher; several
 * open the list filtered to what is waiting on review — the status every held
 * voucher had when the notice was written.
 */
function dayReviewTarget(record: NotificationRecord): NotificationTarget {
	const ids = record.payload?.voucherIds;
	const vouchers = Array.isArray(ids)
		? ids.filter((id): id is string => typeof id === "string" && id !== "")
		: [];
	if (vouchers.length === 1) {
		return { href: "/agency/pv", search: { pv: vouchers[0] } };
	}
	return { href: "/agency/pv", search: { status: "PENDING_REVIEW" } };
}

/**
 * Where tapping a notification should land. Undefined when there is nowhere
 * sensible to go — the bell then just marks it read, which beats navigating
 * somewhere that cannot show the thing.
 */
export function notificationTarget(
	record: NotificationRecord,
	audience: NotificationAudience,
): NotificationTarget | undefined {
	if (audience === "agency") {
		switch (record.kind) {
			case "payment_voucher_issued":
			case "payment_voucher_paid":
			case "payment_voucher_dispute_resolved": {
				const pv = payloadText(record, "voucherId");
				return pv
					? { href: "/agency/pv", search: { pv } }
					: { href: "/agency/pv" };
			}
			// The body says "Approve each day on Payroll & PV, then send" — so the
			// row lands on the voucher it is about.
			case "pv_day_review_pending":
				return dayReviewTarget(record);
			// Overtime is decided on Payroll's Overtime sub-tab, not the roster
			// this used to open — the claim was one page and one tab away.
			case "overtime_pending_approval":
				return { href: "/agency/pv", search: { tab: "overtime" } };
			// Cover is found on the roster's backfill list, which is where the
			// backend's own notification body tells the agency to go.
			case "shift_assigned":
			case "shift_cancelled":
			case "shift_released_early":
			case "shift_cover_needed":
				return { href: "/agency/roster" };
			case "agency_join_resolved":
				return { href: "/agency/pending" };
			// "Review it on Approvals → MC/Leaves": the tab, not the Approvals
			// page's first tab (Agency-Tied sign-ups), which is where it opened.
			case "leave_requested":
				return { href: "/agency/pending", search: { tab: "leaves" } };
			case "cutlost_requested":
				return { href: "/agency/pending", search: { tab: "cutlost" } };
			// The PR whose average dropped, opened on the PR list.
			case "pr_rating_low": {
				const pr = payloadText(record, "prId");
				return pr
					? { href: "/agency/prs", search: { pr } }
					: { href: "/agency/prs" };
			}
			// Every billing notice is about what this agency is billed, and
			// Subscription is the one screen that shows the bill and the rate card.
			case "subscription_tier_weekly":
			case "subscription_invoice_opened":
			case "subscription_autopay_failed":
				return { href: "/agency/subscription" };
			default:
				return undefined;
		}
	}
	if (audience === "outlet") {
		switch (record.kind) {
			// Owner and Finance are the only recipients, and both hold
			// settings:read, which is what `/outlet/subscription` asks for.
			case "subscription_invoice_opened":
			case "subscription_autopay_failed":
				return { href: "/outlet/subscription" };
			// The shift and its cut-loss both live on the floor (Today).
			case "shift_assigned":
			case "shift_cancelled":
			case "cutlost_decided":
				return { href: "/outlet" };
			default:
				return undefined;
		}
	}
	return undefined;
}

/**
 * ⚠️ A DESTINATION THE READER WILL BE LET INTO, or none at all.
 *
 * `notificationTarget` answers from the notification's SUBJECT; it has no idea
 * who is holding the phone. `pr_rating_low` lands on `/agency/prs`, which costs
 * `managePr` — Finance and Director hold neither, and both are notified. So the
 * row offered a trip the route guard refused: it bounced them to the agency
 * default route, and because the bell marks a row read on tap, the notification
 * was spent on a journey that never arrived.
 *
 * Asked through `agencyPathPermission` — the same map `canAccessAgencyPath`
 * reads — so this covers every agency destination and cannot drift from the
 * guard. `undefined` is the "nowhere sensible to go" answer: the bell then just
 * marks it read. The row was seen; it simply has no door.
 */
export function gateAgencyTarget(
	target: NotificationTarget | undefined,
	can: (permission: AgencyPermission) => boolean,
): NotificationTarget | undefined {
	if (!target) return undefined;
	const needed = agencyPathPermission(target.href);
	return !needed || can(needed) ? target : undefined;
}

/**
 * Read off the guard's own map rather than imported: `agency-rbac.ts` keeps
 * `Permission` private, and this is exactly the set a route can demand.
 */
type AgencyPermission = NonNullable<ReturnType<typeof agencyPathPermission>>;
