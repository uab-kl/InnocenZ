/**
 * `.iz-topbar` port — PR identity (avatar, name, "PR · Agency-Tied"), live
 * date/time block, and the notification bell with its unread badge + sheet.
 * Identity comes from the backend session (/auth/me).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { fmtClock, fmtDTopbar, formatRM, todayYmd, weekPvIssueDayLabel } from '../lib/demo-shifts';
import { useSession } from '../lib/session';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import {
  fetchMyNotifications,
  markNotificationRead,
  type NotificationRecord,
} from '../lib/api';
import { Avatar, IzButton } from './ui';
import { Bell, ChevronLeft, FileText } from './icons';
import { usePrNav } from '../lib/pr-nav';

function useClock(): string {
  const [time, setTime] = useState(() => fmtClock(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTime(fmtClock(new Date())), 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

export function TopBar({
  onOpenProfile,
  backLabel,
  onBack,
}: {
  onOpenProfile?: () => void;
  backLabel?: string;
  onBack?: () => void;
}) {
  const { me, token } = useSession();
  const { openPv } = usePrNav();
  const { awaiting } = useAwaitingLastWeekPv();
  const time = useClock();
  const [y, m, d] = todayYmd();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);

  const [rows, setRows] = useState<NotificationRecord[]>([]);

  // Real notifications for this PR. Polled rather than pushed — there is no
  // transport yet, the `notification` table IS the delivery.
  useEffect(() => {
    if (!token) {
      setRows([]);
      return;
    }
    let alive = true;
    const load = () => {
      fetchMyNotifications(token)
        .then((next) => {
          if (alive) setRows(next);
        })
        // A failure here must not take the top bar down with it; the bell just
        // shows whatever it last had.
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token]);

  const notifications = useMemo(() => {
    const real = rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body ?? '',
      at: new Date(r.createdAt).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }),
      read: r.readAt !== null,
      pvId: typeof r.payload?.voucherId === 'string' ? r.payload.voucherId : undefined,
      backed: true,
    }));

    // The awaiting-PV prompt is a stand-in for `payment_voucher_issued`. Keep it
    // only while no real row covers that ground, so a PR never loses the
    // "review & sign" nudge but also never sees it twice.
    const hasRealPv = rows.some((r) => r.kind === 'payment_voucher_issued');
    const derived =
      awaiting && !hasRealPv
        ? [
            {
              id: `n-pv-${awaiting.todo.pvId}`,
              title: 'Payment Voucher ready',
              body: `${awaiting.todo.ref} · ${formatRM(awaiting.todo.net)} net — Finance Head pre-signed. Review & sign.`,
              at: weekPvIssueDayLabel(1),
              read: false as boolean,
              pvId: awaiting.todo.pvId as string | undefined,
              backed: false,
            },
          ]
        : [];

    return [...real, ...derived].map((n) => ({
      ...n,
      read: n.read || readIds.includes(n.id),
    }));
  }, [rows, awaiting, readIds]);
  const unread = notifications.filter((n) => !n.read).length;

  const displayName = me?.username ?? 'PR';
  const roleLabel = me?.profile.underAgency ? 'PR · Agency-Tied' : 'PR';

  return (
    <View style={[styles.topbar, grad(GRADIENTS.topbar, 'transparent')]}>
      {backLabel && onBack ? (
        <Pressable style={styles.backBtn} onPress={onBack}>
          <ChevronLeft size={18} color={C.goldL} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.identity} onPress={onOpenProfile}>
          <Avatar
            size={44}
            radius={14}
            fontSize={16}
            photoPath={me?.profileImage}
            initial={displayName.trim()[0]?.toUpperCase()}
          />
          <View style={styles.meta}>
            <Text style={styles.name} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>
        </Pressable>
      )}

      <View style={styles.actions}>
        {!!backLabel && (
          <Pressable style={styles.identityCompact} onPress={onOpenProfile}>
            <Avatar
              size={28}
              radius={9}
              fontSize={11}
              photoPath={me?.profileImage}
              initial={displayName.trim()[0]?.toUpperCase()}
            />
            <Text style={styles.nameCompact} numberOfLines={1}>
              {displayName}
            </Text>
          </Pressable>
        )}
        <View style={styles.datetime}>
          <Text style={styles.date}>{fmtDTopbar(y, m, d)}</Text>
          <Text style={styles.time}>{time}</Text>
        </View>
        <Pressable style={styles.bellBtn} onPress={() => setSheetOpen(true)}>
          <Bell size={14} color={C.muted} />
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <Modal visible={sheetOpen} transparent animationType="fade" onRequestClose={() => setSheetOpen(false)}>
        <Pressable style={styles.sheetBackdrop} onPress={() => setSheetOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Notifications</Text>
            <Text style={styles.sheetHint}>
              Assignments, swaps, PVs, and SOS receipts — tap to open the screen.
            </Text>
            {notifications.length === 0 ? (
              <Text style={styles.sheetHint}>No notifications right now.</Text>
            ) : (
              notifications.map((n) => (
              <Pressable
                key={n.id}
                style={[styles.notifCard, !n.read && styles.notifCardUnread]}
                onPress={() => {
                  // Optimistic locally either way; a real row also persists the
                  // read server-side so it stays read on the next device.
                  setReadIds((ids) => [...ids, n.id]);
                  if (n.backed && token) {
                    markNotificationRead(token, n.id)
                      .then(() => fetchMyNotifications(token))
                      .then(setRows)
                      .catch(() => {});
                  }
                  setSheetOpen(false);
                  if (n.pvId) openPv(n.pvId);
                }}
              >
                <View style={styles.notifHead}>
                  <View style={styles.notifTitleRow}>
                    <FileText size={14} color={C.txt} />
                    <Text style={styles.notifTitle}>{n.title}</Text>
                  </View>
                  {!n.read && (
                    <View style={styles.newPill}>
                      <Text style={styles.newPillText}>New</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifAt}>{n.at}</Text>
              </Pressable>
              ))
            )}
            <IzButton label="Close" variant="soft" onPress={() => setSheetOpen(false)} style={{ marginTop: 12 }} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    zIndex: 20,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 2,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 1,
    maxWidth: '42%',
  },
  backText: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    color: C.goldL,
  },
  identityCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 90,
  },
  nameCompact: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.txt,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontFamily: F.sora,
    fontWeight: '800',
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
    color: C.txt,
  },
  role: {
    fontFamily: F.sora,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: C.goldL,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  datetime: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 1,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: C.line,
  },
  date: {
    fontFamily: F.sora,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    color: C.muted,
  },
  time: {
    fontFamily: F.sora,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: C.txt,
    fontVariant: ['tabular-nums'],
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.glass2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 2,
    borderRadius: 999,
    backgroundColor: C.red,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontFamily: F.sora,
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,3,12,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.panel,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: C.line2,
    padding: 18,
    paddingBottom: 26,
    maxWidth: 392,
    width: '100%',
    alignSelf: 'center',
  },
  sheetTitle: {
    fontFamily: F.sora,
    fontSize: 22,
    fontWeight: '800',
    color: C.txt,
  },
  sheetHint: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.prMuted,
    marginTop: 4,
    marginBottom: 12,
  },
  notifCard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 12,
    marginTop: 8,
  },
  notifCardUnread: {
    borderColor: 'rgba(232,194,122,0.35)',
  },
  notifHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  notifTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
  },
  notifTitle: {
    fontFamily: F.manrope,
    fontSize: C.fsSm,
    fontWeight: '700',
    color: C.txt,
  },
  newPill: {
    borderWidth: 1,
    borderColor: 'rgba(232,198,106,0.35)',
    backgroundColor: C.amberBg,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  newPillText: {
    fontFamily: F.sora,
    fontSize: 12,
    fontWeight: '700',
    color: C.amber,
  },
  notifBody: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.prMuted,
    marginTop: 4,
  },
  notifAt: {
    fontFamily: F.manrope,
    fontSize: C.fsTiny,
    color: C.prMuted2,
    marginTop: 4,
  },
});
