/**
 * `.iz-topbar` port — PR identity (avatar, name, "PR · Agency-Tied"), live
 * date/time block, and the notification bell with its unread badge + sheet.
 * Identity comes from the backend session (/auth/me).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, F, GRADIENTS, grad } from '../theme/theme';
import { font } from '../theme/fonts';
import { fmtClock, fmtDTopbar, formatRM, todayYmd, weekPvIssueDayLabel } from '../lib/demo-shifts';
import { useSession } from '../lib/session';
import { useAwaitingLastWeekPv } from '../lib/awaiting-pv';
import {
  assetUrl,
  fetchMyNotifications,
  fetchMyOutletSwaps,
  fetchUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRecord,
  type OutletSwapRecord,
} from '../lib/api';
import { ImageLightbox } from './ImageLightbox';
import { PhoneSheet } from './PhoneSheet';
import { localizeNotification } from '../lib/notification-copy';
import {
  badgeLabel,
  realRowCoversVoucher,
  unreadBadgeCount,
} from '../lib/notification-badge';
import { formatMessage, useLocale, type AppTranslations } from '../i18n';
import { Avatar, IzButton } from './ui';
import { Bell, ChevronLeft, ChevronRight, FileText } from './icons';
import { usePrNav } from '../lib/pr-nav';
import { useActiveShift } from '../lib/active-shift';
import { usePrEarnings } from '../lib/pr-earnings';
import { usePaymentHistory } from '../lib/payment-history';
import {
  notificationDestination,
  notificationStayReason,
  notificationSubject,
  type DestinationContext,
  type NotificationDestination,
  type NotificationStayReason,
} from '../lib/notification-targets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The one line the bell says when a notice's item is spent — a swap request
 * already answered or withdrawn. Resolvers, because this is module scope and
 * the words move with the language.
 */
