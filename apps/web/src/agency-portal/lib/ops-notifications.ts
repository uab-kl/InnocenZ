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

export function prTypeLabel(prType: SosIncident["prType"]): string {
	return "Agency-tied";
}
