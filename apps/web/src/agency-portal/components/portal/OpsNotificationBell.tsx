import { IzSheet } from "@agency-portal/components/iz/Sheet";
import { IzCard, IzCardTitle, IzPill } from "@agency-portal/components/iz/ui";
import { useNotifications } from "@agency-portal/hooks/use-notifications";
import {
	type OpsNotification,
	type OpsNotificationKind,
	type OpsPortal,
	opsNotificationsForPortal,
	prTypeLabel,
	sosIncidentById,
} from "@agency-portal/lib/ops-notifications";
import {
	isUrgentOpsKind,
	OPS_KIND_LABEL,
} from "@agency-portal/lib/push-notifications";
import { useStore } from "@agency-portal/lib/store";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AlertTriangle,
	Bell,
	CalendarCheck,
	ClipboardList,
	FileText,
	MapPin,
	Star,
	Wallet,
} from "lucide-react";
import { useState } from "react";
import { usePortalLocale } from "@/lib/portal-i18n/context";

function kindIcon(kind: OpsNotificationKind) {
	if (kind === "sos") return AlertTriangle;
	if (kind === "check_in") return MapPin;
	if (kind === "rating_prompt" || kind === "pr_rating_low") return Star;
	// Guarded rather than trusting the parameter type: this line is what took the
	// agency portal down when an unmapped backend kind arrived here as undefined.
	if (typeof kind === "string" && kind.startsWith("pv")) return Wallet;
	if (kind === "report_ready") return FileText;
	if (kind === "reconciliation_due") return ClipboardList;
	if (kind === "collection_reminder") return Wallet;
	if (kind === "unknown") return Bell;
	return CalendarCheck;
}

