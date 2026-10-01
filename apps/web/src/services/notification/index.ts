import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * The closed enum the backend writes. Mirrors
 * apps/backend/src/features/notification/notification.model.ts — ALL of it.
 *
 * It had fallen seven kinds behind, and the gap was not cosmetic: a kind
 * missing here maps to nothing, so a new bill (`subscription_invoice_opened`,
 * sent to every owner and finance member) and every cut-loss request reached
 * the bell as an unknown row with a generic icon and no link.
 * `notification-targets.ts` maps each one; the compiler holds that map total.
 */
export type NotificationKind =
	| "payment_voucher_issued"
	/** The voucher's money left the agency (0141). PR-addressed. */
	| "payment_voucher_paid"
	| "payment_voucher_dispute_resolved"
	| "overtime_pending_approval"
	/** The agency decided a PR's overtime claim. PR-addressed. */
	| "overtime_decided"
	| "shift_assigned"
	| "shift_cancelled"
	| "agency_join_resolved"
	| "pr_rating_low"
	/** A venue asked to cut a shift's cost — waiting on the agency (0098). */
	| "cutlost_requested"
	/** The agency answered that request. Outlet-addressed. */
	| "cutlost_decided"
	/** A PR was sent home early by an approved cut-loss. PR-addressed. */
	| "shift_released_early"
	| "shift_cover_needed"
	| "pv_day_review_pending"
	| "leave_requested"
	| "leave_decided"
	/** An agency's own free-text notice to its PRs. PR-addressed. */
	| "agency_broadcast"
	/** Agency-addressed weekly billing statement: PVs issued, and the resulting tier (0136). */
	| "subscription_tier_weekly"
	/** A new bill was opened for this organisation — outlet AND agency (0137). */
	| "subscription_invoice_opened"
	/** A saved card / Touch 'n Go charge for a bill was declined — pay it by hand (0166). */
	| "subscription_autopay_failed";

export interface NotificationRecord {
	id: string;
	userId: string;
	kind: NotificationKind;
	title: string;
	body: string | null;
	/** Whatever the reader needs to act on it, e.g. { voucherId } or { shiftId }. */
	payload: Record<string, unknown> | null;
	/** ISO timestamp, or null while unread. */
	readAt: string | null;
	createdAt: string;
}

interface ListResponse {
	success: boolean;
	message: string;
	data: NotificationRecord[];
}

interface CountResponse {
	success: boolean;
	message: string;
	data: { unread: number } | null;
}

interface MarkReadResponse {
	success: boolean;
	message: string;
	data: NotificationRecord | null;
}

/** Newest first. The server caps `limit` at 100 whatever we ask for. */
export async function fetchNotifications(
	params: { unreadOnly?: boolean; limit?: number },
	onRefreshFail: () => void,
): Promise<NotificationRecord[]> {
	const client = getClient(onRefreshFail);
	const queryString = buildQueryParams({
		unreadOnly: params.unreadOnly ? "true" : undefined,
		limit: params.limit,
	});
	const response = await client.get<ListResponse>(
		`/notification${queryString}`,
	);
	return response.data.data ?? [];
}

export async function fetchUnreadCount(
	onRefreshFail: () => void,
): Promise<number> {
	const client = getClient(onRefreshFail);
	const response = await client.get<CountResponse>(
		"/notification/unread-count",
	);
	return response.data.data?.unread ?? 0;
}

/**
 * Idempotent — marking an already-read notification read again is fine. A row
 * that is not the caller's 404s rather than 403s, so a failure here should be
 * treated as "gone", not "forbidden".
 */
export async function markNotificationRead(
	id: string,
	onRefreshFail: () => void,
): Promise<NotificationRecord | null> {
	const client = getClient(onRefreshFail);
	const response = await client.post<MarkReadResponse>(
		`/notification/${id}/read`,
	);
	return response.data.data ?? null;
}
