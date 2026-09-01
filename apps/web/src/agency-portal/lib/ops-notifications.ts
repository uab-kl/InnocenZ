/** Agency & outlet portal notifications (SOS, ops alerts) */

import { outletMatches } from "@agency-portal/lib/portal-sync";

export type OpsPortal = "agency" | "outlet";

export type OpsNotificationKind =
	| "sos"
	| "shift_assigned"
	| "shift_edit"
	| "swap_update"
	| "check_in"
	| "pv_ready"
	| "pv_signed"
	| "pv_paid"
	| "dispute_raised"
	| "rating_prompt"
	| "reconciliation_due"
	| "report_ready"
	| "collection_reminder"
	| "special_service"
	| "receipt_self_log"
	// Backend-only kinds. These come off the `notification` table rather than the
	// demo store, and exist so a real row maps 1:1 instead of being squeezed into
	// a demo kind that means something else — a RESOLVED dispute is not the same
	// event as a raised one, and neither overtime nor a join decision is "roster".
	| "dispute_resolved"
	| "overtime_pending"
	| "agency_join_resolved"
	| "pr_rating_low"
	| "shift_cover_needed"
	// A week that did NOT go out because a day is held or unreviewed. Its own
	// kind rather than `pv_ready`: that one announces a voucher the PR can sign,
	// this one is the opposite — money stuck, and the agency has to act.
	| "pv_day_review_pending"
	// A PR asked to be excused from a shift. Its own kind rather than
	// `shift_cover_needed`: nobody is off yet and the shift is still staffed —
	// this is a decision to make, not a gap to fill.
	| "leave_requested"
	// The agency answered that request — approved or rejected. PR-addressed.
	| "leave_decided"
	// The agency's weekly subscription statement: PVs issued last payroll week
	// and the tier that volume put it on. Its own kind rather than `pv_ready`:
	// that announces one PR's voucher, this is the count of ALL of them read as
	// a bill, and it lands on Subscription rather than Payroll.
	| "subscription_tier_weekly"
	// Last resort for a row whose backend kind this build has never heard of.
	// The `notification_kind` DB enum grows by migration and a shared dev database
	// routinely runs ahead of the web app — mapping such a row to a neutral kind
	// keeps it readable instead of blanking the portal.
	| "unknown";

export interface SosIncident {
	id: string;
	at: string;
	note: string;
	photoDataUrl?: string;
	locationLabel: string;
	lat: number;
	lng: number;
	prId: string;
	prName: string;
	prIc: string;
	prType: "agency_tied";
	outlet: string;
	agencyName: string;
}

export interface OpsNotification {
	id: string;
	portal: OpsPortal;
	kind: OpsNotificationKind;
	title: string;
	body: string;
	at: string;
	read: boolean;
	href?: string;
	sosId?: string;
	pvId?: string;
	prName?: string;
	prType?: SosIncident["prType"];
	outlet?: string;
}

export const DEMO_SOS_LOCATION = {
	label: "Jalan Changkat, KL",
	lat: 3.1478,
	lng: 101.7005,
} as const;

export function opsNotificationsForPortal(
	notifications: OpsNotification[],
	portal: OpsPortal,
	outletName?: string,
): OpsNotification[] {
	return notifications.filter((n) => {
		if (n.portal !== portal) return false;
		if (
			portal === "outlet" &&
			n.outlet &&
			outletName &&
			n.kind !== "collection_reminder"
		) {
			if (!outletMatches(n.outlet, outletName)) return false;
		}
		return true;
	});
}

export function sosIncidentById(
	incidents: SosIncident[],
	id: string | undefined,
): SosIncident | undefined {
	if (!id) return undefined;
	return incidents.find((i) => i.id === id);
}

export function prTypeLabel(_prType: SosIncident["prType"]): string {
	return "Agency-tied";
}
