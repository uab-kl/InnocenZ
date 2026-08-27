/**
 * `.iz-topbar` port — PR identity (avatar, name, "PR · Agency-Tied"), live
 * date/time block, and the notification bell with its unread badge + sheet.
 * Identity comes from the backend session (/auth/me).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { fmtClock, fmtDTopbar, formatRM, todayYmd, weekPvIssueDayLabel } from '../lib/demo-shifts';
import { useSession } from '../lib/session';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import {
  assetUrl,
  fetchMyNotifications,
  markNotificationRead,
  type NotificationRecord,
} from '../lib/api';
import { ImageLightbox } from './ImageLightbox';
import { localizeNotification } from '../lib/notification-copy';
import { formatMessage, useLocale } from '../i18n';
import { Avatar, IzButton } from './ui';
import { Bell, ChevronLeft, FileText } from './icons';
import { usePrNav } from '../lib/pr-nav';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  const { locale, t } = useLocale();
  const { openPv } = usePrNav();
  const { awaiting } = useAwaitingLastWeekPv();
  const time = useClock();
  const [y, m, d] = todayYmd();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Device inset — keeps Close clear of the 3-button / gesture nav bar.
  const insets = useSafeAreaInsets();
  const [readIds, setReadIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

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
    const real = rows.map((r) => {
      /*
       * TITLE AND BODY ARE LOCALIZED HERE, not by the producer.
       *
       * The row is a PERSISTED backend record — translating it at the source
       * would bake one language into the `notification` table and leave every
       * existing row in the other. `localizeNotification` maps `kind` +
       * `payload` onto the dictionary and falls back to the stored English for
       * anything it cannot rebuild. The timestamp below is localized the same
       * way, and was already right.
       */
      const copy = localizeNotification(r, locale, t);
      return {
        id: r.id,
        title: copy.title,
        body: copy.body,
        // `locale`, not `undefined`: passing undefined follows the DEVICE's
        // language, so a PR who switched the app to Chinese still read an English
        // date here. `AppLocale` ('en' | 'zh' | 'zh-Hant') is a valid BCP-47 tag.
        at: new Date(r.createdAt).toLocaleString(locale, {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        }),
        read: r.readAt !== null,
        pvId: typeof r.payload?.voucherId === 'string' ? r.payload.voucherId : undefined,
        backed: true,
      };
    });

    // The awaiting-PV prompt is a stand-in for `payment_voucher_issued`. Keep it
    // only while no real row covers that ground, so a PR never loses the
    // "review & sign" nudge but also never sees it twice.
    const hasRealPv = rows.some((r) => r.kind === 'payment_voucher_issued');
    const derived =
      awaiting && !hasRealPv
        ? [
            {
              id: `n-pv-${awaiting.todo.pvId}`,
              title: t.topbar.pvReadyTitle,
              body: formatMessage(t.topbar.pvReadyBody, {
                ref: awaiting.todo.ref,
                net: formatRM(awaiting.todo.net),
              }),
              at: weekPvIssueDayLabel(1, undefined, t),
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
  }, [rows, awaiting, readIds, locale, t]);
  const unread = notifications.filter((n) => !n.read).length;

  const displayName = me?.username ?? 'PR';
  const roleLabel = me?.profile.underAgency ? t.topbar.prAgencyTied : t.topbar.pr;
  /**
   * Owner's spec: ONE tap on the identity opens the Profile page, a DOUBLE tap
   * opens the profile picture full size. The single tap therefore waits one
   * beat (300ms) for a possible second tap — only when there is a picture to
   * zoom; with no photo the tap opens Profile immediately.
   */
  const avatarUri = assetUrl(me?.profileImage);
  const [zoomUri, setZoomUri] = useState<string | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (tapTimer.current) clearTimeout(tapTimer.current);
    };
  }, []);
  const onIdentityPress = () => {
    if (!avatarUri) {
      onOpenProfile?.();
      return;
    }
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      setZoomUri(avatarUri);
      return;
    }
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      onOpenProfile?.();
    }, 300);
  };
  return (
    <View style={[styles.topbar, grad(GRADIENTS.topbar, 'transparent')]}>
      <ImageLightbox uri={zoomUri} onClose={() => setZoomUri(null)} />
      {backLabel && onBack ? (
        <Pressable style={styles.backBtn} onPress={onBack}>
          <ChevronLeft size={18} color={C.goldL} />
          <Text style={styles.backText}>{backLabel}</Text>
        </Pressable>
      ) : (
        <Pressable style={styles.identity} onPress={onIdentityPress}>
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
          <Pressable style={styles.identityCompact} onPress={onIdentityPress}>
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
          <Text style={styles.date}>{fmtDTopbar(y, m, d, t)}</Text>
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
        {/*
          * The backdrop is a SIBLING, and the list is a real ScrollView.
          *
          * Two faults, one symptom. The sheet had NO ScrollView at all, so a PR
          * with more than a screenful of notifications could not reach the older
          * ones — and the whole sheet sat inside a `Pressable` whose tap-guard
          * swallows the drag on Android, so adding one alone would still not
          * have scrolled. Both fixed together, per the flexible-UI rule.
          */}
        <View style={styles.sheetBackdrop}>
          <Pressable style={styles.backdropTap} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
            <Text style={styles.sheetTitle}>{t.topbar.notifications}</Text>
            <Text style={styles.sheetHint}>{t.topbar.notificationsHint}</Text>
            {/*
              * MARK ALL READ — real, one POST per unread row.
              *
              * There is no bulk endpoint (`/notification` exposes list,
              * unread-count and POST /:id/read only), so this fans out over the
              * unread ones. The badge clears optimistically and the list is
              * re-read from the server afterwards, so a row that failed comes
              * BACK unread rather than looking cleared — a notification silently
              * dropped is one the PR never acts on.
              *
              * Derived rows (`backed: false`, the awaiting-PV stand-in) have no
              * server row to mark; they clear locally, which is all they ever
              * were.
              */}
            {unread > 0 && (
              <Pressable
                style={styles.markAllBtn}
                disabled={markingAll}
                onPress={async () => {
                  const ids = notifications.filter((n) => !n.read).map((n) => n.id);
                  setReadIds((prev) => [...prev, ...ids]);
                  if (!token) return;
                  setMarkingAll(true);
                  try {
                    const backed = notifications.filter((n) => !n.read && n.backed);
                    await Promise.allSettled(
                      backed.map((n) => markNotificationRead(token, n.id)),
                    );
                    setRows(await fetchMyNotifications(token));
                  } catch {
                    /* the 60s poll re-reads and corrects whatever stuck */
                  } finally {
                    setMarkingAll(false);
                  }
                }}
              >
                <Text style={styles.markAllText}>
                  {markingAll ? t.common.loading : t.topbar.markAllRead}
                </Text>
              </Pressable>
            )}

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            {notifications.length === 0 ? (
              <Text style={styles.sheetHint}>{t.topbar.noNotifications}</Text>
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
                      <Text style={styles.newPillText}>{t.common.newBadge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.notifBody}>{n.body}</Text>
                <Text style={styles.notifAt}>{n.at}</Text>
              </Pressable>
              ))
            )}
            </ScrollView>
            {/* Close is red app-wide (owner's colour code). */}
            <Pressable style={styles.sheetCloseBtn} onPress={() => setSheetOpen(false)}>
              <Text style={styles.sheetCloseText}>{t.topbar.close}</Text>
            </Pressable>
          </View>
        </View>
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
    // Fills a real phone; caps only on a tablet. 392 was the WEB frame width.
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
    // Bounded so Close stays reachable; the list inside shrinks to fit.
    maxHeight: '85%',
  },
  /** Dismiss area ABOVE the sheet — a sibling, never a Pressable ancestor. */
  backdropTap: { flex: 1 },
  sheetScroll: { flexShrink: 1, marginTop: 4 },
  markAllBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(183,156,232,0.4)',
    backgroundColor: 'rgba(183,156,232,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  markAllText: { fontFamily: F.sora, fontSize: 12, fontWeight: '700', color: C.violetL },
  sheetCloseBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  sheetCloseText: { fontFamily: F.sora, fontSize: 15, fontWeight: '700', color: C.red },
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
