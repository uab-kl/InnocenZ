import { localizeOpsNotification } from "@agency-portal/lib/notification-copy";
import {
	gateAgencyTarget,
	type NotificationAudience,
	notificationTarget,
	opsKindFor,
} from "@agency-portal/lib/notification-targets";
import type { OpsNotification } from "@agency-portal/lib/ops-notifications";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import { dateLocaleTag } from "@/lib/portal-i18n/date-label";
import {
	fetchNotifications,
	fetchUnreadCount,
	markNotificationRead,
	type NotificationRecord,
} from "@/services/notification";

export type { NotificationAudience } from "@agency-portal/lib/notification-targets";

const NOTIFICATION_KEY = ["notifications"] as const;

/**
 * "3:04 pm" for today, "12 Jul" otherwise — matches the demo rows' brevity.
 *
 * In the PORTAL's language (`dateLocaleTag`), not the browser's: `undefined`
 * here followed the machine, so a 中文 portal on an English browser stamped
 * every row "12 Jul".
 */
function displayTime(iso: string, localeTag: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return "";
	const now = new Date();
	const sameDay =
		at.getFullYear() === now.getFullYear() &&
		at.getMonth() === now.getMonth() &&
		at.getDate() === now.getDate();
	return sameDay
		? at.toLocaleTimeString(localeTag, { hour: "numeric", minute: "2-digit" })
		: at.toLocaleDateString(localeTag, { day: "numeric", month: "short" });
}

export interface UseNotificationsResult {
	/** False for demo sessions — the caller then falls back to its demo store. */
	backed: boolean;
	notifications: OpsNotification[];
	/** Unmapped rows, for bells whose render shape is not OpsNotification. */
	records: NotificationRecord[];
	unread: number;
	isLoading: boolean;
	markRead: (id: string) => void;
}

/**
 * The signed-in user's real notifications.
 *
 * Role-agnostic on purpose: the server returns whatever was addressed to THIS
 * user and takes no user id, so there is no tenant filter to apply here. The
 * `audience` argument only decides where a tap navigates to.
 *
 * Demo sessions get `backed: false` and no rows, so every bell keeps its
 * existing demo store as the fallback — same shape as useOutletHistory.
 */
export function useNotifications(
	audience: NotificationAudience,
): UseNotificationsResult {
	const { isAuthenticated, logout } = useAuth();
	const queryClient = useQueryClient();
	const backed = isAuthenticated;
	// Hooks cannot be conditional, so this is resolved for every audience and
	// only consulted for the agency bell — see `gateAgencyTarget`.
	const agencyCan = useAgencyCan();

	const listQuery = useQuery({
		queryKey: [...NOTIFICATION_KEY, "list"],
		queryFn: () => fetchNotifications({ limit: 50 }, logout),
		enabled: backed,
		// The bell is ambient — poll it rather than making every screen that
		// happens to trigger a notification remember to invalidate this key.
		staleTime: 30_000,
		refetchInterval: 60_000,
	});

	const countQuery = useQuery({
		queryKey: [...NOTIFICATION_KEY, "unread"],
		queryFn: () => fetchUnreadCount(logout),
		enabled: backed,
		staleTime: 30_000,
		refetchInterval: 60_000,
	});

	const markMutation = useMutation({
		mutationFn: (id: string) => markNotificationRead(id, logout),
		onSettled: () => {
			void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
		},
	});

	// The rows are stored English; each is re-worded in the portal's language
	// when drawn (`localizeOpsNotification` — anything it cannot rebuild stays as
	// stored). `t` and `locale` in the deps, so switching language re-draws them.
	const { t, locale } = usePortalLocale();

	const notifications = useMemo<OpsNotification[]>(() => {
		const rows = listQuery.data ?? [];
		return rows.map((record) => {
			const target =
				audience === "agency"
					? gateAgencyTarget(notificationTarget(record, audience), agencyCan)
					: notificationTarget(record, audience);
			const copy = localizeOpsNotification(record, t, locale);
			return {
				id: record.id,
				// `portal` is a demo-store routing field. A real row is already addressed
				// to this user, so it belongs to whichever bell is asking.
				portal: audience === "outlet" ? "outlet" : "agency",
				kind: opsKindFor(record.kind),
				title: copy.title,
				body: copy.body,
				at: displayTime(record.createdAt, dateLocaleTag(locale)),
				read: record.readAt !== null,
				href: target?.href,
				search: target?.search,
			};
		});
	}, [listQuery.data, audience, agencyCan, t, locale]);

	const markRead = useCallback(
		(id: string) => {
			// A 404 means the row is not ours or already gone; either way the
			// invalidate on settle brings the list back in line, so nothing to do.
			markMutation.mutate(id);
		},
		[markMutation],
	);

	return {
		backed,
		notifications,
		records: listQuery.data ?? [],
		unread: countQuery.data ?? 0,
		isLoading: listQuery.isLoading || countQuery.isLoading,
		markRead,
	};
}
