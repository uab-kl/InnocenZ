/**
 * The PR's pending outlet-swap requests — the agency has asked them to work a
 * different venue tonight, and nothing moves until they answer here.
 *
 * Approving is the only action in the app that relocates a booked shift, so
 * each card states both ends of the move explicitly rather than just naming the
 * destination.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
// This app draws its own icons (components/icons.tsx) rather than pulling in
// lucide — there is no arrow-swap glyph, so the venue icon carries the meaning.
import { Store } from './icons';
import { C, F } from '../theme/theme';
import { font } from '../theme/fonts';
import { useLocale, type AppLocale } from '../i18n';
import { IzButton } from './ui';
import type { OutletSwapRecord } from '../lib/api';
import type { OutletSwapsState } from '../lib/outlet-swaps';

/**
 * "Fri, 27 Jul" from a YYYY-MM-DD shift day, parsed as a local date.
 *
 * The locale is a PARAMETER, and passed with no default. It used to be
 * `undefined`, which makes Intl follow the DEVICE's language — so a PR who had
 * switched the app to Chinese still read an English date on the one card that
 * relocates a booked shift. `AppLocale` ('en' | 'zh' | 'zh-Hant') is a valid
 * BCP-47 tag, so it goes straight through.
 */
function formatShiftDay(ymd: string, locale: AppLocale): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function OutletSwapRequests({
  swaps,
}: {
  swaps: Pick<
    OutletSwapsState,
    'pending' | 'actionError' | 'travelWarning' | 'busyId' | 'respond'
  >;
}) {
  const { pending, actionError, travelWarning, busyId, respond } = swaps;
  /*
   * ⚠️ NOT `pending.length === 0` — that threw the answer away at the moment it
   * arrived.
   *
   * `respond()` stores the server's travel warning and then refreshes, which
   * re-filters `pending` to `status === 'pending_pr'`. The swap just accepted is
   * now `approved`, so with the usual single outstanding request `pending`
   * emptied, this returned null, and the warning below — the one whose comment
   * promises it "survives the list refresh" — was destroyed along with the list.
   * The PR saw the "Nothing to do" empty state and never learned they had been
   * sent somewhere they may not have time to reach.
   *
   * The component now renders whenever it has ANYTHING to say: outstanding
   * requests, a failure, or the outcome of the last answer.
   */
  if (pending.length === 0 && !actionError && !travelWarning) return null;

  return (
    <View style={styles.wrap}>
      {pending.map((swap) => (
        <SwapCard
          key={swap.id}
          swap={swap}
          busy={busyId === swap.id}
          // Any card being answered locks the others: the answers hit the same
          // assignment and the second would only race the first.
          disabled={busyId !== null && busyId !== swap.id}
          onRespond={(accept) => respond(swap.id, accept)}
        />
      ))}
      {actionError ? <Text style={styles.error}>{actionError}</Text> : null}
      {/* Amber, not red, and it survives the list refresh: the swap LANDED. Sitting
          under the same header as the error is deliberate — one place to look for
          "what happened when I answered". */}
      {travelWarning ? <Text style={styles.travelWarning}>{travelWarning}</Text> : null}
    </View>
  );
}

function SwapCard({
  swap,
  busy,
  disabled,
  onRespond,
}: {
  swap: OutletSwapRecord;
  busy: boolean;
  disabled: boolean;
  onRespond: (accept: boolean) => void;
}) {
  const { locale, t } = useLocale();
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Store size={14} color={C.violet} />
        <Text style={styles.headText}>{t.swaps.header}</Text>
      </View>

      <Text style={styles.move}>
        {swap.fromOutletName ?? t.swaps.fromFallback}
        <Text style={styles.arrow}> → </Text>
        {swap.toOutletName ?? t.swaps.toFallback}
      </Text>

      <Text style={styles.meta}>
        {formatShiftDay(swap.toShiftDate, locale)}
        {swap.toSlot ? ` · ${swap.toSlot}` : ''}
      </Text>
      {swap.toEventName ? <Text style={styles.event}>{swap.toEventName}</Text> : null}

      {swap.agencyNote ? (
        <Text style={styles.note}>&ldquo;{swap.agencyNote}&rdquo;</Text>
      ) : null}

      <Text style={styles.hint}>{t.swaps.hint}</Text>

      <View style={styles.actions}>
        <IzButton
          label={t.swaps.decline}
          variant="soft"
          small
          fullWidth={false}
          disabled={busy || disabled}
          onPress={() => onRespond(false)}
          style={styles.action}
        />
        <IzButton
          label={busy ? t.swaps.sending : t.swaps.approve}
          small
          fullWidth={false}
          disabled={busy || disabled}
          onPress={() => onRespond(true)}
          style={styles.action}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.violetInk,
    backgroundColor: C.glass,
    padding: 12,
    gap: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: {
    ...font(700),
    fontSize: 10,
    letterSpacing: 1,
    color: C.violet,
  },
  move: {
    ...font(700),
    fontSize: 15,
    color: C.txt,
    marginTop: 2,
  },
  arrow: { color: C.violet },
  meta: { ...font(), fontSize: 12, color: C.prMuted },
  event: { ...font(), fontSize: 12, color: C.accent },
  note: {
    ...font(),
    fontSize: 12,
    color: C.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  hint: { ...font(), fontSize: 11, color: C.muted, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1 },
  error: { ...font(), fontSize: 12, color: C.red },
  travelWarning: { ...font(), fontSize: 12, color: C.amber },
});
