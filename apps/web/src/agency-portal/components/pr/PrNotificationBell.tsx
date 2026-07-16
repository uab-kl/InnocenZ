import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  Bell,
  Briefcase,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCard, IzCardTitle, IzPill } from '@agency-portal/components/iz/ui';
import { useStore } from '@agency-portal/lib/store';
import { getPrRosterId } from '@agency-portal/lib/pr-demo';
import {
  prNotificationsForRecipient,
  type PrNotification,
  type PrNotificationKind,
} from '@agency-portal/lib/pr-features';
import { usePrPortalReady } from '@agency-portal/lib/use-pr-sub-role';

function prKindIcon(kind: PrNotificationKind) {
  if (kind === 'sos') return AlertTriangle;
  if (kind === 'pv') return Wallet;
  if (kind === 'swap') return RefreshCw;
  return Briefcase;
}

export function PrNotificationBell() {
  const { role: prSubRole } = usePrPortalReady();
  const allNotifications = useStore((s) => s.prNotifications);
  const notifications = prNotificationsForRecipient(
    allNotifications,
    getPrRosterId(prSubRole),
  );
  const markPrNotificationRead = useStore((s) => s.markPrNotificationRead);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

  const openNotification = (n: PrNotification) => {
    markPrNotificationRead(n.id);
    setOpen(false);
    if (n.pvId) {
      void navigate({ to: '/host/PaymentVoucher', search: { pvId: n.pvId } });
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
              const urgent = n.kind === 'sos';
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
                          className={`h-3.5 w-3.5 shrink-0${urgent ? ' text-[var(--iz-red)]' : ''}`}
                        />
                        {n.title}
                      </span>
                      {!n.read && (
                        <IzPill variant={urgent ? 'red' : 'amber'}>New</IzPill>
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
