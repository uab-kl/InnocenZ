import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard, IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import { useNotifications } from "@agency-portal/hooks/use-notifications";
import { getPrRosterId } from "@agency-portal/lib/pr-demo";
import {
	type PrNotification,
	type PrNotificationKind,
	prNotificationsForRecipient,
} from "@agency-portal/lib/pr-features";
import { useStore } from "@agency-portal/lib/store";
import { usePrPortalReady } from "@agency-portal/lib/use-pr-sub-role";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Bell,
	Briefcase,
	RefreshCw,
	Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { NotificationKind } from "@/services/notification";

function prKindIcon(kind: PrNotificationKind) {
	if (kind === "sos") return AlertTriangle;
	if (kind === "pv") return Wallet;
	if (kind === "swap") return RefreshCw;
	return Briefcase;
}

/** Backend kind -> the kind this bell renders. */
const PR_KIND_MAP: Record<NotificationKind, PrNotificationKind> = {
	payment_voucher_issued: "pv",
	payment_voucher_dispute_resolved: "pv",
	shift_assigned: "assignment",
	shift_cancelled: "assignment",
	agency_join_resolved: "application",
	// Addressed to the agency, not the PR — mapped only so this map stays total.
	overtime_pending_approval: "assignment",
};

export function PrNotificationBell() {
	const { role: prSubRole } = usePrPortalReady();
	const allNotifications = useStore((s) => s.prNotifications);
	const demoNotifications = prNotificationsForRecipient(
		allNotifications,
		getPrRosterId(prSubRole),
	);
	const markPrNotificationRead = useStore((s) => s.markPrNotificationRead);
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();

	// Real session -> the `notification` table. No recipient filter needed: the
	// server already returns only what was addressed to this user, which is
	// stricter than the demo store's prId match.
	const backend = useNotifications("pr");
	const backendNotifications = useMemo<PrNotification[]>(
		() =>
			backend.records.map((record) => ({
				id: record.id,
				kind: PR_KIND_MAP[record.kind],
				title: record.title,
				body: record.body ?? "",
				at: new Date(record.createdAt).toLocaleString(undefined, {
					day: "numeric",
					month: "short",
					hour: "numeric",
					minute: "2-digit",
				}),
				read: record.readAt !== null,
				// Keeps the existing PV deep-link working for real rows.
				pvId:
					typeof record.payload?.voucherId === "string"
						? record.payload.voucherId
						: undefined,
			})),
		[backend.records],
	);

	const notifications = backend.backed
		? backendNotifications
		: demoNotifications;
	const unread = backend.backed
		? backend.unread
		: notifications.filter((n) => !n.read).length;

	const openNotification = (n: PrNotification) => {
		if (backend.backed) {
			backend.markRead(n.id);
		} else {
			markPrNotificationRead(n.id);
		}
		setOpen(false);
		if (n.pvId) {
			void navigate({ to: "/host/PaymentVoucher", search: { pvId: n.pvId } });
			return;
		}
		if (n.href) {
			void navigate({ to: n.href });
		}
	};

	return (
		<>
			<button
				type="button"
				className="iz-topbar-action relative"
				title="Notifications"
				aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
				onClick={() => setOpen(true)}
			>
				<Bell className="h-3.5 w-3.5" />
				{unread > 0 && (
					<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--iz-red)] px-0.5 text-[9px] font-bold text-white">
						{unread}
					</span>
				)}
			</button>

			<IzSheet open={open} onClose={() => setOpen(false)}>
				<IzCardTitle>Notifications</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3">
					Assignments, swaps, PVs, and SOS receipts — tap to open the screen.
				</p>
				{notifications.length === 0 ? (
					<p className="iz-sm iz-muted py-6 text-center">No notifications</p>
				) : (
					<div className="space-y-2">
						{notifications.map((n) => {
							const Icon = prKindIcon(n.kind);
							const urgent = n.kind === "sos";
							return (
								<button
									key={n.id}
									type="button"
									className="w-full text-left"
									onClick={() => openNotification(n)}
								>
									<IzCard
										flat
										className={
											urgent
												? n.read
													? "border-[rgba(255,107,107,.2)]"
													: "border-[rgba(255,107,107,.45)] bg-[var(--iz-red-bg)]"
												: n.read
													? ""
													: "border-[rgba(232,194,122,.35)]"
										}
									>
										<div className="iz-between gap-2">
											<span className="iz-sm font-bold flex items-center gap-1.5">
												<Icon
													className={`h-3.5 w-3.5 shrink-0${urgent ? " text-[var(--iz-red)]" : ""}`}
												/>
												{n.title}
											</span>
											{!n.read && (
												<IzPill variant={urgent ? "red" : "amber"}>New</IzPill>
											)}
										</div>
										<p className="iz-tiny iz-muted mt-1">{n.body}</p>
										<p className="iz-tiny iz-muted2 mt-1">{n.at}</p>
									</IzCard>
								</button>
							);
						})}
					</div>
				)}
				<Link
					to="/host/PaymentVoucher"
					className="iz-btn iz-btn-soft mt-3"
					onClick={() => setOpen(false)}
				>
					Open Payment
				</Link>
			</IzSheet>
		</>
	);
}
