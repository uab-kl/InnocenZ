/**
 * Cross-role in-app push notifications (X.4) — PR, Agency, Outlet.
 * Prototype: Zustand store delivery + bell UI deep-links (no FCM/APNS).
 */

import type {
	OpsNotification,
	OpsPortal,
	SosIncident,
} from "@agency-portal/lib/ops-notifications";
import type { PrNotification } from "@agency-portal/lib/pr-features";

export type PushEventType =
	| "shift_assigned"
	| "shift_edit"
	| "swap_update"
	| "check_in"
	| "sos"
	| "pv_ready"
	| "pv_sent"
	| "pv_signed"
	| "pv_paid"
	| "dispute_raised"
	| "rating_prompt"
	| "reconciliation_due"
	| "report_ready"
	| "collection_reminder"
	| "special_service_requested"
	| "special_service_update"
	| "receipt_self_log"
	| "receipt_self_log_verified";

export type PushAudience = "pr" | "agency" | "outlet";

/** Per-role toggles — all on by default in demo */
export type NotificationPrefs = Record<
	PushEventType,
	Record<PushAudience, boolean>
>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
	shift_assigned: { pr: true, agency: true, outlet: false },
	shift_edit: { pr: true, agency: true, outlet: false },
	swap_update: { pr: true, agency: true, outlet: false },
	check_in: { pr: false, agency: true, outlet: true },
	sos: { pr: true, agency: true, outlet: true },
	pv_ready: { pr: true, agency: true, outlet: false },
	pv_sent: { pr: true, agency: false, outlet: false },
	pv_signed: { pr: true, agency: true, outlet: false },
	pv_paid: { pr: true, agency: true, outlet: false },
	dispute_raised: { pr: true, agency: true, outlet: true },
	rating_prompt: { pr: false, agency: false, outlet: true },
	reconciliation_due: { pr: false, agency: true, outlet: true },
	report_ready: { pr: false, agency: true, outlet: true },
	collection_reminder: { pr: false, agency: false, outlet: true },
	special_service_requested: { pr: true, agency: true, outlet: true },
	special_service_update: { pr: true, agency: true, outlet: true },
	receipt_self_log: { pr: false, agency: true, outlet: false },
	receipt_self_log_verified: { pr: true, agency: false, outlet: false },
};