const STAY_COPY: Record<NotificationStayReason, (t: AppTranslations) => string> = {
  swapAccepted: (t) => t.swaps.alreadyAccepted,
  swapDeclined: (t) => t.swaps.alreadyDeclined,
  swapWithdrawn: (t) => t.swaps.withdrawn,
  swapClosed: (t) => t.swaps.noLongerOpen,
};

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
  const { openPv, setTab } = usePrNav();
  const { awaiting } = useAwaitingLastWeekPv();

  /*
   * WHAT THE APP ALREADY HOLDS — a notification opens its item only where one
   * of these can show it (`notification-targets.ts`). The assignments cover
   * every status, the open week's vouchers go to Payment rather than to a PV
   * page that cannot render them, and the closed ones prove a voucher still
   * exists before sending the PR to it.
   */
  const { assignments } = useActiveShift();
  const { current } = usePrEarnings();
  const {
    vouchers: closedVouchers,
    loading: historyLoading,
    error: historyError,
  } = usePaymentHistory();
  /**
   * The PR's swap requests, EVERY status — read when the bell opens on a swap
   * notice, so a request answered or withdrawn since the notice stays on the
   * list with a line saying so instead of opening an empty To-do. Null while
   * unknown (not read yet, or the read failed): the notice is then trusted.
   */
  const [swaps, setSwaps] = useState<OutletSwapRecord[] | null>(null);
  const destinationCtx = useMemo<DestinationContext>(
    () => ({
      assignments,
      thisWeek: current
        ? {
            weekStart: current.weekStart,
            weekEnd: current.weekEnd,
            voucherIds: [
              ...(current.voucherId ? [current.voucherId] : []),
              ...(current.vouchers ?? []).map((v) => v.id),
            ],
          }
        : null,
      // Empty is indistinguishable from not-yet-fetched (the provider starts
      // empty), so it counts as unknown too and a voucher id is trusted.
      closedVouchers:
        historyLoading || historyError || closedVouchers.length === 0
          ? null
          : closedVouchers,
      swaps,
    }),
    [assignments, current, closedVouchers, historyLoading, historyError, swaps],
  );

  /** Opens what a tapped notification is about. */
  const openDestination = (destination: NotificationDestination) => {
    switch (destination.to) {
      case 'pv':
        openPv(destination.pvId);
        return;
      case 'paymentThisWeek':
        setTab('payment', { paymentWeek: 'current' });
        return;
      case 'scheduleDay':
        // The booking rides along, so the day's sheet can say it is gone.
        setTab('shifts', {
          shiftsFocus: {
            section: 'schedule',
            dateIso: destination.dateIso,
            ...(destination.assignmentId ? { assignmentId: destination.assignmentId } : {}),
          },
        });
        return;
      case 'swapRequests':
        setTab('shifts', {
          shiftsFocus: {
            section: 'todo',
            ...(destination.swapId ? { swapId: destination.swapId } : {}),
          },
        });
        return;
      case 'profile':
        setTab('profile');
        return;
    }
  };
  const time = useClock();
  const [y, m, d] = todayYmd();
  const [sheetOpen, setSheetOpen] = useState(false);
  // Device inset — keeps Close clear of the 3-button / gesture nav bar.
  const insets = useSafeAreaInsets();
  const [readIds, setReadIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);

  const [rows, setRows] = useState<NotificationRecord[]>([]);
  // EVERY unread row, as the server counts it — the page above is only the
  // newest 50, which is where the badge stuck at 50. null until it answers.
  const [serverUnread, setServerUnread] = useState<number | null>(null);
  /** The line under the title after a tap on a spent notice — see STAY_COPY. */
  const [stayNote, setStayNote] = useState<string | null>(null);

  /*
   * Swap requests are read only when they can matter: the bell is OPEN and a
   * loaded notice is about one. Re-read on every open — a request is answered
   * or withdrawn on another screen, or by the agency, between two opens. A
   * failed read goes back to "unknown" rather than keeping an older list that
   * could send her to To-do for a request that has since closed.
   */
  const hasSwapNotice = useMemo(
    () => rows.some((r) => notificationSubject(r)?.type === 'swap'),
    [rows],
  );
  useEffect(() => {
    if (!sheetOpen || !token || !hasSwapNotice) return;
    let alive = true;
    fetchMyOutletSwaps(token)
      .then((list) => {
        if (alive) setSwaps(list);
      })
      .catch(() => {
        if (alive) setSwaps(null);
      });
    return () => {
      alive = false;
    };
  }, [sheetOpen, token, hasSwapNotice]);
  // The line belongs to the tap that produced it — gone once the sheet closes.
  useEffect(() => {
    if (!sheetOpen) setStayNote(null);
  }, [sheetOpen]);

  /**
   * The page and the count, fetched side by side. Settled, not all-or-nothing:
   * a failure keeps whatever the bell last had rather than taking the top bar
   * down, and one half failing must not blank the other.
   */
  const reload = useCallback(
    async (isAlive: () => boolean = () => true) => {
      if (!token) return;
      const [list, count] = await Promise.allSettled([
        fetchMyNotifications(token),
        fetchUnreadNotificationCount(token),
      ]);
      if (!isAlive()) return;
      if (list.status === 'fulfilled') setRows(list.value);
      if (count.status === 'fulfilled') setServerUnread(count.value);
    },
    [token],
  );

  // Real notifications for this PR. Polled rather than pushed — there is no
  // transport yet, the `notification` table IS the delivery.
  useEffect(() => {
    if (!token) {
      setRows([]);
      setServerUnread(null);
      return;
    }
    let alive = true;
    const load = () => void reload(() => alive);
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [token, reload]);

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
        // Its ITEM — the voucher, the shift's day, the week carrying overtime,
        // the swap request, the membership — or null: nothing to open.
        destination: notificationDestination(r, destinationCtx),
        // And when there is nothing to open although the notice WAS about
        // something (a swap already answered), why — said on tap.
        stayReason: notificationStayReason(r, destinationCtx),
        backed: true,
      };
    });

    // The awaiting-PV prompt is a stand-in for `payment_voucher_issued`. Keep it
    // only while no real row covers THIS voucher, so a PR never loses the
    // "review & sign" nudge but also never sees it twice.
    const derived =
      awaiting && !realRowCoversVoucher(rows, awaiting.todo.pvId)
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
              destination: {
                to: 'pv',
                pvId: awaiting.todo.pvId,
              } as NotificationDestination | null,
              stayReason: null as NotificationStayReason | null,
              backed: false,
            },
          ]
        : [];

    return [...real, ...derived].map((n) => ({
      ...n,
      read: n.read || readIds.includes(n.id),
    }));
  }, [rows, awaiting, readIds, locale, t, destinationCtx]);
  const unread = unreadBadgeCount({
    serverUnread,
    rows,
    locallyRead: readIds,
    derivedUnread: notifications.filter((n) => !n.backed && !n.read).length,
  });
  const badge = badgeLabel(unread);

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
        <Pressable
          style={styles.bellBtn}
          onPress={() => setSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t.topbar.notifications}
        >
          <Bell size={14} color={C.muted} />
          {badge && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {/*
        * PhoneSheet, not a bare Modal: on the web build a Modal escapes the
        * phone frame and covers the whole browser window, while every other
        * sheet in the app stays inside it. Native still gets the Modal.
        */}
      <PhoneSheet visible={sheetOpen} animationType="fade" onRequestClose={() => setSheetOpen(false)}>
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
              * MARK ALL READ — ONE write for every unread row, loaded or not.
              *
              * It used to fan out one POST per unread row ON THE PAGE, and the
              * page is 50 rows: the rest stayed unread with no row on screen to
              * tap, which is half of why the badge never moved off 50.
              * `POST /notification/read-all` clears them all. On a backend that
              * does not have it yet the old fan-out still runs, and either way
              * the page and the count are re-read afterwards, so a row that
              * failed comes BACK unread rather than looking cleared — a
              * notification silently dropped is one the PR never acts on.
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
                  setServerUnread(0);
                  try {
                    await markAllNotificationsRead(token);
                  } catch {
                    const backed = notifications.filter((n) => !n.read && n.backed);
                    await Promise.allSettled(
                      backed.map((n) => markNotificationRead(token, n.id)),
                    );
                  } finally {
                    // The 60s poll would correct it too; this makes it now.
                    await reload();
                    setMarkingAll(false);
                  }
                }}
              >
                <Text style={styles.markAllText}>
                  {markingAll ? t.common.loading : t.topbar.markAllRead}
                </Text>
              </Pressable>
            )}

            {stayNote ? (
              <Text style={styles.stayNote} role="alert">
                {stayNote}
              </Text>
            ) : null}

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
                      .then(() => reload())
                      .catch(() => {});
                  }
                  // NOTHING TO OPEN — an agency's own message, a shift that no
                  // longer exists, a swap already answered. The row is read,
                  // and the list stays where the PR is looking rather than
                  // closing on nothing — with one line saying why, when the
                  // notice WAS about something that has since gone.
                  if (!n.destination) {
                    setStayNote(n.stayReason ? STAY_COPY[n.stayReason](t) : null);
                    return;
                  }
                  setStayNote(null);
                  setSheetOpen(false);
                  openDestination(n.destination);
                }}
              >
                <View style={styles.notifHead}>
                  <View style={styles.notifTitleRow}>
                    <FileText size={14} color={C.txt} />
                    <Text style={styles.notifTitle}>{n.title}</Text>
                  </View>
                  <View style={styles.notifHeadEnd}>
                    {!n.read && (
                      <View style={styles.newPill}>
                        <Text style={styles.newPillText}>{t.common.newBadge}</Text>
                      </View>
                    )}
                    {/* Marks the rows that OPEN something; a row with nowhere
                        to go has none, so its tap is not a surprise. */}
                    {n.destination && (
                      <View testID="notif-opens">
                        <ChevronRight size={14} color={C.muted} />
                      </View>
                    )}
                  </View>
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
      </PhoneSheet>
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
    ...font(700),
    fontSize: 14,
    color: C.goldL,
  },
  identityCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: 90,
  },
  nameCompact: {
    ...font(700),
    fontSize: 12,
    color: C.txt,
  },
  meta: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...font(800),
    fontSize: 16,
    lineHeight: 18,
    letterSpacing: -0.2,
    color: C.txt,
  },
  role: {
    ...font(600),
    fontSize: 13,
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
    ...font(600),
    fontSize: 11,
    letterSpacing: 0.2,
    color: C.muted,
  },
  time: {
    ...font(700),
    fontSize: 14,
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
    ...font(800),
    fontSize: 9,
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
  markAllText: { ...font(700), fontSize: 12, color: C.violetL },
  /** Why a tapped notice opened nothing — informational, so no status colour. */
  stayNote: {
    ...font(600),
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.txt,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.glass2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },
  sheetCloseBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(240,138,138,0.45)',
    backgroundColor: 'rgba(240,138,138,0.12)',
  },
  sheetCloseText: { ...font(700), fontSize: 15, color: C.red },
  sheetTitle: {
    ...font(800),
    fontSize: 22,
    color: C.txt,
  },
  sheetHint: {
    ...font(),
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
  /** The NEW pill and the opens-something chevron, kept together on the right. */
  notifHeadEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  notifTitle: {
    ...font(700),
    fontSize: C.fsSm,
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
    ...font(700),
    fontSize: 12,
    color: C.amber,
  },
  notifBody: {
    ...font(),
    fontSize: C.fsTiny,
    lineHeight: C.fsTiny * 1.55,
    color: C.prMuted,
    marginTop: 4,
  },
  notifAt: {
    ...font(),
    fontSize: C.fsTiny,
    color: C.prMuted2,
    marginTop: 4,
  },
});
