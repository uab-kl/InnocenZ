import { getClient } from "@/lib/axios-v1";
import { buildQueryParams } from "@/lib/build-query-params";

/**
 * The closed enum the backend writes. Mirrors
 * apps/backend/src/features/notification/notification.model.ts — a kind only
 * exists here once something actually raises it.
 */
export type NotificationKind =
	| "payment_voucher_issued"
	| "payment_voucher_dispute_resolved"
	| "overtime_pending_approval"
	| "shift_assigned"
	| "shift_cancelled"
	| "agency_join_resolved"
	| "pr_rating_low"
	| "shift_cover_needed"
	| "pv_day_review_pending";

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