export function notificationStamp(): string {
	return new Date().toLocaleString("en-MY", {
		day: "numeric",
		month: "short",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function nid(prefix: string) {
	return `${prefix}-${Date.now().toString(36)}`;
}

export type PushEvent =
	| {
			type: "shift_assigned";
			prId: string;
			prName: string;
			outlet: string;
			detail?: string;
	  }
	| {
			type: "shift_edit";
			prId: string;
			prName: string;
			outlet: string;
			detail: string;
	  }
	| {
			type: "swap_update";
			prId?: string;
			prName: string;
			outlet: string;
			status:
				| "pending"
				| "approved"
				| "declined"
				| "offer"
				| "replacement_declined";
			requestingPrName?: string;
			reason?: string;
			notifyPr?: boolean;
			notifyAgency?: boolean;
	  }
	| {
			type: "check_in";
			prId: string;
			prName: string;
			outlet: string;
			late?: boolean;
	  }
	| { type: "sos"; incident: SosIncident }
	| {
			type: "pv_ready";
			pvId: string;
			prId: string;
			prName: string;
			net: number;
			outlet: string;
	  }
	| { type: "pv_sent"; pvId: string; prId: string; prName: string; net: number }
	| { type: "pv_signed"; pvId: string; prName: string; net: number }
	| { type: "pv_paid"; pvId: string; prId: string; prName: string; net: number }
	| { type: "dispute_raised"; pvId: string; prName: string; outlet: string }
	| {
			type: "rating_prompt";
			prId?: string;
			prName: string;
			outlet: string;
			audience: "outlet";
	  }
	| { type: "reconciliation_due"; outlet: string }
	| { type: "report_ready"; portal: OpsPortal; label: string }
	| {
			type: "collection_reminder";
			collectionId: string;
			outlet: string;
			amount: number;
			dueDate: string;
	  }
	| {
			type: "special_service_requested";
			orderId: string;
			serviceLabel: string;
			initiatedBy: "agency" | "outlet" | "pr";
			prId?: string;
			prName: string;
			outlet: string;
			notifyAgency?: boolean;
			notifyPr?: boolean;
			notifyOutlet?: boolean;
	  }
	| {
			type: "special_service_update";
			orderId: string;
			serviceLabel: string;
			status: "accepted" | "declined" | "confirmed" | "rejected";
			prId?: string;
			prName: string;
			outlet: string;
			by: "agency" | "outlet" | "pr" | "admin";
			notifyAgency?: boolean;
			notifyPr?: boolean;
			notifyOutlet?: boolean;
	  }
	| {
			type: "receipt_self_log";
			scanId: string;
			receiptRef: string;
			prId: string;
			prName: string;
			outlet: string;
			amount: number;
			category: string;
	  }
	| {
			type: "receipt_self_log_verified";
			scanId: string;
			prId: string;
			prName: string;
			approved: boolean;
			amount: number;
	  };

export interface PushNotifyInput {
	prNotifications: PrNotification[];
	opsNotifications: OpsNotification[];
	notificationPrefs: NotificationPrefs;
}

export interface PushNotifyResult {
	prNotifications: PrNotification[];
	opsNotifications: OpsNotification[];
}

function prefOn(
	prefs: NotificationPrefs,
	type: PushEventType,
	audience: PushAudience,
): boolean {
	return prefs[type]?.[audience] ?? true;
}

function prependPr(
	n: PrNotification,
	list: PrNotification[],
): PrNotification[] {
	return [n, ...list];
}

function prependOps(
	n: OpsNotification,
	list: OpsNotification[],
): OpsNotification[] {
	return [n, ...list];
}

function rm(amount: number) {
	return amount.toLocaleString("en-MY", { style: "currency", currency: "MYR" });
}

/** Apply one push event → updated notification arrays */
export function applyPushEvent(
	state: PushNotifyInput,
	event: PushEvent,
): PushNotifyResult {
	const at = notificationStamp();
	const prefs = state.notificationPrefs;
	let prNotifications = state.prNotifications;
	let opsNotifications = state.opsNotifications;

	switch (event.type) {
		case "shift_assigned": {
			if (prefOn(prefs, "shift_assigned", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("n-assign"),
						kind: "assignment",
						title: "Shift assigned",
						body: event.detail ?? `${event.outlet} — confirm on Shifts home`,
						at,
						read: false,
						prId: event.prId,
						href: "/host",
					},
					prNotifications,
				);
			}
			if (prefOn(prefs, "shift_assigned", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-assign"),
						portal: "agency",
						kind: "shift_assigned",
						title: `Assignment · ${event.prName}`,
						body: `Shift at ${event.outlet} — awaiting PR confirm`,
						at,
						read: false,
						href: "/agency/roster",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "shift_edit": {
			if (prefOn(prefs, "shift_edit", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("n-edit"),
						kind: "assignment",
						title: "Shift updated",
						body: `${event.outlet}: ${event.detail}`,
						at,
						read: false,
						prId: event.prId,
						href: "/host",
					},
					prNotifications,
				);
			}
			if (prefOn(prefs, "shift_edit", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-edit"),
						portal: "agency",
						kind: "shift_edit",
						title: `Roster edit · ${event.prName}`,
						body: `${event.outlet}: ${event.detail}`,
						at,
						read: false,
						href: "/agency/roster",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "swap_update": {
			const statusLabel =
				event.status === "approved"
					? "approved"
					: event.status === "declined"
						? "declined"
						: event.status === "offer"
							? "coverage offer"
							: event.status === "replacement_declined"
								? "replacement declined"
								: "pending";
			if (
				event.notifyPr !== false &&
				prefOn(prefs, "swap_update", "pr") &&
				event.prId
			) {
				const title =
					event.status === "offer"
						? "Swap coverage offer"
						: event.status === "replacement_declined"
							? "Swap update"
							: `Swap ${statusLabel}`;
				const body =
					event.status === "offer"
						? `${event.requestingPrName ?? "A PR"} needs cover at ${event.outlet} — accept or decline on Shifts`
						: event.status === "approved"
							? `${event.outlet} — coverage confirmed`
							: `${event.outlet} — ${event.prName}`;
				prNotifications = prependPr(
					{
						id: nid("n-swap"),
						kind: "swap",
						title,
						body,
						at,
						read: false,
						prId: event.prId,
						href: "/host",
					},
					prNotifications,
				);
			}
			if (
				event.notifyAgency !== false &&
				prefOn(prefs, "swap_update", "agency")
			) {
				const agencyTitle =
					event.status === "replacement_declined"
						? "Replacement declined swap"
						: event.status === "offer"
							? "Swap offer sent"
							: `Swap ${statusLabel}`;
				const agencyBody =
					event.status === "replacement_declined"
						? `${event.prName} declined cover for ${event.requestingPrName ?? "PR"} · ${event.outlet}${event.reason ? ` — “${event.reason}”` : ""}`
						: event.status === "offer"
							? `${event.prName} offered cover for ${event.requestingPrName ?? "PR"} · ${event.outlet}`
							: `${event.prName} · ${event.outlet}`;
				opsNotifications = prependOps(
					{
						id: nid("ops-swap"),
						portal: "agency",
						kind: "swap_update",
						title: agencyTitle,
						body: agencyBody,
						at,
						read: false,
						href: "/agency/roster",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "check_in": {
			const body = `${event.prName} checked in${event.late ? " (late)" : ""}`;
			if (prefOn(prefs, "check_in", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-checkin"),
						portal: "agency",
						kind: "check_in",
						title: "Check-in confirmed",
						body: `${body} · ${event.outlet}`,
						at,
						read: false,
						href: "/agency/roster",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (prefOn(prefs, "check_in", "outlet")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-checkin-out"),
						portal: "outlet",
						kind: "check_in",
						title: "PR on floor",
						body: body,
						at,
						read: false,
						href: "/outlet",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "sos": {
			const { incident } = event;
			const typeLabel = "Agency-tied";
			if (prefOn(prefs, "sos", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("n-sos"),
						kind: "sos",
						title: "SOS sent",
						body: incident.note.slice(0, 80),
						at,
						read: true,
						prId: incident.prId,
					},
					prNotifications,
				);
			}
			if (prefOn(prefs, "sos", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-sos-ag"),
						portal: "agency",
						kind: "sos",
						title: `SOS · ${incident.prName}`,
						body: `${typeLabel} at ${incident.outlet} — ${incident.note.slice(0, 100)}`,
						at,
						read: false,
						href: "/agency/roster",
						sosId: incident.id,
						prName: incident.prName,
						prType: incident.prType,
						outlet: incident.outlet,
					},
					opsNotifications,
				);
			}
			if (prefOn(prefs, "sos", "outlet")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-sos-out"),
						portal: "outlet",
						kind: "sos",
						title: `SOS · ${incident.prName}`,
						body: `Duty manager alert — ${incident.note.slice(0, 100)}`,
						at,
						read: false,
						href: "/outlet",
						sosId: incident.id,
						prName: incident.prName,
						prType: incident.prType,
						outlet: incident.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "pv_ready":
		case "pv_sent": {
			const title =
				event.type === "pv_sent" ? "PV ready for review" : "Shift PV generated";
			if (
				prefOn(prefs, event.type === "pv_sent" ? "pv_sent" : "pv_ready", "pr")
			) {
				prNotifications = prependPr(
					{
						id: nid("n-pv"),
						kind: "pv",
						title,
						body: `${event.pvId} · ${rm(event.net)} net — Finance Head pre-signed`,
						at,
						read: false,
						prId: event.prId,
						pvId: event.pvId,
						href: "/host/PaymentVoucher",
					},
					prNotifications,
				);
			}
			if (event.type === "pv_ready" && prefOn(prefs, "pv_ready", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-pv"),
						portal: "agency",
						kind: "pv_ready",
						title: `PV raised · ${event.prName}`,
						body: `${event.pvId} · ${event.outlet} · ${rm(event.net)}`,
						at,
						read: false,
						href: "/agency/pv",
						pvId: event.pvId,
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "pv_signed": {
			if (prefOn(prefs, "pv_signed", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-pv-sign"),
						portal: "agency",
						kind: "pv_signed",
						title: `PR signed · ${event.prName}`,
						body: `${event.pvId} · ${rm(event.net)} — queued for Friday transfer`,
						at,
						read: false,
						href: "/agency/pv",
						pvId: event.pvId,
						prName: event.prName,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "pv_paid": {
			if (prefOn(prefs, "pv_paid", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("n-paid"),
						kind: "pv",
						title: "Payment received",
						body: `${event.pvId} · ${rm(event.net)} in your bank`,
						at,
						read: false,
						prId: event.prId,
						pvId: event.pvId,
						href: "/host/PaymentVoucher",
					},
					prNotifications,
				);
			}
			if (prefOn(prefs, "pv_paid", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-paid"),
						portal: "agency",
						kind: "pv_paid",
						title: `Paid · ${event.prName}`,
						body: `${event.pvId} · ${rm(event.net)} transferred`,
						at,
						read: false,
						href: "/agency/pv",
						pvId: event.pvId,
						prName: event.prName,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "dispute_raised": {
			if (prefOn(prefs, "dispute_raised", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("n-dispute"),
						kind: "pv",
						title: "Dispute submitted",
						body: `${event.pvId} held — agency verifying with ${event.outlet}`,
						at,
						read: true,
						pvId: event.pvId,
						href: "/host/PaymentVoucher",
					},
					prNotifications,
				);
			}
			if (prefOn(prefs, "dispute_raised", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-dispute"),
						portal: "agency",
						kind: "dispute_raised",
						title: `Dispute · ${event.prName}`,
						body: `${event.pvId} at ${event.outlet} — 7 days to resolve`,
						at,
						read: false,
						href: "/agency/pv",
						pvId: event.pvId,
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (prefOn(prefs, "dispute_raised", "outlet")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-dispute-out"),
						portal: "outlet",
						kind: "dispute_raised",
						title: `PV dispute · ${event.prName}`,
						body: `${event.pvId} — agency may contact you to verify`,
						at,
						read: false,
						href: "/outlet/billing",
						pvId: event.pvId,
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "rating_prompt": {
			if (
				event.audience === "outlet" &&
				prefOn(prefs, "rating_prompt", "outlet")
			) {
				opsNotifications = prependOps(
					{
						id: nid("ops-rate"),
						portal: "outlet",
						kind: "rating_prompt",
						title: "Rate your PRs",
						body: `${event.prName} · ${event.outlet} — post-seal window`,
						at,
						read: false,
						href: "/outlet/history",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "reconciliation_due": {
			if (prefOn(prefs, "reconciliation_due", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-recon-ag"),
						portal: "agency",
						kind: "reconciliation_due",
						title: "Reconciliation due",
						body: `Confirm today's figures vs ${event.outlet} sales`,
						at,
						read: false,
						href: "/agency/pv",
					},
					opsNotifications,
				);
			}
			if (prefOn(prefs, "reconciliation_due", "outlet")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-recon-out"),
						portal: "outlet",
						kind: "reconciliation_due",
						title: "End-of-week reconciliation",
						body: "Review sealed totals vs live sales",
						at,
						read: false,
						href: "/outlet",
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "collection_reminder": {
			if (prefOn(prefs, "collection_reminder", "outlet")) {
				const amountLabel = `RM ${event.amount.toLocaleString("en-MY", {
					minimumFractionDigits: 2,
					maximumFractionDigits: 2,
				})}`;
				opsNotifications = prependOps(
					{
						id: nid("ops-col-remind"),
						portal: "outlet",
						kind: "collection_reminder",
						title: "Payment reminder · Atlas Agency",
						body: `${event.outlet}: ${amountLabel} due ${event.dueDate} · ${event.collectionId}`,
						at,
						read: false,
						href: "/outlet/billing",
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "report_ready": {
			if (prefOn(prefs, "report_ready", event.portal)) {
				opsNotifications = prependOps(
					{
						id: nid("ops-report"),
						portal: event.portal,
						kind: "report_ready",
						title: "Report ready",
						body: event.label,
						at,
						read: false,
						href: event.portal === "agency" ? "/agency/pv" : "/outlet/billing",
					},
					opsNotifications,
				);
			}
			break;
		}
		case "special_service_requested": {
			if (
				event.notifyAgency &&
				prefOn(prefs, "special_service_requested", "agency")
			) {
				opsNotifications = prependOps(
					{
						id: nid("ops-ss-req-ag"),
						portal: "agency",
						kind: "special_service",
						title: "Job posting request",
						body: `${event.serviceLabel} · ${event.prName} · ${event.outlet}`,
						at,
						read: false,
						href: "/agency/special-service",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (
				event.notifyOutlet &&
				prefOn(prefs, "special_service_requested", "outlet")
			) {
				opsNotifications = prependOps(
					{
						id: nid("ops-ss-req-out"),
						portal: "outlet",
						kind: "special_service",
						title: "Agency service booking",
						body: `${event.serviceLabel} for ${event.prName} — accept or decline`,
						at,
						read: false,
						href: "/outlet/bookings?tab=services",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (
				event.notifyPr &&
				event.prId &&
				prefOn(prefs, "special_service_requested", "pr")
			) {
				const prBody =
					event.initiatedBy === "outlet"
						? `${event.outlet} requested ${event.serviceLabel} for you — accept or decline`
						: event.initiatedBy === "agency"
							? `Agency booked ${event.serviceLabel} at ${event.outlet} — accept or decline`
							: `${event.serviceLabel} at ${event.outlet} — accept or decline`;
				prNotifications = prependPr(
					{
						id: nid("pr-ss-req"),
						kind: "special_service",
						title:
							event.initiatedBy === "outlet"
								? "Outlet service request"
								: "Agency service booking",
						body: prBody,
						at,
						read: false,
						prId: event.prId,
						href: "/host?view=services",
					},
					prNotifications,
				);
			}
			break;
		}
		case "special_service_update": {
			const body =
				event.status === "confirmed"
					? `${event.serviceLabel} confirmed for ${event.prName}`
					: event.status === "accepted"
						? `${event.serviceLabel} accepted`
						: `${event.serviceLabel} declined`;
			if (
				event.notifyAgency &&
				prefOn(prefs, "special_service_update", "agency")
			) {
				opsNotifications = prependOps(
					{
						id: nid("ops-ss-up-ag"),
						portal: "agency",
						kind: "special_service",
						title: "Job posting update",
						body,
						at,
						read: false,
						href: "/agency/special-service",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (
				event.notifyOutlet &&
				prefOn(prefs, "special_service_update", "outlet")
			) {
				opsNotifications = prependOps(
					{
						id: nid("ops-ss-up-out"),
						portal: "outlet",
						kind: "special_service",
						title: "Job posting update",
						body,
						at,
						read: false,
						href: "/outlet/bookings?tab=services",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			if (
				event.notifyPr &&
				event.prId &&
				prefOn(prefs, "special_service_update", "pr")
			) {
				prNotifications = prependPr(
					{
						id: nid("pr-ss-up"),
						kind: "special_service",
						title: "Job posting update",
						body,
						at,
						read: false,
						prId: event.prId,
						href: "/host?view=services",
					},
					prNotifications,
				);
			}
			break;
		}
		case "receipt_self_log": {
			if (prefOn(prefs, "receipt_self_log", "agency")) {
				opsNotifications = prependOps(
					{
						id: nid("ops-selflog"),
						portal: "agency",
						kind: "receipt_self_log",
						title: `Self-log · ${event.prName}`,
						body: `${event.category} RM ${event.amount.toFixed(2)} at ${event.outlet} — verify manual entry (${event.receiptRef})`,
						at,
						read: false,
						href: "/agency/pv",
						prName: event.prName,
						outlet: event.outlet,
					},
					opsNotifications,
				);
			}
			break;
		}
		case "receipt_self_log_verified": {
			if (prefOn(prefs, "receipt_self_log_verified", "pr")) {
				prNotifications = prependPr(
					{
						id: nid("pr-selflog-v"),
						kind: "assignment",
						title: event.approved ? "Self-log verified" : "Self-log rejected",
						body: event.approved
							? `Agency approved your manual receipt log · RM ${event.amount.toFixed(2)}`
							: `Agency rejected your manual receipt log · RM ${event.amount.toFixed(2)} — contact agency`,
						at,
						read: false,
						prId: event.prId,
						href: "/host/tonight",
					},
					prNotifications,
				);
			}
			break;
		}
	}

	return { prNotifications, opsNotifications };
}

export const OPS_KIND_LABEL: Record<OpsNotification["kind"], string> = {
	sos: "SOS",
	shift_assigned: "Assignment",
	shift_edit: "Roster",
	swap_update: "Swap",
	check_in: "Check-in",
	pv_ready: "PV",
	pv_signed: "PV signed",
	pv_paid: "Paid",
	dispute_raised: "Dispute",
	rating_prompt: "Rating",
	reconciliation_due: "Reconciliation",
	report_ready: "Report",
	collection_reminder: "Invoice due",
	special_service: "Job posting",
	receipt_self_log: "Self-log",
	dispute_resolved: "Dispute resolved",
	overtime_pending: "Overtime",
	agency_join_resolved: "Agency",
	pr_rating_low: "Rating drop",
	shift_cover_needed: "Cover needed",
	pv_day_review_pending: "Day review",
	unknown: "Update",
};

export function isUrgentOpsKind(kind: OpsNotification["kind"]): boolean {
	return kind === "sos" || kind === "dispute_raised";
}
