/** Lightweight PR notification types — keep out of pr-features.ts so the
 * notification bell does not pull marketplace/demo modules into every SSR. */

export type PrNotificationKind =
	| "pv"
	| "assignment"
	| "application"
	| "swap"
	| "sos"
	| "special_service";

export interface PrNotification {
	id: string;
	kind: PrNotificationKind;
	title: string;
	body: string;
	at: string;
	read: boolean;
	/** When set, only this roster PR sees the notification in the host portal */
	prId?: string;
	/** Route target e.g. /host/history?tab=pv or pv id */
	href?: string;
	pvId?: string;
}

export function prNotificationsForRecipient(
	notifications: PrNotification[],
	prId: string,
): PrNotification[] {
	return notifications.filter((n) => !n.prId || n.prId === prId);
}
