/** InnocenZ admin portal notifications (hidden ops console) */

import type { OutletSubscriptionPlanId } from "@agency-portal/lib/outlet-demo";

export type AdminNotificationKind = "pos_integration_quote";

export interface AdminNotification {
	id: string;
	kind: AdminNotificationKind;
	title: string;
	body: string;
	at: string;
	read: boolean;
	href?: string;
	requestId?: string;
	outlet: string;
	contactLine?: string;
}

export type PosIntegrationQuoteRequestStatus = "pending" | "contacted";

export interface PosIntegrationQuoteRequest {
	id: string;
	outlet: string;
	ownerName: string;
	email: string;
	mobile: string;
	currentPlanId: OutletSubscriptionPlanId;
	at: string;
	status: PosIntegrationQuoteRequestStatus;
}

export function buildPosIntegrationAdminNotification(
	req: PosIntegrationQuoteRequest,
): AdminNotification {
	const contact = [req.ownerName, req.email || req.mobile]
		.filter(Boolean)
		.join(" · ");
	return {
		id: `admin-pos-${req.id}`,
		kind: "pos_integration_quote",
		title: "POS integration quote",
		body: `${req.outlet} requested POS sync pricing`,
		at: req.at,
		read: false,
		href: "/admin/subscriptions",
		requestId: req.id,
		outlet: req.outlet,
		contactLine: contact,
	};
}

export function adminNotificationKindLabel(
	kind: AdminNotificationKind,
): string {
	if (kind === "pos_integration_quote") return "POS integration";
	return "Admin alert";
}

export function pendingPosIntegrationQuoteRequests(
	requests: PosIntegrationQuoteRequest[],
): PosIntegrationQuoteRequest[] {
	return requests.filter((r) => r.status === "pending");
}
