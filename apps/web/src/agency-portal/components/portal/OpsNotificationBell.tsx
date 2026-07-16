import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  ClipboardList,
  FileText,
  MapPin,
  Star,
  Wallet,
} from 'lucide-react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCard, IzCardTitle, IzPill } from '@agency-portal/components/iz/ui';
import { useStore } from '@agency-portal/lib/store';
import {
  opsNotificationsForPortal,
  prTypeLabel,
  sosIncidentById,
  type OpsNotification,
  type OpsNotificationKind,
  type OpsPortal,
} from '@agency-portal/lib/ops-notifications';
import {
  isUrgentOpsKind,
  OPS_KIND_LABEL,
} from '@agency-portal/lib/push-notifications';

function kindIcon(kind: OpsNotificationKind) {
  if (kind === 'sos') return AlertTriangle;
  if (kind === 'check_in') return MapPin;
  if (kind === 'rating_prompt') return Star;
  if (kind.startsWith('pv')) return Wallet;
  if (kind === 'report_ready') return FileText;
  if (kind === 'reconciliation_due') return ClipboardList;
  if (kind === 'collection_reminder') return Wallet;
  return CalendarCheck;
}

export function OpsNotificationBell({ portal }: { portal: OpsPortal }) {
  const outletOrgName = useStore((s) => s.outletOwner.orgName);
  const allNotifications = useStore((s) => s.opsNotifications);
  const sosIncidents = useStore((s) => s.sosIncidents);
  const markOpsNotificationRead = useStore((s) => s.markOpsNotificationRead);
  const [open, setOpen] = useState(false);
  const [sosDetailId, setSosDetailId] = useState<string | null>(null);
  const navigate = useNavigate();

  const outletName = portal === 'outlet' ? outletOrgName : undefined;
  const notifications = opsNotificationsForPortal(
    allNotifications,
    portal,
    outletName,
  );
  const unread = notifications.filter((n) => !n.read).length;
  const sosDetail = sosIncidentById(sosIncidents, sosDetailId ?? undefined);

  const openNotification = (n: OpsNotification) => {
    markOpsNotificationRead(n.id);
    if (n.kind === 'sos' && n.sosId) {
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
        title="Notifications"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
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
        <IzCardTitle>Notifications</IzCardTitle>
        <p className="iz-tiny iz-muted mb-3">
          Shift updates, check-ins, PVs, disputes, ratings, SOS, and reports —
          tap to open.
        </p>
        {notifications.length === 0 ? (
          <p className="iz-sm iz-muted py-6 text-center">No notifications</p>
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
                          ? 'border-[rgba(255,107,107,.2)]'
                          : 'border-[rgba(255,107,107,.45)] bg-[var(--iz-red-bg)]'
                        : n.read
                          ? ''
                          : 'border-[rgba(232,194,122,.35)]'
                    }
                  >
                    <div className="iz-between gap-2">
                      <span className="iz-sm font-bold flex items-center gap-1.5">
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0${urgent ? ' text-[var(--iz-red)]' : ' text-[var(--iz-gold-l)]'}`}
                        />
                        {n.title}
                      </span>
                      {!n.read && (
                        <IzPill variant={urgent ? 'red' : 'amber'}>New</IzPill>
                      )}
                    </div>
                    <p className="iz-tiny iz-muted mt-1">{n.body}</p>
                    <p className="iz-tiny iz-muted2 mt-1">
                      {OPS_KIND_LABEL[n.kind]} · {n.at}
                    </p>
                  </IzCard>
                </button>
              );
            })}
          </div>
        )}
        {portal === 'agency' && (
          <Link
            to="/agency/roster"
            className="iz-btn iz-btn-soft mt-3"
            onClick={() => setOpen(false)}
          >
            Open Live Roster
          </Link>
        )}
        {portal === 'outlet' && (
          <Link
            to="/outlet"
            className="iz-btn iz-btn-soft mt-3"
            onClick={() => setOpen(false)}
          >
            Open Floor
          </Link>
        )}
      </IzSheet>

      <IzSheet open={Boolean(sosDetail)} onClose={closeSosDetail}>
        {sosDetail && (
          <>
            <IzCardTitle className="text-[var(--iz-red)] flex items-center gap-2">
              SOS incident
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
                Outlet: <b>{sosDetail.outlet}</b> · Agency:{' '}
                {sosDetail.agencyName}
              </p>
              <p className="iz-tiny mt-2 flex items-start gap-1 font-semibold text-[var(--iz-gold-l)]">
                <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                {sosDetail.locationLabel} · {sosDetail.lat.toFixed(4)},{' '}
                {sosDetail.lng.toFixed(4)}
              </p>
              <p className="iz-tiny iz-muted2 mt-2">Reported {sosDetail.at}</p>
            </IzCard>
            <label className="iz-tiny iz-muted2 mt-3 block tracking-wide">
              INCIDENT NOTE
            </label>
            <p className="iz-sm mt-1 whitespace-pre-wrap">{sosDetail.note}</p>
            {sosDetail.photoDataUrl && (
              <img
                src={sosDetail.photoDataUrl}
                alt="SOS evidence"
                className="mt-3 max-h-40 w-full rounded-lg object-cover"
              />
            )}
            <button
              type="button"
              className="iz-btn iz-btn-soft mt-4"
              onClick={closeSosDetail}
            >
              Close
            </button>
          </>
        )}
      </IzSheet>
    </>
  );
}