export function OpsNotificationBell({ portal }: { portal: OpsPortal }) {
	const outletOrgName = useStore((s) => s.outletOwner.orgName);
	const allNotifications = useStore((s) => s.opsNotifications);
	const sosIncidents = useStore((s) => s.sosIncidents);
	const markOpsNotificationRead = useStore((s) => s.markOpsNotificationRead);
	const [open, setOpen] = useState(false);
	const [sosDetailId, setSosDetailId] = useState<string | null>(null);
	const { t } = usePortalLocale();
	const navigate = useNavigate();

	// A real session reads the `notification` table; demo sessions keep the demo
	// store. SOS has no backend table at all, so the incident sheet below stays
	// on the store either way.
	const backend = useNotifications(portal);

	const outletName = portal === "outlet" ? outletOrgName : undefined;
	const demoNotifications = opsNotificationsForPortal(
		allNotifications,
		portal,
		outletName,
	);
	const notifications = backend.backed
		? backend.notifications
		: demoNotifications;
	// Backed sessions trust the server's count rather than counting the page we
	// happen to be showing — the list is capped at 50.
	const unread = backend.backed
		? backend.unread
		: notifications.filter((n) => !n.read).length;
	const sosDetail = sosIncidentById(sosIncidents, sosDetailId ?? undefined);

	const openNotification = (n: OpsNotification) => {
		if (backend.backed) {
			backend.markRead(n.id);
		} else {
			markOpsNotificationRead(n.id);
		}
		if (n.kind === "sos" && n.sosId) {
			setSosDetailId(n.sosId);
			return;
		}
		setOpen(false);
		if (n.href) {
			void navigate({ to: n.href });
		}
	};

	const closeSosDetail = () => {
		setSosDetailId(null);
		setOpen(false);
	};

	return (
		<>
			<button
				type="button"
				className="iz-topbar-action relative"
				title={t.notifications.title}
				aria-label={`${t.notifications.title}${unread ? `, ${unread} ${t.notifications.unreadSuffix}` : ""}`}
				onClick={() => setOpen(true)}
			>
				<Bell className="h-3.5 w-3.5" />
				{unread > 0 && (
					<span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--iz-red)] px-0.5 text-[9px] font-bold text-white">
						{unread}
					</span>
				)}
			</button>

			<IzSheet open={open && !sosDetailId} onClose={() => setOpen(false)}>
				<IzCardTitle>{t.notifications.title}</IzCardTitle>
				<p className="iz-tiny iz-muted mb-3">{t.notifications.hint}</p>
				{notifications.length === 0 ? (
					<p className="iz-sm iz-muted py-6 text-center">
						{t.notifications.empty}
					</p>
				) : (
					<div className="space-y-2">
						{notifications.map((n) => {
							const Icon = kindIcon(n.kind);
							const urgent = isUrgentOpsKind(n.kind);
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
													className={`h-3.5 w-3.5 shrink-0${urgent ? " text-[var(--iz-red)]" : " text-[var(--iz-gold-l)]"}`}
												/>
												{n.title}
											</span>
											{!n.read && (
												<IzPill variant={urgent ? "red" : "amber"}>
													{t.notifications.isNew}
												</IzPill>
											)}
										</div>
										<p className="iz-tiny iz-muted mt-1">{n.body}</p>
										<p className="iz-tiny iz-muted2 mt-1">
											{/*
											 * Optional-called on purpose. As a plain string map an
											 * unmapped backend kind rendered empty and nobody died;
											 * as resolver functions the same miss would be
											 * `undefined(t)`, which throws and white-screens the
											 * portal — the exact failure `kindIcon` above is
											 * guarded against. Falling back to the "Update" label
											 * keeps an unknown kind readable.
											 */}
											{(OPS_KIND_LABEL[n.kind] ?? OPS_KIND_LABEL.unknown)(t)} ·{" "}
											{n.at}
										</p>
									</IzCard>
								</button>
							);
						})}
					</div>
				)}
				{portal === "agency" && (
					<Link
						to="/agency/roster"
						className="iz-btn iz-btn-soft mt-3"
						onClick={() => setOpen(false)}
					>
						{t.notifications.openLiveRoster}
					</Link>
				)}
				{portal === "outlet" && (
					<Link
						to="/outlet"
						className="iz-btn iz-btn-soft mt-3"
						onClick={() => setOpen(false)}
					>
						{t.notifications.openFloor}
					</Link>
				)}
			</IzSheet>

			<IzSheet open={Boolean(sosDetail)} onClose={closeSosDetail}>
				{sosDetail && (
					<>
						<IzCardTitle className="text-[var(--iz-red)] flex items-center gap-2">
							{t.notifications.sosIncident}
						</IzCardTitle>
						<IzCard
							flat
							className="border-[rgba(255,107,107,.35)] bg-[var(--iz-red-bg)]"
						>
							<p className="iz-sm font-bold">{sosDetail.prName}</p>
							<p className="iz-tiny iz-muted mt-0.5">
								{prTypeLabel(sosDetail.prType)} · IC {sosDetail.prIc}
							</p>
							<p className="iz-tiny iz-muted mt-1">
								{t.notifications.outletLabel}: <b>{sosDetail.outlet}</b> ·{" "}
								{t.notifications.agencyLabel}: {sosDetail.agencyName}
							</p>
							<p className="iz-tiny mt-2 flex items-start gap-1 font-semibold text-[var(--iz-gold-l)]">
								<MapPin className="mt-0.5 h-3 w-3 shrink-0" />
								{sosDetail.locationLabel} · {sosDetail.lat.toFixed(4)},{" "}
								{sosDetail.lng.toFixed(4)}
							</p>
							<p className="iz-tiny iz-muted2 mt-2">
								{t.notifications.reported} {sosDetail.at}
							</p>
						</IzCard>
						{/*
						 * A <span>, not a <label>: there is no field here. The incident
						 * note below is read-only text, so this is a caption — a <label>
						 * would promise a control that does not exist. `block` keeps the
						 * same box the label had.
						 */}
						<span className="iz-tiny iz-muted2 mt-3 block uppercase tracking-wide">
							{t.notifications.incidentNote}
						</span>
						<p className="iz-sm mt-1 whitespace-pre-wrap">{sosDetail.note}</p>
						{sosDetail.photoDataUrl && (
							<img
								src={sosDetail.photoDataUrl}
								alt={t.notifications.sosEvidence}
								className="mt-3 max-h-40 w-full rounded-lg object-cover"
							/>
						)}
						<button
							type="button"
							className="iz-btn iz-btn-soft mt-4"
							onClick={closeSosDetail}
						>
							{t.common.close}
						</button>
					</>
				)}
			</IzSheet>
		</>
	);
}
