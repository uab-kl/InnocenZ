import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bell, Plug } from 'lucide-react';
import { IzSheet } from '@agency-portal/components/iz/Sheet';
import { IzCard, IzCardTitle, IzPill } from '@agency-portal/components/iz/ui';
import { useStore } from '@agency-portal/lib/store';
import {
  adminNotificationKindLabel,
  type AdminNotification,
  type AdminNotificationKind,
} from '@agency-portal/lib/admin-notifications';

function kindIcon(kind: AdminNotificationKind) {
  if (kind === 'pos_integration_quote') return Plug;
  return Bell;
}

export function AdminNotificationBell() {
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
        title="Admin notifications"
        aria-label={`Admin notifications${unread ? `, ${unread} unread` : ''}`}
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
        <IzCardTitle>Admin notifications</IzCardTitle>
        <p className="iz-tiny iz-muted mt-1">
          Outlet requests and ops alerts for InnocenZ admin
        </p>
        {notifications.length === 0 ? (
          <IzCard flat className="mt-3 text-center">
            <p className="iz-sm iz-muted py-6">No notifications yet.</p>
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
                      ? 'border-[var(--iz-line)] bg-[var(--iz-bg2)] opacity-80'
                      : 'border-[rgba(167,139,250,.35)] bg-[rgba(167,139,250,.08)]'
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
                        {!n.read && <IzPill variant="violet">New</IzPill>}
                      </div>
                      <p className="iz-tiny iz-muted mt-0.5">{n.body}</p>
                      {n.contactLine && (
                        <p className="iz-tiny mt-1 text-[var(--iz-violet-l)]">
                          {n.contactLine}
                        </p>
                      )}
                      <p className="iz-tiny iz-muted2 mt-1">
                        {adminNotificationKindLabel(n.kind)} · {n.at}
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
