import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard, IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import type {
	AdminNotification,
	AdminNotificationKind,
} from "@agency-portal/lib/admin-notifications";
import { useStore } from "@agency-portal/lib/store";
import { useNavigate } from "@tanstack/react-router";
import { Bell, Plug } from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";
import type { PortalTranslations } from "@/lib/portal-i18n/translations";

function kindIcon(kind: AdminNotificationKind) {
	if (kind === "pos_integration_quote") return Plug;
	return Bell;
}

/**
 * What the kind is CALLED, keyed on the stored enum.
 *
 * The record keys are `AdminNotificationKind` values and never move; only the
 * resolver's result does. A kind added server-side misses the map and falls
 * through to the generic label rather than rendering blank — the same posture
 * `adminNotificationKindLabel` in `lib/admin-notifications.ts` has today, which
 * is where this resolution would live if that module were in scope for this
 * pass. Consolidate the two the next time that file is opened.
 */
const ADMIN_KIND_LABEL: Record<string, (t: PortalTranslations) => string> = {
	pos_integration_quote: (t) => t.portalShell.adminKindPosIntegration,
};

function adminKindLabel(kind: AdminNotificationKind, t: PortalTranslations) {
	return ADMIN_KIND_LABEL[kind]?.(t) ?? t.portalShell.adminKindAlert;
}

export function AdminNotificationBell() {
	const { t } = usePortalLocale();
	const notifications = useStore((s) => s.adminNotifications);
	const markAdminNotificationRead = useStore(
		(s) => s.markAdminNotificationRead,
	);
	const [open, setOpen] = useState(false);
	const navigate = useNavigate();

	const unread = notifications.filter((n) => !n.read).length;

	const openNotification = (n: AdminNotification) => {
		markAdminNotificationRead(n.id);
		setOpen(false);
		if (n.href) {
			void navigate({ to: n.href });
		}
	};

	return (
		<>
			<button
				type="button"
				className="iz-topbar-action relative"
				title={t.portalShell.adminNotifications}
				aria-label={`${t.portalShell.adminNotifications}${unread ? `, ${unread} ${t.notifications.unreadSuffix}` : ""}`}
				onClick={() => setOpen(true)}
			>
				<Bell className="h-3.5 w-3.5" />
				{unread > 0 && (
					<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--iz-red)] px-0.5 text-[9px] font-bold text-white">
						{unread}
					</span>
				)}
			</button>

			<IzSheet open={open} onClose={() => setOpen(false)} variant="dialog">
				<IzCardTitle>{t.portalShell.adminNotifications}</IzCardTitle>
				<p className="iz-tiny iz-muted mt-1">
					{t.portalShell.adminNotificationsHint}
				</p>
				{notifications.length === 0 ? (
					<IzCard flat className="mt-3 text-center">
						<p className="iz-sm iz-muted py-6">{t.notifications.empty}</p>
					</IzCard>
				) : (
					<div className="mt-3 space-y-2">
						{notifications.map((n) => {
							const Icon = kindIcon(n.kind);
							return (
								<button
									key={n.id}
									type="button"
									className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
										n.read
											? "border-[var(--iz-line)] bg-[var(--iz-bg2)] opacity-80"
											: "border-[rgba(167,139,250,.35)] bg-[rgba(167,139,250,.08)]"
									}`}
									onClick={() => openNotification(n)}
								>
									<div className="flex items-start gap-2.5">
										<span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[rgba(167,139,250,.15)] text-[var(--iz-violet-l)]">
											<Icon className="h-4 w-4" />
										</span>
										<div className="min-w-0 flex-1">
											<div className="flex flex-wrap items-center gap-2">
												<p className="text-sm font-semibold text-[var(--iz-txt)]">
													{n.title}
												</p>
												{!n.read && (
													<IzPill variant="violet">
														{t.notifications.isNew}
													</IzPill>
												)}
											</div>
											<p className="iz-tiny iz-muted mt-0.5">{n.body}</p>
											{n.contactLine && (
												<p className="iz-tiny mt-1 text-[var(--iz-violet-l)]">
													{n.contactLine}
												</p>
											)}
											<p className="iz-tiny iz-muted2 mt-1">
												{adminKindLabel(n.kind, t)} · {n.at}
											</p>
										</div>
									</div>
								</button>
							);
						})}
					</div>
				)}
			</IzSheet>
		</>
	);
}
