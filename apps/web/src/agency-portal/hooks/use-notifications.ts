import { agencyPathPermission } from "@agency-portal/lib/agency-rbac";
import type {
	OpsNotification,
	OpsNotificationKind,
	OpsPortal,
} from "@agency-portal/lib/ops-notifications";
import { useAgencyCan } from "@agency-portal/lib/use-portal-can";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import {
	fetchNotifications,
	fetchUnreadCount,
	markNotificationRead,
	type NotificationKind,
	type NotificationRecord,
} from "@/services/notification";

const NOTIFICATION_KEY = ["notifications"] as const;

/**
 * Derived rather than imported: `agency-rbac.ts` keeps `Permission` private, and
 * the portal's other consumers (`pv-money-actions.ts`) read it off `agencyCan`
 * the same way. Taken from the hook so it stays the type the caller must pass.
 */
type AgencyPermission = Parameters<ReturnType<typeof useAgencyCan>>[0];

/** Which bell is asking. Only decides where a tap navigates to. */
export type NotificationAudience = OpsPortal | "admin" | "pr";

/**
 * Backend kind -> the kind the bells already know how to render. Three of these
 * were added to the union for this map rather than folding a real event into a
 * demo one that means something else.
 */
const KIND_MAP: Record<NotificationKind, OpsNotificationKind> = {
	payment_voucher_issued: "pv_ready",
	payment_voucher_dispute_resolved: "dispute_resolved",
	overtime_pending_approval: "overtime_pending",
	shift_assigned: "shift_assigned",
	shift_cancelled: "shift_edit",
	agency_join_resolved: "agency_join_resolved",
	pr_rating_low: "pr_rating_low",
	shift_cover_needed: "shift_cover_needed",
	pv_day_review_pending: "pv_day_review_pending",
	leave_requested: "leave_requested",
	leave_decided: "leave_decided",
	subscription_tier_weekly: "subscription_tier_weekly",
	// Same "Subscription" chip: the row's title carries "Automatic payment failed".
	subscription_autopay_failed: "subscription_tier_weekly",
};

/**
 * The map above is total over the kinds this build knows, and the compiler keeps
 * it that way. It is NOT total over what the server can send: `notification_kind`
 * is a DB enum that migrations extend, so an API paired with an older bundle
 * returns kinds absent from the union entirely. That is not theoretical — it is
 * what blanked the agency portal: an unmapped kind produced `undefined`, and
 * rendering it called `.startsWith` on that. Unknown kinds now degrade to a
 * readable neutral row instead of taking the whole page down.
 */
function opsKindFor(kind: NotificationKind): OpsNotificationKind {
	return KIND_MAP[kind] ?? "unknown";
}

/**
 * Where tapping a notification should land. Returns undefined when there is
 * nowhere sensible to go — the bell then just marks it read, which beats
 * navigating somewhere that cannot show the thing.
 */
function hrefFor(
	record: NotificationRecord,
	audience: NotificationAudience,
): string | undefined {
	if (audience === "agency") {
		switch (record.kind) {
			case "payment_voucher_issued":
			case "payment_voucher_dispute_resolved":
			// The body literally says "Approve each day on Payroll & PV, then
			// send" — so the row has to land there. It fell to `default` before
			// and returned undefined, which made the instruction a dead end.
			case "pv_day_review_pending":
				return "/agency/pv";
			case "overtime_pending_approval":
			case "shift_assigned":
			case "shift_cancelled":
			// Cover is found on the roster's backfill list, which is where the
			// backend's own notification body tells the agency to go.
			case "shift_cover_needed":
				return "/agency/roster";
			case "agency_join_resolved":
			// The body says "Review it on Approvals → MC/Leaves", so the row has
			// to land on Approvals. It opens on the Agency-Tied tab: `navigate`
			// is typed against the route union and `hrefFor` returns a bare path,
			// so the `?tab=leaves` deep link needs a search-aware href first.
			case "leave_requested":
				return "/agency/pending";
			// The rating that dropped belongs to a PR, so land on the PR list
			// rather than the roster.
			case "pr_rating_low":
				return "/agency/prs";
			// The statement is about what this agency is billed, and Subscription
			// is the only screen that shows the tier and the rate card together.
			// Payroll would be the wrong landing even though the count comes from
			// vouchers: the subject is the price, not any one PR's wages.
			case "subscription_tier_weekly":
			// The body says "pay it by FPX or e-wallet from Subscription, Payment
			// history" — the unpaid bill is there.
			case "subscription_autopay_failed":
				return "/agency/subscription";
			default:
				return undefined;
		}
	}
	if (audience === "outlet") {
		// Owner and Finance are the only recipients, and both hold settings:read,
		// which is what `/outlet/subscription` asks for — so this door opens.
		if (record.kind === "subscription_autopay_failed") return "/outlet/subscription";
		return record.kind === "shift_assigned" || record.kind === "shift_cancelled"
			? "/outlet"
			: undefined;
	}
	return undefined;
}

/**
 * ⚠️ A DESTINATION THE READER WILL BE LET INTO, or none at all.
 *
 * `hrefFor` above answers from the notification's SUBJECT; it has no idea who
 * is holding the phone. `pr_rating_low` lands on `/agency/prs`, which costs
 * `managePr` — Finance and Director hold neither, and both are notified. So the
 * row offered a trip the route guard refused: it bounced them to the agency
 * default route, and because the bell marks a row read on tap, the notification
 * was spent on a journey that never arrived.
 *
 * Asked through `agencyPathPermission` — the same map `canAccessAgencyPath`
 * reads — so this covers every agency destination, not just the one that was
 * found, and cannot drift from the guard. `undefined` is already this hook's
 * documented "nowhere sensible to go" answer: the bell then just marks it read,
 * which is right. The row was seen; it simply has no door.
 */
function gateAgencyHref(
	href: string | undefined,
	can: (permission: AgencyPermission) => boolean,
): string | undefined {
	if (!href) return undefined;
	const needed = agencyPathPermission(href);
	return !needed || can(needed) ? href : undefined;
}

/** "3:04 pm" for today, "12 Jul" otherwise — matches the demo rows' brevity. */
function displayTime(iso: string): string {
	const at = new Date(iso);
	if (Number.isNaN(at.getTime())) return "";
	const now = new Date();
	const sameDay =
		at.getFullYear() === now.getFullYear() &&
		at.getMonth() === now.getMonth() &&
		at.getDate() === now.getDate();
	return sameDay
		? at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
		: at.toLocaleDateString(undefined, { day: "numeric", month: "short" });
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
	// only consulted for the agency bell — see `gateAgencyHref`.
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

	const notifications = useMemo<OpsNotification[]>(() => {
		const rows = listQuery.data ?? [];
		return rows.map((record) => ({
			id: record.id,
			// `portal` is a demo-store routing field. A real row is already addressed
			// to this user, so it belongs to whichever bell is asking.
			portal: audience === "outlet" ? "outlet" : "agency",
			kind: opsKindFor(record.kind),
			title: record.title,
			body: record.body ?? "",
			at: displayTime(record.createdAt),
			read: record.readAt !== null,
			href:
				audience === "agency"
					? gateAgencyHref(hrefFor(record, audience), agencyCan)
					: hrefFor(record, audience),
		}));
	}, [listQuery.data, audience, agencyCan]);

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
